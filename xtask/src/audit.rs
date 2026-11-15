//! The grep-shaped gates.
//!
//! These are crude on purpose. A gate that needs interpretation is a gate that
//! gets argued with; these ones read the source, find a token, and fail. Each
//! carries the rule it enforces in its failure message, because the point of a
//! red gate is to name the promise that was broken.

use std::path::{Path, PathBuf};

use repo_conformance::workspace_test_names;
use repo_model::Model;

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

/// R5: every public failure is typed, modeled, documented, and covered by a
/// negative test.
///
/// Concretely: a shipped crate may name an error type in a `Result` only if
/// `model/ids.toml` declares that type (`failure`) together with the registered
/// `build` row whose test is its negative test (`negative`), and that test
/// exists. The sanctioned set is read off the register rather than listed here:
/// a list in the gate would be a second source for what the model says (R1), and
/// the error types of one repository are not the error types of the next.
pub fn audit_limits(root: &Path) -> Result<(), Fail> {
    let model = Model::load(&root.join("model"))?;
    let declared = model.ids.declared_failures()?;
    let tests = workspace_test_names(root);

    let mut violations = Vec::new();
    for d in &declared {
        let slug = d.negative.to_lowercase().replace('-', "_");
        if !tests.iter().any(|t| t.ends_with(&slug)) {
            violations.push(format!(
                "{}: failure `{}` has negative test {}, but no test name ends in `{slug}`",
                d.declared_by, d.type_name, d.negative
            ));
        }
    }
    for src in shipped_sources(root)? {
        for (line_no, error) in result_errors(&src.text) {
            let Some(error) = error else {
                violations.push(format!(
                    "{}:{line_no}: a `Result` that names no error type (an alias hides it); \
                     write `Result<T, E>` with a declared `E`",
                    src.rel
                ));
                continue;
            };
            // The last segment of a path, so `crate::Overflow` is `Overflow`. A
            // generic or compound type (`Box<dyn Error>`) is no declared name.
            let name = error.rsplit("::").next().unwrap_or(&error).trim();
            if !declared.iter().any(|d| d.type_name == name) {
                violations.push(format!(
                    "{}:{line_no}: error type `{error}` is not declared in model/ids.toml",
                    src.rel
                ));
            }
        }
    }
    if !violations.is_empty() {
        return Err(format!(
            "R5: every public failure is typed, modeled, documented, and covered by a \
             negative test. A shipped crate may name an error type in a `Result` only when a \
             row of model/ids.toml declares it (`failure`) and names its negative test \
             (`negative`), and that test exists.\n\n{}",
            violations.join("\n")
        )
        .into());
    }
    println!(
        "audit-limits: every error type a shipped crate names is declared with a negative \
         test ({} declared) (R5)",
        declared.len()
    );
    Ok(())
}

