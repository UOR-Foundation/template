//! The `contract` suite: one test per scenario in `features/suites/contract.feature`.
//!
//! The proofs are checked by the Lean kernel when `just vv` runs
//! `prismpm verify` on `app/`. What this test holds fixed is the claim those
//! proofs are about: both theorems' exact statements and axioms, the six
//! universal policy files they quantify over, and that the verdict the
//! application returns is decided by the function they prove. A weakened
//! statement, a dropped file, an extra axiom, or a verdict decided some other
//! way would still verify, and would no longer be the claim `TC-01` makes.

use std::path::PathBuf;

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .expect("crates/conformance is two below the root")
        .to_path_buf()
}

/// The body of the top-level declaration named `name`, up to its closing brace.
fn declaration<'a>(model: &'a str, name: &str) -> &'a str {
    let start = model
        .find(&format!("\n  name: {name},\n"))
        .unwrap_or_else(|| panic!("{name} is not declared"));
    let end = model[start..]
        .find("\n}\n")
        .unwrap_or_else(|| panic!("{name} is not closed"));
    &model[start..start + end]
}

/// `TC-01`: The checker answers conformant exactly when every universal policy file's observed digest equals its locked digest
#[test]
fn contract_tc_01() {
    let model = std::fs::read_to_string(root().join("app/src/Contract.lex.tex"))
        .expect("the contract model");

    let sound = declaration(&model, "conformant_sound");
    assert!(
        sound.contains(
            "statement: (((conformant observation) = true) -> (Conformant observation)),"
        ),
        "TC-01's soundness statement changed:\n{sound}"
    );
    let complete = declaration(&model, "conformant_complete");
    assert!(
        complete.contains(
            "statement: ((Conformant observation) -> ((conformant observation) = true)),"
        ),
        "TC-01's completeness statement changed:\n{complete}"
    );
    for theorem in [sound, complete] {
        assert!(
            theorem.contains("parameters: [observation : Observation],")
                && theorem.contains("axioms: [propext]"),
            "TC-01 quantifies over every observation and rests on propext only:\n{theorem}"
        );
    }

    // The proposition names every universal policy file whose digest
    // `template.lock` binds: all of them but the self-referential lock.
    let contract =
        std::fs::read_to_string(root().join("template-contract.json")).expect("contract");
    let list = contract
        .split("\"universal_policy_paths\":[")
        .nth(1)
        .and_then(|rest| rest.split(']').next())
        .expect("universal_policy_paths");
    let bound: Vec<&str> = list
        .split(',')
        .map(|p| p.trim_matches('"'))
        .filter(|p| *p != "template.lock")
        .collect();
    let proposition = declaration(&model, "Conformant");
    let fields = [
        "devcontainer",
        "bootstrap",
        "agents",
        "verification",
        "prismpmLock",
        "templateContract",
    ];
    assert_eq!(bound.len(), fields.len(), "the contract binds {bound:?}");
    let drifted = declaration(&model, "drifted");
    for (field, path) in fields.iter().zip(&bound) {
        assert!(
            proposition.contains(&format!(
                "((project (project observation {field}) expected) = (project (project observation {field}) observed))"
            )),
            "Conformant must require {path} ({field}) to match"
        );
        assert!(
            drifted.contains(&format!("(pinMatches (project observation {field}))"))
                && drifted.contains(&format!("\"{path}\"")),
            "a drifted {path} must be named in the verdict"
        );
    }

    let dispatch = declaration(&model, "dispatch");
    assert!(
        dispatch.contains("(if (conformant (observe value)) then"),
        "the verdict must be decided by conformant, the function TC-01 proves"
    );
}
