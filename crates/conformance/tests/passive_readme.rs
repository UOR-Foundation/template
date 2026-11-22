//! RD-01: task-owned passive README classifier is fail-closed.
//! This is not yet the normative acceptance tier.

use std::path::PathBuf;
use std::process::Command;

/// RD-01: The passive README classifier accepts a verified presentation-only diff and refuses unsupported paths, changed generated regions, and unsafe references
#[test]
fn passive_readme_rd_01() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    let result = Command::new("python3")
        .args([
            "-m",
            "unittest",
            "discover",
            "-s",
            "ci",
            "-p",
            "test_passive_readme_scope.py",
            "-v",
        ])
        .current_dir(root)
        .output()
        .expect("python3 needed for the passive README classifier fixtures");
    assert!(
        result.status.success(),
        "RD-01 planted fixtures failed:\n{}\n{}",
        String::from_utf8_lossy(&result.stdout),
        String::from_utf8_lossy(&result.stderr)
    );
}
