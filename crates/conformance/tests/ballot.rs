//! The `ballot` suite: one test per scenario in `features/suites/ballot.feature`.
//!
//! The proof itself is checked by the Lean kernel when `just vv` runs
//! `prismpm verify` on `app/`. What this test holds fixed is the claim that
//! proof is about: the theorem's exact statement and axioms, and that the
//! response the application returns is built from the functions it names. A
//! weakened statement, an extra axiom, or a tally computed some other way would
//! still verify, and would no longer be the claim `BA-01` makes.

use std::path::PathBuf;

fn model() -> String {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .expect("crates/conformance is two below the root")
        .to_path_buf();
    std::fs::read_to_string(root.join("app/src/Ballot.lex.tex")).expect("the ballot model")
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

/// `BA-01`: Every ballot is counted exactly once: ayes plus nays equals ballots cast, for every list of ballots
#[test]
fn ballot_ba_01() {
    let model = model();
    let theorem = declaration(&model, "every_ballot_counted_once");
    assert!(
        theorem.contains("parameters: [ballots : (List Ballot)],"),
        "BA-01 must quantify over every list of ballots:\n{theorem}"
    );
    assert!(
        theorem.contains("statement: (((ayes ballots) + (nays ballots)) = (cast ballots)),"),
        "BA-01's statement changed:\n{theorem}"
    );
    assert!(
        theorem.contains("axioms: [Quot.sound, propext]"),
        "BA-01 must rest on Quot.sound and propext only:\n{theorem}"
    );

    let tally = declaration(&model, "tally");
    for function in ["(ayes ballots)", "(nays ballots)", "(cast ballots)"] {
        assert!(
            tally.contains(function),
            "the returned tally must be computed by {function}, the function BA-01 proves"
        );
    }
    let dispatch = declaration(&model, "dispatch");
    assert!(
        dispatch.contains("(tally ballots)"),
        "dispatch must answer with tally"
    );
}
