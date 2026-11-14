/**
 * One error type for the whole package. `code` names the check that failed
 * (`archive.magic`, `core.exports`, `closure.provenance`, ...) so a caller can
 * branch on it without parsing the message.
 */
export class PrismCodeError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'PrismCodeError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export function fail(code, message, details) {
  throw new PrismCodeError(code, message, details);
}
