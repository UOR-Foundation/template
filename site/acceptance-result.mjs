// Narrow display contract for a guest's byte-for-byte acceptance replay.
// This preserves failing vector identities but never sends requests or
// responses to the UI merely to render a pass/fail indicator.
export function acceptanceSummary(result, expectedTotal) {
  if (!result || typeof result !== "object" ||
      !Number.isSafeInteger(expectedTotal) || expectedTotal < 0 ||
      !Number.isSafeInteger(result.total) || result.total !== expectedTotal ||
      !Number.isSafeInteger(result.passed) || result.passed < 0 ||
      result.passed > result.total || !Array.isArray(result.failed)) {
    throw new Error("invalid acceptance result");
  }
  const failed = [];
  const seen = new Set();
  for (const item of result.failed) {
    const index = item?.index;
    if (!Number.isSafeInteger(index) || index < 0 || index >= result.total || seen.has(index)) {
      throw new Error("invalid acceptance failure identity");
    }
    seen.add(index);
    failed.push(index);
  }
  if (result.passed + failed.length !== result.total) {
    throw new Error("acceptance result counts disagree");
  }
  return { total: result.total, passed: result.passed, failed };
}
