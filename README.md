# UOR Prism template

The starting point for every Prism application: a repository whose every claim
is registered, specified as a scenario, and proved by Lean's kernel, all
checked by one command that runs in its own process.

```sh
npx prism-code@latest init my-app
cd my-app
npx prism-code check
npx prism-code build
```

`init` writes this template from the copy `prism-code` carries, each file
admitted by its BLAKE3 label, so it reads nothing from the network. `check` and
`build` need no container, toolchain, workflow or server.

A Prism application is modeled in [LexLean](https://github.com/UOR-Foundation/LexLean),
proved by Lean's kernel, and built by [`prism-code`](https://www.npmjs.com/package/prism-code)
into a holo: one content-addressed archive that holds the model, the
WebAssembly guest, its view and its acceptance vectors. Anyone can check a holo
before it runs, offline, with `prism-code verify`.

## What you get

| Feature | What it means |
| --- | --- |
| **One command** | `prism-code check` is the acceptance boundary, the same on every machine. `prism-code build` also writes the app and replays every acceptance vector. |
| **Claims you can audit** | `model/` registers every claim with an honesty level, and `CONFORMANCE.md` is generated from it. A claim without a scenario, or a `build` claim whose theorems Lean does not prove, fails `check`. |
| **Proof, not tests** | A `build` claim names the theorems of the model that prove it. `check` refuses the claim unless Lean's kernel proved each, within its declared axioms, in that same run. |
| **Typed refusals** | A registered failure names the exact refusal it answers, and `build` refuses it unless an acceptance vector answered with that refusal is replayed. |
| **A bound policy** | `template.lock` binds the universal policy files by BLAKE3 label, and `check` refuses one that changed. |

## The template is a Prism application

`app/` is the **template contract checker**. A repository built from this
template inherits universal policy files it must never edit. For each of the
three that `template.lock` binds, the checker takes the locked label and the
label actually on disk, and answers `conformant` or names every file that
drifted.

What makes it Prism and not a script: Lean proves the verdict is right.

```
theorem conformant_decides : conformant observation = true ↔ Conformant observation
theorem accepts_exactly_a_request : accepts length = true ↔ length = 192
```

`Conformant` says every observed label equals its locked label. The first
claim is registered as `TC-01`; the second, `TC-02`, is its refusal: any request
that is not three pins answers `invalid request`, which `build` replays on four
such requests. Both are specified in `features/suites/contract.feature`. Keep
them as a worked example, or replace `app/src/Contract.lex.tex` with your own
model and the rows of `model/ids.toml` with your own claims.

## Everyday commands

| Command | What it does |
| --- | --- |
| `prism-code check` | Checks the model, has Lean's kernel prove every theorem, and enforces R1 to R6 over the registers, the scenarios and `template.lock`. |
| `prism-code build` | Regenerates `CONFORMANCE.md` from `model/`, runs `check`, then writes the app under `app/.prism/build` and replays every acceptance vector. |
| `prism-code verify` | Checks a built app again: its archive, its world and its vectors. |

## For coding agents

[AGENTS.md](AGENTS.md) holds the rules R1 to R6 and the required order of work.
Read it first. Every refusal `check` reports names the rule it enforces.
`init` also writes the Prism skill into `.claude/skills/prism` and
`.agents/skills/prism`.

Repositories generated from this template are already Qortara-initialized; do
not re-append managed sections; keep `.qortara/` journals empty here. The kit
these files came from is pinned in
[docs/qortara-template-pin.json](docs/qortara-template-pin.json).

## Repository layout

| Path | Owner | Purpose |
| --- | --- | --- |
| `app/` | project | The Prism application: its LexLean model, the Foundation library it imports, and its project files. |
| `model/` | project | The claim, authority and ledger registers: the single source of every claim (R1). |
| `features/suites/` | project | One Gherkin scenario per registered ID (R3). |
| `CONFORMANCE.md` | generated | Written by `prism-code build`, never by hand. |
| `AGENTS.md`, `VERIFICATION.md`, `template-contract.json`, `template.lock` | universal policy | Bound by `template.lock`. Changes arrive only as a template release. |

[TEMPLATE-CONTRACT.md](TEMPLATE-CONTRACT.md) defines the inherited policy, the
`template/2` register and the lock. [VERIFICATION.md](VERIFICATION.md) defines
the acceptance boundary, and [TEMPLATE-VERIFICATION.md](TEMPLATE-VERIFICATION.md)
records this repository's planted defects.

Licensed under [MIT](LICENSE-MIT) or [Apache-2.0](LICENSE-APACHE).
