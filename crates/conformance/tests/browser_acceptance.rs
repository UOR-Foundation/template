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
        .args([
            "--test",
            "--test-reporter=tap",
            "bootstrap/acceptance-result.test.mjs",
        ])
        .current_dir(root)
        .output()
        .expect("locked SDK provides Node");
    let stdout = String::from_utf8_lossy(&result.stdout);
    let stderr = String::from_utf8_lossy(&result.stderr);
    assert!(
        result.status.success(),
        "TC-02 browser acceptance failed\nstdout:\n{stdout}\nstderr:\n{stderr}"
    );

    // A green process status is not evidence that tests actually executed:
    // Node exits successfully if every declaration is test.skip(...).
    const EXPECTED: [&str; 8] = [
        "worker preserves failing vector identities but not raw vector contents",
        "worker preserves a zero-failures result",
        "worker reports malformed result as an error, not a success",
        "missing, duplicated and out-of-range failures refuse",
        "public acceptance diagnostics match their authoritative model",
        "count mismatch exposes its stable typed diagnostic",
        "fully declared negative result identifies every failing vector",
        "spec view marks the correct failing row, not all green",
    ];
    let executed: Vec<&str> = stdout
        .lines()
        .filter_map(|line| line.strip_prefix("# Subtest: "))
        .collect();
    assert_eq!(
        executed.as_slice(),
        &EXPECTED,
        "TC-02 required acceptance cases were omitted, renamed or duplicated:\n{stdout}"
    );
    for (name, expected) in [
        ("tests", 8),
        ("pass", 8),
        ("fail", 0),
        ("cancelled", 0),
        ("skipped", 0),
        ("todo", 0),
    ] {
        let summary = format!("# {name} {expected}");
        assert_eq!(
            stdout.lines().filter(|line| *line == summary).count(),
            1,
            "TC-02 expected exactly one {summary} summary:\n{stdout}"
        );
    }
}
