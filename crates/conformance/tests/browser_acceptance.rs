//! TC-02: source-level browser acceptance behavior and stable error codes.
//! This test executes as part of cargo test --workspace in the canonical just vv.
use std::path::PathBuf;
use std::process::Command;

fn require_complete_tap(tap: &str) -> Result<(), String> {
    const REQUIRED: [&str; 8] = [
        "worker preserves failing vector identities but not raw vector contents",
        "worker preserves a zero-failures result",
        "worker reports malformed result as an error, not a success",
        "missing, duplicated and out-of-range failures refuse",
        "public acceptance diagnostics match their authoritative model",
        "count mismatch exposes its stable typed diagnostic",
        "fully declared negative result identifies every failing vector",
        "spec view marks the correct failing row, not all green",
    ];
    let cases: Vec<&str> = tap
        .lines()
        .filter_map(|line| line.strip_prefix("# Subtest: "))
        .collect();
    if cases.as_slice() != &REQUIRED[..] {
        return Err(
            "TC-02: required test identity was skipped, removed, renamed or repeated".into(),
        );
    }

    for (key, expected) in [
        ("tests", 8),
        ("pass", 8),
        ("fail", 0),
        ("cancelled", 0),
        ("skipped", 0),
        ("todo", 0),
    ] {
        let required = format!("# {key} {expected}");
        if tap.lines().filter(|line| *line == required).count() != 1 {
            return Err(format!(
                "TC-02: invalid TAP summary for {key}; expected {required}"
            ));
        }
    }
    Ok(())
}

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

    // Planted negative controls mutate the real test transcript and must
    // refuse rather than bless an empty or skipped successful Node process.
    let skipped =
        stdout
            .replacen("# pass 8", "# pass 0", 1)
            .replacen("# skipped 0", "# skipped 8", 1);
    assert_ne!(skipped, stdout, "TC-02 skipped-test plant was not applied");
    assert!(
        require_complete_tap(&skipped).is_err(),
        "TC-02 skipped-test plant did not fail"
    );

    let missing = stdout.replacen(
        "# Subtest: worker preserves a zero-failures result",
        "# Subtest: deliberately missing required case",
        1,
    );
    assert_ne!(missing, stdout, "TC-02 missing-test plant was not applied");
    assert!(
        require_complete_tap(&missing).is_err(),
        "TC-02 missing-test plant did not fail"
    );

    if let Err(error) = require_complete_tap(&stdout) {
        panic!("TC-02 unmodified acceptance transcript failed: {error}\n{stdout}");
    }
}
