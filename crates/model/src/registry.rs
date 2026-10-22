//! The typed shape of `model/*.toml`.
//!
//! Nothing here interprets the model; [`crate::Model::check`] does that. These
//! types exist so that a malformed model is a parse error rather than a
//! silently wrong constant.

use serde::Deserialize;

use crate::ModelError;

/// One of the three honesty levels (R2).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Level {
    /// A fact reproduced from an authority. Not established here.
    SomeTrue,
    /// Constructed here and validated against its oracle.
    Build,
    /// Measured and reported, never asserted.
    Open,
}

impl Level {
    /// The token used in `model/*.toml` and in generated documentation.
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::SomeTrue => "some-true",
            Self::Build => "build",
            Self::Open => "open",
        }
    }
}

/// `model/ledger.toml`.
#[derive(Debug, Clone, Deserialize)]
pub struct Ledger {
    /// The schema tag.
    pub spec: String,
    /// One row per claim.
    pub claim: Vec<Claim>,
}

/// One claim, at exactly one honesty level.
#[derive(Debug, Clone, Deserialize)]
pub struct Claim {
    /// The conformance ID, or an `AUTH-`/`OPEN-` prefixed identifier.
    pub id: String,
    /// The honesty level. Untagged claims do not ship (R2).
    pub level: Level,
    /// What is claimed.
    pub statement: String,
    /// The Gherkin file carrying the scenario (R3).
    #[serde(default)]
    pub feature: Option<String>,
    /// The authority a `some-true` claim is reproduced from.
    #[serde(default)]
    pub authority: Option<String>,
    /// Recorded sample size, for a claim that is a statistic.
    #[serde(default)]
    pub sample_size: Option<u64>,
    /// Recorded seed, for a claim that is a statistic.
    #[serde(default)]
    pub seed: Option<u64>,
}

impl Ledger {
    /// The meta-gate's structural half: every claim is well formed for its
    /// level (R2).
    ///
    /// The behavioural half --- that no test asserts an `open` claim as
    /// established --- lives in `repo-conformance`, because it needs the
    /// test names, not the model.
    pub fn check(&self) -> Result<(), ModelError> {
        for c in &self.claim {
            match c.level {
                Level::SomeTrue => {
                    if c.authority.is_none() {
                        return Err(ModelError::Inconsistent(format!(
                            "{}: a some-true claim must name the authority it is \
                             reproduced from",
                            c.id
                        )));
                    }
                }
                Level::Build => {
                    if c.feature.is_none() {
                        return Err(ModelError::Inconsistent(format!(
                            "{}: a build claim must name the Gherkin scenario that \
                             validates it (R3)",
                            c.id
                        )));
                    }
                    if c.authority.is_some() {
                        return Err(ModelError::Inconsistent(format!(
                            "{}: a build claim is evidence, not a reproduction of an \
                             authority; it must not name one",
                            c.id
                        )));
                    }
                }
                Level::Open => {
                    if c.authority.is_some() {
                        return Err(ModelError::Inconsistent(format!(
                            "{}: an open claim is a measurement and cannot cite an \
                             authority for its value",
                            c.id
                        )));
                    }
                }
            }
            // No rules about a *class* of ID here. `CP-` recording a sample size,
            // `CG-` being measured rather than asserted, `CN-` not existing at
            // all --- each was a fact about a repository that had that class, and
            // a rule enforcing a taxonomy the register does not have is a
            // restriction on the first person to want one. A repository adding a
            // class adds its rule here, in the commit that adds the first ID in
            // it. The level rules above apply to every claim and stay.
        }
        Ok(())
    }

    /// Look up a claim by conformance ID.
    pub fn get(&self, id: &str) -> Option<&Claim> {
        self.claim.iter().find(|c| c.id == id)
    }
}

/// `model/ids.toml` --- the conformance ID register.
#[derive(Debug, Clone, Deserialize)]
pub struct Ids {
    /// The schema tag.
    pub spec: String,
    /// One row per conformance ID.
    pub id: Vec<IdRow>,
}

