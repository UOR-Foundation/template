//! The checksum over an authority's committed artifact (R6).
//!
//! An authority is cited, not vendored; but a corpus an oracle runs on has to
//! be committed to be pinned, and a pin nobody recomputes is a claim about
//! bytes that nothing checks. [`Model::check_artifacts`] is the recomputation:
//! every row that names an `artifact` is hashed from the working tree and
//! compared with the checksum the row records.
//!
//! The checksum is a SHA-256, as 64 lowercase hex digits:
//!
//! - of a file, over its bytes;
//! - of a directory, over its manifest: one `<sha256 of file>  <path>` line per
//!   file, `path` relative to the directory with `/` separators, in byte order
//!   of the paths, each line ending in a newline.
//!
//! The manifest is hashed rather than the files concatenated, so that a rename
//! or a moved byte between two files changes the checksum.

use std::path::{Component, Path};

use sha2::{Digest, Sha256};

use crate::{Model, ModelError};

/// Is `path` a relative path that stays inside the repository?
pub(crate) fn is_inside(path: &str) -> bool {
    !path.is_empty()
        && Path::new(path)
            .components()
            .all(|c| matches!(c, Component::Normal(_)))
}

/// Is `s` a SHA-256 written as 64 lowercase hex digits?
pub(crate) fn is_sha256(s: &str) -> bool {
    s.len() == 64 && s.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
}

fn hex(bytes: &[u8]) -> String {
    use core::fmt::Write as _;
    bytes.iter().fold(String::with_capacity(64), |mut out, b| {
        let _ = write!(out, "{b:02x}");
        out
    })
}

fn io(path: &Path, e: std::io::Error) -> ModelError {
    ModelError::Io(path.to_path_buf(), e)
}

/// Every regular file under `dir`, as a path relative to `base`.
fn files(base: &Path, dir: &Path, id: &str, out: &mut Vec<String>) -> Result<(), ModelError> {
    for entry in std::fs::read_dir(dir).map_err(|e| io(dir, e))? {
        let path = entry.map_err(|e| io(dir, e))?.path();
        let kind = std::fs::symlink_metadata(&path)
            .map_err(|e| io(&path, e))?
            .file_type();
        if kind.is_dir() {
            files(base, &path, id, out)?;
        } else if kind.is_file() {
            let rel = path.strip_prefix(base).unwrap_or(&path);
            let rel = rel
                .components()
                .map(|c| c.as_os_str().to_str())
                .collect::<Option<Vec<_>>>()
                .ok_or_else(|| {
                    ModelError::Inconsistent(format!(
                        "{id}: {} has a name that is not UTF-8, so the manifest cannot name it",
                        path.display()
                    ))
                })?;
            out.push(rel.join("/"));
        } else {
            // A link can point outside the repository, and then the checksum
            // would cover bytes the repository does not contain.
            return Err(ModelError::Inconsistent(format!(
                "{id}: {} is not a regular file or directory; an artifact holds files only",
                path.display()
            )));
        }
    }
    Ok(())
}

/// The checksum of the committed `artifact` of authority `id`, under `root`.
pub fn artifact_checksum(root: &Path, id: &str, artifact: &str) -> Result<String, ModelError> {
    let path = root.join(artifact);
    let meta = match std::fs::symlink_metadata(&path) {
        Ok(meta) => meta,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Err(ModelError::Inconsistent(format!(
                "{id}: artifact `{artifact}` is not committed. The row names a path that \
                 holds no file (R6)"
            )))
        }
        Err(e) => return Err(io(&path, e)),
    };
    if meta.is_file() {
        let bytes = std::fs::read(&path).map_err(|e| io(&path, e))?;
        return Ok(hex(&Sha256::digest(bytes)));
    }
    if !meta.is_dir() {
        return Err(ModelError::Inconsistent(format!(
            "{id}: artifact `{artifact}` is not a regular file or directory"
        )));
    }
    let mut names = Vec::new();
    files(&path, &path, id, &mut names)?;
    if names.is_empty() {
        return Err(ModelError::Inconsistent(format!(
            "{id}: artifact `{artifact}` holds no files, so there is nothing to checksum"
        )));
    }
    names.sort();
    let mut manifest = String::new();
    for name in names {
        let file = path.join(&name);
        let bytes = std::fs::read(&file).map_err(|e| io(&file, e))?;
        manifest.push_str(&format!("{}  {name}\n", hex(&Sha256::digest(bytes))));
    }
    Ok(hex(&Sha256::digest(manifest.as_bytes())))
}

impl Model {
    /// `CM-03`: every committed artifact an authority names is the artifact its
    /// checksum records.
    ///
    /// [`Model::check`] has already established that a row names an artifact
    /// exactly when it records a checksum; this reads the working tree under
    /// `root` and compares. The two halves are split because the first needs no
    /// file system and the second needs the repository.
    pub fn check_artifacts(&self, root: &Path) -> Result<(), ModelError> {
        for a in &self.authorities.authority {
            let Some(artifact) = &a.artifact else {
                continue;
            };
            let computed = artifact_checksum(root, &a.id, artifact)?;
            if computed != a.checksum {
                return Err(ModelError::Inconsistent(format!(
                    "{}: the committed artifact `{artifact}` does not match its recorded \
                     checksum: recorded {}, computed {computed}. A pinned artifact is the \
                     bytes that were reviewed; re-record the checksum only after reviewing \
                     why they changed (R6)",
                    a.id, a.checksum
                )));
            }
        }
        Ok(())
    }
}
