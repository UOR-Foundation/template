# Repository instructions

These rules apply to every repository carrying `uor/template-contract/1`.
Project documentation names the repository's authoritative model, generated
outputs, and additional acceptance gates.

## Universal rules

| Rule | Requirement |
| --- | --- |
| R1 | The declared model is the single source for claims and generated behavior. `CONFORMANCE.md` is regenerated with `just model-write`, never edited as an independent authority. |
| R2 | Claim levels remain distinct: imported facts are reproduced from their named authority, built claims are constructed and validated here, and open claims are measured without being restated as proof. |
| R3 | A capability begins as a registered ID, a behavioral scenario, and a failing test before its implementation. |
| R4 | Nothing is deferred, stubbed, or hidden behind a flag that disables the claimed capability. |
| R5 | Every public failure is typed, modeled, documented, and covered by a negative test. |
| R6 | Shipped outputs use only locked production dependencies, with no wildcard, path, Git, or development-only substitute. |

The model representation is project-owned. It may be a Prism/LexLean graph or
another registered source, but a claim cannot acquire a second source in prose,
generated code, a workflow, or a test fixture. Imported standards and packages
are cited and independently validated; their guarantees are not re-registered
as local facts.

## Required workflow

1. Update the authoritative model, its ID/claim/authority/ledger records, and
   its acceptance scenario.
2. Run `just model-write` for generated project evidence.
3. Implement the modeled behavior without adding a handwritten fallback.
4. Plant the representative defect and confirm the intended gate rejects it.
5. Run `just vv` inside the exact SDK image selected by `prismpm.lock`.

`just vv` is the repository's complete acceptance boundary. Project-specific
recipes may strengthen it, but may not create a reduced path that is used for
release. An empty repository arms anti-vacuity checks so the first registered
capability must add its scenario and test; an empty register is not itself a
claim that product behavior exists.

## SDK and template boundary

- Use PrismPM only through the immutable SDK image in `prismpm.lock`.
- Do not add a vendored, submodule, path, Git, host-tool, or workflow-only
  implementation of SDK behavior.
- The digest-pinned devcontainer and the full-commit-pinned shared Action call
  the same public CLI contract.
- `prismpm template check` is read-only. Template changes arrive only as a
  reviewable pull request generated from an exact template policy revision.
- Universal policy files are byte-bound by `template.lock`. Put generated or
  product-specific verification evidence in project-owned files; never edit a
  universal file to make one repository's result pass.

## Gate quality

A gate is evidence only after a planted defect demonstrates that it can fail.
Record the defect, failing command, diagnostic, and restored result in the
project's verification documentation. Gates that read source must inspect
their own implementation and must reject skipped, ignored, filtered,
conditionally omitted, stale, or wrong-file results.

Comments explain why a decision exists. The implementation and model already
say what it does.
