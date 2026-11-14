/** SHA-256 as hex through WebCrypto, available in Node 22 and every browser. */
export async function sha256Hex(bytes) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  let s = '';
  for (const b of new Uint8Array(digest)) s += b.toString(16).padStart(2, '0');
  return s;
}
