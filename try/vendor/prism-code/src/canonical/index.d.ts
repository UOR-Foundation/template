export interface CanonicalizeOptions {
  /** Line ending used in the canonical form. Default `'\n'`. */
  eol?: '\n' | '\r\n';
  /** Strip spaces and tabs before every newline. Default `true`. */
  stripTrailingWhitespace?: boolean;
  /** End with exactly one newline. Default `true`. */
  finalNewline?: boolean;
  /** Drop a leading UTF-8 BOM. Default `true`. */
  stripBom?: boolean;
}
export interface HashOptions extends CanonicalizeOptions {
  /** Digest passed to `node:crypto`. Default `'sha256'`. */
  algorithm?: string;
  /** Hash the canonical form (`true`) or the bytes as given (`false`). Default `true`. */
  canonical?: boolean;
  /** Return `"<algorithm>:<hex>"` instead of bare hex. Default `true`. */
  prefix?: boolean;
}
export interface CodeFacts {
  /** UTF-8 byte length of the input. */
  bytes: number;
  /** Lines in the input; `0` for empty input, a trailing newline adds no line. */
  lines: number;
  /** Line ending detected in the input. */
  eol: 'lf' | 'crlf' | 'mixed' | 'none';
  /** Whether the input started with a BOM. */
  hadBom: boolean;
  /** Whether the input ended with a newline. */
  finalNewline: boolean;
  /** Content address of the canonical form; see {@link codeHash}. */
  hash: string;
}
/** Reduce source text to its canonical form. */
export declare function canonicalize(source: string, options?: CanonicalizeOptions): string;
/** Content address of source text. */
export declare function codeHash(source: string, options?: HashOptions): string;
/** Cheap structural facts about source text, including its content address. */
export declare function describe(source: string, options?: HashOptions): CodeFacts;
/** Whether two sources differ in substance rather than in formatting. */
export declare function differs(a: string, b: string, options?: CanonicalizeOptions): boolean;
