# Prism accounts

The person icon at the right end of every Prism app's bar. One click opens the
account panel; one more, and Face ID, Touch ID, Windows Hello or a phone signs
the visitor in. No password exists anywhere. [PROTOCOL.md](PROTOCOL.md) is the
contract; this file says why it is built this way and how to run it.

## Why a passkey, and why this domain

A passkey is the only credential a web page can reach that lives in the
device's secure hardware: the Secure Enclave on Apple devices, the TPM under
Windows Hello, the TEE or StrongBox on Android. The private key never leaves
it, and the fingerprint or face never leaves the device at all.

A passkey belongs to one domain, its rpId, and every page on that domain can
ask it to sign. So the rpId is `id.uor.foundation`, which serves this one
page and nothing else. It is not `registry.uor.foundation`, which serves
content others push, and not `uor.foundation`, which would let every
subdomain ask. **The rpId is permanent**: changing it orphans every passkey.

## Who is trusted with what

| Part | If it were hostile, it could | It could not |
| --- | --- | --- |
| Registry | Withhold a record, so a sign-in fails | Forge or swap a key: a record's name is its key's hash, and every binding is a passkey signature the frame checks |
| Sign-in page | Refuse to help | Sign anything without the visitor's own biometric prompt, which names `id.uor.foundation` |
| Another app | Ask the visitor to sign in to *it* | Use that session elsewhere: a session names the app origin it was signed for |
| Script on the app's own page | Use the session while the page is open | Copy the session key out: it is a non-extractable WebCrypto key |

Revocation is the registry withholding a record, so it takes effect at the
next sign-in, not inside a session already signed (7 days at most).

## Adding a device

Synced passkeys (iCloud Keychain, Google Password Manager) already follow the
visitor to their other devices. For any other device: open the panel, choose
**Add another device**, make the passkey on the new device (a phone scans the
code the browser shows), then confirm on this one. The registry stores the new
key with that confirmation, and every app accepts either key for the account.

## Run it

```sh
npm ci && npx playwright install chromium
npm run test:identity        # every refused check, then the whole flow in Chromium
node identity/dev.mjs        # the sign-in page on localhost:8790, a demo app on 127.0.0.1:8791
```

`dev.mjs` stands in for the registry with an in-memory store that does not
verify registrations; the frame's checks are the real ones.

## Deploy

1. `node identity/publish.mjs out` writes the page with every file it loads
   pinned by hash, and `current.json` naming the page by its SHA-256.
2. Serve `out/` as static files at `https://id.uor.foundation`, HTTPS only,
   with HSTS. Do not set `Cross-Origin-Opener-Policy: same-origin`: the
   popup fallback needs `window.opener`.
3. Deploy the registry's `/passkey/` routes (UOR-Foundation/kappa-registry)
   with `https://id.uor.foundation` as the allowed identity origin.

Ship the frame change only after steps 2 and 3 are live: every Prism app
loads the frame from main on its next visit. Before then the panel says
Prism accounts are not reachable, and never shows a broken page.
