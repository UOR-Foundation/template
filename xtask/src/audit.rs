//! The grep-shaped gates.
//!
//! These are crude on purpose. A gate that needs interpretation is a gate that
//! gets argued with; these ones read the source, find a token, and fail. Each
//! carries the rule it enforces in its failure message, because the point of a
//! red gate is to name the promise that was broken.

use std::path::{Path, PathBuf};

use crate::Fail;

/// The crates that ship: every crate under `crates/` that is not
/// `publish = false`. The rules below apply to those and not to the
/// dev-and-CI-only crates, which may use `std`, `alloc`, and floats freely.
///
/// Derived from the manifests rather than listed here. A list would be a second
/// place to remember, and the failure mode of a second place is that a crate
/// added to one is missing from the other --- silently, because a gate that
/// skips a crate cannot report on it. Reading `publish = false` asks the same
/// question `cargo publish` asks.
fn shipped(root: &Path) -> Result<Vec<String>, Fail> {
    let mut out = Vec::new();
    let dir = root.join("crates");
    if !dir.exists() {
        return Ok(out);
    }
    for entry in std::fs::read_dir(&dir)? {
        let path = entry?.path();
        let manifest = path.join("Cargo.toml");
        let Ok(toml) = std::fs::read_to_string(&manifest) else {
            continue;
        };
        if toml.lines().any(|l| l.trim() == "publish = false") {
            continue;
        }
        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            out.push(name.to_string());
        }
    }
    out.sort();
    Ok(out)
}

struct Source {
    rel: String,
    text: String,
}

fn shipped_sources(root: &Path) -> Result<Vec<Source>, Fail> {
    let mut out = Vec::new();
    for name in shipped(root)? {
        let dir = root.join("crates").join(&name).join("src");
        if !dir.exists() {
            continue;
        }
        collect(&dir, root, &mut out)?;
    }
    Ok(out)
}

fn collect(dir: &Path, root: &Path, out: &mut Vec<Source>) -> Result<(), Fail> {
    for entry in std::fs::read_dir(dir)? {
        let path = entry?.path();
        if path.is_dir() {
            collect(&path, root, out)?;
        } else if path.extension().is_some_and(|e| e == "rs") {
            let text = std::fs::read_to_string(&path)?;
            let rel = path
                .strip_prefix(root)
                .unwrap_or(&path)
                .display()
                .to_string();
            out.push(Source { rel, text });
        }
    }
    Ok(())
}

/// Lines of `text` outside comments and outside `#[cfg(test)]` modules.
///
/// A rule about what the code *does* must not be tripped by a doc comment
/// explaining what it does not do, nor by a test that deliberately constructs
/// the forbidden thing to prove it is caught.
fn effective_lines(text: &str) -> Vec<(usize, &str)> {
    let mut out = Vec::new();
    let mut in_test = false;
    let mut test_depth = 0i32;
    let mut depth = 0i32;
    for (i, raw) in text.lines().enumerate() {
        let line = raw.trim();
        if line.starts_with("//") || line.starts_with("#!") {
            // A `#![deny(...)]` or a comment states policy; it never is the
            // behaviour the gate is looking for.
            continue;
        }
        let opens = raw.matches('{').count() as i32;
        let closes = raw.matches('}').count() as i32;
        if line.starts_with("#[cfg(test)]") {
            in_test = true;
            test_depth = depth;
        }
        if !in_test {
            let code = line.split("//").next().unwrap_or("");
            if !code.trim().is_empty() {
                out.push((i + 1, code));
            }
        }
        depth += opens - closes;
        if in_test && depth <= test_depth && closes > 0 {
            in_test = false;
        }
    }
    out
}

/// R5: no arbitrary limitation. Every bound is a property of the caller's
/// chosen instantiation, never of the code.
///
/// Concretely: no shipped crate may return an error the model does not
/// sanction. The absence of a class of error is checked here --- the absence of
/// negative testing is only honest if there is nothing to test negatively.
pub fn audit_limits(root: &Path) -> Result<(), Fail> {
    let sources = shipped_sources(root)?;
    // The only error type a shipped crate may name, plus the declaration check at
    // a declared boundary, which is not the operation failing.
    let sanctioned = ["NotAProduct", "ObservedBound", "KappaError"];

    let mut violations = Vec::new();
    for src in &sources {
        for (line_no, line) in effective_lines(&src.text) {
            let Some(pos) = line.find("Result<") else {
                continue;
            };
            let tail = &line[pos..];
            if sanctioned.iter().any(|s| tail.contains(s)) {
                continue;
            }
            violations.push(format!("{}:{line_no}:{}", src.rel, line.trim()));
        }
    }
    if !violations.is_empty() {
        return Err(format!(
            "R5: every bound is derived from declared parameters and is a \
             property of the caller's chosen instantiation. The only reportable \
             condition is that the requested object does not exist, reported at view \
             construction. A `Result` over anything else is a limitation the model does \
             not sanction.\n\n{}",
            violations.join("\n")
        )
        .into());
    }
    println!("audit-limits: no shipped crate returns an unsanctioned error (R5)");
    Ok(())
}

