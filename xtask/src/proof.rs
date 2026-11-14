//! The proof `just app` keeps, and the check a run makes before it reuses one.
//!
//! The cache key only finds a candidate. It is not trusted: a kept proof is
//! reused only when its attestation ID resolves to the attestation it names,
//! that attestation's evidence is the evidence it hashes, and the attestation
//! binds the inputs this checkout would prove now. Anything else proves in full.

use std::path::Path;
use std::process::Command;

use crate::Fail;
use serde_json::Value;
use sha2::{Digest, Sha256};

/// Where `just app` keeps a proof, and where bootstrap.yml caches it from.
const KEPT: &str = ".prism-proof";
/// The three files `prismpm verify` publishes under `verified/<attestation-id>/`.
const EVIDENCE: [&str; 3] = [
    "manifest.json",
    "lexlean-attestation.json",
    "application-acceptance.json",
];
/// Every checked-in byte the proof reads, as bootstrap.yml's cache key names it.
const INPUT_PATHS: [&str; 4] = ["app", "prismpm.lock", "Justfile", "rust-toolchain.toml"];

/// A kept proof, as read back from `.prism-proof`.
struct Kept {
    attestation: String,
    manifest: Vec<u8>,
    lexlean: Vec<u8>,
    acceptance: Vec<u8>,
    inputs: String,
}

/// What this checkout and this SDK image would prove now.
struct Observed {
    inputs: String,
    source_id: String,
    semantic_id: String,
    lean_sha256: String,
    lake_sha256: String,
    arch: String,
    /// `(path, sha256)` of each Lake workspace file the attestation names, read from `app/`.
    workspace: Vec<(String, String)>,
}

fn hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn is_id(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn text<'a>(value: &'a Value, pointer: &str) -> Result<&'a str, String> {
    value
        .pointer(pointer)
        .and_then(Value::as_str)
        .ok_or_else(|| format!("the attestation has no {pointer}"))
}

fn same(what: &str, kept: &str, observed: &str) -> Result<(), String> {
    if kept == observed {
        Ok(())
    } else {
        Err(format!(
            "{what} differs: the kept proof has {kept}, this run has {observed}"
        ))
    }
}

fn workspace_paths(lexlean: &Value) -> Result<Vec<String>, String> {
    let rows = lexlean
        .get("lake_workspace")
        .and_then(Value::as_array)
        .ok_or("the attestation names no Lake workspace")?;
    rows.iter()
        .map(|row| {
            let path = text(row, "/path")?;
            if path.is_empty() || path.starts_with('/') || path.split('/').any(|part| part == "..")
            {
                return Err(format!(
                    "the attestation names a Lake file outside app/: {path}"
                ));
            }
            Ok(path.to_owned())
        })
        .collect()
}

/// The whole read-time check. Pure, so each planted defect is a unit test.
fn binds(kept: &Kept, observed: &Observed) -> Result<(), String> {
    if !is_id(&kept.attestation) {
        return Err("the kept attestation ID is not a SHA-256".into());
    }
    // The ID resolves: prismpm defines the attestation ID as the SHA-256 of
    // the manifest bytes.
    same(
        "the manifest's address",
        &kept.attestation,
        &hex(&kept.manifest),
    )?;
    let parse = |bytes: &[u8], name: &str| {
        serde_json::from_slice::<Value>(bytes).map_err(|error| format!("{name}: {error}"))
    };
    let manifest = parse(&kept.manifest, "manifest.json")?;
    let lexlean = parse(&kept.lexlean, "lexlean-attestation.json")?;
    let acceptance = parse(&kept.acceptance, "application-acceptance.json")?;
    same(
        "the manifest schema",
        text(&manifest, "/schema")?,
        "prismpm/application-verification-manifest/2",
    )?;
    // The manifest binds the evidence it names, byte for byte.
    same(
        "the LexLean attestation",
        text(&manifest, "/lexlean_attestation_sha256")?,
        &hex(&kept.lexlean),
    )?;
    same(
        "the application acceptance",
        text(&manifest, "/acceptance_sha256")?,
        &hex(&kept.acceptance),
    )?;
    same("the LexLean status", text(&lexlean, "/status")?, "verified")?;
    same(
        "the acceptance status",
        text(&acceptance, "/status")?,
        "verified",
    )?;
    same(
        "the acceptance's LexLean attestation",
        text(&acceptance, "/lexlean_attestation_id")?,
        text(&lexlean, "/attestation_id")?,
    )?;
    same(
        "the acceptance's build",
        text(&acceptance, "/build_id")?,
        text(&manifest, "/build_id")?,
    )?;
    // The attestation binds this checkout's model and this image's Lean.
    same(
        "the source ID",
        text(&lexlean, "/source_id")?,
        &observed.source_id,
    )?;
    same(
        "the semantic ID",
        text(&lexlean, "/semantic_id")?,
        &observed.semantic_id,
    )?;
    same(
        "the Lean executable",
        text(&lexlean, "/toolchain/lean/executable_sha256")?,
        &observed.lean_sha256,
    )?;
    same(
        "the Lake executable",
        text(&lexlean, "/toolchain/lake/executable_sha256")?,
        &observed.lake_sha256,
    )?;
    same(
        "the architecture",
        text(&lexlean, "/host/arch")?,
        &observed.arch,
    )?;
    let rows = lexlean
        .get("lake_workspace")
        .and_then(Value::as_array)
        .ok_or("the attestation names no Lake workspace")?;
    if rows.len() != observed.workspace.len() {
        return Err("the Lake workspace differs".into());
    }
    for (row, (path, sha256)) in rows.iter().zip(&observed.workspace) {
        same("a Lake workspace path", text(row, "/path")?, path)?;
        same(&format!("app/{path}"), text(row, "/sha256")?, sha256)?;
    }
    // Every other proof input: the SDK image, the tools it runs, and every
    // checked-in byte the cache key names.
    let recorded = kept
        .inputs
        .strip_prefix(&format!("attestation {}\n", kept.attestation))
        .ok_or("the kept inputs name another attestation")?;
    if recorded != observed.inputs {
        return Err("the proof inputs differ from the kept proof's".into());
    }
    Ok(())
}

