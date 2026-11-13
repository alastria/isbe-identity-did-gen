#!/bin/sh
# Signed + notarized macOS release (arm64 and x64 DMG/ZIP in release/).
#
# Signing: a "Developer ID Application" certificate, either in the login
# keychain or exported as .p12 via CSC_LINK + CSC_KEY_PASSWORD.
# Notarization, one of:
#   APPLE_KEYCHAIN_PROFILE                         (xcrun notarytool store-credentials)
#   APPLE_API_KEY + APPLE_API_KEY_ID + APPLE_API_ISSUER   (App Store Connect API key)
#   APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID
set -eu
cd "$(dirname "$0")/.."

[ "$(uname)" = Darwin ] || { echo "Build signed macOS packages on macOS." >&2; exit 1; }
[ -f node_modules/isbe-did-gen/dist/signer.js ] || {
  echo "Run bootstrap first: node desktop/scripts/bootstrap.cjs" >&2; exit 1; }

if [ -z "${CSC_LINK:-}" ] && ! security find-identity -v -p codesigning | grep -q "Developer ID Application"; then
  echo "No 'Developer ID Application' certificate in the keychain and CSC_LINK is not set." >&2
  exit 1
fi

# electron-builder only warns when credentials are missing, which would ship a
# signed but un-notarized app that Gatekeeper still blocks. Fail instead.
if [ -z "${APPLE_KEYCHAIN_PROFILE:-}" ] && [ -z "${APPLE_API_KEY:-}" ] && [ -z "${APPLE_ID:-}" ]; then
  echo "No notarization credentials. Set APPLE_KEYCHAIN_PROFILE, APPLE_API_KEY(+_ID, _ISSUER)" >&2
  echo "or APPLE_ID(+APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID). See desktop/README.md." >&2
  exit 1
fi

npx electron-builder --mac --publish never -c.forceCodeSigning=true
sh scripts/verify-mac.sh
