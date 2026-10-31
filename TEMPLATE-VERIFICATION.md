# Template repository verification

This repository's `just vv` instantiates the universal verification policy in
`VERIFICATION.md` for the template itself, which is a Prism application: the
template contract checker in `app/`.

| `just` recipe | Enforces | ID classes |
| --- | --- | --- |
| `just fmt-check` | the diff is reviewable | --- |
| `just model` | R1, R4, R5 and the bootstrap trust root, in one `xtask validate` | `CM-01` |
| `just template-check` | immutable SDK selection and template drift, checked by the SDK | --- |
| `just lint` | Clippy at `-D warnings`, every target, every optional feature | --- |
| `just test` | the workspace suite, including the R3 meta-gate | `CM-02`, `CM-03` |
| `just deny` | R6 over the dependency graph | --- |
| `just app` | the Prism application: LexLean format and lock, then `prismpm build` and `prismpm verify` of the holo | `TC-01` |

Each check runs once per `just vv`. `just bdd` runs only the meta-gate while a
scenario is being written; `just test` already includes it.

The register holds one claim, `TC-01`, so the meta-gate checks a real row, a
real scenario and a real test. It becomes an error as soon as an ID, scenario,
or test is added without the other two.

## Planted defects

| Gate | Planted defect | Result |
| --- | --- | --- |
| `check-model` | `CONFORMANCE.md` disagrees with the register | rejected |
| `audit-deferral` | a deferral marker in a crate and in the gate's own source | both rejected |
| honesty meta-gate | an ID with no test | rejected |
| `contract_tc_01` | `Conformant` drops the `bootstrap` conjunct, or `dispatch` answers on `true` instead of `conformant` | both rejected |
| `prismpm build` | an acceptance vector set without the exact guest-allocation boundary | rejected (PP2009) |
| `audit-bootstrap` | a floating/copied action, mutable SDK tag, changed universal file, narrowed boundary, shallow/credential-retaining checkout, copied project renderer, omitted standards lock, acceptance bypass, deploy-job signing privilege, incomplete release lifecycle, or a bootstrap that drops a native architecture from main or tags, cancels or replaces a main run, or skips runs by path, condition or matrix exclusion | all rejected |

`audit-deferral` reads every crate and `xtask`, including itself. Its token
construction therefore cannot exempt the very gate in which a deferral could
otherwise be hidden.

## One pull-request run, complete native coverage on main and tags

