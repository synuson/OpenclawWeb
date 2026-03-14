from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from urllib.parse import quote, urlparse

from fastapi import Depends, FastAPI, Header, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import AliasChoices, BaseModel, ConfigDict, Field

from browser import build_artifacts
from summarizer import build_meeting_reply, summarize_instruction


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def now_iso() -> str:
    return now_utc().isoformat()


def to_iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


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
API_TOKEN = os.getenv("OPENCLAW_API_TOKEN") or os.getenv("OPENCLAW_API_KEY") or ""
TASKS: dict[str, dict[str, Any]] = {}


class ApiError(Exception):
    def __init__(self, status_code: int, code: str, message: str, details: Optional[dict[str, Any]] = None):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details or {}


class ChatHistoryItem(BaseModel):
    model_config = ConfigDict(extra="allow")

    role: str
    content: str
    agent: Optional[str] = None


class MeetingChatRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    agent_id: Optional[str] = Field(default=None, validation_alias=AliasChoices("agentId", "agent_id", "agent"))
    phase: Optional[str] = None
    system_prompt: str = Field(default="", validation_alias=AliasChoices("systemPrompt", "system_prompt"))
    message: str
    history: list[ChatHistoryItem] = Field(default_factory=list)
    locale: str = "ko"
    mode: str = "meeting"
    session_id: Optional[str] = Field(default=None, validation_alias=AliasChoices("sessionId", "session_id", "session"))
    context: dict[str, Any] = Field(default_factory=dict)


class TaskInput(BaseModel):
    model_config = ConfigDict(extra="allow")

    prompt: Optional[str] = None
    context: dict[str, Any] = Field(default_factory=dict)


class TaskOptions(BaseModel):
    model_config = ConfigDict(extra="allow")

    priority: Optional[str] = None
    timeout_sec: Optional[int] = None
    max_retries: Optional[int] = None
    webhook_url: Optional[str] = None
    webhook_events: list[str] = Field(default_factory=list)


class TaskArtifactsExpectation(BaseModel):
    model_config = ConfigDict(extra="allow")

    expected: list[str] = Field(default_factory=list)


class TaskCreateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    agent_id: Optional[str] = Field(default=None, validation_alias=AliasChoices("agentId", "agent_id", "agent"))
    instruction: Optional[str] = Field(default=None, validation_alias=AliasChoices("instruction", "prompt"))
    url: Optional[str] = None
    session_id: Optional[str] = Field(default=None, validation_alias=AliasChoices("sessionId", "session_id", "session"))
    locale: str = "ko"
    title: Optional[str] = None
    role: Optional[str] = None
    input: Optional[TaskInput] = None
    options: TaskOptions = Field(default_factory=TaskOptions)
    artifacts: TaskArtifactsExpectation = Field(default_factory=TaskArtifactsExpectation)
    metadata: dict[str, Any] = Field(default_factory=dict)


app = FastAPI(title="OpenClaw Local Backend", version="0.3.0")


@app.exception_handler(ApiError)
async def handle_api_error(_request: Request, exc: ApiError):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": exc.code,
                "message": exc.message,
                "details": exc.details,
            }
        },
    )


@app.exception_handler(RequestValidationError)
async def handle_validation_error(_request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={
            "error": {
                "code": "BAD_REQUEST",
                "message": "invalid input",
                "details": {"errors": exc.errors()},
            }
        },
    )


@app.exception_handler(Exception)
async def handle_unexpected_error(_request: Request, exc: Exception):
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": {
                "code": "INTERNAL_SERVER_ERROR",
                "message": str(exc) or "internal server error",
                "details": {},
            }
        },
    )


@app.get("/health")
@app.get("/api/health")
def health():
    return {"status": "ok", "time": now_iso()}


def require_authorization(authorization: Optional[str] = Header(default=None)):
    if not API_TOKEN:
        return

    if not authorization or not authorization.startswith("Bearer "):
        raise ApiError(status.HTTP_401_UNAUTHORIZED, "UNAUTHORIZED", "missing bearer token")

    token = authorization.removeprefix("Bearer ").strip()
    if token != API_TOKEN:
        raise ApiError(status.HTTP_401_UNAUTHORIZED, "UNAUTHORIZED", "invalid bearer token")


