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
    let output = String::from_utf8_lossy(&result.stderr);
    const EXPECTED: &[&str] = [
        "test_passes_two_regular_presentation_paths",
        "test_rejects_unapproved_png",
        "test_rejects_mixed_source_change",
        "test_rejects_workflow_change",
        "test_rejects_unknown_doc",
        "test_rejects_executable_readme",
        "test_rejects_symlink_readme",
        "test_rejects_broken_anchor",
        "test_rejects_broken_local_target",
        "test_rejects_reference_style_missing_file",
        "test_rejects_reference_style_broken_anchor",
        "test_rejects_reference_definition_without_usage",
        "test_rejects_empty_label_broken_link",
        "test_rejects_empty_alt_broken_image",
        "test_rejects_fenced_heading_as_fake_anchor",
        "test_rejects_unterminated_fence",
        "test_rejects_traversal",
        "test_rejects_generated_source_header",
        "test_rejects_modified_generated_region",
        "test_rejects_removed_protected_region",
        "test_rejects_uorust_release_target_change",
        "test_rejects_removed_uorust_release_target_markers",
        "test_rejects_unknown_generated_marker",
        "test_rejects_missing_base",
        "test_rejects_mismatched_head",
        "test_rejects_no_readme_change",
        "test_rejects_renamed_readme",
        "test_rejects_asset_alone_or_delete",
        "test_rejects_newly_injected_policy_marker",
    ];
    assert!(
        output.contains(&format!("Ran {} tests", EXPECTED.len())),
        "RD-01 must execute the entire pinned fixture inventory:\n{output}"
    );
    assert!(
        !output.contains("skipped=")
            && !output.contains("expected failures=")
            && !output.contains(" ... skipped")
            && !output.contains(" ... expected failure"),
        "RD-01 must reject skipped or suppressed test cases:\n{output}"
    );
    for name in EXPECTED {
        assert!(
            output.contains(&format!("{name} (")) && output.contains(&format!("... ok")),
            "RD-01 fixture {name} was omitted:\n{output}"
        );
    }
    assert!(
        result.status.success(),
        "RD-01 planted fixtures failed:\n{}\n{}",
        String::from_utf8_lossy(&result.stdout),
        String::from_utf8_lossy(&result.stderr)
    );
}
