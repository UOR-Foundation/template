# UOR project template

Shared repository policy for projects consuming PrismPM as an SDK. No
application or organizational model is included.

## Create a repository

1. Create a GitHub repository from this template and clone it.
2. Set `workspace.package.repository` and `homepage` in `Cargo.toml`.
3. Replace this README with the project's name, purpose, and current status.
4. Keep the claim and authority registers empty until capabilities are defined.
   Follow [AGENTS.md](AGENTS.md) when adding them.

## SDK status

This template is not yet bound to a public SDK release. `prismpm.lock` and
`template.lock` are absent; the devcontainer and complete `just vv` gate require
those immutable bindings. Creating and naming a repository does
not require selecting its model, standards, views, or deployment targets.

Once bound, open the repository in its digest-pinned devcontainer and run
`just vv`. The host needs only Git, Docker with Buildx, and a devcontainer
client. Do not substitute a vendored PrismPM checkout or host toolchain.

## Repository boundary

- `model/`, `features/suites/`, and generated `CONFORMANCE.md` describe project
  claims. They begin empty; repository tooling is not a product implementation.
- [TEMPLATE-CONTRACT.md](TEMPLATE-CONTRACT.md) defines inherited policy and the
  immutable SDK/template update process.
- [VERIFICATION.md](VERIFICATION.md) defines the full acceptance boundary;
  [TEMPLATE-VERIFICATION.md](TEMPLATE-VERIFICATION.md) maps the scaffold's gates.
- Reusable workflows are infrastructure. Do not enable publication or
  deployment before the project model and its acceptance criteria exist.

Licensed under [MIT](LICENSE-MIT) or [Apache-2.0](LICENSE-APACHE).
