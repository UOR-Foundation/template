//! `new-capability`: R3's first step, written in the order `AGENTS.md` sets.
//!
//! A capability begins as a register row, a scenario and a failing test. The
//! three must agree on the ID, the level and the suite, and getting one of them
//! subtly wrong (a test name that ends in `cx01` rather than `cx_01`, a scenario
//! tagged with the wrong level) is reported by the meta-gate only after the
//! next build. Writing all three from one set of arguments removes that round
//! trip. Nothing here weakens a gate: the test fails until the capability is
//! built, and `just vv` stays red until it is.

use std::path::{Path, PathBuf};

use repo_model::{codegen, Model};

use crate::Fail;

/// The levels a register row may take, as `model/ids.toml` spells them.
const LEVELS: [&str; 3] = ["some-true", "build", "open"];

/// What one invocation writes.
#[derive(Debug, PartialEq, Eq)]
pub struct Capability {
    /// The conformance ID, such as `CX-01`.
    pub id: String,
    /// One of [`LEVELS`].
    pub level: String,
    /// The suite file stem under `features/suites/`.
    pub suite: String,
    /// The one-line statement, shared by the row and the scenario.
    pub statement: String,
}

impl Capability {
    /// Validate the four arguments before anything is written.
    pub fn parse(args: &[String]) -> Result<Self, Fail> {
        let [id, level, suite, statement] = args else {
            return Err(
                "usage: cargo xtask new-capability <ID> <some-true|build|open> <suite> <statement>"
                    .into(),
            );
        };
        if !id_is_well_formed(id) {
            return Err(format!(
                "{id}: an ID is an uppercase prefix, a hyphen and a number, such as CX-01"
            )
            .into());
        }
        if !LEVELS.contains(&level.as_str()) {
            return Err(format!("{level}: the level is one of {}", LEVELS.join(", ")).into());
        }
        if suite.is_empty()
            || suite.starts_with('-')
            || !suite
                .bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
        {
            return Err(format!(
                "{suite}: a suite is a lowercase file stem of letters, digits and hyphens"
            )
            .into());
        }
        let statement = statement.trim();
        if statement.is_empty() || statement.contains(['\n', '\r']) {
            return Err("the statement is one non-empty line (R2)".into());
        }
        Ok(Self {
            id: id.clone(),
            level: level.clone(),
            suite: suite.clone(),
            statement: statement.to_string(),
        })
    }

    /// The suffix CM-02 requires of the test's name.
    pub fn slug(&self) -> String {
        self.id.to_lowercase().replace('-', "_")
    }

    /// The test's full name: the suite, then the ID.
    pub fn test_name(&self) -> String {
        format!("{}_{}", self.suite.replace('-', "_"), self.slug())
    }
}

fn id_is_well_formed(id: &str) -> bool {
    let Some((prefix, number)) = id.split_once('-') else {
        return false;
    };
    prefix.starts_with(|c: char| c.is_ascii_uppercase())
        && prefix
            .bytes()
            .all(|b| b.is_ascii_uppercase() || b.is_ascii_digit())
        && !number.is_empty()
        && number.bytes().all(|b| b.is_ascii_digit())
}

