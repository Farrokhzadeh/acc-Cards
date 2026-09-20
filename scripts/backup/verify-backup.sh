#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 /absolute/path/accabad-YYYYMMDDTHHMMSSZ.tar.gz" >&2
  exit 2
fi

bundle="$1"
[[ -f "$bundle" ]] || { echo "backup not found: $bundle" >&2; exit 2; }

if [[ -f "$bundle.sha256" ]]; then
  (cd "$(dirname "$bundle")" && sha256sum -c "$(basename "$bundle").sha256")
fi

if tar -tzf "$bundle" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then
  echo "backup contains an unsafe path" >&2
  exit 1
fi

verify_dir="$(mktemp -d)"
cleanup() { rm -rf -- "$verify_dir"; }
trap cleanup EXIT
tar -xzf "$bundle" -C "$verify_dir"

for required in manifest.json SHA256SUMS database.dump private-files.tar.gz; do
  [[ -f "$verify_dir/$required" ]] || { echo "backup is missing $required" >&2; exit 1; }
done
(cd "$verify_dir" && sha256sum -c SHA256SUMS)
docker compose exec -T postgres sh -lc 'pg_restore --list' < "$verify_dir/database.dump" >/dev/null
if tar -tzf "$verify_dir/private-files.tar.gz" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then
  echo "private file archive contains an unsafe path" >&2
  exit 1
fi
tar -tzf "$verify_dir/private-files.tar.gz" | grep -Eq '^receipts/?$|^support-attachments/?$'

echo "[accabad-backup] archive verification passed"
