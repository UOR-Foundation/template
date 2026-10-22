//! Reading `features/suites/*.feature` (R3).

use std::collections::BTreeSet;
use std::path::Path;

/// One scenario, and the conformance ID it discharges.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct Scenario {
    /// The conformance ID from the scenario's tag.
    pub id: String,
    /// The honesty level from the scenario's tag.
    pub level: String,
    /// The scenario's one-line statement.
    pub statement: String,
    /// Which suite file it came from.
    pub suite: String,
    /// The steps, in order.
    pub steps: Vec<String>,
}

/// What a suite directory contains.
#[derive(Clone, Debug, Default)]
pub struct SuiteReport {
    /// Every scenario found.
    pub scenarios: Vec<Scenario>,
    /// Files that were read.
    pub files: usize,
}

/// Parse every `.feature` file in `dir`.
///
/// A deliberately small parser. Cucumber's full grammar buys nothing here: the
/// scenarios are generated from the register and their job is to be *readable*
/// and to carry the ID, not to be executed by a step-definition engine. What
/// executes the claims are the tests, and `CM-02` is what ties the two together.
pub fn scenarios_in(dir: &Path) -> std::io::Result<SuiteReport> {
    let mut report = SuiteReport::default();
    let mut entries: Vec<_> = std::fs::read_dir(dir)?.collect::<Result<_, _>>()?;
    entries.sort_by_key(|e| e.path());

    for entry in entries {
        let path = entry.path();
        if path.extension().is_none_or(|e| e != "feature") {
            continue;
        }
        report.files += 1;
        let suite = path
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        let text = std::fs::read_to_string(&path)?;

        let mut pending_tags: Vec<String> = Vec::new();
        let mut current: Option<Scenario> = None;
        for raw in text.lines() {
            let line = raw.trim();
            if line.starts_with('@') {
                pending_tags = line
                    .split_whitespace()
                    .map(|t| t.trim_start_matches('@').to_string())
                    .collect();
            } else if let Some(rest) = line.strip_prefix("Scenario:") {
                if let Some(done) = current.take() {
                    report.scenarios.push(done);
                }
                let id = pending_tags.first().cloned().unwrap_or_default();
                let level = pending_tags.get(1).cloned().unwrap_or_default();
                current = Some(Scenario {
                    id,
                    level,
                    statement: rest.trim().to_string(),
                    suite: suite.clone(),
                    steps: Vec::new(),
                });
                pending_tags.clear();
            } else if let Some(scenario) = current.as_mut() {
                for keyword in ["Given ", "When ", "Then ", "And ", "But "] {
                    if let Some(step) = line.strip_prefix(keyword) {
                        scenario.steps.push(format!("{keyword}{step}"));
                        break;
                    }
                }
            }
        }
        if let Some(done) = current.take() {
            report.scenarios.push(done);
        }
    }
    Ok(report)
}

impl SuiteReport {
    /// The set of IDs the suites cover.
    pub fn ids(&self) -> BTreeSet<&str> {
        self.scenarios.iter().map(|s| s.id.as_str()).collect()
    }
}

/// Every `#[test]` function name in the workspace.
///
/// Read from the source rather than from `cargo test -- --list`, because this
/// runs *inside* `cargo test` and a nested invocation blocks on the target
/// directory lock. The scan is exact for the shape the workspace uses: a
/// `#[test]` attribute followed, possibly after further attributes, by the
/// function it annotates.
///
/// Shared by the meta-gate and by `xtask audit-limits`, which asks the same
/// question of a declared failure's negative test; two scanners would be two
/// answers to it.
pub fn workspace_test_names(root: &Path) -> BTreeSet<String> {
    let mut names = BTreeSet::new();
    let mut stack = vec![root.join("crates"), root.join("xtask")];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if path.file_name().is_some_and(|n| n == "target") {
                    continue;
                }
                stack.push(path);
            } else if path.extension().is_some_and(|e| e == "rs") {
                let Ok(text) = std::fs::read_to_string(&path) else {
                    continue;
                };
                let mut armed = false;
                for line in text.lines() {
                    let line = line.trim();
                    if line == "#[test]" {
                        armed = true;
                    } else if armed {
                        if let Some(rest) = line.strip_prefix("fn ") {
                            let name: String = rest
                                .chars()
                                .take_while(|c| c.is_alphanumeric() || *c == '_')
                                .collect();
                            if !name.is_empty() {
                                names.insert(name);
                            }
                            armed = false;
                        } else if !line.starts_with('#') && !line.is_empty() {
                            armed = false;
                        }
                    }
                }
            }
        }
    }
    names
}