def normalize_agent_id(raw: Optional[str]) -> str:
    token = (raw or "assistant").strip().lower()
    if token in {"assistant", "facilitator", "moderator", "mc", "role_facilitator_kr_v1"}:
        return "assistant"
    if token in {"analyst", "market_analyst_risk_first_v1", "role_market_analyst_kr_v1"}:
        return "analyst"
    if "facilitator" in token or "moderator" in token:
        return "assistant"
    if "analyst" in token:
        return "analyst"
    return "assistant"


def validate_target_url(url: Optional[str]) -> None:
    if not url:
        return

    domain = urlparse(url).netloc.lower()
    allowed = any(domain == item or domain.endswith(f".{item}") for item in ALLOWED_DOMAINS)
    if not domain or not allowed:
        raise ApiError(
            status.HTTP_400_BAD_REQUEST,
            "BAD_REQUEST",
            "blocked target domain",
            {"domain": domain or "unknown"},
        )


def make_log(level: str, message: str, ts: Optional[datetime] = None) -> dict[str, Any]:
    timestamp = ts or now_utc()
    return {
        "id": f"log_{uuid.uuid4().hex[:10]}",
        "timestamp": timestamp.isoformat(),
        "ts": timestamp.isoformat(),
        "level": level,
        "message": message,
    }


def encode_json_data_url(payload: dict[str, Any]) -> str:
    return f"data:application/json;charset=utf-8,{quote(json.dumps(payload, ensure_ascii=False, indent=2))}"


def encode_text_data_url(text: str) -> str:
    return f"data:text/plain;charset=utf-8,{quote(text)}"


def build_placeholder_items(task: dict[str, Any], expected_names: list[str]) -> list[dict[str, Any]]:
    created_at = to_iso(task["created_at"])
    screenshot = task["artifacts"]["screenshot"]
    notes_text = "\n".join(task["artifacts"]["notes"])
    report_payload = {
        "task_id": task["id"],
        "title": task["title"],
        "status": task["status"],
        "summary": task["summary"],
        "instruction": task["instruction"],
        "url": task.get("url"),
    }

    default_items = [
        {
            "name": "report.json",
            "type": "report",
            "size_bytes": len(json.dumps(report_payload, ensure_ascii=False).encode("utf-8")),
            "created_at": created_at,
            "download_url": encode_json_data_url(report_payload),
        },
        {
            "name": "notes.txt",
            "type": "log",
            "size_bytes": len(notes_text.encode("utf-8")),
            "created_at": created_at,
            "download_url": encode_text_data_url(notes_text),
        },
        {
            "name": "preview.svg",
            "type": "image",
            "size_bytes": len(screenshot.encode("utf-8")),
            "created_at": created_at,
            "download_url": screenshot,
        },
    ]

    if not expected_names:
        return default_items

    items_by_name = {item["name"]: item for item in default_items}
    synthesized: list[dict[str, Any]] = []
    for name in expected_names:
        normalized = name.strip()
        if not normalized:
            continue
        if normalized in items_by_name:
            synthesized.append(items_by_name[normalized])
            continue

        item_type = normalized.rsplit(".", 1)[-1].lower() if "." in normalized else "file"
        placeholder_body = encode_text_data_url(f"Placeholder artifact for {normalized}\nTask: {task['id']}")
        synthesized.append(
            {
                "name": normalized,
                "type": item_type,
                "size_bytes": 0,
                "created_at": created_at,
                "download_url": placeholder_body,
            }
        )
    return synthesized


