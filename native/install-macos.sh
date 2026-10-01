#!/bin/bash
set -euo pipefail

if [[ ! -x /usr/bin/python3 ]]; then
  echo "python3 is required at /usr/bin/python3 to install the local shell host." >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_SUPPORT="${HOME}/Library/Application Support/Terminal"
HOST="$APP_SUPPORT/host.py"
TASKS="$APP_SUPPORT/tasks.py"
DEST="${HOME}/Library/Application Support/Google/Chrome/NativeMessagingHosts"

mkdir -p "$APP_SUPPORT"
cp "$ROOT/native/host.py" "$HOST"
cp "$ROOT/native/tasks.py" "$TASKS"
chmod 755 "$HOST" "$TASKS"
export ROOT HOST TASKS DEST

python3 - <<'PY'
import base64
import hashlib
import json
import os
import pathlib

root = pathlib.Path(os.environ["ROOT"])
manifest = json.loads((root / "manifest.json").read_text())
key = manifest.get("key")
if not isinstance(key, str) or not key.strip():
    raise SystemExit("manifest.json is missing a public key")

digest = hashlib.sha256(base64.b64decode(key)).digest()
extension_id = "".join(
    chr(ord("a") + nibble)
    for byte in digest[:16]
    for nibble in (byte >> 4, byte & 0xF)
)

def install(template_name, binary, dest_name):
    template = json.loads((root / "native" / template_name).read_text())
    template["path"] = binary
    template["allowed_origins"] = [f"chrome-extension://{extension_id}/"]
    dest = dest_dir / dest_name
    dest.write_text(json.dumps(template, indent=2) + "\n")
    print(dest)

dest_dir = pathlib.Path(os.environ["DEST"])
dest_dir.mkdir(parents=True, exist_ok=True)
install("com.terminal.shell.json", os.environ["HOST"], "com.terminal.shell.json")
install("com.terminal.tasks.json", os.environ["TASKS"], "com.terminal.tasks.json")
print(f"Installed local hosts for chrome-extension://{extension_id}/")
PY
