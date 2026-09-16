# Template repository verification

This repository's `just vv` instantiates the universal verification policy in
`VERIFICATION.md` for the empty template itself.

| `just` recipe | Enforces | ID classes |
| --- | --- | --- |
| `just fmt-check` | the diff is reviewable | --- |
| `just model` | R1, R4, R5 | `CM-01` |
| `just lint` | clippy at `-D warnings` | --- |
| `just test` | the workspace suite | --- |
| `just features` | every optional feature compiles, with its tests | --- |
| `just bdd` | R3 and R2's behavioral half | `CM-02`, `CM-03` |
| `just deny` | R6 over the dependency graph | --- |
| `just template-check` | immutable SDK selection, template drift, and bootstrap least privilege | --- |

The register is empty, so its anti-vacuity check is armed rather than claiming
that features exist. It becomes an error as soon as an ID, scenario, or test is
added without the other two.

## Planted defects

| Gate | Planted defect | Result |
| --- | --- | --- |
| `check-model` | `CONFORMANCE.md` disagrees with the register | rejected |
| `audit-deferral` | a deferral marker in a crate and in the gate's own source | both rejected |
| honesty meta-gate | an ID with no test | armed by the empty register |
| `audit-bootstrap` | a floating/copied action, mutable SDK tag, changed universal file, narrowed boundary, shallow/credential-retaining checkout, copied project renderer, omitted standards lock, acceptance bypass, deploy-job signing privilege, or incomplete release lifecycle | all rejected |

`audit-deferral` reads every crate and `xtask`, including itself. Its token
construction therefore cannot exempt the very gate in which a deferral could
otherwise be hidden.

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
