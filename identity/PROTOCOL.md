# prism/identity/2

A Prism account is a set of keys: passkeys, whose private keys never leave
each device's secure hardware (Secure Enclave, TPM, Android TEE or StrongBox),
and recovery keys, whose private keys the owner keeps outside every device as
a recovery code. Losing a device never loses the account. Everything else is
public, content addressed and checkable by anyone, so no server is trusted to
say who a user is. One account signs in to every Prism app, Foundry included.

prism/identity/2 extends prism/identity/1: keys are named by κ, recovery keys
exist, and an account's first key may be one. Every prism/identity/1 record,
signature and account stays valid.

## Parties

| Party | Where | Holds |
| --- | --- | --- |
| Identity page | `https://id.uor.foundation` (rpId `id.uor.foundation`) | Nothing. It runs the WebAuthn ceremony and hands the result to the app. It serves no other content, because every page on the rpId's origin can ask a passkey to sign. |
| Registry | `https://registry.uor.foundation`, routes under `/passkey/` | Public key records, indexed by credential. It verifies before it stores, and cannot forge: every record is checked again by whoever reads it. |
| Frame | `<prism-frame>` in every Prism app | Checks every signature in the browser and keeps the session. |

For development the identity page runs on `http://localhost:<port>` with rpId
`localhost`, which WebAuthn treats as a secure context.

## Encodings

`b64u` is base64url without padding. `H(x)` is SHA-256. Strings are UTF-8.

- **Key ID**: the κ of the key, `sha256:<64 lowercase hex>` of `H(spki)`, the
  UORC object address of its DER SubjectPublicKeyInfo (for a passkey,
  `AuthenticatorAttestationResponse.getPublicKey()`). Records of spec
  `prism/identity/key/1` keep their prism/identity/1 key ID, `b64u(H(spki))`;
  a reader picks the rule by the record's spec.
- **Account ID**: the key ID of the account's first key. It never changes,
  and it outlives that key: revoking it, or losing its device, leaves the
  account and every key bound into it.
- **Algorithms**: passkeys ES256 (`-7`, P-256) and RS256 (`-257`, for older
  Windows Hello); recovery keys EdDSA (`-8`, Ed25519).

## Signed messages

A recovery key's signature is Ed25519 over the message's UTF-8 bytes, carried
as `{credential, signature}` with no `clientDataJSON` or `authenticatorData`;
a verifier checks it under the record's `spki` and refuses one that carries
either field. A recovery key signs bind and revoke messages, never a session:
only a device's passkey signs a session.

Every passkey signature is a WebAuthn assertion: the authenticator signs
`authenticatorData || H(clientDataJSON)`. The challenge inside `clientDataJSON`
is the hash of the message below, so the signature covers the message. A
verifier rebuilds the message, then checks, in order and failing closed:

1. `clientData.type` is `webauthn.get`.
2. `clientData.challenge` equals `b64u(H(message))`.
3. `clientData.origin` is an identity origin the verifier accepts.
4. `authenticatorData[0..32]` equals `H(rpId)` for that origin.
5. Flags have user presence (`0x01`) and user verification (`0x04`).
6. The signature verifies under the key's `spki` (ECDSA signatures are DER).

| Purpose | Message |
| --- | --- |
| Session | `prism/identity/session/1\n<app origin>\n<nonce>\n<session key>\n<expires>` |
| Bind a device | `prism/identity/bind/1\n<account>\n<new key ID>` |
| Revoke a device | `prism/identity/revoke/1\n<account>\n<key ID>` |

`<nonce>` is 32 random bytes in b64u, made by the app and used once.
`<session key>` is the app's session public key, raw P-256 point in b64u.
`<expires>` is a Unix time in milliseconds. A bind or revoke message names
exactly one change, so replaying it repeats that change and nothing else.

## Key record

```json
{
  "spec": "prism/identity/key/2",
  "key": "<key ID>",
  "account": "<account ID>",
  "credential": "<b64u credential ID>",
  "alg": -7,
  "spki": "<b64u DER>",
  "origin": "https://id.uor.foundation",
  "created": 1762516800000,
  "binding": null
}
```

`binding` is null for an account's first key (then `key == account`).
Otherwise it is the bind signature made by a key already in the account, a
passkey's assertion or a recovery key's signature:

```json
{ "credential": "<b64u>", "clientDataJSON": "<b64u>", "authenticatorData": "<b64u>", "signature": "<b64u>" }
{ "credential": "<b64u>", "signature": "<b64u>" }
```

A recovery key's record has `alg` `-8`, its `credential` is its raw 32-byte
public key in b64u (so the code alone finds its record), and its `origin` is
the identity origin it was made on.

A reader accepts a record only when `key` is the key ID its spec names for
`spki` and either `key == account`, or the binding verifies as a bind message
under a record that the reader has itself accepted for the same account. A
chain longer than 32 bindings is refused; the bound only keeps a reader's work
finite.

## Recovery codes

A recovery code is a recovery key's 32-byte Ed25519 seed followed by the first
three bytes of `H(seed)`, in Crockford base32: 56 characters, written in
groups of four. A reader ignores spaces, hyphens and case, reads `I` and `L`
as `1` and `O` as `0`, and refuses a code whose check bytes differ. The
private key is the PKCS#8 encoding of the seed; the code is shown once, never
stored and never sent.

The sign-in page makes a new account with a recovery key as its first key:
it creates the device's passkey, registers the recovery key alone (which
starts the account), binds the passkey to it with a recovery signature, shows
the code, and then asks the passkey to sign the app's session. A signed-in
account adds a recovery code by its passkey binding a new recovery key. On a
new device, the code finds its record, the device's new passkey is bound by
a recovery signature, and that passkey signs the session. A recovery key is
revoked like any key.

## Registry routes

All bodies are JSON. Errors are `{"error": "<code>", "message": "<one sentence>"}`.

| Route | Does |
| --- | --- |
| `POST /passkey/challenge` | `{"challenge": "<b64u 32 bytes>", "expires": <ms>}`. Single use, 120 s. |
| `POST /passkey/register` | Registers a new passkey. Body: `spki`, `alg`, `credential`, `clientDataJSON`, `authenticatorData`, `attestationObject`, `transports`, and `binding` (null, or a bind signature plus `account`). |
| `POST /passkey/recovery` | Adds a recovery key. Body: `spki` alone, which starts an account with it as the first key and records the request's identity origin; or `spki`, `account` and `binding`, a bind signature by a live key of the account. Answers `{key, account, record}`. |
| `GET /passkey/credential/{credential}` | The key record. `404` unknown, `410` revoked. |
| `GET /passkey/account/{account}` | `{"account", "keys": [records], "revoked": [key IDs]}`. |
| `POST /passkey/revoke` | Body: `account`, `key`, and a revoke assertion by a live key of the account. |

`register` checks: `clientData.type` is `webauthn.create`; its challenge is one
the registry issued and has not used (consumed on first use, pass or fail);
origin is allowed; `rpIdHash`, UP, UV and AT flags; the attested credential ID
equals `credential`; the attested COSE key is the same public key as `spki`;
the credential is not already registered (first write wins); and the binding,
when present, verifies under a live key of `account`. Error codes:
`challenge`, `origin`, `rp`, `flags`, `credential`, `key`, `exists`,
`binding`, `signature`, `revoked`, `rate`.

Further codes: `request` (400, a malformed body), `account` (404, an unknown
account), `store` (500, details only in the registry's log). An unknown
credential is `credential` with 404. A bind or revoke assertion with the wrong
type or challenge is `signature`.

`revoke` takes `{account, key, assertion: {credential, clientDataJSON,
authenticatorData, signature}}` and answers `{account, key, revoked: true,
newly}`. A key bound before its binder was revoked stays valid, so
`/passkey/account/` keeps revoked records in `keys` and names them in
`revoked`; a reader builds a binding chain from that list. The key that signs
a session must itself be live (`/passkey/credential/` answers 410).

Writes are rate limited per client address. Reads are public with CORS `*`;
writes allow only the identity origins.

## Session

On sign-in the frame makes a non-extractable P-256 key with WebCrypto, stored
in the app origin's IndexedDB, and asks the passkey to sign a session message
naming it. The signed session is the delegation: anyone can check that the
account's passkey let this browser key act for it, on this app's origin, until
`expires`. The private session key cannot be read out by script. No token is
ever kept in `localStorage`. A session lasts 7 days; sign-out deletes it.
