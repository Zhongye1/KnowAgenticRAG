#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

compose=(docker compose "$@")
proof_file="$(mktemp "${TMPDIR:-/tmp}/ars-quiescence.XXXXXX")"
cleanup() {
  rm -f "$proof_file"
  "${compose[@]}" stop sandbox-provisioner >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

"${compose[@]}" stop api worker sandbox-provisioner

# Always run the provisioner from the checked-out target version. The old
# provisioner does not own the quiesce protocol yet; --no-deps breaks the
# storage-migrator dependency while this proof is being established.
"${compose[@]}" up -d --no-deps --build --wait sandbox-provisioner

# The provisioner first rejects new creates, then deletes Docker containers or
# Kubernetes Pods and waits for the authoritative backend inventory to reach zero.
"${compose[@]}" exec -T sandbox-provisioner python - <<'PY'
import os
import urllib.request

base = "http://127.0.0.1:8002"
headers = {"Authorization": f"Bearer {os.environ['SANDBOX_PROVISIONER_TOKEN']}"}
request = urllib.request.Request(
    f"{base}/api/sandboxes/quiesce?timeout_seconds=180",
    headers=headers,
    method="POST",
)
with urllib.request.urlopen(request, timeout=240):
    pass
PY

"${compose[@]}" stop sandbox-provisioner

if "${compose[@]}" ps --status running --services | grep -Eq '^(api|worker|sandbox-provisioner)$'; then
  echo "failed to quiesce API, worker, or sandbox-provisioner" >&2
  exit 1
fi

token="$(openssl rand -hex 32)"
chmod 600 "$proof_file"
printf '%s\n' "$token" > "$proof_file"

"${compose[@]}" run --rm \
  -v "$proof_file:/app/legacy-saves/.storage-migration-quiesced:ro" \
  -e ARS_STORAGE_MIGRATION_QUIESCENCE_TOKEN="$token" \
  storage-migrator

echo "storage migration completed; restart ARS with the same Docker Compose options"
