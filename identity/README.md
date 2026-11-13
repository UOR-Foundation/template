# Prism ids

The person icon at the right end of every Prism app's bar. One click opens a
small Prism id window; one more, and the visitor is signed in. There is no
password and no passkey prompt: the browser makes its own key, which never
leaves it. One Prism id signs in to every Prism app, Foundry included.
[PROTOCOL.md](PROTOCOL.md) is the contract; the id itself is stitch's Prism
id, pinned in [stitch.lock](stitch.lock).

## Losing a device never loses the id

Creating a Prism id shows its recovery code once, before the first sign-in.
On any browser, **Use a recovery code** brings the same id there. A signed-in
visitor can make a fresh code from the panel at any time (**Recovery codes and devices**).
**Download** saves a recovery file holding the code and its sealed escrow,
which recovers even when the registry cannot be reached.

Nothing is retired on its own: a code keeps working, and a lost browser
stays a device of the id, until one of the id's devices removes it. The
Prism id page lists every device (browsers and recovery codes) with
**Remove**: removing the lost browser stops it signing the next time it
syncs, and removing a code makes it bring back nothing. Removing a device
rotates the id's private key, and the id itself never changes.

Recovery restores the id: signing in, as the same id, everywhere. It does
not restore what an app kept only in the lost browser (its local projects,
chats or databases); that lives with the app, not the id.

## Why a window, and why this domain

A Prism id's device lives in `id.uor.foundation`'s storage. Inside another
site's iframe a browser partitions that storage per site, which would give
every app a different device, so the page runs as its own window, where its
storage is the same for every app. The origin serves this one page and
nothing else.

## Who is trusted with what

| Part | If it were hostile, it could | It could not |
| --- | --- | --- |
| Registry mailbox | Withhold an escrow or sync message, so a recovery or a removal does not arrive | Read one, or forge one: names are derived from secrets, messages are sealed, and every record is signed and checked by the reader |
| Prism id page (its script, as served) | Everything the visitor's device can do: sign for any app, link or remove devices, read a recovery code as it is typed or shown | Copy the device keys out: they are non-extractable WebCrypto keys. This is why the origin serves this one page, every file pinned by hash (publish.mjs) |
| Another app | Open the Prism id window and ask the visitor to sign in to *it* | Sign in without the visitor continuing in the window, which names the app; or use that session elsewhere: a session names the app origin it was signed for |
| Script on the app's own page | Use the session while the page is open | Copy the session key out: it is a non-extractable WebCrypto key |
| Anyone holding a recovery code | Add a device to the id, from any browser, with no other check | Do so once the code is removed |

There is no biometric or OS prompt: a device's keys sign whenever the page
asks, and the visitor's click in the window is the only consent. A recovery
code is a bearer secret that the page's script handles in the clear while
it is shown or typed.

A session lasts at most 8 days (the frame asks for 7). A removed device
stops signing new sessions once it syncs, but a session it signed earlier
stays valid until it expires, and an app hears of a removal only from the
log the signing device presents: a stolen browser that never syncs can keep
signing until stitch defines how hosts hear revocations.

## Run it

```sh
npm ci && npx playwright install chromium
npm run test:identity        # the stitch copy matches its lock, every refused check, then the flow in Chromium
node identity/dev.mjs        # the Prism id page on localhost:8790/3/, a demo app on 127.0.0.1:8791
```

`dev.mjs` stands in for the registry's mailbox with an in-memory one (or
uses a real registry, below); the frame's checks are the real ones.

## Follow stitch

```sh
node identity/stitch-sync.mjs <stitch commit>    # fetches that commit; add a local checkout path to read it instead
```

It rewrites `prism-id.mjs` and `stitch.lock`. Copy `frame/` and `identity/`
to Foundry and prism-devrel byte for byte, as with any frame change.

## Deploy

Every step is additive, so old and new clients keep working throughout:

1. Deploy the registry's `/prism/topic/` routes (UOR-Foundation/kappa-registry).
   The passkey routes are unchanged.
2. `node identity/publish.mjs out` writes the page to `out/3/`, every file it
   loads pinned by hash, with `current.json` naming the page by its SHA-256.
   Copy `out/3/` to `https://id.uor.foundation/3/`, beside the
   prism/identity/1 page at `/`, which apps open on older frames still use.
   HTTPS only, with HSTS. Do not set `Cross-Origin-Opener-Policy:
   same-origin`: the app needs the window's `opener`.
3. Merge the frame. Every app opens `/3/` from its next load.

The page works before the registry routes do: sign-in needs no registry,
and a new recovery code then asks the visitor to download its recovery file.

To run the browser flow against a real registry, start a kappa-server with
`KAPPA_PASSKEY_ORIGINS=http://localhost:8792` and run
`PRISM_REGISTRY=http://127.0.0.1:<port> npm run test:identity`.