/// A TOML basic string.
fn toml_string(value: &str) -> String {
    let mut out = String::from("\"");
    for c in value.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\t' => out.push_str("\\t"),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

/// `model/ids.toml` with the row appended. The empty register is written as
/// `id = []`, which cannot coexist with an `[[id]]` table, so that line goes.
fn register_with(ids: &str, c: &Capability) -> String {
    let mut out: String = ids
        .lines()
        .filter(|line| line.trim() != "id = []")
        .map(|line| format!("{line}\n"))
        .collect();
    while out.ends_with("\n\n") {
        out.pop();
    }
    out.push_str(&format!(
        "\n[[id]]\nid = {}\nlevel = {}\nsuite = {}\nstatement = {}\n",
        toml_string(&c.id),
        toml_string(&c.level),
        toml_string(&c.suite),
        toml_string(&c.statement),
    ));
    out
}

fn scenario(c: &Capability) -> String {
    format!(
        "\n  @{id} @{level}\n  Scenario: {statement}\n    Given the fixture {id} needs\n    When the suite exercises {id}\n    Then {statement}\n",
        id = c.id,
        level = c.level,
        statement = c.statement,
    )
}

fn test_case(c: &Capability) -> String {
    format!(
        "\n/// `{id}`: {statement}\n#[test]\nfn {name}() {{\n    panic!(\"{id} is registered and not built: assert what its scenario states\");\n}}\n",
        id = c.id,
        statement = c.statement.replace('`', "'"),
        name = c.test_name(),
    )
}

/// The files one capability touches, relative to the root.
fn paths(root: &Path, c: &Capability) -> (PathBuf, PathBuf, PathBuf) {
    (
        root.join("model/ids.toml"),
        root.join("features/suites")
            .join(format!("{}.feature", c.suite)),
        root.join("crates/conformance/tests")
            .join(format!("{}.rs", c.suite.replace('-', "_"))),
    )
}

/// Write the row, the scenario and the failing test, then regenerate
/// `CONFORMANCE.md`. Nothing is written when the ID is already registered or
/// the register would not load afterwards.
pub fn new_capability(root: &Path, args: &[String]) -> Result<(), Fail> {
    let c = Capability::parse(args)?;
    let model = Model::load(&root.join("model"))?;
    if model.ids.get(&c.id).is_some() {
        return Err(format!("{}: already registered in model/ids.toml", c.id).into());
    }

    let (ids_path, feature_path, test_path) = paths(root, &c);
    let ids_before = std::fs::read_to_string(&ids_path)?;
    std::fs::write(&ids_path, register_with(&ids_before, &c))?;
    let model = match Model::load(&root.join("model")).and_then(|m| m.check().map(|()| m)) {
        Ok(model) => model,
        Err(error) => {
            std::fs::write(&ids_path, ids_before)?;
            return Err(error.into());
        }
    };

    let mut feature = std::fs::read_to_string(&feature_path)
        .unwrap_or_else(|_| format!("Feature: {}\n", c.suite));
    feature.push_str(&scenario(&c));
    std::fs::write(&feature_path, feature)?;

    let mut tests = std::fs::read_to_string(&test_path).unwrap_or_else(|_| {
        format!(
            "//! The `{}` suite: one test per scenario in `features/suites/{}.feature`.\n",
            c.suite, c.suite
        )
    });
    tests.push_str(&test_case(&c));
    if let Some(parent) = test_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&test_path, tests)?;

    std::fs::write(
        root.join(codegen::CONFORMANCE_PATH),
        codegen::render_conformance(&model),
    )?;

    let rel = |p: &Path| p.strip_prefix(root).unwrap_or(p).display().to_string();
    println!(
        "new-capability: {id} registered\n  {}\n  {}\n  {} (fn {name}, failing)\n  {}\n\
         Next: make {name} assert the scenario, implement until it passes, plant the \
         defect it exists to catch, then run `just vv`.",
        rel(&ids_path),
        rel(&feature_path),
        rel(&test_path),
        codegen::CONFORMANCE_PATH,
        id = c.id,
        name = c.test_name(),
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{new_capability, register_with, Capability};
    use repo_model::Model;
    use std::collections::BTreeSet;
    use std::path::{Path, PathBuf};

    fn args(values: [&str; 4]) -> Vec<String> {
        values.iter().map(|v| (*v).to_string()).collect()
    }

    /// A scratch repository with an empty register and this one's authorities and ledger.
    fn scratch(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "xtask-new-capability-{name}-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&root);
        let real = repo_model::repo_root();
        for dir in ["model", "features/suites", "crates/conformance/tests"] {
            std::fs::create_dir_all(root.join(dir)).unwrap();
        }
        for file in ["authorities.toml", "ledger.toml"] {
            std::fs::copy(real.join("model").join(file), root.join("model").join(file)).unwrap();
        }
        // An empty register, as a freshly instantiated repository has; this
        // repository's own rows are not the scratch repository's.
        std::fs::write(
            root.join("model/ids.toml"),
            "spec = \"template/1\"\n\nid = []\n",
        )
        .unwrap();
        root
    }

    fn test_names(root: &Path) -> BTreeSet<String> {
        let mut names = BTreeSet::new();
        for entry in std::fs::read_dir(root.join("crates/conformance/tests")).unwrap() {
            let text = std::fs::read_to_string(entry.unwrap().path()).unwrap();
            let mut armed = false;
            for line in text.lines() {
                if line.trim() == "#[test]" {
                    armed = true;
                } else if let Some(rest) = line.strip_prefix("fn ").filter(|_| armed) {
                    names.insert(rest.split('(').next().unwrap().to_string());
                    armed = false;
                }
            }
        }
        names
    }

    #[test]
    fn scaffolded_capabilities_satisfy_the_meta_gate() {
        let root = scratch("ok");
        new_capability(
            &root,
            &args([
                "CX-01",
                "build",
                "parsing",
                "A \"parsed\" document round-trips",
            ]),
        )
        .unwrap();
        new_capability(
            &root,
            &args(["CX-02", "open", "parsing", "Parsing throughput is measured"]),
        )
        .unwrap();

        let model = Model::load(&root.join("model")).unwrap();
        model.check().unwrap();
        assert_eq!(model.ids.id.len(), 2);
        assert_eq!(
            model.ids.id[0].statement,
            "A \"parsed\" document round-trips"
        );

        let report = repo_conformance::check_honesty(&root, &test_names(&root)).unwrap();
        assert!(report.is_clean(), "{:?}", report.violations);
        assert_eq!(report.scenarios_checked, 2);

        let feature =
            std::fs::read_to_string(root.join("features/suites/parsing.feature")).unwrap();
        assert_eq!(feature.matches("Scenario:").count(), 2);
        assert!(feature.starts_with("Feature: parsing\n"));
        let tests =
            std::fs::read_to_string(root.join("crates/conformance/tests/parsing.rs")).unwrap();
        assert!(tests.contains("fn parsing_cx_01()") && tests.contains("fn parsing_cx_02()"));
        assert!(root.join("CONFORMANCE.md").is_file());
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn malformed_or_duplicate_capabilities_write_nothing() {
        let root = scratch("bad");
        let ids = std::fs::read_to_string(root.join("model/ids.toml")).unwrap();
        for bad in [
            ["cx-01", "build", "parsing", "lowercase ID"],
            ["CX01", "build", "parsing", "no hyphen"],
            ["CX-", "build", "parsing", "no number"],
            ["CX-01", "proven", "parsing", "unknown level"],
            ["CX-01", "build", "Parsing", "uppercase suite"],
            ["CX-01", "build", "../x", "escaping suite"],
            ["CX-01", "build", "parsing", "  "],
            ["CX-01", "build", "parsing", "two\nlines"],
        ] {
            assert!(
                new_capability(&root, &args(bad)).is_err(),
                "{bad:?} was accepted"
            );
        }
        let short = vec!["CX-01".to_string(), "build".to_string()];
        assert!(new_capability(&root, &short).is_err());
        assert_eq!(
            std::fs::read_to_string(root.join("model/ids.toml")).unwrap(),
            ids
        );
        assert!(!root.join("features/suites/parsing.feature").exists());

        new_capability(&root, &args(["CX-01", "build", "parsing", "first"])).unwrap();
        let once = std::fs::read_to_string(root.join("model/ids.toml")).unwrap();
        assert!(new_capability(&root, &args(["CX-01", "open", "other", "again"])).is_err());
        assert_eq!(
            std::fs::read_to_string(root.join("model/ids.toml")).unwrap(),
            once
        );
        assert!(!root.join("features/suites/other.feature").exists());
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn the_empty_register_becomes_a_table() {
        let c = Capability::parse(&args(["CX-01", "build", "s", "x"])).unwrap();
        let out = register_with("spec = \"template/1\"\n\nid = []\n", &c);
        assert!(!out.contains("id = []"));
        assert!(out.ends_with(
            "[[id]]\nid = \"CX-01\"\nlevel = \"build\"\nsuite = \"s\"\nstatement = \"x\"\n"
        ));
        assert_eq!(c.test_name(), "s_cx_01");
    }
}
