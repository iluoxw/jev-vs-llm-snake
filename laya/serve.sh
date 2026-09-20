#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")" && pwd)"
venv="${LAYA_VENV:-$root/.venv}"
if [[ ! -x "$venv/bin/python" ]]; then
  echo "Laya venv not found: $venv" >&2
  echo "Set LAYA_VENV to an environment that already has the laya package." >&2
  exit 1
fi

# shellcheck disable=SC1091
source "$venv/bin/activate"
export USE_TF=0
export PYTORCH_ENABLE_MPS_FALLBACK=1
# Metal command-buffer assertions kill the process; stay on CPU unless overridden.
export LAYA_DEVICE="${LAYA_DEVICE:-cpu}"
export LAYA_MODEL="${LAYA_MODEL:-multilingual}"
export LAYA_PRELOAD="${LAYA_PRELOAD:-multilingual}"

if ! python -c "import fastapi, uvicorn" >/dev/null 2>&1; then
  pip install -q -r "$root/requirements.txt"
fi

port="${LAYA_PORT:-8790}"
exec python -m uvicorn laya_server:app --app-dir "$root" --host 127.0.0.1 --port "$port"