Every instance inherits this bootstrap. Before this change, each pull request
and each main push ran the complete `just vv` on both native runners, and
nothing cancelled a superseded pull-request run. Those runner minutes are
shared across the organization (UOR-Foundation/PrismPM#187). Repeating a
deterministic gate on the same inputs adds time, not evidence
(UOR-Foundation/PrismPM#210, UOR-Foundation/prism-code#25).

A pull request now runs the complete gate once, natively on amd64, and a newer
push to the same pull request cancels its older run. Every main push and every
tag runs the complete gate on both native architectures. Each non-pull-request
run has a concurrency group of its own. GitHub keeps at most one pending run
per group, so a shared main group would replace a queued commit's run before
it produced a verdict. The pull request's arm64 evidence therefore arrives on
the merge commit, before any tag of it publishes.

`native_coverage_is_complete`, part of `audit-bootstrap`, keeps that saving
sound. It requires the main and tag triggers, one of exactly two runner
matrices, and either no concurrency or exactly the pull-request-only
cancellation. The two admissible matrices are both architectures on every
event, or amd64 on pull requests and both elsewhere. The gate also rejects job
conditions, `continue-on-error`, matrix inclusions or exclusions, and path,
branch or tag filters.

The new test, `dropped_native_coverage_plant_is_rejected`, failed against the
previous workflow bytes: `assertion failed: native_coverage_is_complete(bootstrap)`.
It passes against the changed workflow, and rejects eight planted defects:
- arm64 removed from main and tags;
- the two matrix legs swapped;
- the tag trigger removed;
- unconditional cancellation;
- one shared main group;
- a `paths-ignore` filter;
- a job condition that skips arm64;
- a matrix exclusion of arm64.

Running both architectures on every event without concurrency stays
admissible, because it is stronger than the policy.

All 15 `xtask` tests, including both invoked Node cases, passed with the pinned
Rust 1.97.1 on `x86_64-pc-windows-gnu`, locked. Formatting passed, and
all-target Clippy with warnings denied passed for `xtask`. These ran outside
the SDK image, because no Docker host was available. Workspace Clippy on that
target also reports `result_large_err` in `repo-model` on unchanged `main`; it
is not part of this change. The change's own pull-request run on GitHub
evaluated both expressions and started exactly one job,
`acceptance / ubuntu-24.04`. That job then stopped before the gate, as every
template run does, because the template commits no `prismpm.lock`. The main,
tag and cancellation behavior have not yet run on a hosted runner.

## Platform-indexed SDK bootstrap

The `/2` SDK lock renderer delegates index and inventory validation to the
SDK-owned `platform-lock.mjs` helper. Transport extracts inventory and standards
files from each exact `linux/amd64` and `linux/arm64` image child using Docker
without executing the foreign architecture. The template native audit compares
the detected platform's complete inventory and bytes; the legacy `/1` branch
keeps its original exact comparison.

All 10 template `xtask` tests and all-target Clippy passed, locked and offline,
inside the existing PrismPM SDK as UID 1000. The new negative test rejects a
swapped native inventory, missing platform, and legacy architecture drift.
Shell and Node syntax checks passed. An isolated ignored Cargo target was used
because older root-owned fingerprints prevented reuse of the default target;
those unrelated artifacts were not changed. These focused tests do not claim
the template's full `just vv` has accepted an unpublished candidate SDK. A real
immutable multi-platform candidate and policy-input commit are still required
before generating and committing the new locks.

The initial standards binding adds two executable Node cases, also invoked
by the ordinary `xtask` test suite: absent and matching locks preserve the
exact supplied bytes; a differing existing lock is rejected without changing
it. The complete 11-test `xtask` suite, all-target Clippy and shell/Node syntax
checks passed inside the SDK as UID 1000. This is byte-binding evidence, not a
claim that the project has adopted or conforms to every referenced standard.

## Private Buildx state with read-only credentials

Foundry bootstrap run `35104180230` failed on both runner architectures before
the repository gate: Buildx tried to create `.docker/buildx` inside the
read-only credentials mount. The exact amd64 SDK candidate
`ghcr.io/uor-foundation/prismpm-sdk-candidate@sha256:c2e0e50437e13d9b2e382d3af4ae7a962b469721b9b80f14f215d9254e8ed78f`
reproduced `mkdir /tmp/prismpm-home/.docker/buildx: read-only file system`
under UID 1000, with network disabled, an empty test-only credentials file
mounted read-only, the socket's group, and the same private `/tmp` tmpfs.
No owner credentials were read or mounted.

With `BUILDX_CONFIG=/tmp/prismpm-buildx` and `umask 077`, actual `docker buildx
version` and `docker buildx inspect --bootstrap` passed. The state directory
was mode 0700, credentials stayed read-only and byte-identical, and no state
was created inside the credential directory. The default Docker driver was
inspected; no builder was created, selected, or removed. The disposable
container's state vanished when it exited. This is native amd64 execution,
not a claim that the updated hosted ARM job has already passed.

The native guard's planted missing-state regression failed before the fix.
It now rejects missing/duplicate configuration, paths inside either the
credentials directory or its parent, missing tmpfs and permissive creation.
An additional real-workflow mutation pair reproduced that the initial guard
accepted an appended `umask 022` before Buildx and a `umask 077` moved after
inspection. Both now fail: the scoped container-script check requires exactly
one umask directive, exactly 077, before its first Buildx command. The final
12-test xtask suite, both invoked Node tests, formatting and Clippy passed
again; the actual Docker workflow was already correct and remained unchanged.
All 20 workspace Rust tests (including all 12 xtask tests), both invoked
Node tests, locked offline Clippy, all-features/all-target checks, formatting,
model comparison and YAML/embedded-shell syntax passed under that exact SDK.
The YAML check used the SDK's existing `js-yaml`; no tooling was installed.
Raw RED/GREEN logs are retained under `target/template-buildx-*`.

The template remains unbound: these component checks do not replace its
required complete `just vv`, accept a production SDK, or waive universal
policy. Downstream repositories must receive the changed workflow and policy
through their normal reviewed template update.

## SDK-owned dependency maintenance

Dependabot uses canonical JSON-form YAML, checked structurally by
`audit-dependency-updates` within `audit-bootstrap`. Duplicate keys, malformed
values, missing or broader exclusions, and disabled maintenance are rejected.
Only the SHA-pinned `UOR-Foundation/PrismPM/action` and byte-bound
`.github/workflows/bootstrap.yml` use the reviewed SDK/template update flow.
Other Actions and Cargo dependencies retain their weekly schedules and groups;
both now request Conventional Commit prefixes.

GitHub documents [dependency ignores and path exclusions](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference).
The upstream [SHA-pinned subpath parser](https://github.com/dependabot/dependabot-core/blob/dc25739e082c6d97399b476ad4eb06b5559895e7/github_actions/lib/dependabot/github_actions/file_parser.rb#L148)
confirms the exact action dependency name. The existing SDK's `js-yaml` 4.3.2
independently parsed the configuration and preserved the prior schedules and
groups; this inspection is not a new SDK API or general YAML conformance claim.

The previous configuration failed the new gate. A canonical broad `*` ignore
also failed the actual command; restoring the exact action passed. Negative
tests cover omitted/wrong/extra exclusions, disabled or duplicate ecosystems,
removed Cargo coverage, altered scheduling, and duplicate JSON keys.
The byte-wise SHA formatter preserves exact empty-string and `abc` digests
with unchanged sha2 0.10.9; the same correction fixes sha2 0.11 compilation in
the separately verified Foundry dependency update. No dependency was changed
here. Logs are retained under `target/template-dependabot-*` and
`target/template-maintenance-*`.

In the exact native AMD64 SDK above, all 22 workspace Rust tests and both
invoked Node tests, formatting, Clippy, all-feature/all-target compilation,
model/limit/deferral audits and dependency checks passed. Full `just vv`
passes the new policy check, then rejects the template's existing absent
`prismpm.lock`. No universal policy bytes changed or release gate was waived.

## Each check once, and the R3 scaffold

`just vv` used to run `check-model` and `audit-bootstrap` twice (once in
`template-check`, again inside `xtask validate`), the `repo-conformance` tests
twice (`test`, then `bdd`), and the workspace through two compilers that differ
only in features (`lint` at the default features, then `features`, a
`cargo check --all-features`). Repeating a deterministic check on the same
inputs adds time, not evidence. Now `model` is the one `xtask validate`,
`template-check` is only the SDK's two checks, `lint` is Clippy with
`--all-features` (so an optional feature is still compiled, with its tests, and
now also linted), and `test` compiles the default features. Every Cargo
invocation passes `--locked`, so no part of the gate can resolve a dependency
the lock does not name (R6). The `cargo vv` alias, which ran `xtask validate`
and so was not the gate its name claimed, is removed.

`cargo xtask new-capability <ID> <level> <suite> <statement>` (`just
new-capability`) writes the register row, the tagged scenario and a test named
`<suite>_<id>` that fails until the capability is built, then regenerates
`CONFORMANCE.md`. Its tests run the honesty meta-gate on a scratch copy of the
register: two scaffolded capabilities leave it clean, and a lowercase ID, a
missing hyphen or number, an unknown level, an uppercase or path-escaping
suite, an empty or two-line statement, too few arguments and a duplicate ID
are all refused with the register byte-identical and no suite file written.

On a copy of this repository, `just new-capability CX-01 build parsing ...`
produced files that passed `cargo fmt --check` and all-feature Clippy, and
`cargo test` then failed exactly at `parsing_cx_01`, as R3 requires. The 18
`xtask` tests, all-target all-feature Clippy, formatting and `audit-deferral`
passed with the pinned Rust 1.97.1 on `x86_64-unknown-linux-gnu`, locked,
outside the SDK image; the SDK checks run in the pull request's bootstrap job.

## The template contract checker

`app/` is a Prism text application modeled in `app/src/Contract.lex.tex`. Its
request is 384 bytes: for each universal policy file, in `template.lock`
`policy_files` order, the locked SHA-256 then the observed SHA-256. It answers
`conformant`, or `drift: ` and the drifted paths, or `invalid request` for any
other length. Lean proves, with only `propext`, that the executable verdict is
both sound and complete for the specification:

- `conformant_decides`: `conformant observation = true ↔ Conformant observation`.

The proof is `simplify` over the definitions and Lean's `Bool.and_eq_true` and
`Nat.beq_eq`, not `linear_arithmetic`. A `linear_arithmetic` proof makes the
generated module import `LexLeanRuntime.Laws`, and `prismpm build` then
compiles that module to C, which did not finish within the build's ten-minute
limit in CI or in 25 minutes locally (without C generation it takes four
seconds). The first CI run of this app failed exactly there, with
`PP5007: application-lean timed out`.

`Conformant` is the conjunction of six digest equalities, one per universal
policy path. `contract_tc_01` reads the model as text and requires the theorem
statement, its axiom list, one `Conformant` conjunct for each path in
`template-contract.json` other than `template.lock` (which cannot pin its own
digest), each path in the drift report, and a `dispatch` decided by
`conformant`. The nine acceptance vectors (conformant, four drift cases, 383,
385, 0 and 512 bytes) are executed by `prismpm build` against the compiled
guest, and `prismpm verify` checks the resulting holo, so the proof, the code
and the observed behaviour ship as one artifact.

Locally, with LexLean 0.3.0 (the SDK's compiler), `lexlean check` and
`lexlean verify` passed, verifying three modules; both planted defects in the
table above made `contract_tc_01` fail with a message naming the defect. The
holo build and verify run in the pull request's bootstrap job inside the
locked SDK.