fn run(root: &Path, dir: &str, program: &str, args: &[&str]) -> Result<String, Fail> {
    let output = Command::new(program)
        .args(args)
        .current_dir(root.join(dir))
        .output()
        .map_err(|error| format!("{program}: {error}"))?;
    if !output.status.success() {
        return Err(format!(
            "{program} {}: {}",
            args.join(" "),
            String::from_utf8_lossy(&output.stderr)
        )
        .into());
    }
    Ok(String::from_utf8(output.stdout)?)
}

/// The inputs line by line: the SDK image this run is in, the versions of the
/// tools it proves with, the architecture, the SHA-256 of every tracked input
/// file, and any untracked or modified input.
fn inputs(root: &Path) -> Result<String, Fail> {
    let mut out = format!(
        "sdk {}\nprismpm {}lexlean {}arch {}\n",
        std::env::var("SDK_IMAGE").unwrap_or_default(),
        run(root, ".", "prismpm", &["--version"])?,
        run(root, ".", "lexlean", &["--version"])?,
        std::env::consts::ARCH,
    );
    let mut args = vec!["ls-files", "-z", "--"];
    args.extend(INPUT_PATHS);
    let files = run(root, ".", "git", &args)?;
    for path in files.split('\0').filter(|path| !path.is_empty()) {
        let bytes = std::fs::read(root.join(path)).map_err(|error| format!("{path}: {error}"))?;
        out.push_str(&format!("{}  {path}\n", hex(&bytes)));
    }
    let mut args = vec!["status", "--porcelain=v1", "--untracked-files=all", "--"];
    args.extend(INPUT_PATHS);
    out.push_str(&run(root, ".", "git", &args)?);
    Ok(out)
}

fn observe(root: &Path, lexlean: &Value) -> Result<Observed, Fail> {
    let check: Value = serde_json::from_str(&run(
        root,
        "app",
        "lexlean",
        &["--diagnostic-format", "json", "check"],
    )?)?;
    if check.get("success") != Some(&Value::Bool(true)) {
        return Err("lexlean check did not succeed".into());
    }
    let prefix = run(root, "app", "lean", &["--print-prefix"])?;
    let bin = Path::new(prefix.trim()).join("bin");
    let file = |path: &Path| -> Result<String, Fail> {
        Ok(hex(
            &std::fs::read(path).map_err(|error| format!("{}: {error}", path.display()))?
        ))
    };
    let mut workspace = Vec::new();
    for path in workspace_paths(lexlean)? {
        let sha256 = file(&root.join("app").join(&path))?;
        workspace.push((path, sha256));
    }
    Ok(Observed {
        inputs: inputs(root)?,
        source_id: text(&check, "/source_id")?.to_owned(),
        semantic_id: text(&check, "/semantic_id")?.to_owned(),
        lean_sha256: file(&bin.join("lean"))?,
        lake_sha256: file(&bin.join("lake"))?,
        arch: std::env::consts::ARCH.to_owned(),
        workspace,
    })
}

