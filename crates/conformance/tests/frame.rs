//! Executes the production frame regression under Node's isolated VM loader.

use std::path::PathBuf;
use std::process::Command;

#[test]
fn frame_fr_01() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .expect("crates/conformance is two below the root")
        .to_path_buf();
    let result = Command::new("node")
        .arg("site/worker-gate.mjs")
        .current_dir(root)
        .output()
        .expect("Node executes the production frame regression");
    assert!(
        result.status.success(),
        "FR-01: {}\n{}",
        String::from_utf8_lossy(&result.stdout),
        String::from_utf8_lossy(&result.stderr)
    );
}

/// `FR-02`: A returning browser whose worker kept an earlier deploy serves this deploy from the navigation that brings its page
#[test]
fn frame_fr_02() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .expect("crates/conformance is two below the root")
        .to_path_buf();
    let result = Command::new("node")
        .arg("site/sw-gate.mjs")
        .current_dir(root)
        .output()
        .expect("Node executes the production service worker regression");
    assert!(
        result.status.success(),
        "FR-02: {}\n{}",
        String::from_utf8_lossy(&result.stdout),
        String::from_utf8_lossy(&result.stderr)
    );
}
