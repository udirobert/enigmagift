#!/usr/bin/env bash
# Create a fresh verified backup inside the Fly volume, stream it off-volume,
# and verify the resulting gzip before moving it into place.
#
# Usage: scripts/pull-backup.sh [destination-directory]
set -euo pipefail

APP="${FLY_APP:-enigmagift-api}"
DEST="${1:-$HOME/enigmagift-backups}"
mkdir -p "$DEST"

echo "creating remote backup in ${APP}…"
backup_output="$(fly -a "$APP" ssh console -C 'node /app/scripts/backup-volume.mjs')"
printf '%s\n' "$backup_output"
backup_path="$(printf '%s\n' "$backup_output" | sed -n 's/.*"backup": "\([^"]*\)".*/\1/p' | head -1)"
if [[ -z "$backup_path" ]]; then
  echo 'could not parse remote backup path' >&2
  exit 1
fi
name="${backup_path##*/}"
part="$DEST/.enigmagift-${name}.tar.gz.part"
final="$DEST/enigmagift-${name}.tar.gz"

echo "streaming $backup_path off the volume…"
fly -a "$APP" ssh console -C "tar -czf - -C /data/backups '$name'" > "$part"
gzip -t "$part"
mv "$part" "$final"

if command -v shasum >/dev/null 2>&1; then
  sha="$(shasum -a 256 "$final" | awk '{print $1}')"
else
  sha="$(sha256sum "$final" | awk '{print $1}')"
fi
bytes="$(stat -f%z "$final" 2>/dev/null || stat -c%s "$final")"
printf 'off-volume backup verified: %s\nbytes: %s\nsha256: %s\n' "$final" "$bytes" "$sha"
