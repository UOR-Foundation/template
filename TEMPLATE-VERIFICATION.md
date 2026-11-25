# Template repository verification

This repository instantiates the universal verification policy in
`VERIFICATION.md` for the template itself, which is a Prism application: the
starter app in `app/`, which every new app begins as. One command is its whole
gate:

| Command | Enforces | IDs |
| --- | --- | --- |
| `prism-code check` | LexLean checks the model; Lean's kernel proves its theorem within its declared axioms (R4); R1 to R3 and R5 over `model/`, `features/suites/` and `CONFORMANCE.md`; `template.lock` over the universal policy; LexLean's lock check (R6) | `APP-01` |
| `prism-code build` | `CONFORMANCE.md` from the register, then `check`, then the holo, with its acceptance vector replayed | `APP-01` |

The register holds `APP-01`, so every check runs over a real row, scenario and
theorem.

## Planted defects

Each was applied to a copy of this repository and run with `prism-code check`,
which exited 1 and named the code below. Restored, the same command exits 0
with no violation.

| Rule | Planted defect | Refused with |
| --- | --- | --- |
| R1 | a line added to `CONFORMANCE.md` by hand | `contract.conformance` |
| R2 | `APP-01` given the level `built` | `contract.level` |
| R3 | `APP-01` names `App.answers_with_a_request`, which the model does not state | `contract.theorem-unstated` |
| R3 | `APP-01` with no `theorems` | `contract.untested` |
| R3 | `dispatch` answers `0x`, so `answers_with_the_request` is false | `contract.theorem-unproved` |
| R3 | `APP-01`'s scenario tagged `@APP-09`, which is not registered | `contract.unregistered` |
| R5 | `APP-01` given the failure `refused`, with no `@rejects` scenario and no vector refused with it | `contract.rejects-scenario`, `contract.refusal-unreplayed` |
| policy | a line added to `AGENTS.md` | `contract.policy-drift` |
| contract | the register's spec is `template/3` | `contract.spec` |
