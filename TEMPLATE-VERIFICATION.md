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
| `just app` | the Prism application: LexLean format and lock, then `prismpm verify`, which builds the holo and checks it | `TC-01` |

Each check runs once per `just vv`. `just bdd` runs only the meta-gate while a
scenario is being written; `just test` already includes it.

The register holds `TC-01` and `FR-01`, so the meta-gate checks real rows,
scenarios and tests. It becomes an error as soon as an ID, scenario,
or test is added without the other two.

## Planted defects

| Gate | Planted defect | Result |
| --- | --- | --- |
| `check-model` | `CONFORMANCE.md` disagrees with the register | rejected |
| `audit-deferral` | a deferral marker in a crate and in the gate's own source | both rejected |
| honesty meta-gate | an ID with no test | rejected |
| `contract_tc_01` | `Conformant` drops the `bootstrap` conjunct, or `dispatch` answers on `true` instead of `conformant` | both rejected |
| `prismpm verify` | an acceptance vector set without the exact guest-allocation boundary | rejected (PP2009) |
| `audit-bootstrap` | a floating/copied action, mutable SDK tag, changed universal file, narrowed boundary, shallow/credential-retaining checkout, copied project renderer, omitted standards lock, acceptance bypass, deploy-job signing privilege, incomplete release lifecycle, or a bootstrap that drops a native architecture from main or tags, cancels or replaces a main run, or skips runs by path, condition or matrix exclusion | all rejected |
| `audit-bootstrap` (`proof_reuse_is_confined`) | a cache key that omits any one of its eight proof inputs, the SDK digest named by a constant, the Lean toolchain read from another file, the ref spliced into the script or dropped, the event line removed, reuse on a tag or on any event, reuse without the read-time check, a stale kept proof surviving a full proof, a recipe that stops proving or keeps a proof without its inputs, a second use of the event, an early exit, and the `merge_group` trigger dropped | all rejected |
| `xtask proof-reuse` (`binds`) | an attestation ID that does not resolve, a manifest, LexLean attestation or acceptance changed after sealing, a verdict that is not verified, an acceptance of another attestation, a changed model or meaning, another Lean, Lake, architecture or SDK image, a changed Lake workspace file, a modified input, inputs recorded for another attestation, and a Lake path outside `app/` | all proved again |

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

## A pull request reuses main's proof of byte-identical inputs

Proving the application (`prismpm --project app verify`, Lean and leanchecker)
is most of a pull request's gate: in UOR-Foundation/foundry it took 16 of 20
minutes, on every pull request, including the many that change no proof input.
The reasoning of the section above applies to it unchanged: a pull request's
merge commit is proved again, in full, on main.

`bootstrap.yml` now keeps the proof in `.prism-proof`, through `actions/cache`,
keyed by every byte the proof reads: `app/**`, `prismpm.lock`, the `Justfile`
and `rust-toolchain.toml`, per runner OS and architecture. It passes the event
to the gate as `PRISM_PROOF_EVENT`. `just app` reuses a kept proof only when the
event is `pull_request` or `merge_group`, and says so with the attestation it
reuses. A main push, a tag and every local run prove in full and keep their
proof. GitHub scopes caches by ref: a pull request can write only its own
scope, and reads main's. A pull request could already change the `Justfile`
to skip the proof on itself, so reuse gives a pull request no power it lacked.
Main's verdict, which is what a release rests on, never reuses anything.

`merge_group` joins the fixed trigger block, so a merge queue can require this
gate. A merge queue run gets the pull request's amd64 matrix and its own
concurrency group, and is never cancelled.

`proof_reuse_is_confined`, part of `audit-bootstrap`, keeps the saving sound. It
requires the exact cache key, the exact event line, and a `Justfile` `app`
recipe whose only use of the event is one `case` with the single pattern
`pull_request|merge_group)`, and which still runs `prismpm --project app verify`.
`native_coverage_is_complete` requires `merge_group` in the triggers and the new
matrix. The new test, `widened_proof_reuse_plant_is_rejected`, rejects every
planted defect: reuse widened to `push`; reuse for any event; a recipe that
stops proving; the `Justfile` or `app/**` dropped from the key; the event line
removed; a second use of the event in the recipe; and `merge_group` dropped
from the triggers. All 19 `xtask` tests passed in the locked SDK image, with
formatting checked.

