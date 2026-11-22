# UOR template contract 2

`template-contract.json` is the canonical `uor/template-contract/2` machine
contract. Its disjoint `universal_policy_paths` and `project_content_paths`
sets separate repository policy inherited by every UOR project from content
owned by the instantiated project. `required_paths` is their exact union.

Contract 2 is the standalone frame: a repository made from this template needs
only `prism-code` to check, build and verify it. It carries no SDK container
lock, no devcontainer, no GitHub workflow and no Rust tooling.

## Universal policy

The following are template-owned policy and remain present in every instance:

- R1 to R6 and the claim, authority, ID and ledger discipline (`AGENTS.md`);
- the universal verification policy (`VERIFICATION.md`);
- this contract (`template-contract.json`) and the lock that binds it
  (`template.lock`).

An instantiated repository may strengthen these rules. It cannot replace or
weaken them while claiming conformance to this contract.

## Project content

The application model in `app/`, the registers in `model/`, the scenarios in
`features/suites/`, the generated `CONFORMANCE.md`, and any further documents
belong to the instantiated repository. `CONFORMANCE.md` is project content: the
template begins with the generation of its own register, and an instance
regenerates its own bytes with `prism-code build`. Adding content re-arms
the R1 to R6 gates; it does not require editing the universal policy.

## The register, `template/2`

`model/ids.toml`, `model/authorities.toml` and `model/ledger.toml` carry
`spec = "template/2"`. A row of `model/ids.toml` holds:

| Field | Meaning |
| --- | --- |
| `id`, `suite`, `level`, `statement` | as in contract 1 |
| `theorems` | for a `build` row: the theorems of the model that prove it, each `Module.name`. `prism-code check` refuses the row unless each is stated by the model and proved by Lean's kernel within its declared axioms, in that same check (R3). |
| `failure` | for a row that specifies a public failure: the exact response the application gives when it refuses, as text (R5) |
| `negative` | with `failure`: the `build` row whose theorems prove the refusal's condition, or the row's own ID (R5) |

A row with `failure` has its scenario tagged `@rejects`, and `prism-code build`
refuses the row unless it replays at least one acceptance vector whose response
is exactly the `failure` text. A register with `spec = "template/1"` keeps
contract 1's R3, a test named for the ID; any other spec is refused.

## The lock

`template.lock` is `uor/template-lock/2`. It names the template repository,
the BLAKE3 label of `template-contract.json`, and every universal policy file
but itself with the BLAKE3 label of its bytes. The labels say what the policy
is, so the lock needs no commit to name it, and a release is one commit. `prism-code check` recomputes each label and refuses
a file whose bytes differ. Line endings are part of those bytes:
`.gitattributes` keeps every file as committed.

`init` writes the template from the copy prism-code carries, admitted by its
BLAKE3 labels, so starting a project reads nothing from the network. A
template release is a reviewed commit here, then a prism-code release that
carries it.
