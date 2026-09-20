"""Local Laya decide process for jev-vs-llm-snake. Node cannot load the weights."""

from __future__ import annotations

import os
import sys
import time
from typing import Any

os.environ.setdefault("USE_TF", "0")
os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

LAYA_MODEL = os.environ.get("LAYA_MODEL", "multilingual").strip()
LAYA_PRELOAD = os.environ.get("LAYA_PRELOAD", "multilingual").strip().lower()


def _device() -> str:
    raw = os.environ.get("LAYA_DEVICE", "").strip().lower()
    if raw:
        return raw
    # macOS MPS hits native Metal assertions (IOGPUMetalCommandBuffer) that kill the process.
    if sys.platform == "darwin":
        return "cpu"
    return ""


def _as_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if hasattr(value, "items"):
        return dict(value.items())
    return {k: getattr(value, k) for k in dir(value) if not k.startswith("_")}


def _field(value: Any, *names: str) -> Any:
    data = value if isinstance(value, dict) else None
    for name in names:
        if data is not None and name in data:
            return data[name]
        if hasattr(value, name):
            return getattr(value, name)
    return None


def _build_router():
    from laya import Router

    # 0.3.4: Router(preload=True) loads every checkpoint. Pin English with preload(["english"]).
    device = _device()
    router = Router(device=device or None)
    if LAYA_PRELOAD in {"1", "true", "all"}:
        router.preload()
    else:
        names = [name.strip() for name in (LAYA_PRELOAD or "multilingual").split(",") if name.strip()]
        router.preload(names or ["multilingual"])
    return router


router = _build_router()
app = FastAPI(title="laya-decide")


class DecideIn(BaseModel):
    state: dict[str, Any]
    instructions: str
    criteria: dict[str, str] = Field(default_factory=dict)


@app.get("/health")
def health() -> dict[str, str]:
    loaded = ",".join(getattr(router, "loaded", []) or [])
    return {"ok": "true", "model": LAYA_MODEL or "auto", "device": _device() or "auto", "loaded": loaded}


@app.post("/decide")
def decide(body: DecideIn) -> dict[str, Any]:
    if len(body.criteria) < 2:
        raise HTTPException(status_code=400, detail="合法方向不足两个")
    questions = {
        "move": {
            "type": "choice",
            "instructions": body.instructions,
            "criteria": body.criteria,
        }
    }
    started = time.perf_counter()
    kwargs: dict[str, Any] = {}
    if LAYA_MODEL:
        kwargs["model"] = LAYA_MODEL
    raw = router.predict(body.state, questions, **kwargs)
    elapsed_ms = round((time.perf_counter() - started) * 1000)
    payload = _as_dict(raw)
    answers = _as_dict(_field(payload, "answers") or {})
    move = _field(answers, "move")
    if move is None:
        raise HTTPException(status_code=502, detail="Laya 没有返回 move")
    choice = _field(move, "choice")
    if not isinstance(choice, str) or choice not in body.criteria:
        raise HTTPException(status_code=502, detail="Laya 返回了非法方向")
    probabilities = _field(move, "probabilities") or {}
    if not isinstance(probabilities, dict):
        probabilities = _as_dict(probabilities)
    confidence = _field(move, "confidence")
    routing = _as_dict(_field(payload, "routing") or {})
    return {
        "choice": choice,
        "probabilities": {key: float(value) for key, value in probabilities.items() if key in body.criteria},
        "confidence": float(confidence) if isinstance(confidence, (int, float)) else None,
        "model": str(routing.get("model") or LAYA_MODEL or "laya"),
        "upstreamMs": elapsed_ms,
        "inputTokens": None,
        "outputTokens": None,
        "estimatedUsd": 0,
    }