/// Every `Result<..>` in the effective code of `text`, with the line it opens
/// on and the error type it names, or `None` when it names none.
///
/// Read across lines: a signature that rustfmt has broken over several lines is
/// still one `Result`. The argument list is split on its top-level commas, so
/// `Result<Vec<(u8, u8)>, E>` has the error type `E`.
fn result_errors(text: &str) -> Vec<(usize, Option<String>)> {
    let mut flat = String::new();
    let mut starts: Vec<(usize, usize)> = Vec::new();
    for (line_no, line) in effective_lines(text) {
        starts.push((flat.len(), line_no));
        flat.push_str(line);
        flat.push(' ');
    }
    let line_of = |at: usize| {
        let i = starts.partition_point(|(offset, _)| *offset <= at);
        starts[i.saturating_sub(1)].1
    };

    let mut out = Vec::new();
    let mut from = 0;
    while let Some(found) = flat[from..].find("Result<") {
        let open = from + found + "Result<".len();
        from = open;
        let mut depth = 1usize;
        let mut args: Vec<&str> = Vec::new();
        let mut arg_start = open;
        let mut closed = false;
        let bytes = flat.as_bytes();
        for (i, &b) in bytes.iter().enumerate().skip(open) {
            match b {
                b'<' | b'(' | b'[' | b'{' => depth += 1,
                // The arrow of `fn() -> T` is not a closing bracket.
                b'>' if bytes[i - 1] == b'-' => {}
                b'>' | b')' | b']' | b'}' => {
                    depth -= 1;
                    if depth == 0 {
                        args.push(&flat[arg_start..i]);
                        closed = true;
                        break;
                    }
                }
                b',' if depth == 1 => {
                    args.push(&flat[arg_start..i]);
                    arg_start = i + 1;
                }
                _ => {}
            }
        }
        let line = line_of(open);
        // A trailing comma leaves an empty last argument.
        while args.last().is_some_and(|a| a.trim().is_empty()) {
            args.pop();
        }
        let error = match (closed, args.as_slice()) {
            (true, [_, error]) => Some(error.trim().to_string()),
            _ => None,
        };
        out.push((line, error));
    }
    out
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
    fn only_a_bare_type_name_is_a_declared_name() {
        // `Box<dyn Error>` is not the declared type merely because it begins
        // with a name; and the arrow of a function type does not end the
        // argument list early.
        let boxed = Fixture::new(
            "boxed",
            DECLARED,
            "pub fn f() -> Result<u8, Box<dyn Overflow>> { Ok(0) }\n",
            Some(NEGATIVE_TEST),
        );
        rejected(&boxed, &["R5", "`Box<dyn Overflow>`", "not declared"]);
        let arrow = Fixture::new(
            "arrow",
            DECLARED,
            "pub fn f() -> Result<fn(u8) -> u8, Other> { Ok(id) }\n",
            Some(NEGATIVE_TEST),
        );
        rejected(&arrow, &["R5", "`Other`", "not declared"]);
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

/// Only Prism is implemented here.
///
/// This product is a Prism model: behavior is written in LexLean (`*.lex.tex`), checked by Lean and
/// built by PrismPM. Everything else that executes, hand-written Rust, TypeScript, JavaScript,
/// Python, shell, CSS or HTML, is non-Prism implementation, and it may only shrink. This is the
/// shrink-only ratchet of `afflom/rule30` (Python may not grow) and `afflom/verdant-resonance`
/// (hand-written modules may not grow), applied to every non-Prism language at once.
///
/// The ceiling is the commit's first parent, measured, not a recorded number: on a pull request
/// or merge queue run the checked-out commit is a merge whose first parent is the base branch,
/// and on main it is the previous main. So a removal tightens the ceiling the moment it merges,
/// with no baseline file to regenerate, and a ceiling cannot be raised by editing one.
///
/// Refused: a non-Prism file the parent does not have (author it in LexLean instead), and any
/// net growth in non-Prism lines. Lines are non-blank and outside comments, so explaining a
/// decision costs nothing. Prism output that a Prism lock binds byte for byte is Prism's own
/// and is not counted: the frame `frame.lock` pins to the template, and the Prism id
/// `identity/stitch.lock` generates from stitch's model. A bound file whose bytes differ from its
/// lock is counted.
pub mod prism {
    use std::collections::BTreeMap;
    use std::io::{BufRead, BufReader, Read, Write};
    use std::path::Path;
    use std::process::{Command, Stdio};

    use sha2::{Digest, Sha256};

    use crate::Fail;

    /// Non-Prism implementation, by extension, with the comment syntax its lines are counted under.
    const LANGUAGES: [(&str, Comments); 20] = [
        ("rs", Comments::C),
        ("ts", Comments::C),
        ("tsx", Comments::C),
        ("mts", Comments::C),
        ("cts", Comments::C),
        ("js", Comments::C),
        ("mjs", Comments::C),
        ("cjs", Comments::C),
        ("jsx", Comments::C),
        ("css", Comments::C),
        ("scss", Comments::C),
        ("c", Comments::C),
        ("h", Comments::C),
        ("cpp", Comments::C),
        ("html", Comments::Html),
        ("py", Comments::Hash),
        ("sh", Comments::Hash),
        ("bash", Comments::Hash),
        ("awk", Comments::Hash),
        ("lean", Comments::Lean),
    ];

    #[derive(Clone, Copy, PartialEq, Eq, Debug)]
    enum Comments {
        /// `//` lines and `/* */` blocks.
        C,
        /// `#` lines.
        Hash,
        /// `--` lines and `/- -/` blocks.
        Lean,
        /// `<!-- -->` blocks.
        Html,
    }

    fn language(path: &str) -> Option<Comments> {
        let name = path.rsplit('/').next().unwrap_or(path);
        let (_, extension) = name.rsplit_once('.')?;
        LANGUAGES
            .iter()
            .find(|(e, _)| *e == extension)
            .map(|(_, c)| *c)
    }

    /// Non-blank lines outside comments. A line that starts inside a block comment and ends it
    /// counts only if code follows the close.
    fn count_lines(text: &str, comments: Comments) -> usize {
        let (line, open, close) = match comments {
            Comments::C => (Some("//"), Some("/*"), Some("*/")),
            Comments::Hash => (Some("#"), None, None),
            Comments::Lean => (Some("--"), Some("/-"), Some("-/")),
            Comments::Html => (None, Some("<!--"), Some("-->")),
        };
        let mut in_block = false;
        let mut count = 0;
        for raw in text.lines() {
            let mut rest = raw.trim();
            if in_block {
                match close.and_then(|c| rest.find(c).map(|i| i + c.len())) {
                    Some(end) => {
                        in_block = false;
                        rest = rest[end..].trim();
                    }
                    None => continue,
                }
            }
            while let (Some(o), Some(c)) = (open, close) {
                let Some(after) = rest.strip_prefix(o) else {
                    break;
                };
                match after.find(c) {
                    Some(end) => rest = after[end + c.len()..].trim(),
                    None => {
                        in_block = true;
                        rest = "";
                    }
                }
            }
            if rest.is_empty() || line.is_some_and(|l| rest.starts_with(l)) {
                continue;
            }
            count += 1;
        }
        count
    }

    /// The locks that bind Prism output: each `files` entry and the `output` entry name a path
    /// and the digest its bytes must have.
    const PRISM_LOCKS: [&str; 2] = ["frame.lock", "identity/stitch.lock"];

    /// How a commit's `xtask/src/audit.rs` shows it runs this gate.
    const GATE: &[u8] = b"pub mod prism {";

    /// Paths the Prism locks bind, with the digest each must have. `read` answers a lock's text,
    /// or `None` where the tree has no such lock.
    fn bound(
        mut read: impl FnMut(&str) -> Result<Option<String>, Fail>,
    ) -> Result<BTreeMap<String, String>, Fail> {
        let mut out = BTreeMap::new();
        for name in PRISM_LOCKS {
            let Some(text) = read(name)? else {
                continue;
            };
            let lock: serde_json::Value = serde_json::from_str(&text)?;
            // A lock binds output only when it names where the output comes from. The template's
            // own frame.lock has no source: there the frame is the template's implementation.
            let upstream = lock["source"]["repository"]
                .as_str()
                .or(lock["repository"].as_str());
            if upstream.is_none_or(str::is_empty) {
                continue;
            }
            let files = lock["files"].as_array().into_iter().flatten();
            for entry in files.chain(lock.get("output")) {
                let (Some(path), Some(sha256)) = (entry["path"].as_str(), entry["sha256"].as_str())
                else {
                    return Err(format!("{name}: an entry without a path and a sha256").into());
                };
                out.insert(path.to_string(), sha256.to_string());
            }
        }
        Ok(out)
    }

    /// Non-Prism lines per file of one tree.
    #[derive(Default, Debug)]
    struct Measure {
        files: BTreeMap<String, usize>,
    }

    impl Measure {
        fn total(&self) -> usize {
            self.files.values().sum()
        }

        /// Adds `path` if it is non-Prism implementation.
        fn add(&mut self, path: &str, bytes: &[u8], frame: &BTreeMap<String, String>) {
            let Some(comments) = language(path) else {
                return;
            };
            if frame
                .get(path)
                .is_some_and(|sha256| *sha256 == hex(&Sha256::digest(bytes)))
            {
                return;
            }
            let lines = count_lines(&String::from_utf8_lossy(bytes), comments);
            self.files.insert(path.to_string(), lines);
        }
    }

    fn hex(bytes: &[u8]) -> String {
        bytes.iter().map(|b| format!("{b:02x}")).collect()
    }

    /// The ratchet itself: what `current` adds over `ceiling`, or nothing.
    fn refusals(ceiling: &Measure, current: &Measure) -> Vec<String> {
        let mut out = Vec::new();
        let added: Vec<&String> = current
            .files
            .keys()
            .filter(|path| !ceiling.files.contains_key(*path))
            .collect();
        if !added.is_empty() {
            let shown: Vec<&str> = added.iter().take(20).map(|p| p.as_str()).collect();
            out.push(format!(
                "{} new non-Prism file(s): {}{}. Author the behavior in LexLean (`*.lex.tex`) so PrismPM builds it.",
                added.len(),
                shown.join(", "),
                if added.len() > shown.len() { ", ..." } else { "" }
            ));
        }
        let (now, before) = (current.total(), ceiling.total());
        if now > before {
            let mut grown: Vec<(&String, usize)> = current
                .files
                .iter()
                .filter_map(|(path, &n)| {
                    let was = ceiling.files.get(path).copied().unwrap_or(0);
                    n.checked_sub(was).filter(|d| *d > 0).map(|d| (path, d))
                })
                .collect();
            grown.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(b.0)));
            let shown: Vec<String> = grown
                .iter()
                .take(10)
                .map(|(p, n)| format!("{p} +{n}"))
                .collect();
            out.push(format!(
                "non-Prism implementation grew by {} lines ({before} to {now}); grown: {}. It may only shrink: move the logic into the Prism model, or delete as much as you add.",
                now - before,
                shown.join(", ")
            ));
        }
        out
    }

    fn git(root: &Path, args: &[&str]) -> Result<Vec<u8>, Fail> {
        let out = Command::new("git").current_dir(root).args(args).output()?;
        if !out.status.success() {
            return Err(format!(
                "git {}: {}",
                args.join(" "),
                String::from_utf8_lossy(&out.stderr).trim()
            )
            .into());
        }
        Ok(out.stdout)
    }

    /// The working tree's tracked files.
    fn measure_worktree(root: &Path) -> Result<Measure, Fail> {
        let frame = bound(|name| match std::fs::read_to_string(root.join(name)) {
            Ok(text) => Ok(Some(text)),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(e.into()),
        })?;
        let mut measure = Measure::default();
        for path in git(root, &["ls-files", "-z", "--cached"])?.split(|b| *b == 0) {
            let path = std::str::from_utf8(path)?;
            if path.is_empty() || language(path).is_none() {
                continue;
            }
            let full = root.join(path);
            // A symlink is not implementation of its own, and a path deleted but not yet staged is
            // gone.
            if full.is_symlink() || !full.is_file() {
                continue;
            }
            measure.add(path, &std::fs::read(&full)?, &frame);
        }
        Ok(measure)
    }

    /// A commit's tree, read from the object store.
    fn measure_commit(root: &Path, commit: &str) -> Result<Measure, Fail> {
        let frame = bound(
            |name| match git(root, &["show", &format!("{commit}:{name}")]) {
                Ok(text) => Ok(Some(String::from_utf8(text)?)),
                Err(_) => Ok(None),
            },
        )?;
        let listing = git(root, &["ls-tree", "-r", "-z", commit])?;
        let mut blobs = Vec::new();
        for entry in listing.split(|b| *b == 0) {
            let entry = std::str::from_utf8(entry)?;
            let Some((meta, path)) = entry.split_once('\t') else {
                continue;
            };
            let fields: Vec<&str> = meta.split(' ').collect();
            if fields.len() == 3
                && fields[0] != "120000"
                && fields[1] == "blob"
                && language(path).is_some()
            {
                blobs.push((fields[2].to_string(), path.to_string()));
            }
        }

        let mut child = Command::new("git")
            .current_dir(root)
            .args(["cat-file", "--batch"])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()?;
        let mut stdin = child.stdin.take().ok_or("git cat-file: no stdin")?;
        let ids: Vec<String> = blobs.iter().map(|(id, _)| id.clone()).collect();
        // Written from a thread so that a full output pipe cannot stall the request.
        let writer = std::thread::spawn(move || -> std::io::Result<()> {
            for id in ids {
                writeln!(stdin, "{id}")?;
            }
            Ok(())
        });
        let mut reader = BufReader::new(child.stdout.take().ok_or("git cat-file: no stdout")?);
        let mut measure = Measure::default();
        for (_, path) in &blobs {
            let mut header = String::new();
            reader.read_line(&mut header)?;
            let size: usize = header
                .split(' ')
                .nth(2)
                .and_then(|s| s.trim().parse().ok())
                .ok_or_else(|| format!("git cat-file: unexpected header {header:?} for {path}"))?;
            let mut bytes = vec![0; size + 1];
            reader.read_exact(&mut bytes)?;
            bytes.truncate(size);
            measure.add(path, &bytes, &frame);
        }
        writer
            .join()
            .map_err(|_| "git cat-file: writer panicked")??;
        child.wait()?;
        Ok(measure)
    }

    pub fn audit(root: &Path) -> Result<(), Fail> {
        let current = measure_worktree(root)?;
        let parent = git(root, &["rev-parse", "--verify", "-q", "HEAD^1^{commit}"]);
        let Ok(parent) = parent else {
            // A shallow clone hides the parent rather than lacking one: that is a gate that cannot
            // see its ceiling, and it must not pass.
            if git(root, &["rev-parse", "--is-shallow-repository"])?.starts_with(b"true") {
                return Err("audit-prism: the clone is shallow, so the parent commit, the ratchet's ceiling, cannot be read; check out with full history".into());
            }
            println!(
                "audit-prism: a root commit; non-Prism implementation is {} lines in {} files",
                current.total(),
                current.files.len()
            );
            return Ok(());
        };
        let parent = String::from_utf8(parent)?.trim().to_string();
        // The ratchet starts at the commit that installs it: a parent without this gate set no
        // ceiling. Removing the gate needs a change that deletes it, which this does not open.
        let gated = git(root, &["show", &format!("{parent}:xtask/src/audit.rs")])
            .is_ok_and(|source| source.windows(GATE.len()).any(|w| w == GATE));
        if !gated {
            println!(
                "audit-prism: installed here; the parent ran no ratchet, so this commit sets the ceiling: {} lines in {} files",
                current.total(),
                current.files.len()
            );
            return Ok(());
        }
        let ceiling = measure_commit(root, &parent)?;
        let refused = refusals(&ceiling, &current);
        if !refused.is_empty() {
            return Err(format!(
                "audit-prism: only Prism may be implemented here, measured against {}:\n  - {}",
                &parent[..12.min(parent.len())],
                refused.join("\n  - ")
            )
            .into());
        }
        println!(
            "audit-prism: non-Prism implementation is {} lines in {} files ({} lines, {} files in the parent); it only shrinks",
            current.total(),
            current.files.len(),
            ceiling.total(),
            ceiling.files.len()
        );
        Ok(())
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        fn measure(files: &[(&str, &str)]) -> Measure {
            let mut m = Measure::default();
            for (path, text) in files {
                m.add(path, text.as_bytes(), &BTreeMap::new());
            }
            m
        }

        #[test]
        fn counts_code_not_comments_or_blank_lines() {
            let rust = "// why\n/* a\n block */\nfn a() {}\n\n/* x */ let b = 1;\n";
            assert_eq!(count_lines(rust, Comments::C), 2);
            assert_eq!(
                count_lines("#!/bin/sh\n# why\necho hi\n", Comments::Hash),
                1
            );
            assert_eq!(
                count_lines("/- doc\n-/\n-- x\ndef a := 1\n", Comments::Lean),
                1
            );
            assert_eq!(count_lines("<!--\n x -->\n<p>a</p>\n", Comments::Html), 1);
        }

        #[test]
        fn prism_and_data_are_not_counted() {
            let m = measure(&[
                ("app/src/Kernel.lex.tex", "def a := 1\n"),
                ("model/ids.toml", "x = 1\n"),
                ("app/product.json", "{}\n"),
                ("studio/a.mjs", "export {}\n"),
            ]);
            assert_eq!(m.files.keys().collect::<Vec<_>>(), ["studio/a.mjs"]);
        }

        #[test]
        fn locks_bind_frame_files_and_generated_output() {
            let frame = r#"{"source": {"repository": "UOR-Foundation/template"}, "files": [{"path": "site/app.mjs", "sha256": "aa"}]}"#;
            let stitch = r#"{"repository": "afflom/stitch", "output": {"path": "identity/prism-id.mjs", "sha256": "bb"}}"#;
            let locks = bound(|name| {
                Ok(match name {
                    "frame.lock" => Some(frame.to_string()),
                    "identity/stitch.lock" => Some(stitch.to_string()),
                    _ => None,
                })
            })
            .unwrap();
            assert_eq!(locks.get("site/app.mjs").map(String::as_str), Some("aa"));
            assert_eq!(
                locks.get("identity/prism-id.mjs").map(String::as_str),
                Some("bb")
            );
            let bad = r#"{"repository": "afflom/stitch", "files": [{"path": "x"}]}"#;
            assert!(bound(|_| Ok(Some(bad.to_string()))).is_err());
            // The template's own frame.lock names no source, so it binds nothing.
            let own = r#"{"files": [{"path": "site/app.mjs", "sha256": "aa"}]}"#;
            assert!(bound(|_| Ok(Some(own.to_string()))).unwrap().is_empty());
        }

        #[test]
        fn frame_counts_only_while_its_bytes_match_the_lock() {
            let bytes = b"export const a = 1;\n";
            let lock = BTreeMap::from([("site/app.mjs".to_string(), hex(&Sha256::digest(bytes)))]);
            let mut m = Measure::default();
            m.add("site/app.mjs", bytes, &lock);
            assert!(m.files.is_empty());
            m.add("site/app.mjs", b"export const a = 2;\nlet b;\n", &lock);
            assert_eq!(m.total(), 2);
        }

        // The planted defects: each must be refused.
        #[test]
        fn refuses_a_new_non_prism_file() {
            let before = measure(&[("studio/a.mjs", "a()\nb()\n")]);
            let after = measure(&[("studio/a.mjs", "a()\n"), ("studio/b.ts", "b()\n")]);
            let refused = refusals(&before, &after);
            assert_eq!(refused.len(), 1);
            assert!(refused[0].contains("studio/b.ts"));
        }

        #[test]
        fn refuses_net_growth() {
            let before = measure(&[("studio/a.mjs", "a()\n"), ("crates/x.rs", "x();\n")]);
            let after = measure(&[("studio/a.mjs", "a()\nb()\nc()\n")]);
            let refused = refusals(&before, &after);
            assert_eq!(refused.len(), 1);
            assert!(
                refused[0].contains("grew by 1 lines (2 to 3)"),
                "{refused:?}"
            );
            assert!(refused[0].contains("studio/a.mjs +2"));
        }

        #[test]
        fn names_what_grew_when_another_file_shrank() {
            let before = measure(&[("studio/a.mjs", "a()\nb()\n"), ("studio/c.mjs", "c()\n")]);
            let after = measure(&[
                ("studio/a.mjs", "a()\n"),
                ("studio/c.mjs", "c()\nd()\ne()\nf()\n"),
            ]);
            let refused = refusals(&before, &after);
            assert_eq!(refused.len(), 1);
            assert!(refused[0].contains("studio/c.mjs +3"), "{refused:?}");
            assert!(!refused[0].contains("studio/a.mjs"), "{refused:?}");
        }

        #[test]
        fn admits_shrinking_and_growth_paid_for_by_deletion() {
            let before = measure(&[("studio/a.mjs", "a()\nb()\n"), ("studio/c.mjs", "c()\n")]);
            let after = measure(&[("studio/a.mjs", "a()\nb()\nd()\n")]);
            assert!(refusals(&before, &after).is_empty());
            assert!(refusals(&before, &measure(&[])).is_empty());
        }

        #[test]
        fn a_comment_or_a_blank_line_is_free() {
            let before = measure(&[("studio/a.mjs", "a()\n")]);
            let after = measure(&[("studio/a.mjs", "// why a\n\na()\n")]);
            assert!(refusals(&before, &after).is_empty());
        }
    }
}
