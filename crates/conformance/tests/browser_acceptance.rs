//! TC-02: source-level browser acceptance behavior and stable error codes.
//! This test executes as part of cargo test --workspace in the canonical just vv.
use std::path::PathBuf;
use std::process::Command;

#[test]
fn browser_acceptance_tc_02() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .expect("conformance crate is two levels below repository root")
        .to_path_buf();
    let result = Command::new("node")
        .args(["--test", "bootstrap/acceptance-result.test.mjs"])
        .current_dir(root)
        .output()
        .expect("locked SDK provides Node");
    assert!(
        result.status.success(),
        "TC-02 browser acceptance failed\nstdout:\n{}\nstderr:\n{}",
        String::from_utf8_lossy(&result.stdout),
        String::from_utf8_lossy(&result.stderr)
    );
}

