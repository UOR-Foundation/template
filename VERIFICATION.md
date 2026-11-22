# Universal verification policy

Every `uor/template-contract/2` repository satisfies this policy through one
command, `prism-code`, which runs LexLean and Lean's kernel in its own process.
Nothing here needs a container, a toolchain, a workflow or the network.
Project-owned verification documentation maps its features, diagnostics and
planted defects to concrete evidence.

| Boundary | Required check |
| --- | --- |
| template | `prism-code check` verifies each universal policy file against its BLAKE3 label in `template.lock` |
| model | `prism-code check` has LexLean check the model and Lean's kernel prove every theorem, each within its declared axioms |
| register | `prism-code check` enforces R1 to R3 and R5 over `model/` and `features/suites/`; `prism-code build` regenerates `CONFORMANCE.md` |
| acceptance | `prism-code build` writes the app and replays every acceptance vector; `prism-code verify` checks a built app again |
| dependencies | LexLean's lock check admits only exact, locked imports (R6) |

R1 to R6 are defined only in `AGENTS.md`. Each is falsifiable:

- a `CONFORMANCE.md` that is not the generation of the register fails R1;
- a blurred claim level, or a `some-true` claim with no authority, fails R2;
- a registered ID without a scenario, or a `build` ID whose theorems the model
  does not state or the kernel does not prove, fails R3;
- a theorem proved on an axiom it does not declare, or an unproved one, fails
  R4;
- a registered failure with no rejecting scenario, or with no replayed
  acceptance vector answered with its refusal, fails R5; and
- an unlocked or mutable import fails R6.

This file does not assert that any particular product capability passed. Those
claims belong to the project model, the generated `CONFORMANCE.md`, and its
project-owned verification evidence.
