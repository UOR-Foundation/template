# UOR project template

Shared repository policy for projects consuming PrismPM as an SDK. No
application or organizational model is included.

## Try Prism first

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/UOR-Foundation/template?quickstart=1&devcontainer_path=.devcontainer%2Ftry%2Fdevcontainer.json)
&nbsp;or&nbsp;
[run it in your browser](https://uor-foundation.github.io/template/), no sign-in.

The page loads `Calculator.holo`, recomputes its BLAKE3 hashes, asks it
`add 20 22`, and replays its 22 acceptance vectors. It is plain static files in
[`site/`](site/), running [`prism-code`](https://www.npmjs.com/package/prism-code)
0.2.0 vendored from npm; `node site/vendor.mjs --check` proves the copy is the
published release.

The badge opens a small Node 22 codespace ([`.devcontainer/try/`](.devcontainer/try/devcontainer.json),
no SDK image) that installs `prism-code` and serves the same Calculator on
port 8080; your browser opens on it with no command typed. Then, in its terminal:

```
npx prism-code vectors "$(npm root -g)/prism-code/fixtures/Calculator.holo"   # replay 22 acceptance vectors, exit 1 on a failure
npx prism-code inspect "$(npm root -g)/prism-code/fixtures/Calculator.holo"   # identities, limits, provenance
tail /tmp/calculator.log                                                      # the running server
```

To build your own application you need the SDK image and Docker, which the try
codespace deliberately does not carry; see the build tier in
[`prism-code`](https://github.com/UOR-Foundation/prism-code).

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