def create_task_record(request: TaskCreateRequest) -> dict[str, Any]:
    agent_id = normalize_agent_id(request.agent_id or request.role)
    input_prompt = request.input.prompt if request.input else None
    instruction = request.instruction or input_prompt or request.title
    if not instruction:
        raise ApiError(status.HTTP_400_BAD_REQUEST, "BAD_REQUEST", "instruction is required")

    validate_target_url(request.url)

    task_id = f"tsk_{uuid.uuid4().hex[:20]}"
    session_id = request.session_id or f"ses_{uuid.uuid4().hex[:20]}"
    created_at = now_utc()
    summary = "?묒뾽???앹꽦?섏뿀?듬땲??"
    artifacts = build_artifacts(agent_id, instruction, request.url)
    task = {
        "id": task_id,
        "taskId": task_id,
        "session_id": session_id,
        "sessionId": session_id,
        "agent_id": agent_id,
        "agentId": agent_id,
        "title": request.title or summarize_instruction(instruction),
        "instruction": instruction,
        "url": request.url,
        "locale": request.locale,
        "status": "queued",
        "summary": summary,
        "created_at": created_at,
        "started_at": None,
        "updated_at": created_at,
        "logs": [make_log("info", "?묒뾽???먯뿉 ?깅줉?섏뿀?듬땲??", created_at)],
        "result_summary": None,
        "result_error": None,
        "metrics": {
            "attempts": 0,
            "success_count": 0,
            "failure_count": 0,
        },
        "artifacts": {
            "task_id": task_id,
            "taskId": task_id,
            "screenshot": artifacts["screenshot"],
            "image": artifacts["screenshot"],
            "notes": artifacts["notes"],
            "items": [],
        },
        "links": {
            "self": f"/api/tasks/{task_id}",
            "artifacts": f"/api/tasks/{task_id}/artifacts",
        },
    }
    task["artifacts"]["items"] = build_placeholder_items(task, request.artifacts.expected)
    TASKS[task_id] = task
    return task


def ensure_started(task: dict[str, Any], timestamp: datetime) -> None:
    if task["status"] != "queued":
        return
    task["status"] = "running"
    task["summary"] = "釉뚮씪?곗? 而⑦뀓?ㅽ듃瑜?以鍮꾪븯怨??덉뒿?덈떎."
    task["started_at"] = task["started_at"] or timestamp
    task["updated_at"] = timestamp
    task["logs"].append(make_log("info", task["summary"], timestamp))


def ensure_completed(task: dict[str, Any], timestamp: datetime) -> None:
    if task["status"] == "succeeded":
        return
    task["status"] = "succeeded"
    task["summary"] = "濡쒖뺄 OpenClaw ?ㅽ뀅 ?묒뾽???꾨즺?섏뿀?듬땲??"
    task["updated_at"] = timestamp
    task["result_summary"] = {
        "notes_count": len(task["artifacts"]["notes"]),
        "items_count": len(task["artifacts"]["items"]),
    }
    task["metrics"] = {
        "attempts": 1,
        "success_count": len(task["artifacts"]["items"]),
        "failure_count": 0,
    }
    task["logs"].append(make_log("success", task["summary"], timestamp))


def sync_task_state(task: dict[str, Any]) -> dict[str, Any]:
    now = now_utc()
    elapsed = (now - task["created_at"]).total_seconds()

    if task["status"] in {"failed", "succeeded"}:
        return task

    if elapsed >= 2.0:
        if task["status"] == "queued":
            ensure_started(task, task["created_at"] + timedelta(seconds=0.8))
        ensure_completed(task, now)
    elif elapsed >= 0.8:
        ensure_started(task, now)

    return task


def progress_for(task: dict[str, Any]) -> dict[str, Any]:
    if task["status"] == "queued":
        return {"percent": 10, "step": "queued", "message": task["summary"]}
    if task["status"] == "running":
        return {"percent": 65, "step": "browsing", "message": task["summary"]}
    return {"percent": 100, "step": task["status"], "message": task["summary"]}


