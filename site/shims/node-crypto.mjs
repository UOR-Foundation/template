// prism-code@0.2.0's browser entry still imports `node:crypto` through its
// deprecated canonicalization re-exports (src/canonical/index.js). The page
// never calls those, and verification uses prism-code's own BLAKE3. The import
// map points the specifier here so the vendored bytes stay untouched.
export function createHash() {
  throw new Error('node:crypto is not available in the browser; use prism-code/canonical from Node');
}