fn read_kept(root: &Path) -> Result<Kept, Fail> {
    let read = |path: &str| {
        std::fs::read(root.join(KEPT).join(path)).map_err(|error| format!("{KEPT}/{path}: {error}"))
    };
    Ok(Kept {
        attestation: String::from_utf8(read("attestation")?)?
            .trim_end()
            .to_owned(),
        manifest: read("verified/manifest.json")?,
        lexlean: read("verified/lexlean-attestation.json")?,
        acceptance: read("verified/application-acceptance.json")?,
        inputs: String::from_utf8(read("inputs")?)?,
    })
}

fn check(root: &Path) -> Result<String, Fail> {
    let kept = read_kept(root)?;
    let lexlean: Value = serde_json::from_slice(&kept.lexlean)?;
    binds(&kept, &observe(root, &lexlean)?)?;
    Ok(kept.attestation)
}

/// `cargo xtask proof-reuse`: succeeds only when the kept proof binds these
/// exact inputs. Any failure, including no kept proof, means: prove in full.
pub fn reuse(root: &Path) -> Result<(), Fail> {
    match check(root) {
        Ok(attestation) => {
            println!(
                "app: reused attestation {attestation}: it resolves and binds these exact proof inputs"
            );
            Ok(())
        }
        Err(error) => {
            println!("app: proving in full, the kept proof is not reusable: {error}");
            Err(error)
        }
    }
}