## Main reuses its own proof of identical inputs, checked on read

The section above kept main proving in full. Main then re-proved inputs it had
already proved: in UOR-Foundation/foundry run 43197127999, a main push, `just
app` took 420 s of a 624 s gate on amd64 and 630 s of an 818 s gate on arm64.
Repeating a deterministic proof of the same inputs adds time, not evidence.
What made reuse unsafe on main was that nothing checked a kept proof when it
was read back. This change adds that check and then lets main reuse.

The cache key now names every proof input: the runner OS and architecture, the
SDK image digest and the Lean toolchain by value (a step reads them from
`prismpm.lock` and `app/lean-toolchain`), and the hash of `app/**`,
`prismpm.lock`, the `Justfile` and `rust-toolchain.toml`. The key is not
trusted; it only finds a candidate. `xtask proof-reuse` reuses the candidate
only when all of these hold:

1. The attestation ID resolves. `prismpm verify` defines it as the SHA-256 of
   the manifest it publishes under `app/.prism/verified/<id>/`; the kept
   manifest must hash to the kept ID.
2. The manifest binds the evidence. Its `lexlean_attestation_sha256` and
   `acceptance_sha256` must equal the hashes of the kept LexLean attestation
   and application acceptance, both must say `verified`, and the acceptance
   must name that LexLean attestation and the manifest's build.
3. The attestation binds this checkout and this image. Its source and semantic
   IDs must equal what `lexlean check` computes from `app/` now (0.3 s). Its
   Lean and Lake executable hashes must equal the executables in this image.
   Its architecture must be this one. Its Lake workspace files must hash the
   same in `app/`.
4. The rest of the inputs are identical. `proof-keep` records, beside the ID,
   the SDK image the run is in, the `prismpm` and `lexlean` versions, the
   SHA-256 of every tracked file under `app/` and of `prismpm.lock`, the
   `Justfile` and `rust-toolchain.toml`, and any modified or untracked input.
   The record must be byte-identical to what this run computes.

Any failure, including no kept proof, proves in full and prints the reason.
`proof-keep` keeps every proof and reads it back through the same check, so a
proof that would not be reusable fails the run that made it.

`just app` now reuses on a pull request, a merge queue run and a push to
`main`. A tag, a manual run and every local run prove in full. The event and
its ref reach the recipe as `PRISM_PROOF_EVENT=<event>:<ref>` through the step
environment, never spliced into the script, so a tag push
(`push:refs/tags/...`) cannot match `push:refs/heads/main`.

Who could have written a proof that main reuses: GitHub scopes caches by ref,
and a run on `main` reads only main's scope. Only runs on `refs/heads/main`
write it, and each of them proved in full before keeping. So main reuses only
its own earlier proof of the same inputs. The read-time check makes a stale,
partial or mismatched entry prove again; it does not authenticate an entry. A
forged entry needs code running on `main`, which could already change what
`main` runs. Releases are unaffected: tags still prove in full on both
architectures.

`proof_reuse_is_confined` holds the workflow and the recipe to this shape: the
exact key, the exact step that names the SDK digest and the Lean toolchain, the
event through the environment, and the recipe's reuse and proof line for line,
with one exit. `widened_proof_reuse_plant_is_rejected` rejects 21 planted
defects, among them a key that omits each of its eight inputs in turn.
`a_kept_proof_that_does_not_bind_these_inputs_is_proved_again` rejects 16
planted defects of the read-time check, one per binding, and
`a_lake_file_outside_the_application_is_never_read` rejects four escaping Lake
paths. All 22 `xtask` tests passed in the locked SDK image, with formatting and
all-target Clippy at `-D warnings`.

Run in the locked SDK image (`cd3b47d7`, amd64, WSL, on a machine shared with
other proofs at load average 15 to 21):

