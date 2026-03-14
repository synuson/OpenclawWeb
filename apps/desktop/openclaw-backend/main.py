from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from browser import build_artifacts
from summarizer import build_meeting_reply, summarize_instruction


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_allowlist() -> set[str]:
    raw = os.getenv(
        "OPENCLAW_ALLOWED_DOMAINS",
        ",".join(
            [
                "finance.naver.com",
                "stock.naver.com",
                "investing.com",
                "reuters.com",
                "bloomberg.com",
                "coinmarketcap.com",
                "upbit.com",
                "krx.co.kr",
                "dart.fss.or.kr",
            ]
        ),
    )
    return {item.strip().lower() for item in raw.split(",") if item.strip()}


ALLOWED_DOMAINS = parse_allowlist()
TASKS: dict[str, dict] = {}


class TaskCreateRequest(BaseModel):
    agentId: str
    instruction: str
    url: Optional[str] = None
    sessionId: Optional[str] = None


class ChatHistoryItem(BaseModel):
    role: str
    content: str
    agent: Optional[str] = None


class MeetingChatRequest(BaseModel):
    agentId: str
    phase: Optional[str] = None
    systemPrompt: str
    message: str
    history: list[ChatHistoryItem] = Field(default_factory=list)
    mode: str = "meeting"


app = FastAPI(title="OpenClaw Local Backend", version="0.2.0")


@app.get("/health")
def health():
    return {"status": "ok"}


def validate_target_url(url: Optional[str]) -> None:
    if not url:
        return

    domain = urlparse(url).netloc.lower()
    if not domain or domain not in ALLOWED_DOMAINS:
        raise HTTPException(status_code=400, detail=f"Blocked target domain: {domain or 'unknown'}")


@app.post("/chat")
def meeting_chat(request: MeetingChatRequest):
    reply = build_meeting_reply(
        agent_id=request.agentId,
        phase=request.phase,
        message=request.message,
        history=[item.model_dump() for item in request.history],
    )
    return {
        "text": reply,
        "provider": "openclaw",
        "model": os.getenv("OPENCLAW_CHAT_MODEL", "local-backend-stub"),
        "citations": [],
    }


@app.post("/tasks")
def create_task(request: TaskCreateRequest):
    validate_target_url(request.url)

    task_id = f"task_{uuid.uuid4().hex[:12]}"
    session_id = request.sessionId or f"session_{uuid.uuid4().hex[:8]}"
    summary = summarize_instruction(request.instruction)
    artifacts = build_artifacts(request.agentId, request.instruction, request.url)
    task = {
        "taskId": task_id,
        "sessionId": session_id,
        "agentId": request.agentId,
        "instruction": request.instruction,
        "url": request.url,
        "status": "succeeded",
        "summary": summary,
        "logs": [
            {
                "id": f"log_{uuid.uuid4().hex[:10]}",
                "ts": now_iso(),
                "level": "info",
                "message": "Local backend stub completed the browser task.",
            }
        ],
        "artifacts": artifacts,
        "updatedAt": now_iso(),
    }
    TASKS[task_id] = task
    return task


@app.get("/tasks/{task_id}")
def get_task(task_id: str):
    task = TASKS.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@app.get("/tasks/{task_id}/artifacts")
def get_task_artifacts(task_id: str):
    task = TASKS.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task["artifacts"]


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=int(os.getenv("PORT", "18374")), reload=False)
