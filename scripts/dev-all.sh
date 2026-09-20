#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

laya_home="${LAYA_HOME:-$root/laya}"
venv="${LAYA_VENV:-$laya_home/.venv}"
if [[ ! -x "$venv/bin/python" ]]; then
  echo "Laya venv not found: $venv" >&2
  echo "Set LAYA_VENV to an environment that already has the laya package." >&2
  exit 1
fi
if [[ ! -f "$laya_home/laya_server.py" ]]; then
  echo "Laya server not found: $laya_home/laya_server.py" >&2
  exit 1
fi

# shellcheck disable=SC1091
source "$venv/bin/activate"
export USE_TF=0
export PYTORCH_ENABLE_MPS_FALLBACK=1
export LAYA_DEVICE="${LAYA_DEVICE:-cpu}"

if ! python -c "import fastapi, uvicorn" >/dev/null 2>&1; then
  pip install -q -r "$laya_home/requirements.txt"
fi

port="${LAYA_PORT:-8790}"
python -m uvicorn laya_server:app --app-dir "$laya_home" --host 127.0.0.1 --port "$port" &
laya_pid=$!
cleanup() {
  kill "$laya_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "waiting for Laya on 127.0.0.1:${port} (first load may download weights)"
ready=0
for _ in $(seq 1 180); do
  if curl -sf "http://127.0.0.1:${port}/health" >/dev/null; then
    ready=1
    break
  fi
  sleep 1
done
if [[ "$ready" -ne 1 ]]; then
  echo "Laya did not become ready; jev/llm will still start, laya column returns 503"
fi

pnpm dev