| Case | Result | Time |
|---|---|---|
| local run, nothing kept | proved, kept and read back, attestation `1e2f3136…` (the same ID an earlier independent proof produced) | 1047 s |
| main push, kept proof of these inputs | reused `1e2f3136…` | `just app` 1.7 s |
| pull request | reused | |
| merge queue run | reused | |
| tag push (`push:refs/tags/v9.9.9`) | went to the full proof | |
| manual run on main, local run | went to the full proof | |
| one byte appended to the kept manifest | proved in full: the manifest's address differs | |
| kept ID `ffff…` | proved in full: the manifest's address differs | |
| committed change to a model source | proved in full | |
| committed change to `rust-toolchain.toml` | proved in full: the proof inputs differ | |
| untracked file in `app/` | proved in full: the proof inputs differ | |
| another `SDK_IMAGE` | proved in full: the proof inputs differ | |
| `bootstrap.yml` key without the SDK digest, `template.lock` relocked to it | `audit-bootstrap` failed: `bootstrap.yml and the Justfile may reuse a proof only on a pull request, a merge queue run or a main push, keyed by every proof input and checked on read`; restored, it passed | |

The tag push first ran `prismpm verify` in full; under that load the Hologram
oracle's cargo build was killed (PP5301, SIGTERM), so the tag, manual and local
cases were then repeated with `prismpm` replaced by a stub that reports it was
called. The full proof itself passed in the first case.

The whole `just vv`, run as a main push (`PRISM_PROOF_EVENT=push:refs/heads/main`) on these exact commits, passed in 157 s: every other part of the gate ran in full, and `app` reused `1e2f3136…`.

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
`conformant`, or `drift:` followed by each drifted path after a space, or
`invalid request` for any
other length. Lean proves, with only `propext`, that the executable verdict is
both sound and complete for the specification:

- `conformant_decides`: `conformant observation = true ↔ Conformant observation`.

The proof is `simplify` over the definitions and Lean's `Bool.and_eq_true` and
`Nat.beq_eq`, not `linear_arithmetic`. A `linear_arithmetic` proof makes the
generated module import `LexLeanRuntime.Laws`, and `prismpm build` then
compiles that module to C, which did not finish within the build's ten-minute
limit in CI or in 25 minutes locally (without C generation it takes four
seconds). The first CI run of this app failed exactly there, with
`PP5007: application-lean timed out`. The second failed in code generation
(`PP4102`), because the drift report was a `List String` built as an
intermediate value. It is now `Bytes` appended straight into the response.

`Conformant` is the conjunction of six digest equalities, one per universal
policy path. A digest is four big-endian 64-bit words, because generated code
represents a `Nat` as a checked `u64`, and `SameDigest` requires all four words
to be equal, so two digests are the same exactly when their 32 bytes are. `contract_tc_01` reads the model as text and requires the theorem
statement, its axiom list, one `Conformant` conjunct for each path in
`template-contract.json` other than `template.lock` (which cannot pin its own
digest), each path in the drift report, and a `dispatch` decided by
`conformant`. The nine acceptance vectors (conformant, four drift cases, 383,
385, 0 and 512 bytes) are executed against the compiled guest by the build
that `prismpm verify` runs before it checks the resulting holo, so the proof, the code
and the observed behaviour ship as one artifact.

