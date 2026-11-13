#!/bin/sh
# Check what Gatekeeper will check: signature, notarization ticket, assessment.
set -eu
cd "$(dirname "$0")/../release"
status=0
for app in mac*/*.app; do
  [ -d "$app" ] || continue
  echo "== $app"
  codesign --verify --deep --strict --verbose=2 "$app" || status=1
  codesign -dv --verbose=2 "$app" 2>&1 | grep -E '^(Authority|TeamIdentifier|Runtime Version|flags)=' || true
  xcrun stapler validate "$app" || status=1
  spctl --assess --type execute --verbose=2 "$app" || status=1
done
[ $status -eq 0 ] && echo "All apps signed, notarized and accepted by Gatekeeper." || echo "Verification FAILED." >&2
exit $status
