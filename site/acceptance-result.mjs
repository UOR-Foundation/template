// Narrow display contract for a guest's byte-for-byte acceptance replay.
// It preserves failure identities without shipping request/response bytes to UI.
// Public diagnostics are stable codes governed by model/browser-acceptance-diagnostics.toml.
export const ACCEPTANCE_DIAGNOSTICS = Object.freeze({
  invalidResult: "FRAME_ACCEPTANCE_INVALID_RESULT",
  invalidIdentity: "FRAME_ACCEPTANCE_INVALID_FAILURE_IDENTITY",
  countMismatch: "FRAME_ACCEPTANCE_COUNT_MISMATCH",
});

function refuse(code) {
  throw Object.assign(new Error(code), { code });
}

export function acceptanceSummary(result, expectedTotal) {
  if (!result || typeof result !== "object" ||
      !Number.isSafeInteger(expectedTotal) || expectedTotal < 0 ||
      !Number.isSafeInteger(result.total) || result.total !== expectedTotal ||
      !Number.isSafeInteger(result.passed) || result.passed < 0 ||
      result.passed > result.total || !Array.isArray(result.failed)) {
    refuse(ACCEPTANCE_DIAGNOSTICS.invalidResult);
  }
  const failed = [];
  const seen = new Set();
  for (const item of result.failed) {
    const index = item?.index;
    if (!Number.isSafeInteger(index) || index < 0 || index >= result.total || seen.has(index)) {
      refuse(ACCEPTANCE_DIAGNOSTICS.invalidIdentity);
    }
    seen.add(index);
    failed.push(index);
  }
  if (result.passed + failed.length !== result.total) {
    refuse(ACCEPTANCE_DIAGNOSTICS.countMismatch);
  }
  return { total: result.total, passed: result.passed, failed };
}
