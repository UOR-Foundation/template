//! Checks for the hand-reviewed bootstrap policy.

use std::path::{Path, PathBuf};

use crate::Fail;
use sha2::{Digest, Sha256};

const UNIVERSAL_POLICY_PATHS: [&str; 7] = [
    ".devcontainer/devcontainer.json",
    ".github/workflows/bootstrap.yml",
    "AGENTS.md",
    "VERIFICATION.md",
    "prismpm.lock",
    "template-contract.json",
    "template.lock",
];
const PROJECT_CONTENT_PATHS: [&str; 1] = ["CONFORMANCE.md"];

fn read(root: &Path, path: &str) -> Result<String, Fail> {
    Ok(std::fs::read_to_string(root.join(path))
        .map_err(|error| format!("reading {path}: {error}"))?)
}

fn immutable_image(value: &str) -> bool {
    value.rsplit_once("@sha256:").is_some_and(|(name, digest)| {
        let valid_registry = name.split_once('/').is_some_and(|(registry, path)| {
            let (host, port) = registry
                .rsplit_once(':')
                .map_or((registry, None), |(host, port)| (host, Some(port)));
            !host.is_empty()
                && host.bytes().all(|byte| {
                    byte.is_ascii_lowercase() || byte.is_ascii_digit() || b".-".contains(&byte)
                })
                && port.is_none_or(|port| port.parse::<u16>().is_ok_and(|port| port > 0))
                && !path.is_empty()
                && path.bytes().all(|byte| {
                    byte.is_ascii_lowercase() || byte.is_ascii_digit() || b"./_-".contains(&byte)
                })
        });
        valid_registry
            && digest.len() == 64
            && digest
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
    })
}

fn sdk_image(lock: &str) -> Option<&str> {
    let prefix = "\"sdk_image\":\"";
    let rest = lock.split_once(prefix)?.1;
    rest.split_once('"').map(|(value, _)| value)
}

fn sha256(bytes: &[u8]) -> String {
    format!("sha256:{:x}", Sha256::digest(bytes))
}

fn content_matches(bytes: &[u8], expected: &str) -> bool {
    sha256(bytes) == expected
}

fn policy_boundary_is_canonical(universal: &[&str], project: &[&str], required: &[&str]) -> bool {
    let mut union = universal.to_vec();
    union.extend(project.iter().copied());
    union.sort_by(|left, right| left.as_bytes().cmp(right.as_bytes()));
    universal == UNIVERSAL_POLICY_PATHS
        && project == PROJECT_CONTENT_PATHS
        && union == required
        && union
            .windows(2)
            .all(|pair| pair[0].as_bytes() < pair[1].as_bytes())
}

fn audit_policy_files(root: &Path, lock: &serde_json::Value) -> Result<(), Fail> {
    let contract_bytes = std::fs::read(root.join("template-contract.json"))?;
    let contract: serde_json::Value = serde_json::from_slice(&contract_bytes)?;
    if serde_json::to_vec(&contract)? != contract_bytes {
        return Err("template-contract.json is not canonical JSON".into());
    }
    let expected_keys = [
        "project_content_paths",
        "required_paths",
        "schema",
        "universal_policy_paths",
        "version",
    ];
    if contract
        .as_object()
        .is_none_or(|object| object.keys().map(String::as_str).ne(expected_keys))
        || contract["schema"] != "uor/template-contract/1"
        || contract["version"] != "1.0.0"
    {
        return Err("template contract schema or version is unsupported".into());
    }
    let universal = contract["universal_policy_paths"]
        .as_array()
        .ok_or("template contract has no universal_policy_paths")?
        .iter()
        .map(|value| {
            value
                .as_str()
                .ok_or("universal policy path is not a string")
        })
        .collect::<Result<Vec<_>, _>>()?;
    let project = contract["project_content_paths"]
        .as_array()
        .ok_or("template contract has no project_content_paths")?
        .iter()
        .map(|value| value.as_str().ok_or("project content path is not a string"))
        .collect::<Result<Vec<_>, _>>()?;
    let required = contract["required_paths"]
        .as_array()
        .ok_or("template contract has no required_paths")?
        .iter()
        .map(|value| value.as_str().ok_or("required path is not a string"))
        .collect::<Result<Vec<_>, _>>()?;
    if !policy_boundary_is_canonical(&universal, &project, &required) {
        return Err("template contract path boundary is not canonical or disjoint".into());
    }
    if lock["contract_digest"] != sha256(&contract_bytes) {
        return Err("template.lock contract digest is stale".into());
    }
    let mut expected = universal
        .iter()
        .filter(|path| **path != "template.lock")
        .map(|path| (*path).to_owned())
        .collect::<Vec<_>>();
    expected.sort_by(|left, right| left.as_bytes().cmp(right.as_bytes()));
    expected.dedup();

    let policy_files = lock["policy_files"]
        .as_array()
        .ok_or("template.lock has no policy_files")?;
    let observed = policy_files
        .iter()
        .map(|row| -> Result<String, Fail> {
            let object = row.as_object().ok_or("policy_files row is not an object")?;
            if object.len() != 2 || !object.contains_key("path") || !object.contains_key("sha256") {
                return Err("policy_files row is not closed".into());
            }
            let path = row["path"]
                .as_str()
                .ok_or("policy_files path is not a string")?;
            let digest = row["sha256"]
                .as_str()
                .ok_or("policy_files sha256 is not a string")?;
            let bytes = std::fs::read(root.join(path))?;
            if !content_matches(&bytes, digest) {
                return Err(format!("universal policy drift: {path}").into());
            }
            Ok(path.to_owned())
        })
        .collect::<Result<Vec<_>, Fail>>()?;
    if observed != expected {
        return Err("template.lock policy_files does not close the universal policy paths".into());
    }
    let tree_bytes = serde_json::to_vec(policy_files)?;
    let expected_tree = sha256(&tree_bytes);
    if lock["policy_tree_sha256"].as_str() != Some(expected_tree.as_str()) {
        return Err("template.lock policy tree digest is stale".into());
    }
    Ok(())
}