/// One registered conformance ID.
#[derive(Debug, Clone, Deserialize)]
pub struct IdRow {
    /// The ID, e.g. `CS-04`.
    pub id: String,
    /// The honesty level of the claim (R2).
    pub level: Level,
    /// The Gherkin suite the scenario belongs to.
    pub suite: String,
    /// What the ID claims.
    pub statement: String,
    /// The error type this row declares, when the row specifies a public
    /// failure (R5). `cargo xtask audit-limits` sanctions a shipped crate's
    /// `Result<_, E>` only for an `E` declared here.
    #[serde(default)]
    pub failure: Option<String>,
    /// The ID of the `build` row whose test is the negative test of
    /// [`Self::failure`]: the test that provokes the refusal and observes it. It
    /// may be this row's own ID. Present exactly when `failure` is.
    #[serde(default)]
    pub negative: Option<String>,
}

/// A public failure type the register declares (R5).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DeclaredFailure<'a> {
    /// The error type, as written in `Result<_, E>`.
    pub type_name: &'a str,
    /// The row that declares it.
    pub declared_by: &'a str,
    /// The ID of the row whose test is its negative test.
    pub negative: &'a str,
}

impl Ids {
    /// Look up a row.
    pub fn get(&self, id: &str) -> Option<&IdRow> {
        self.id.iter().find(|r| r.id == id)
    }

    /// Every failure type the register declares, each with its negative test.
    ///
    /// A declaration is a pair: `failure` names the type and `negative` names a
    /// registered `build` row, so the register itself says which test refuses
    /// it. A type is declared once --- two rows declaring it would be two
    /// sources for one failure (R1).
    pub fn declared_failures(&self) -> Result<Vec<DeclaredFailure<'_>>, ModelError> {
        let bad = |m: String| ModelError::Inconsistent(m);
        let mut out: Vec<DeclaredFailure<'_>> = Vec::new();
        for row in &self.id {
            let (type_name, negative) = match (&row.failure, &row.negative) {
                (None, None) => continue,
                (Some(_), None) => {
                    return Err(bad(format!(
                        "{}: declares failure `{}` and names no negative test. Every public \
                         failure is covered by a negative test (R5)",
                        row.id,
                        row.failure.as_deref().unwrap_or_default()
                    )))
                }
                (None, Some(negative)) => {
                    return Err(bad(format!(
                        "{}: names negative test {negative} and declares no failure type",
                        row.id
                    )))
                }
                (Some(type_name), Some(negative)) => (type_name.as_str(), negative.as_str()),
            };
            if type_name.is_empty()
                || type_name.starts_with(|c: char| c.is_ascii_digit())
                || !type_name
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '_')
            {
                return Err(bad(format!(
                    "{}: failure `{type_name}` is not a bare Rust type name",
                    row.id
                )));
            }
            if let Some(first) = out.iter().find(|d| d.type_name == type_name) {
                return Err(bad(format!(
                    "{}: failure `{type_name}` is declared twice, by {} and {} (R1)",
                    row.id, first.declared_by, row.id
                )));
            }
            let Some(target) = self.get(negative) else {
                return Err(bad(format!(
                    "{}: failure `{type_name}` names negative test {negative}, which is \
                     not a registered ID (R5)",
                    row.id
                )));
            };
            if target.level != Level::Build {
                return Err(bad(format!(
                    "{}: negative test {negative} of failure `{type_name}` must be a `build` \
                     claim, not `{}`: only a claim constructed here asserts a refusal (R2)",
                    row.id,
                    target.level.as_str()
                )));
            }
            out.push(DeclaredFailure {
                type_name,
                declared_by: &row.id,
                negative,
            });
        }
        Ok(out)
    }
}

/// `model/authorities.toml` --- what this repository cites (`CM-03`).
#[derive(Debug, Clone, Deserialize)]
pub struct Authorities {
    /// The schema tag.
    pub spec: String,
    /// One row per cited authority.
    pub authority: Vec<AuthorityRow>,
}

/// A cited authority. Never re-derived, vendored, or gated on.
#[derive(Debug, Clone, Deserialize)]
pub struct AuthorityRow {
    /// Stable identifier, e.g. `CL-MM01`.
    pub id: String,
    /// Human-readable name.
    pub name: String,
    /// What a third party needs to find the source.
    pub citation: String,
    /// A checksum over the committed artifact, or `none`.
    pub checksum: String,
    /// Why there is no checksum, when there is none.
    #[serde(default)]
    pub checksum_reason: String,
    /// What the authority says.
    pub statement: String,
    /// The conformance IDs that are evidence this library realizes it.
    #[serde(default)]
    pub realized_by: Vec<String>,
}
