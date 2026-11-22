# Template repository verification

This repository instantiates the universal verification policy in
`VERIFICATION.md` for the template itself, which is a Prism application: the
template contract checker in `app/`. One command is its whole gate:

| Command | Enforces | IDs |
| --- | --- | --- |
| `prism-code check` | LexLean checks the model; Lean's kernel proves both theorems within their declared axioms (R4); R1 to R3 and R5 over `model/`, `features/suites/` and `CONFORMANCE.md`; `template.lock` over the universal policy; LexLean's lock check (R6) | `TC-01`, `TC-02` |
| `prism-code build` | `CONFORMANCE.md` from the register, then `check`, then the holo, with all 9 acceptance vectors replayed: 5 that answer a verdict and 4 refused with `invalid request` | `TC-01`, `TC-02` |

The register holds `TC-01` and `TC-02`, so every check runs over real rows,
scenarios and theorems, and `TC-02` arms R5 with a real refusal.

## Planted defects

Each was applied to a copy of this repository and run with `prism-code check`,
which exited 1 and named the code below. Restored, the same command exits 0
with no violation.

| Rule | Planted defect | Refused with |
| --- | --- | --- |
| R1 | a line added to `CONFORMANCE.md` by hand | `contract.conformance` |
| R2 | `TC-01` given the level `built` | `contract.level` |
| R3 | `TC-01` names `Contract.conformant_decided`, which the model does not state | `contract.theorem-unstated` |
| R3 | `TC-01` with no `theorems` | `contract.untested` |
| R3 | `accepts` tests for 191, so `accepts_exactly_a_request` is false | `contract.theorem-unproved` |
| R3 | `TC-02`'s scenario tagged `@TC-09`, which is not registered | `contract.unregistered` |
| R5 | `TC-02`'s failure is `request refused`, which no vector answers | `contract.refusal-unreplayed` |
| R5 | `TC-02`'s scenario not tagged `@rejects` | `contract.rejects-scenario` |
| R5 | `TC-02`'s negative is `TC-09` | `contract.negative` |
| policy | a line added to `AGENTS.md` | `contract.policy-drift` |
| contract | the register's spec is `template/3` | `contract.spec` |