/// `cargo xtask proof-keep <attestation-id>`: keep the proof `prismpm verify`
/// just published, with the inputs it was proved from, then read it back
/// through the same check a later run makes.
pub fn keep(root: &Path, attestation: &str) -> Result<(), Fail> {
    if !is_id(attestation) {
        return Err(format!("prismpm verify printed no attestation ID: {attestation:?}").into());
    }
    let published = root.join("app/.prism/verified").join(attestation);
    let kept = root.join(KEPT);
    if kept.exists() {
        std::fs::remove_dir_all(&kept)?;
    }
    std::fs::create_dir_all(kept.join("verified"))?;
    for name in EVIDENCE {
        std::fs::copy(published.join(name), kept.join("verified").join(name))
            .map_err(|error| format!("{}: {error}", published.join(name).display()))?;
    }
    std::fs::write(
        kept.join("inputs"),
        format!("attestation {attestation}\n{}", inputs(root)?),
    )?;
    std::fs::write(kept.join("attestation"), format!("{attestation}\n"))?;
    check(root).map_err(|error| format!("the proof just kept does not read back: {error}"))?;
    println!("app: kept attestation {attestation} with the inputs it binds");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{binds, hex, Kept, Observed};
    use serde_json::json;

    const LEAN: &str = "e8baaa71855a616dc351028f3ad2200051b0671f423a1696a100e809302d5550";
    const LAKE: &str = "60330ab6f07dce20f3fa9ebb08e8b984ea9549eac172afeb15d9d2227060e2b3";
    const SOURCE: &str = "c573a7a43bdb1d0561da769cbd12fb9a9dea517fdb004165d5086d292d82a92c";
    const SEMANTIC: &str = "fbad6e6ba85b0d26526724c760b0080c4a274f9c113c6776357dfd636d3ee02d";
    const TOOLCHAIN_FILE: &str = "8e3538e0ab5f81a3ee04927d8838c8c674e0e112838b4b3ce87ec218143276af";
    const INPUTS: &str =
        "sdk ghcr.io/uor-foundation/prismpm-sdk-candidate@sha256:cd3b\nprismpm 0.3.0\n";

    struct Proof {
        lexlean: serde_json::Value,
        acceptance: serde_json::Value,
    }

    fn proof() -> Proof {
        Proof {
            lexlean: json!({
                "attestation_id": "1".repeat(64),
                "host": {"arch": "x86_64", "os": "linux"},
                "lake_workspace": [{"path": "lean-toolchain", "sha256": TOOLCHAIN_FILE}],
                "semantic_id": SEMANTIC,
                "source_id": SOURCE,
                "spec": "lexlean/attestation/2",
                "status": "verified",
                "toolchain": {
                    "lake": {"executable_sha256": LAKE},
                    "lean": {"executable_sha256": LEAN}
                }
            }),
            acceptance: json!({
                "build_id": "2".repeat(64),
                "lexlean_attestation_id": "1".repeat(64),
                "schema": "prismpm/application-acceptance/1",
                "status": "verified"
            }),
        }
    }

    /// Seals a proof the way `prismpm verify` does: the manifest hashes the
    /// evidence, and the attestation ID is the manifest's SHA-256.
    fn seal(proof: &Proof) -> Kept {
        let lexlean = serde_json::to_vec(&proof.lexlean).unwrap();
        let acceptance = serde_json::to_vec(&proof.acceptance).unwrap();
        let manifest = serde_json::to_vec(&json!({
            "acceptance_sha256": hex(&acceptance),
            "build_id": "2".repeat(64),
            "lexlean_attestation_sha256": hex(&lexlean),
            "schema": "prismpm/application-verification-manifest/2"
        }))
        .unwrap();
        let attestation = hex(&manifest);
        Kept {
            inputs: format!("attestation {attestation}\n{INPUTS}"),
            attestation,
            manifest,
            lexlean,
            acceptance,
        }
    }

    fn observed() -> Observed {
        Observed {
            inputs: INPUTS.to_owned(),
            source_id: SOURCE.to_owned(),
            semantic_id: SEMANTIC.to_owned(),
            lean_sha256: LEAN.to_owned(),
            lake_sha256: LAKE.to_owned(),
            arch: "x86_64".to_owned(),
            workspace: vec![("lean-toolchain".to_owned(), TOOLCHAIN_FILE.to_owned())],
        }
    }

    #[test]
    fn a_proof_of_these_exact_inputs_is_reused() {
        assert_eq!(binds(&seal(&proof()), &observed()), Ok(()));
    }

    #[test]
    fn a_kept_proof_that_does_not_bind_these_inputs_is_proved_again() {
        let mut plants: Vec<(&str, Kept, Observed)> = Vec::new();
        let sealed = || seal(&proof());

        let mut kept = sealed();
        kept.attestation = "f".repeat(64);
        plants.push(("an ID that does not resolve", kept, observed()));

        let mut kept = sealed();
        kept.manifest.push(b' ');
        plants.push(("a manifest changed after sealing", kept, observed()));

        let mut kept = sealed();
        kept.lexlean.push(b' ');
        plants.push((
            "a LexLean attestation the manifest does not hash",
            kept,
            observed(),
        ));

        let mut kept = sealed();
        kept.acceptance.push(b' ');
        plants.push(("an acceptance the manifest does not hash", kept, observed()));

        let mut failed = proof();
        failed.lexlean["status"] = json!("failed");
        plants.push((
            "a LexLean verdict that is not verified",
            seal(&failed),
            observed(),
        ));

        let mut failed = proof();
        failed.acceptance["status"] = json!("failed");
        plants.push((
            "an acceptance that is not verified",
            seal(&failed),
            observed(),
        ));

        let mut other = proof();
        other.acceptance["lexlean_attestation_id"] = json!("3".repeat(64));
        plants.push((
            "an acceptance of another LexLean attestation",
            seal(&other),
            observed(),
        ));

        let mut now = observed();
        now.source_id = "4".repeat(64);
        plants.push(("a changed model", sealed(), now));

        let mut now = observed();
        now.semantic_id = "5".repeat(64);
        plants.push(("a changed meaning", sealed(), now));

        let mut now = observed();
        now.lean_sha256 = "6".repeat(64);
        plants.push(("another Lean toolchain", sealed(), now));

        let mut now = observed();
        now.lake_sha256 = "7".repeat(64);
        plants.push(("another Lake", sealed(), now));

        let mut now = observed();
        now.arch = "aarch64".to_owned();
        plants.push(("another architecture", sealed(), now));

        let mut now = observed();
        now.workspace[0].1 = "8".repeat(64);
        plants.push(("a changed lean-toolchain file", sealed(), now));

        let mut now = observed();
        now.inputs = INPUTS.replace("cd3b", "0000");
        plants.push(("another SDK image", sealed(), now));

        let mut now = observed();
        now.inputs.push_str(" M Justfile\n");
        plants.push(("a modified input", sealed(), now));

        let mut kept = sealed();
        kept.inputs = format!("attestation {}\n{INPUTS}", "9".repeat(64));
        plants.push(("inputs recorded for another attestation", kept, observed()));

        for (defect, kept, now) in &plants {
            assert!(binds(kept, now).is_err(), "{defect} was reused");
        }
    }

    #[test]
    fn a_lake_file_outside_the_application_is_never_read() {
        assert!(super::workspace_paths(&proof().lexlean).is_ok());
        for path in ["../Justfile", "/etc/passwd", "a/../../b", ""] {
            let mut escape = proof();
            escape.lexlean["lake_workspace"][0]["path"] = json!(path);
            assert!(super::workspace_paths(&escape.lexlean).is_err(), "{path}");
        }
    }
}
