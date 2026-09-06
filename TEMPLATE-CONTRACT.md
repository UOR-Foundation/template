# UOR template contract 1

`template-contract.json` is the canonical `uor/template-contract/1` machine
contract. Its disjoint `universal_policy_paths` and `project_content_paths`
sets separate repository policy inherited by every UOR project from content
owned by the instantiated project. `required_paths` is their exact union.

## Universal policy

The following are template-owned policy and remain present in every instance:

- R1--R6 and the claim, authority, ID, and ledger discipline;
- the empty-register anti-vacuity and generated-conformance requirements;
- the requirement for project-owned planted-defect evidence, demonstrated for
  this repository in `TEMPLATE-VERIFICATION.md`;
- the immutable PrismPM SDK lock and SDK-based devcontainer;
- the hand-reviewed bootstrap workflow and full-commit-pinned shared PrismPM
  action consumption; and
- read-only drift checks plus explicit, reviewable update proposals.

An instantiated repository may strengthen these rules. It cannot replace or
weaken them while claiming conformance to this contract.

## Project content

Product models, source, generated artifacts, project-specific workflows,
deployment targets, authorities, claims, and additional gates belong to the
instantiated repository. `CONFORMANCE.md` is explicitly project content: this
template begins with the correctly generated empty document, while populated
repositories regenerate their own bytes from their own model. Update proposals
never overwrite it. The supplied reusable product workflow is starter content
whose release identity is rendered and pinned, not a byte-copied universal
policy path; downstream projects may extend or replace that workflow while the
universal bootstrap and lock checks remain authoritative. Adding content
re-arms the existing R1--R6 gates; it does not require editing the universal
policy.

## Locks and updates

`prismpm.lock` selects one multi-platform SDK manifest by digest. `template.lock`
binds that SDK identity, this contract's content digest, the template repository,
and the full commit revision of the policy input from which the lock-bearing
release was rendered. The policy-input revision is intentionally the preceding
policy commit, not the later commit that contains its derived lock. Exact file
digests in `policy_files` cover every universal path except the self-referential
`template.lock`; `policy_tree_sha256` binds the canonical JSON array. Together
they make drift checkable without fetching that commit. `prismpm template
check` is read-only. `prismpm template update`
emits a patch for review; automation may open a pull request
containing that patch but may not write a downstream default branch directly.

Publishing a template release passes three explicit arguments to
`bootstrap/render.sh`: the SDK manifest-list digest, the shared action's
independently published commit, and the preceding policy-input commit. No
placeholder or mutable discovery file is committed. The renderer refuses
anything except an OCI name with a lowercase SHA-256 manifest digest and a
complete 40-character PrismPM action and policy commit, reads the inventory
from that digest-selected SDK image, and regenerates the SDK-derived locks,
devcontainer, and workflow pins. The release renderer additionally requires
the policy commit to be the checked-out `HEAD` and its policy inputs to be
clean; downstream update automation uses the same renderer module on the
explicit policy snapshot that it checked out separately.
The rendered files are committed and checked, so opening a repository never
depends on mutable discovery.

A template release therefore uses two reviewed commits: policy commit A, then
lock commit B generated at A. This avoids a false self-reference while making
every downstream repository's input revision exact.
