# Changelog

## 3.0.0

### Security

- **The private key is no longer passed on the command line.** `did` now takes
  `--keystore <file>` (encrypted, passphrase prompted without echo) or
  `--priv-key-stdin`. `--privKey` still works but is deprecated and warns: the
  value lands in shell history and is visible to any process through `ps`.
- **`keys` no longer prints the private key by default.** It writes a Web3
  Secret Storage v3 keystore (scrypt, AES-128-CTR, mode `0600`) and prints only
  public material. `--print-private` restores the old behaviour explicitly.
- Key material is held in `Buffer`s and wiped after use, rather than in strings
  that cannot be zeroed.
- Keystore MACs are compared with `timingSafeEqual`.
- Key generation draws from the OS CSPRNG with rejection sampling, instead of
  `elliptic`'s `genKeyPair()`.

### Added

- `sign-tx`: signs the unsigned transactions the did:isbe API builds, so the
  whole identity lifecycle works without the key ever leaving the keystore.
  Verifies `from` and the recovered address before emitting anything.
- Test suite (153 tests): golden vectors from v2.1.0, an in-TypeScript
  reimplementation of the on-chain `_validateProof` check, keystore round-trips
  and bidirectional interoperability with ethers/geth/MetaMask.
- `--json` output for `did` and `sign-tx`.

### Changed

- The keystore is now ethers' implementation of Web3 Secret Storage v3 rather
  than one written here, cutting ~180 lines of hand-rolled scrypt/AES/MAC for
  no loss of security — same format, same work factor, far more widely
  exercised code. Files written by the previous revision still open.
- Keystores are secp256k1 only. The v3 format has no field for a curve, so a
  P-256 keystore would advertise an address its key does not control; the CLI
  now refuses rather than writing one. P-256 keys still work via
  `--priv-key-stdin`.

- `Signer` interface in `src/signer.ts`: all key use goes through it, so a
  hardware wallet or HSM backend can be added without touching the commands.
- Removed the `jose` dependency. It is ESM-only, which broke this CommonJS
  package on Node < 22.12 and under Jest; `calculateJwkThumbprint` is now a
  native RFC 7638 implementation producing identical output.
- Removed `chalk`. Human-readable output goes to stderr and data to stdout, so
  commands compose in a pipeline.
- Dependencies pinned to exact versions; use `npm ci`.
- `--version` now reflects `package.json`, enforced by a test. Previously
  hardcoded to `2.0.0` while the package said `2.1.0`.
- `tsconfig.json` no longer references a non-existent `error.js`; tests are
  excluded from the build.

### Compatibility

DIDs, proofs, public keys, EOAs and JWK thumbprints are unchanged. Identities
registered with earlier versions remain reproducible; the golden-vector suite
enforces this.
