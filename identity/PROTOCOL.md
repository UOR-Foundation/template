# prism/identity/3

A Prism id is stitch's Prism id ([afflom/stitch](https://github.com/afflom/stitch),
`src/prism-id.js` and `docs/prism-id.md`), pinned by commit in
[stitch.lock](stitch.lock) and copied, with the model decisions it calls, into
[prism-id.mjs](prism-id.mjs) by [stitch-sync.mjs](stitch-sync.mjs). This file
says how the frame and the Prism id page use it; stitch's documents are the
contract for the id itself, and every authorization decision is taken by its
`Stitch.PrismId` model. When stitch's Prism model is refined, re-pin:

```sh
node identity/stitch-sync.mjs <stitch commit>   # writes prism-id.mjs and stitch.lock
npm run test:identity                           # the lock matches, every check refuses, the flow signs in
```

prism/identity/3 replaces prism/identity/2 (passkeys and recovery keys).
Nothing carries over: a passkey-era account is a fresh Prism id.

## The id

- **Prism id**: the κ (`sha256:<hex>` of uor-addr canonical JSON) of a
  self-signed genesis record. It never changes.
- **Device**: non-extractable WebCrypto P-256 keys (one signs, one agrees
  keys) made on the device with no prompt. Its id is the κ of its public
  record. Devices are linked to the id by signed records in the id's log;
  any member device can remove another, which rotates the private boundary
  key.
- **Log**: the set of signed records (genesis, binds, revokes), merged by
  set union. Anyone holding the log can resolve which devices may act.
- **Recovery code**: 56 Crockford base32 characters (a 32-byte seed and three
  check bytes). It opens an escrow holding a recovery device of class
  `recovery`: a member device kept outside every browser. With the code, a
  new browser links its own device to the same id. Revoking the recovery
  device retires the code.

## Parties

| Party | Where | Holds |
| --- | --- | --- |
| Prism id page | `https://id.uor.foundation` | This browser's device, keyring and log, in the origin's IndexedDB. It runs as its own window (first-party storage), so every app reaches the same device. It serves no other content. |
| Registry mailbox | `https://registry.uor.foundation/prism/topic/<name>` | Opaque messages under names only holders can derive: recovery escrows (named by the code's locator) and sealed sync messages (named by a boundary key's sync topic). It reads none of them. |
| Frame | `<prism-frame>` in every Prism app | This app's session key and the id's signed session. It checks every signature itself, with Prism id's `verifyAction`. |

## Sign-in

1. The frame makes a non-extractable P-256 session key and opens the Prism id
   page as a window. The page posts `{type: "prism/identity/3/ready"}`.
2. The frame posts, to the page's origin only:
   `{type: "prism/identity/3/request", mode: "signin" | "recovery", sessionKey, expires}`
   (`sessionKey` is the raw public point in base64url; `expires` is at most
   8 days away). The page takes the app's origin from the browser, never
   from the message.
3. The visitor continues (or creates an id, or uses a recovery code). The
   page first takes in its other devices' sync messages, so a device removed
   elsewhere stops here, then signs
   `signAction(session, "prism/session/1", {sessionKey, expires}, {audience: <app origin>})`
   and posts `{type: "prism/identity/3/session", envelope, records}` to the
   app's origin, then closes.
4. The frame checks that the payload is the key and expiry it asked for,
   then `verifySession`: the log resolves for the envelope's prism id, the
   signer is an active device, the audience is this origin, the nonce is
   new and the action is fresh (`Stitch.PrismId.actionFresh`,
   `actionAllowed`). Only then does it keep the session.

A kept session is `{app, envelope, records}`. `frame.sign(bytes)` signs with
the session key and returns the signature with it, and anyone can check it
later with `verifySession(session, {fresh: 0})`: as of its signing, bounded
by its expiry.

`mode: "recovery"` makes a new recovery code on the device and answers
`{type: "prism/identity/3/recovery"}`; it signs nothing for the app.

## Mailbox

`POST /prism/topic/<name>` with the message bytes keeps it; `GET` returns
`{topic, messages: [<base64url>...]}`, newest last, or 404. A name is
`<scheme>:<64 lowercase hex>` (`sha256:` for an escrow locator,
`prism-sync:` for a sync topic, `prism-rendezvous:` for linking). The
registry keeps the newest 64 distinct messages of a name, each at most
1 MiB. Readers skip any message that does not open or resolve.

When the registry cannot keep an escrow, the page says so and the recovery
file (the code and its escrow, downloaded) recovers with no registry at all.

## Not yet

- Linking a second device by QR code (stitch's link offers over the
  `prism-rendezvous:` mailbox). Today a recovery code adds a device.
- Removing a device from the page (stitch's `revokeDevice` works).
- A host learns of a removal only from the log the signing device presents;
  a stolen device that never syncs can keep signing until stitch defines
  how hosts hear revocations.