fn audit_sdk_inventory(lock: &serde_json::Value) -> Result<(), Fail> {
    let inventory_path = std::env::var_os("PRISMPM_SDK_INVENTORY")
        .ok_or("audit-bootstrap must run inside the digest-selected PrismPM SDK")?;
    let inventory: serde_json::Value = serde_json::from_slice(&std::fs::read(inventory_path)?)?;
    let artifacts = inventory["artifacts"]
        .as_array()
        .ok_or("running SDK has no artifact inventory")?;
    let locked = lock["inventory"]
        .as_array()
        .ok_or("prismpm.lock has no SDK inventory")?;
    let observed_artifacts = locked
        .iter()
        .filter(|row| row["id"] != "sdk-manifest")
        .cloned()
        .collect::<Vec<_>>();
    if observed_artifacts != *artifacts {
        return Err("prismpm.lock artifact inventory disagrees with the running SDK".into());
    }
    let image_digest = lock["sdk_image"]
        .as_str()
        .and_then(|image| image.rsplit_once('@').map(|(_, digest)| digest))
        .ok_or("prismpm.lock SDK image is malformed")?;
    let manifest = locked
        .iter()
        .find(|row| row["id"] == "sdk-manifest")
        .ok_or("prismpm.lock has no SDK manifest inventory row")?;
    if manifest["kind"] != "image" || manifest["digest"] != image_digest {
        return Err("SDK manifest inventory row disagrees with sdk_image".into());
    }
    Ok(())
}

fn action_reference_is_pinned(line: &str) -> bool {
    let Some(reference) = line.trim().strip_prefix("uses:") else {
        return true;
    };
    let reference = reference.split('#').next().unwrap_or_default().trim();
    if reference.starts_with("./") {
        return false;
    }
    let Some((name, revision)) = reference.rsplit_once('@') else {
        return false;
    };
    !name.is_empty()
        && revision.len() == 40
        && revision
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}

fn pipeline_lifecycle_is_complete(source: &str) -> bool {
    let count = |needle: &str| source.matches(needle).count();
    count("command: build") == 1
        && count("command: fetch") == 2
        && count("command: pull") == 5
        && count("command: prepare-promotion") == 2
        && count("command: sign-evidence") == 1
        && count("command: verify-release") == 4
        && count("Explicitly replay candidate release trust after the clean pull") == 2
        && count("Explicitly replay deployed release trust after the clean pull") == 1
        && count("Independently replay every signature and promotion decision") == 1
        && source.contains("policy: ${{ steps.policy.outputs.policy-path }}")
        && source.contains("trusted-root: ${{ steps.policy.outputs.trusted-root-path }}")
        && count("name: prismpm-deployment-plan") == 2
        && count("path: .prism/plans") == 2
        && count("name: prismpm-deployment-state") == 2
        && count("path: .prism/targets") == 2
        && !source.contains("inputs.promotion-policy")
        && !source.contains("inputs.trusted-root")
}

fn workflow_files(root: &Path) -> Result<Vec<PathBuf>, Fail> {
    let directory = root.join(".github/workflows");
    let mut paths = std::fs::read_dir(&directory)?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.extension()
                .is_some_and(|extension| extension == "yml" || extension == "yaml")
        })
        .collect::<Vec<_>>();
    paths.sort();
    Ok(paths)
}

