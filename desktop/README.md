# ISBE DID Generator — Desktop GUI

An **offline Electron UI** for the existing `isbe-identity-did-gen` CLI.
No modifications to the DID Registry, DID API, Evidence Gateway, or CLI are required.

## Requirements

- Node.js 22.12+ (required by Electron 45) and npm 10+
- macOS, Windows, or Linux desktop

## Start from the repository root

```sh
npm ci
node desktop/scripts/bootstrap.cjs
npm --prefix desktop start
```

`bootstrap.cjs` runs the existing `npm run build`, packs the **current local
CLI code** into a temporary npm tarball, and installs that tarball as a normal
production dependency of the Electron app. This avoids fragile symlinks to
files outside the packaged application, and ensures the desktop GUI uses the
same signing implementation as the CLI. Re-run bootstrap after changing CLI
sources; it does not change root `package.json` or `package-lock.json`.

`desktop/package-lock.json` pins every registry dependency of the app
(Electron, electron-builder and the CLI's own dependencies) by hash. The one
exception is the local CLI tarball, which bootstrap rebuilds on every run, so
its hash is left out on purpose. Commit the lockfile whenever bootstrap changes
it; CI fails if it is out of date.

For standalone installers, after bootstrap:

```sh
npm --prefix desktop run dist:dir    # unpacked app for local smoke testing
npm --prefix desktop run dist:mac    # macOS DMG/ZIP, arm64 + x64, ad-hoc signed
npm --prefix desktop run dist:win    # Windows NSIS installers (x64 + arm64)
npm --prefix desktop run dist:linux  # Linux AppImage + DEB (x64 + arm64)
```

Artifacts appear in `desktop/release/`. No auto-updater is provided.

The simplest way to get all three is the **Desktop installers** GitHub Actions
workflow (`.github/workflows/desktop.yml`): run it by hand or push a `v*` tag,
and it builds each OS on a native runner and attaches the installers to the run.
It also runs on pull requests that touch the GUI or the CLI it ships.
Building Windows/Linux from an Apple Silicon Mac also works, but
electron-builder's NSIS and AppImage tools are x86_64-only, so it needs Rosetta
(`softwareupdate --install-rosetta --agree-to-license`).

### Installing unsigned builds

There are no signing certificates yet, so the operating system warns on first
launch. Tell users to verify the installer came from the official release.

- **macOS**: `dist:mac` signs ad-hoc (without that, Apple Silicon reports the
  app as "damaged"). Gatekeeper still blocks the first launch: open the app
  once, then *System Settings → Privacy & Security → Open Anyway*. Or remove the
  quarantine flag:
  `xattr -dr com.apple.quarantine "/Applications/ISBE DID Generator.app"`.
- **Windows**: SmartScreen shows "Windows protected your PC" → *More info → Run
  anyway*.
- **Linux**: `chmod +x` the AppImage, or `sudo apt install ./<file>.deb`.

### Signed macOS packages (needs Apple Developer Program)

`npm --prefix desktop run dist:mac:signed` builds arm64 and x64 DMG/ZIP, signs them
with a **Developer ID Application** certificate under the hardened runtime,
notarizes and staples the app, then runs `verify:mac` (codesign, stapler,
`spctl`). It refuses to run without both a certificate and notarization
credentials, because a signed but un-notarized app is still blocked by
Gatekeeper.

1. Certificate: install the *Developer ID Application* certificate (with its
   private key) in the login keychain, or export it as `.p12` and set
   `CSC_LINK=/path/cert.p12` and `CSC_KEY_PASSWORD`. Only the Account Holder
   of the Apple Developer team can create it.
2. Notarization credentials, once per machine:

   ```sh
   xcrun notarytool store-credentials isbe-notary \
     --apple-id <apple-id> --team-id <TEAMID> --password <app-specific-password>
   ```

   For CI use an App Store Connect API key instead:
   `APPLE_API_KEY=/path/AuthKey_XXXX.p8 APPLE_API_KEY_ID=… APPLE_API_ISSUER=…`.
3. Build:

   ```sh
   APPLE_KEYCHAIN_PROFILE=isbe-notary npm --prefix desktop run dist:mac:signed
   ```

The only entitlement granted is `com.apple.security.cs.allow-jit`
(`build/entitlements.mac.plist`); a test pins it. Packaged builds also
disable DevTools.

### Icons

`build/isbe-logo.svg` is the ISBE brand mark. `npm --prefix desktop run icons`
regenerates `build/icon.{icns,ico,png}` and `renderer/icon.svg` from it
(needs `rsvg-convert` and ImageMagick).

## Operations

| UI | Existing CLI equivalent |
| --- | --- |
| Generate identity | `did-gen keys --out` |
| Generate DID and proof | `did-gen did --keystore --modelDeploy` |
| Sign unsigned JSON transaction (file or `isbe-didgen://sign` link) | `did-gen sign-tx -k -f` |
| Import raw secp256k1 key into encrypted keystore | `did-gen import-key --out` |
| Reveal raw private key (explicit confirmation) | `did-gen export-key --keystore` |

The GUI uses PRE (`uc-pre`) and PRO (`uc`) DID environments. Keystores and
transaction signing are **secp256k1 only**, matching the existing CLI. Bare
Network P-256 transaction signing is not supported.

### Transaction flow (unchanged)

1. Prepare `unsigned-tx.json` with the existing DID API (`POST /api/v1/contract/*`).
2. Select that file and a local encrypted keystore in **Sign transaction**.
3. Inspect the destination, chain, fees and calldata selector.
4. Enter your password, confirm the native signing dialog, then save or copy
   the signed transaction. You can also save an API-ready JSON body.
5. Use your existing API client to send it to `POST /api/v1/transactions/send`
   with JSON `{ "signedRawTransaction": "0x..." }`.

### Signing links

A page that prepares a transaction (for example, the evidence gateway's setup
assistant) can open it here directly with a link
`isbe-didgen://sign?tx=<base64url of the unsigned JSON>`. The installers
register the `isbe-didgen` scheme (macOS, Windows, `.deb`; not the AppImage).
The app opens **Sign transaction** with the review loaded; signing is the same
as with a file: keystore, password and the native confirmation. The signed
transaction is then copied to the clipboard, ready to paste back in that page.

Any web page can open such a link, so it is treated as untrusted input like a
file: same validation, a 16 KB limit, and it only preloads the review.

This application **does not broadcast** transactions. The raw signed payload
is not the JSON envelope: the API caller still wraps it in the documented
`{ signedRawTransaction }` property.

## Security considerations

- Only bundled UI assets are allowed. No external scripts, API calls,
  remote navigation, embedded webviews, telemetry or automatic updates.
- `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, CSP,
  a whitelist of static asset paths and narrow, sender-checked IPC handlers.
- Private keys are decrypted **in the Electron main process**, not sent
  through HTTP, IPC to the renderer (except deliberate raw-key export),
  or the command line. Keystore creation uses exclusive `0600` file creation.
- Signing rechecks the unsigned file's SHA-256 after review, validates the
  transaction with existing `did-gen` code, verifies the signer address and
  requires a native confirmation. It is **not** a smart-contract simulator:
  function selectors are shown but not ABI-decoded.
- Exporting a raw key intentionally exposes it to the UI and optionally the
  clipboard. The view is cleared after 30 seconds and the clipboard is cleared
  after 30 seconds if unchanged. JavaScript runtimes cannot guarantee secure
  erasure of immutable strings, clipboard history, screenshots, crash dumps,
  or other applications' access to copied content.
- Passwords pass through renderer-to-main IPC as strings and are cleared from
  form inputs after operations. Neither Electron nor V8 guarantees that all
  transient copies can be securely zeroed.
- This is **local/offline signing**, not an isolated air-gapped machine by
  default. Verify installer authenticity before opening sensitive identities.

## Tests

```sh
npm --prefix desktop test
npm test           # existing CLI tests, from repository root
```

Before distributing installers, test on the target OS with an expendable
keystore, compare DID/proof results against the CLI golden vectors, validate
an actual API unsigned transaction, and test successful + cancelled signing.
This PoC ships no certificate, release automation, hardware wallet or HSM
backend.