def serialize_task(task: dict[str, Any]) -> dict[str, Any]:
    synced = sync_task_state(task)
    return {
        "id": synced["id"],
        "taskId": synced["taskId"],
        "task_id": synced["id"],
        "title": synced["title"],
        "session": synced["session_id"],
        "session_id": synced["session_id"],
        "sessionId": synced["sessionId"],
        "agent": synced["agent_id"],
        "agent_id": synced["agent_id"],
        "agentId": synced["agentId"],
        "instruction": synced["instruction"],
        "prompt": synced["instruction"],
        "url": synced["url"],
        "status": synced["status"],
        "state": synced["status"],
        "summary": synced["summary"],
        "message": synced["summary"],
        "created_at": to_iso(synced["created_at"]),
        "updated_at": to_iso(synced["updated_at"]),
        "updatedAt": to_iso(synced["updated_at"]),
        "logs": synced["logs"],
        "logs_tail": [log["message"] for log in synced["logs"][-5:]],
        "screenshot": synced["artifacts"]["screenshot"],
        "image": synced["artifacts"]["image"],
        "progress": progress_for(synced),
        "result": {
            "summary": synced["result_summary"],
            "error": synced["result_error"],
        },
        "timing": {
            "created_at": to_iso(synced["created_at"]),
            "started_at": to_iso(synced["started_at"]),
            "updated_at": to_iso(synced["updated_at"]),
        },
        "metrics": synced["metrics"],
        "links": synced["links"],
        "artifacts": synced["artifacts"],
    }


def serialize_artifacts(task: dict[str, Any], artifact_type: Optional[str], limit: int) -> dict[str, Any]:
    synced = sync_task_state(task)
    items = synced["artifacts"]["items"]
    if artifact_type:
        items = [item for item in items if item["type"] == artifact_type]
    items = items[: max(limit, 1)]
    return {
        "task_id": synced["id"],
        "taskId": synced["taskId"],
        "screenshot": synced["artifacts"]["screenshot"],
        "image": synced["artifacts"]["image"],
        "notes": synced["artifacts"]["notes"],
        "items": items,
        "page": {"next_cursor": None},
    }


@app.post("/chat", dependencies=[Depends(require_authorization)])
@app.post("/api/chat", dependencies=[Depends(require_authorization)])
def meeting_chat(request: MeetingChatRequest, _x_request_id: Optional[str] = Header(default=None, alias="X-Request-Id")):
    agent_id = normalize_agent_id(request.agent_id or request.context.get("role"))
    session_id = request.session_id or f"ses_{uuid.uuid4().hex[:20]}"
    reply = build_meeting_reply(
        agent_id=agent_id,
        phase=request.phase,
        message=request.message,
        history=[item.model_dump() for item in request.history],
    )
    created_at = now_iso()
    return {
        "id": f"chat_{uuid.uuid4().hex[:20]}",
        "session_id": session_id,
        "reply": reply,
        "text": reply,
        "provider": "openclaw",
        "model": os.getenv("OPENCLAW_CHAT_MODEL", "local-backend-stub"),
        "citations": [],
        "created_at": created_at,
    }


@app.post("/tasks", dependencies=[Depends(require_authorization)])
@app.post("/api/tasks", dependencies=[Depends(require_authorization)], status_code=status.HTTP_201_CREATED)
def create_task(request: TaskCreateRequest, _x_request_id: Optional[str] = Header(default=None, alias="X-Request-Id")):
    task = create_task_record(request)
    return serialize_task(task)


@app.get("/tasks/{task_id}", dependencies=[Depends(require_authorization)])
@app.get("/api/tasks/{task_id}", dependencies=[Depends(require_authorization)])
def get_task(task_id: str, _x_request_id: Optional[str] = Header(default=None, alias="X-Request-Id")):
    task = TASKS.get(task_id)
    if not task:
        raise ApiError(status.HTTP_404_NOT_FOUND, "TASK_NOT_FOUND", "task id not found", {"task_id": task_id})
    return serialize_task(task)


@app.get("/tasks/{task_id}/artifacts", dependencies=[Depends(require_authorization)])
@app.get("/api/tasks/{task_id}/artifacts", dependencies=[Depends(require_authorization)])
def get_task_artifacts(
    task_id: str,
    type: Optional[str] = None,
    cursor: Optional[str] = None,
    limit: int = 50,
    _x_request_id: Optional[str] = Header(default=None, alias="X-Request-Id"),
):
    _ = cursor
    task = TASKS.get(task_id)
    if not task:
        raise ApiError(status.HTTP_404_NOT_FOUND, "TASK_NOT_FOUND", "task id not found", {"task_id": task_id})
    return serialize_artifacts(task, type, limit)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=int(os.getenv("PORT", "18374")), reload=False)