/// R4: nothing is deferred. No deferral marker, no stub, no placeholder
/// document section, no capability behind a flag that turns it off.
///
/// The markers are spelled in halves. This gate reads every crate *and*
/// `xtask`, which means it reads this file, and a list of forbidden tokens
/// written out in full is a list that matches itself --- the gate would fail on
/// its own definition, for ever. The alternative is exempting this file, and an
/// exemption is a hole: a real deferral parked in the gate would then be the one
/// place nothing looks. Split, the gate scans itself like anything else.
pub fn audit_deferral(root: &Path) -> Result<(), Fail> {
    let markers = [
        concat!("TO", "DO"),
        concat!("FIX", "ME"),
        concat!("XX", "X"),
        concat!("unimplemented", "!"),
        concat!("to", "do!"),
        concat!("for ", "now"),
        concat!("later ", "version"),
    ];
    let mut violations = Vec::new();

    // Every crate, not only the shipped ones, and `xtask` with them: R4 is a
    // promise about the repository, and a deferral parked in a gate is the same
    // deferral as one parked in shipped code.
    let mut files: Vec<PathBuf> = Vec::new();
    for dir in [root.join("crates"), root.join("xtask")] {
        if dir.exists() {
            gather_all(&dir, &mut files)?;
        }
    }
    // Every Markdown file at the root, discovered rather than listed. A list
    // here would go stale the first time a document was added or renamed, and
    // the failure would be silent: a document nobody scans reports nothing.
    for entry in std::fs::read_dir(root)? {
        let p = entry?.path();
        if p.extension().is_some_and(|e| e == "md") {
            files.push(p);
        }
    }

    for path in files {
        let Ok(text) = std::fs::read_to_string(&path) else {
            continue;
        };
        let rel = path
            .strip_prefix(root)
            .unwrap_or(&path)
            .display()
            .to_string();
        for (i, line) in text.lines().enumerate() {
            for marker in markers {
                if !line.contains(marker) {
                    continue;
                }
                // A backticked marker is a *mention*, not a use: the
                // documentation has to be able to name what the gate catches
                // without tripping it. Anything outside code spans is real.
                if outside_code_spans(line, marker) {
                    violations.push(format!("{rel}:{}: {}", i + 1, line.trim()));
                }
            }
        }
    }

    if !violations.is_empty() {
        return Err(format!(
            "R4: nothing is deferred. None of {} may appear, and no stub, no \
             placeholder section, and no capability behind a flag that turns it \
             off. Every capability ships in the one release.\n\n{}",
            markers.join(", "),
            violations.join("\n")
        )
        .into());
    }
    println!("audit-deferral: nothing is deferred (R4)");
    Ok(())
}

/// Does `marker` occur in `line` outside every backtick-delimited span?
fn outside_code_spans(line: &str, marker: &str) -> bool {
    let mut rest = line;
    let mut at = 0usize;
    while let Some(pos) = rest.find(marker) {
        let absolute = at + pos;
        // An odd number of backticks before this occurrence means it is inside
        // a span.
        if line[..absolute].matches('`').count().is_multiple_of(2) {
            return true;
        }
        at = absolute + marker.len();
        rest = &line[at..];
    }
    false
}

