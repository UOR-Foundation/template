# Vendored `prism-code`

This directory is a byte-for-byte copy of the browser-relevant files from the
published `prism-code@0.2.0` npm package. Nothing here is rebuilt.

- Package: `prism-code@0.2.0`
- Source: <https://registry.npmjs.org/prism-code/-/prism-code-0.2.0.tgz>
- Tarball shasum (SHA-1): `b2c980029bd85b080116604e606b73021447ac21`
- Tarball integrity:
  `sha512-LBjO3WVy0ZHiWUjgAveUJoT6Fz7u+Oh0IEQyNXldX76jFMkOU44wnL0tp46Xx4/p1QLh8gItYGVRIvaPSW/a8g==`
- Files taken: `src/`, `fixtures/Calculator.holo`, `LICENSE`.
- `package.json` here is a minimal replacement that keeps `version` and
  `type: module` (the published manifest is not needed for relative imports).
- `fixtures/Calculator.holo`: 24,801 bytes, SHA-256
  `84371aaac82af6b2a81a25a81d43d4097892985f55ae4919cfdcfa8b6e3486e7`.

The page imports `src/browser.mjs` directly, so there is no bundler and no
external request at runtime. `src/node.mjs` and `src/docker.mjs` are unused in
the browser and are kept only so the vendored tree matches the published `src/`.