Locally, with LexLean 0.3.0 (the SDK's compiler), `lexlean check` and
`lexlean verify` passed, verifying three modules; both planted defects in the
table above made `contract_tc_01` fail with a message naming the defect. The
holo build and verify run in the pull request's bootstrap job inside the
locked SDK. `just app` runs only `prismpm verify`: it begins with the same
build `prismpm build` performs, so running both built the holo twice. In the
first green run, `prismpm build` took 82 seconds and `prismpm verify` 6
minutes 14 seconds.

## Prism accounts: the remembered passkey

The sign-in page (`identity/id.mjs`) remembers which passkey this device last
signed in with, so the browser asks for that one and skips its chooser, and
it names the device's authenticator ("Secured by Windows Hello"). The hint
must never decide that a device has no passkey: if it could, someone with an
account whose remembered passkey was removed would be sent to Create account
and end up with a second account.

| Gate | Planted defect | Result |
| --- | --- | --- |
| `npm run test:identity`, "a remembered passkey that is gone asks for any passkey, never straight to a new account" | the branch that forgets a remembered passkey which did not answer, removed from `run()` | rejected: `locator.waitFor: Timeout 10000ms exceeded` waiting for `#go-label` to read `Sign in`; restored, 20 of 20 pass |
| `npm run test:identity`, "a click the bar is redrawn under still opens the panel" | the frame before this fix, which opened the panel it was clicked on even after the bar was redrawn (found on holo-search: a first click right after load did nothing) | rejected: `not ok 2`, waiting for `#account-panel:popover-open`; fixed, 21 of 21 pass |
| same test, after the account panel became a centred dialog and the button reads "Continue with Windows Hello" | the same branch removed again | rejected: the button read `Create account` where `Continue with Windows Hello` was required; restored, 21 of 21 pass |

## The workspace page

The standard page became the workspace: a header row, the app's surface
beside a rail for its result, actions and history, and a spec that opens
beside the window (the frame's window and bar narrow by `--prism-aside`)
and loads only when opened. Plain dark replaced immersive as the default
theme. The page gates were run on three apps built with these files, as
`frame-sync.mjs --pin` gives them (Leap year, Luhn check, Legal chess, each
with its own holo and LexLean source):

| Gate | Result |
| --- | --- |
| `node bootstrap/screens.mjs site screens`, six size classes in three themes, the spec open and closed | every class passes in every theme, all three apps |
| `lhci autorun`, three runs each | 100 in all four categories, CLS 0, LCP about 1.21 s; 105 KiB (Leap year, Luhn) and 122,701 of 122,880 bytes (Legal chess, whose live page was already within 1 KiB of the budget) |
| `npm run test:identity`, `npm run test:try` | 21 of 21, 1 of 1 |

The screens gate's new check, that the workspace fits the screen, was first
written as "the page does not scroll". A planted defect showed it could not
fail: the page hides its overflow, so a workspace taller than the screen is
cut off rather than scrolled.

| Gate | Planted defect | Result |
| --- | --- | --- |
| `screens.mjs`, the workspace fits the screen (scroll only) | `main` made 4 rem taller than the screen | passed: the defect went unseen |
| same, checking that `main` ends inside the screen and holds its content | the same 4 rem | rejected in all 18 cases: `the workspace does not fit the screen: the page would scroll or cut it off`; restored, the three apps pass |

Lighthouse found two more before the change was done: the display's type
shrank once the script set its width (CLS 0.009 on Luhn check, fixed by
setting the first width in the hashed stylesheet), and `app.mjs` crossed the
unminified-JavaScript allowance (2,458 bytes against 2,048, fixed by moving
the spec into `site/spec.mjs`, loaded on first open, and shortening comments).

## A newer frame may add a file

`frame-sync.mjs --pin` judged a target commit's lock by this checkout's own
frame list, so the first frame to add files (`site/spec.css`, `site/spec.mjs`)
could not be pinned by any app that had an older script. The target is now
judged by its own frame: its `frame-sync.mjs`, matched to its lock, names the
files, read as text and never run, and each must sit under `bootstrap/` or
`site/` (or be `lighthouserc.json`). `--check` is unchanged. Run against real
commits and against mirrors served with `PRISM_TEMPLATE_RAW`:

| Case | Result |
| --- | --- |
| the old logic with the old fourteen-file list pins `128d80d` | refused: `frame.lock at 128d80d… is not a prism/frame-lock/1 lock of this frame` (the defect) |
| the new logic with the old list pins `128d80d` | pinned; `--check` then passes, 16 files |
| the new logic pins back to `76bdeb0` | pinned; `site/spec.css` and `site/spec.mjs` reported as no longer part of the frame |
| a mirror serves `site/app.mjs` with one line added | refused: its digest against the lock's; nothing written |
| a mirror's lock names a file its frame does not | refused: the lock's list against the frame's; nothing written |
| a mirror's frame and lock both add `.github/workflows/x.yml` | refused: `names files outside the page`; nothing written |
| an untouched mirror | pinned |

## Archive verification stays off the UI thread (FR-01)

The frame's normal worker path now sends an absolute archive URL, not already
parsed guest bytes. The worker calls the locked `prism-code` browser loader and
keeps that application for identities, dispatch and acceptance. The page never
imports the archive runtime on that path. No runtime parser or verifier is copied.

Absent workers, constructor errors and failed startup transport retain fully
verified page-side loading. A worker reply carrying a runtime load refusal is
final: it is never treated as unavailable transport. Unverified identities cannot
enable the card or workspace and cannot dispatch or replay inside the worker.
Runtime error codes survive the message boundary. Frame protocol failures are
`frame.worker` (transport), `frame.worker.not-ready`, `frame.worker.initialized`,
`frame.worker.not-verified`, and `frame.worker.request`, as specified in FR-01's
scenario. After an initialized worker crashes, waiting and future calls fail;
they are not silently re-executed on the page.

`frame_fr_01` calls `node site/worker-gate.mjs` from the normal Rust test suite.
The gate executes the complete production page and worker modules in isolated
VM contexts. Browser APIs and the imported runtime are test doubles. Fourteen
controls cover verified fallback, normal startup, exact identities, dispatch,
acceptance mismatch indices, final archive refusal, unverified archives, protocol
refusals, runtime codes, crashed/malformed transport, and latest-answer/Enter
history UI ordering. The gate requires all fourteen controls to pass without
skips, cancellation or todo entries; process success alone is not enough.

The new capability's register, scenario and failing test preceded implementation.
The baseline production-page test failed with `archive verification was imported
on the UI thread before worker startup`; its no-worker control passed. Actual
`just model-write` and read-back ran in the locked SDK in Foundry diagnostic run
43059551107, bound to template base dfc09e61 and the preparation patch. Only its
hash-verified generated `CONFORMANCE.md` was imported, never a handwritten
projection. `frame.lock` was regenerated with the template's own
`node bootstrap/frame-sync.mjs --lock` after implementation.

Planted defects rejected by `node site/worker-gate.mjs` (all exit 1):
- importing archive verification on the normal UI path;
- retrying an archive refusal through page-side fallback;
- allowing worker dispatch for unverified identities;
- returning a different archive fingerprint;
- dropping runtime refusal codes;
- skipping the normal worker control;
- omitting a fallback control.

All fourteen controls passed again after restoring the production sources.
Syntax checks, `frame-sync --check`, and whitespace checks also passed locally.
A separate Node worker-thread adapter executed the unchanged production worker
with the exact failed Foundry archive (385,046 bytes; SHA-256
`b7b116cd0f20bca62b598a51867bd20a01a91ca122769f791b9ae0201ce61e93`) and the diagnostic
artifact's actual runtime. All 114 acceptance vectors and 114 individual dispatch
comparisons passed, with the original verified fingerprint. A changed model
returned unverified identities and refused dispatch/replay; a malformed header
preserved `archive.magic`. These are Node functional checks, not browser
performance qualification, and the diagnostic inputs are not vendored here.

Full locked-SDK `just vv` on the finished patch and browser/Lighthouse acceptance
remain required. Local tooling did not support the SDK or browser launch. No
performance threshold, universal policy, production dependency, or deployment
gate was weakened. No production performance improvement is claimed until the
original browser gate passes on the reviewed downstream import.

### Browser worker module graph repair

The earlier diagnostic ran the frame protocol against VM doubles but the real
module worker could not import `node:crypto`. Document import maps do not apply
to workers, so startup failed and the fully verified page fallback preserved
correctness while retaining the original long task.

The build now packages the exact locked runtime static module graph under
`worker-runtime/`. All module bytes are unchanged except one import specifier:
canonical/index.js selects the identical browser crypto refusal adapter already
used by the page. No canonical hashing function is supplied or executed. The
packager records source/output SHA-256 pairs and refuses unknown bare or escaping
static imports with `frame.worker.bundle`. Source dependency files are untouched.
The template's frame lock includes the packager, and page assembly always runs it.

The real static module graph failed before implementation with `module workers
cannot resolve bare specifier node:crypto`. All eighteen complete production
controls now pass, including exact module bytes, graph linking and planted
unknown/escaping imports. A separate real Chromium suite exercises the full page,
absence of document-side runtime imports, 22/22 fixture acceptance and dispatch,
malformed archives, and offline reload. It runs in the existing browser workflow.
Local Chromium cannot launch in this executor (`socket() failed: Operation not
permitted`), so browser results and the downstream Lighthouse improvement remain
unqualified until hosted CI passes. Thresholds and CSP are unchanged.

Independent review caught a local-render regression: reading `site/vendor`
assumed production staging and stopped the documented no-holo scaffold render.
The packager now requires an explicit input root; page assembly names its locked
`../try/vendor`, while mutation fixtures name their isolated input directories.
The added source-root control failed before the correction with ENOENT on the
unstaged vendor directory. Nineteen Node controls pass after correction. A real
no-holo/no-vendor scaffold render is also included in the browser lane. Production
packaging remains unconditional; no gate or capability is skipped.