fn gather_all(dir: &Path, out: &mut Vec<PathBuf>) -> Result<(), Fail> {
    for entry in std::fs::read_dir(dir)? {
        let path = entry?.path();
        if path.is_dir() {
            if path.file_name().is_some_and(|n| n == "target") {
                continue;
            }
            gather_all(&path, out)?;
        } else if path
            .extension()
            .is_some_and(|e| e == "rs" || e == "md" || e == "toml")
        {
            out.push(path);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    //! The fixtures of `audit-limits`. Each builds a throwaway repository root
    //! with its own register, one shipped crate and, where the case needs one,
    //! the negative test, then runs the audit on it.
    //!
    //! The register rows live here and not in `model/ids.toml`: that register
    //! is the template's own, it is empty, and a row in it would be copied into
    //! every repository cut from the template.

    use super::*;

    const HEADER: &str = "spec = \"template/1\"\n";

    /// A declared failure type, and the row whose test is its negative test.
    const DECLARED: &str = "\n[[id]]\nid = \"OV-01\"\nlevel = \"build\"\nsuite = \"fixture\"\n\
        statement = \"A value past the bound is refused as Overflow.\"\n\
        failure = \"Overflow\"\nnegative = \"OV-02\"\n\
        \n[[id]]\nid = \"OV-02\"\nlevel = \"build\"\nsuite = \"fixture\"\n\
        statement = \"The refusal of a value past the bound is observed.\"\n";

    /// The negative test, as a file of the shipped crate. One source line, so
    /// that this file is not itself read as containing a test.
    const NEGATIVE_TEST: &str = "#[test]\nfn refuses_a_value_past_the_bound_ov_02() {}\n";

    const SHIPPED: &str = "[package]\nname = \"shipped\"\nversion = \"0.1.0\"\n";

    struct Fixture {
        root: PathBuf,
    }

    impl Fixture {
        fn new(name: &str, ids: &str, lib: &str, test: Option<&str>) -> Self {
            let root = std::env::temp_dir().join(format!(
                "template-audit-limits-{}-{name}",
                std::process::id()
            ));
            let _ = std::fs::remove_dir_all(&root);
            let write = |rel: &str, text: &str| {
                let path = root.join(rel);
                std::fs::create_dir_all(path.parent().expect("a parent")).expect("mkdir");
                std::fs::write(path, text).expect("write");
            };
            write(
                "model/ids.toml",
                &format!("{HEADER}{}", ids_with_header(ids)),
            );
            write("model/ledger.toml", &format!("{HEADER}claim = []\n"));
            write(
                "model/authorities.toml",
                &format!("{HEADER}authority = []\n"),
            );
            write("crates/shipped/Cargo.toml", SHIPPED);
            write("crates/shipped/src/lib.rs", lib);
            if let Some(test) = test {
                write("crates/shipped/tests/negative.rs", test);
            }
            Self { root }
        }

        fn audit(&self) -> Result<(), String> {
            audit_limits(&self.root).map_err(|e| e.to_string())
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.root);
        }
    }

    fn ids_with_header(rows: &str) -> String {
        if rows.trim().is_empty() {
            "id = []\n".to_string()
        } else {
            rows.to_string()
        }
    }

    fn rejected(fixture: &Fixture, needles: &[&str]) {
        let message = fixture
            .audit()
            .expect_err("the audit must reject this fixture");
        for needle in needles {
            assert!(
                message.contains(needle),
                "the diagnostic must contain `{needle}`:\n{message}"
            );
        }
    }

    #[test]
    fn a_declared_failure_type_passes() {
        let f = Fixture::new(
            "declared",
            DECLARED,
            "pub type R<T> = Result<T, Overflow>;\n\
             pub struct Overflow;\n\
             pub fn f(x: u8) -> Result<u8, crate::Overflow> { Ok(x) }\n",
            Some(NEGATIVE_TEST),
        );
        f.audit().expect("a declared type with its test passes");
    }

    #[test]
    fn a_result_broken_across_lines_is_read_whole() {
        let ok = Fixture::new(
            "multiline-ok",
            DECLARED,
            "pub fn f() -> Result<\n    Vec<(u8, u8)>,\n    Overflow,\n> { body() }\n",
            Some(NEGATIVE_TEST),
        );
        ok.audit().expect("the error type is on a later line");
        let bad = Fixture::new(
            "multiline-bad",
            DECLARED,
            "pub fn f() -> Result<\n    Vec<(u8, u8)>,\n    Other,\n> { body() }\n",
            Some(NEGATIVE_TEST),
        );
        rejected(&bad, &["src/lib.rs:1", "`Other`", "not declared"]);
    }

    #[test]
    fn an_undeclared_failure_type_fails() {
        let f = Fixture::new(
            "undeclared",
            DECLARED,
            "pub fn f() -> Result<u8, Other> { Ok(0) }\n",
            Some(NEGATIVE_TEST),
        );
        rejected(&f, &["R5", "src/lib.rs:1", "`Other`", "not declared"]);
    }

    #[test]
    fn no_error_type_is_sanctioned_without_a_declaration() {
        // The three names the audit once carried are errors of one library; a
        // register that does not declare them does not sanction them.
        for name in ["NotAProduct", "ObservedBound", "KappaError"] {
            let f = Fixture::new(
                &format!("fixed-{name}"),
                "",
                &format!("pub fn f() -> Result<u8, {name}> {{ Ok(0) }}\n"),
                None,
            );
            rejected(&f, &["R5", &format!("`{name}`"), "not declared"]);
        }
    }

    #[test]
    fn an_alias_that_hides_the_error_type_fails() {
        for ret in ["std::io::Result<u8>", "Result<u8>"] {
            let f = Fixture::new(
                "alias",
                DECLARED,
                &format!("pub fn f() -> {ret} {{ Ok(0) }}\n"),
                Some(NEGATIVE_TEST),
            );
            rejected(&f, &["R5", "names no error type"]);
        }
    }

    #[test]
    fn a_declared_type_without_its_negative_test_fails() {
        let f = Fixture::new(
            "no-test",
            DECLARED,
            "pub fn f() -> Result<u8, Overflow> { Ok(0) }\n",
            None,
        );
        rejected(
            &f,
            &["R5", "`Overflow`", "OV-02", "no test name ends in `ov_02`"],
        );
    }

    #[test]
    fn a_declared_type_whose_negative_test_is_not_registered_fails() {
        let ids = DECLARED.replace("negative = \"OV-02\"", "negative = \"OV-09\"");
        let f = Fixture::new(
            "unregistered",
            &ids,
            "pub fn f() -> Result<u8, Overflow> { Ok(0) }\n",
            Some(NEGATIVE_TEST),
        );
        rejected(&f, &["OV-01", "`Overflow`", "OV-09", "not a registered ID"]);
    }

    #[test]
    fn a_negative_test_is_a_build_claim() {
        // An `open` claim is measured and never asserted, so it cannot be the
        // row whose test asserts a refusal.
        let ids = DECLARED.replace(
            "id = \"OV-02\"\nlevel = \"build\"",
            "id = \"OV-02\"\nlevel = \"open\"",
        );
        let f = Fixture::new(
            "open-negative",
            &ids,
            "pub fn f() -> Result<u8, Overflow> { Ok(0) }\n",
            Some(NEGATIVE_TEST),
        );
        rejected(&f, &["OV-02", "must be a `build` claim"]);
    }

    #[test]
    fn a_declaration_is_a_pair_and_is_made_once() {
        let no_negative = DECLARED.replace("negative = \"OV-02\"\n", "");
        rejected(
            &Fixture::new("no-negative", &no_negative, "", Some(NEGATIVE_TEST)),
            &["OV-01", "names no negative test"],
        );
        let no_failure = DECLARED.replace("failure = \"Overflow\"\n", "");
        rejected(
            &Fixture::new("no-failure", &no_failure, "", Some(NEGATIVE_TEST)),
            &["OV-01", "declares no failure type"],
        );
        let twice = format!(
            "{DECLARED}\n[[id]]\nid = \"OV-03\"\nlevel = \"build\"\nsuite = \"fixture\"\n\
             statement = \"Declared again.\"\nfailure = \"Overflow\"\nnegative = \"OV-02\"\n"
        );
        rejected(
            &Fixture::new("twice", &twice, "", Some(NEGATIVE_TEST)),
            &["Overflow", "OV-01", "OV-03", "declared twice"],
        );
    }

    #[test]
    fn a_crate_that_does_not_ship_is_not_audited() {
        let f = Fixture::new(
            "unshipped",
            "",
            "pub fn f() -> Result<u8, Other> { Ok(0) }\n",
            None,
        );
        std::fs::write(
            f.root.join("crates/shipped/Cargo.toml"),
            format!("{SHIPPED}publish = false\n"),
        )
        .expect("write");
        f.audit()
            .expect("a publish = false crate may return anything");
    }

    #[test]
    fn a_result_in_a_comment_or_a_test_module_is_not_audited() {
        let f = Fixture::new(
            "comments",
            "",
            "// fn f() -> Result<u8, Other>\n\
             pub fn g() {}\n\
             #[cfg(test)]\n\
             mod tests {\n    fn h() -> Result<u8, Other> { Ok(0) }\n}\n",
            None,
        );
        f.audit().expect("neither is behavior");
    }

    #[test]
    fn the_template_itself_passes() {
        audit_limits(&repo_model::repo_root()).expect("the template ships no failure");
    }
}