/// Validate immutable SDK selection and the independent workflow trust root.
pub fn audit(root: &Path) -> Result<(), Fail> {
    if root.join(".github/actions/prismpm").exists() {
        return Err(
            "the template must consume the shared PrismPM action, not a copied wrapper".into(),
        );
    }
    let sdk_lock_bytes = std::fs::read(root.join("prismpm.lock"))
        .map_err(|error| format!("prismpm.lock is required: {error}"))?;
    let lock: serde_json::Value = serde_json::from_slice(&sdk_lock_bytes)?;
    if serde_json::to_vec(&lock)? != sdk_lock_bytes {
        return Err("prismpm.lock is not canonical JSON".into());
    }
    let lock_text = std::str::from_utf8(&sdk_lock_bytes)?;
    let image = sdk_image(lock_text)
        .filter(|value| immutable_image(value))
        .ok_or("prismpm.lock does not select an immutable lowercase SDK manifest digest")?;
    audit_sdk_inventory(&lock)?;
    let template_lock_bytes = std::fs::read(root.join("template.lock"))
        .map_err(|error| format!("template.lock is required: {error}"))?;
    let template_lock: serde_json::Value = serde_json::from_slice(&template_lock_bytes)?;
    if serde_json::to_vec(&template_lock)? != template_lock_bytes {
        return Err("template.lock is not canonical JSON".into());
    }
    if template_lock["schema"] != "uor/template-lock/1"
        || template_lock["sdk_image"] != image
        || template_lock["template_repository"] != "https://github.com/UOR-Foundation/template"
        || !template_lock["template_revision"]
            .as_str()
            .is_some_and(|revision| {
                revision.len() == 40
                    && revision
                        .bytes()
                        .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
            })
    {
        return Err("template.lock identity is stale or mutable".into());
    }
    audit_policy_files(root, &template_lock)?;
    let devcontainer = read(root, ".devcontainer/devcontainer.json")?;
    let devcontainer_value: serde_json::Value = serde_json::from_str(&devcontainer)?;
    let mounts = devcontainer_value["mounts"].as_array();
    if devcontainer_value["image"] != image
        || devcontainer_value.get("build").is_some()
        || devcontainer_value.get("dockerFile").is_some()
        || devcontainer_value.get("features").is_some()
        || devcontainer_value["containerUser"] != "root"
        || devcontainer_value["remoteUser"] != "vscode"
        || devcontainer_value["overrideCommand"] != false
        || mounts.is_none_or(|mounts| {
            !mounts.iter().any(|mount| {
                mount == "source=/var/run/docker.sock,target=/var/run/docker.sock,type=bind"
            }) || !mounts.iter().any(|mount| {
                mount
                == "source=${localEnv:HOME}/.docker,target=/home/vscode/.docker,type=bind,readonly"
            })
        })
        || devcontainer_value["runArgs"]
            .as_array()
            .is_none_or(|arguments| {
                !arguments
                    .iter()
                    .any(|argument| argument == "prismpm-devcontainer-init")
            })
        || devcontainer.contains("curl")
        || devcontainer.contains("stable")
    {
        return Err("the devcontainer is not a direct use of the locked SDK image".into());
    }

    let bootstrap = read(root, ".github/workflows/bootstrap.yml")?;
    if bootstrap.contains("pull_request_target")
        || !bootstrap.contains("permissions:\n  contents: read")
        || !bootstrap.contains("persist-credentials: false")
    {
        return Err("bootstrap.yml is not a read-only pull-request trust root".into());
    }

    for path in workflow_files(root)? {
        let source = std::fs::read_to_string(&path)?;
        if source.contains("ubuntu-latest")
            || source.contains("@main")
            || source.contains("@master")
            || source
                .lines()
                .any(|line| line.trim().starts_with("uses:") && !action_reference_is_pinned(line))
        {
            return Err(format!("{} contains a floating workflow input", path.display()).into());
        }
    }

    let reusable = read(root, ".github/workflows/prismpm.yml")?;
    let action_lines = reusable
        .lines()
        .filter(|line| line.contains("# prismpm-action-input"))
        .collect::<Vec<_>>();
    if action_lines.is_empty()
        || action_lines
            .iter()
            .any(|line| !action_reference_is_pinned(line))
    {
        return Err(
            "reusable pipeline does not use a full-commit-pinned shared PrismPM action".into(),
        );
    }
    let action = action_lines[0]
        .split_once("uses:")
        .and_then(|(_, value)| value.split('#').next())
        .map(str::trim)
        .ok_or("reusable pipeline action reference is malformed")?;
    if !action.starts_with("UOR-Foundation/PrismPM/action@")
        || action_lines.iter().any(|line| !line.contains(action))
    {
        return Err("reusable pipeline action references are inconsistent".into());
    }
    if !pipeline_lifecycle_is_complete(&reusable) {
        return Err(
            "reusable pipeline does not preserve the build/plan/state artifacts or complete the SDK-owned signing lifecycle"
                .into(),
        );
    }
    for required in [
        "permissions: {}",
        "build product once without publication credentials",
        "reject publication from an unprotected ref",
        "REF_PROTECTED: ${{ github.ref_protected }}",
        "environment: release",
        "id-token: write",
        "deploy the planned digest without rebuilding",
        "Require post-deployment state and release verification",
        "command: sign",
        "command: prepare-promotion",
        "command: sign-evidence",
        "command: verify-release",
        "command: push",
        "command: promote",
        "promotion-to: candidate",
        "promotion-to: accepted",
        "plan: ${{ needs.plan.outputs.plan-digest }}",
        "trusted-root: ${{ steps.policy.outputs.trusted-root-path }}",
        "policy: ${{ steps.policy.outputs.policy-path }}",
    ] {
        if !reusable.contains(required) {
            return Err(format!("reusable pipeline is missing policy: {required}").into());
        }
    }

    println!("audit-bootstrap: SDK and workflow trust roots are immutable and separated");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        action_reference_is_pinned, content_matches, immutable_image,
        pipeline_lifecycle_is_complete, policy_boundary_is_canonical, sha256,
        PROJECT_CONTENT_PATHS, UNIVERSAL_POLICY_PATHS,
    };

    #[test]
    fn floating_action_plant_is_rejected() {
        assert!(!action_reference_is_pinned("uses: actions/checkout@v4"));
        assert!(action_reference_is_pinned(
            "uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683"
        ));
        assert!(!action_reference_is_pinned(
            "uses: ./.github/actions/prismpm"
        ));
    }

    #[test]
    fn mutable_sdk_plant_is_rejected() {
        assert!(!immutable_image(
            "ghcr.io/uor-foundation/prismpm-sdk:latest"
        ));
        assert!(immutable_image(&format!(
            "ghcr.io/uor-foundation/prismpm-sdk@sha256:{}",
            "a".repeat(64)
        )));
        assert!(immutable_image(&format!(
            "localhost:5000/prismpm-sdk@sha256:{}",
            "a".repeat(64)
        )));
        assert!(!immutable_image(&format!(
            "localhost:65536/prismpm-sdk@sha256:{}",
            "a".repeat(64)
        )));
    }

    #[test]
    fn universal_policy_drift_plant_is_rejected() {
        let recorded = sha256(b"reviewed policy\n");
        assert!(content_matches(b"reviewed policy\n", &recorded));
        assert!(!content_matches(b"changed policy\n", &recorded));
    }

    #[test]
    fn narrowed_policy_boundary_plant_is_rejected() {
        let mut required = UNIVERSAL_POLICY_PATHS.to_vec();
        required.extend(PROJECT_CONTENT_PATHS);
        required.sort_by(|left, right| left.as_bytes().cmp(right.as_bytes()));
        assert!(policy_boundary_is_canonical(
            &UNIVERSAL_POLICY_PATHS,
            &PROJECT_CONTENT_PATHS,
            &required,
        ));
        assert!(!policy_boundary_is_canonical(
            &UNIVERSAL_POLICY_PATHS[..6],
            &PROJECT_CONTENT_PATHS,
            &required,
        ));
    }

    #[test]
    fn incomplete_release_lifecycle_plant_is_rejected() {
        let complete = r#"
          command: build
          command: fetch
          command: fetch
          command: pull
          command: pull
          command: pull
          command: pull
          command: pull
          command: prepare-promotion
          command: prepare-promotion
          command: sign-evidence
          command: verify-release
          command: verify-release
          command: verify-release
          command: verify-release
          Explicitly replay candidate release trust after the clean pull
          Explicitly replay candidate release trust after the clean pull
          Explicitly replay deployed release trust after the clean pull
          Independently replay every signature and promotion decision
          policy: ${{ steps.policy.outputs.policy-path }}
          trusted-root: ${{ steps.policy.outputs.trusted-root-path }}
          name: prismpm-deployment-plan
          name: prismpm-deployment-plan
          path: .prism/plans
          path: .prism/plans
          name: prismpm-deployment-state
          name: prismpm-deployment-state
          path: .prism/targets
          path: .prism/targets
        "#;
        assert!(pipeline_lifecycle_is_complete(complete));
        assert!(!pipeline_lifecycle_is_complete(
            &complete.replace("          command: sign-evidence\n", "")
        ));
        assert!(!pipeline_lifecycle_is_complete(
            &complete.replace("          path: .prism/plans\n", "")
        ));
    }
}
