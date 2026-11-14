/**
 * Browser shim for the one Node built-in that the vendored `prism-code`
 * package reaches: `node:crypto`, imported by the deprecated 0.1.0 canonical
 * helpers re-exported from `src/index.mjs`.
 *
 * The try page never calls those helpers. This module exists so the browser
 * can resolve the specifier and load the rest of the package unchanged.
 * Calling `createHash` here is a programming error, not a silent fallback.
 */
export function createHash() {
  throw new Error(
    "node:crypto is not available in the browser; the deprecated canonical helpers are not part of the try page",
  );
}
