#!/bin/bash
set -euo pipefail
APPLE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DRY_RUN=false
PLATFORM=ios
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    --platform) PLATFORM="${2:?--platform exige ios ou macos}"; shift 2 ;;
    *) echo "Usage: $0 [--dry-run] [--platform ios|macos]" >&2; exit 2 ;;
  esac
done
case "$PLATFORM" in
  ios) DESTINATION='generic/platform=iOS'; EXTENSION=ipa ;;
  macos) DESTINATION='generic/platform=macOS'; EXTENSION=pkg ;;
  *) echo 'Plateforme attendue : ios ou macos' >&2; exit 2 ;;
esac
if [[ -n "${VENIO_API_BASE_URL:-}" ]]; then
  python3 - <<'PYURL'
import os, sys, urllib.parse
url = urllib.parse.urlsplit(os.environ['VENIO_API_BASE_URL'])
if url.scheme != 'https' or not url.hostname or url.username or url.password or url.path not in ('','/') or url.query or url.fragment:
    sys.exit('VENIO_API_BASE_URL doit être une origine HTTPS sans identifiants, chemin ni paramètres')
PYURL
fi
if ! "$DRY_RUN"; then
  for NAME in VENIO_DEVELOPMENT_TEAM ASC_KEY_ID ASC_ISSUER_ID ASC_KEY_PATH; do
    if [[ -z "${!NAME:-}" ]]; then echo "Variable requise : $NAME" >&2; exit 2; fi
  done
  [[ -r "$ASC_KEY_PATH" ]] || { echo 'ASC_KEY_PATH doit désigner une clé .p8 lisible' >&2; exit 2; }
fi
cd "$APPLE_DIR"
mkdir -p .build
RUN_DIR="$(mktemp -d "$APPLE_DIR/.build/testflight-${PLATFORM}.XXXXXX")"
xcodegen generate --quiet
ARCHIVE_ARGS=(-project Venio.xcodeproj -scheme Venio -configuration Release
  -destination "$DESTINATION" -derivedDataPath "$APPLE_DIR/.build/DD"
  -archivePath "$RUN_DIR/Venio.xcarchive")
if [[ -n "${VENIO_API_BASE_URL:-}" ]]; then
  ARCHIVE_ARGS+=("VENIO_API_BASE_URL=$VENIO_API_BASE_URL")
fi
if "$DRY_RUN"; then
  xcodebuild "${ARCHIVE_ARGS[@]}" CODE_SIGNING_ALLOWED=NO archive
  echo "Dry-run terminé : $RUN_DIR/Venio.xcarchive (sans signature, export ni envoi)"
  exit 0
fi
"$APPLE_DIR/scripts/bump-build.sh"
AUTH_ARGS=(-allowProvisioningUpdates -authenticationKeyPath "$ASC_KEY_PATH"
  -authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER_ID")
xcodebuild "${ARCHIVE_ARGS[@]}" "DEVELOPMENT_TEAM=$VENIO_DEVELOPMENT_TEAM" "${AUTH_ARGS[@]}" archive
python3 - "$APPLE_DIR/Config/ExportOptions.plist" "$RUN_DIR/ExportOptions.plist" <<'PY'
import os, plistlib, sys
with open(sys.argv[1],'rb') as f: options = plistlib.load(f)
options['teamID'] = os.environ['VENIO_DEVELOPMENT_TEAM']
with open(sys.argv[2],'wb') as f: plistlib.dump(options,f)
PY
xcodebuild -exportArchive -archivePath "$RUN_DIR/Venio.xcarchive" -exportPath "$RUN_DIR/export" \
  -exportOptionsPlist "$RUN_DIR/ExportOptions.plist" "DEVELOPMENT_TEAM=$VENIO_DEVELOPMENT_TEAM" "${AUTH_ARGS[@]}"
PACKAGE="$(find "$RUN_DIR/export" -maxdepth 1 -name "*.$EXTENSION" -print -quit)"
[[ -n "$PACKAGE" ]] || { echo "Export .$EXTENSION introuvable" >&2; exit 1; }
xcrun altool --upload-app -f "$PACKAGE" --api-key "$ASC_KEY_ID" --api-issuer "$ASC_ISSUER_ID" \
  --p8-file-path "$ASC_KEY_PATH"
