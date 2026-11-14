# `just vv` is the normative acceptance gate. Every other recipe is either one
# of its parts or a writer the gate checks the output of.
#
# Each check in `vv` runs exactly once. The parts are ordered so the cheapest
# failure is reported first: formatting needs no compiler, the repository gates
# compile only `xtask`, and the SDK's checks run before the workspace build.

default: vv

# The whole gate.
vv: fmt-check model template-check lint test deny app
    @echo "vv: the acceptance gate passed"

fmt-check:
    cargo fmt --all -- --check

# R1, R4, R5 and the bootstrap trust root: `check-model`, `audit-limits`,
# `audit-deferral` and `audit-bootstrap` (which includes
# `audit-dependency-updates`), in one `xtask` process.
model:
    cargo run -q --locked -p xtask -- validate

# The SDK's own checks of the contract and both locks. `template check` also
# regenerates `CONFORMANCE.md` in an isolated copy through `model-write`.
template-check:
    prismpm template check
    prismpm lock check

# Clippy at `-D warnings` over every target with every feature enabled. This is
# the one place an optional feature is compiled: a rename upstream of an
# optional dependency fails nowhere else until someone turns the flag on, and
# `--all-targets` because the tests behind a flag are code too. `test` compiles
# the default feature set.
lint:
    cargo clippy --workspace --all-targets --all-features --locked -- -D warnings

# The workspace suite, which includes the `repo-conformance` meta-gate (R3,
# `CM-02`, `CM-03`).
test:
    cargo test --workspace --locked

# R6: nothing shipped depends on a dev-only crate, no wildcard version
# requirement, no advisory against anything in the tree. `cargo-deny` is
# supplied by the locked SDK.
deny:
    cargo deny --all-features check

# The template's own Prism application, the contract checker. The model must
# be canonical and locked. `prismpm verify` builds the holo, replaying its
# acceptance vectors in the compiled guest, then has the Lean kernel and
# leanchecker check every theorem (`TC-01`) and the generated code against the
# model. It runs the build itself, so a separate `prismpm build` would repeat it.
#
# A pull request, a merge queue run and a main push may reuse a kept proof;
# a tag, a manual run and every local run prove in full. bootstrap.yml
# restores `.prism-proof` from a cache keyed by every proof input and passes
# `<event>:<ref>` in PRISM_PROOF_EVENT. The key only finds a candidate:
# `xtask proof-reuse` reuses it only if its attestation ID resolves to the
# attestation it names and that attestation binds this checkout's model, this
# image's Lean and Lake, the architecture, the SDK image and every input file.
# Anything else proves in full, and every proof is kept and read back.
app:
    #!/usr/bin/env bash
    set -euo pipefail
    (cd app && lexlean fmt --check && lexlean lock --check)
    case "${PRISM_PROOF_EVENT:-}" in
      pull_request:*|merge_group:*|push:refs/heads/main)
        if cargo run -q --locked -p xtask -- proof-reuse; then
          exit 0
        fi
        ;;
    esac
    rm -rf .prism-proof
    prismpm --project app verify | tee .prism-proof.log
    attestation=$(sed -n 's/^verified attestation: \([0-9a-f]\{64\}\)$/\1/p' .prism-proof.log)
    rm -f .prism-proof.log
    cargo run -q --locked -p xtask -- proof-keep "$attestation"

# Only the meta-gate, while iterating on a scenario. `test` already runs it.
bdd:
    cargo test --locked -p repo-conformance

fmt:
    cargo fmt --all

# Regenerate everything the model owns: CONFORMANCE.md.
model-write:
    cargo run -q --locked -p xtask -- check-model --write

# R3's first step in one command: a register row, its scenario, a failing test
# named for the ID, and the regenerated CONFORMANCE.md.
#
#     just new-capability CX-01 build parsing "A parsed document round-trips"
new-capability id level suite statement:
    cargo run -q --locked -p xtask -- new-capability {{quote(id)}} {{quote(level)}} {{quote(suite)}} {{quote(statement)}}
