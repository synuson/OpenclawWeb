# OpenClaw 호환 API 스펙

이 문서는 현재 OpenClawWEB 프론트엔드가 기대하는 OpenClaw 서버 계약을 정리한 문서다.
목표는 "서버 구현자가 이 문서만 보고 바로 연결 가능한 API를 만들 수 있게 하는 것"이다.

기준 코드:
- `packages/shared/src/lib/openclaw/client.ts`
- `packages/shared/src/lib/meeting/provider.ts`

## 1. 결론

현재 앱과 바로 호환되려면 아래 4개 엔드포인트가 필요하다.

- `POST /chat`
- `POST /tasks`
- `GET /tasks/:id`
- `GET /tasks/:id/artifacts`

이 중 필수 최소 구성은 `POST /chat`이다.
회의 응답만 OpenClaw로 만들고 싶다면 `/chat`만 있어도 된다.
조사 패널까지 모두 붙이려면 나머지 `tasks` 계열 3개가 필요하다.

## 2. Base URL / 인증

권장 Base URL:

```text
https://<your-openclaw-host>/api/v1
```

앱 `.env.local` 예시:

```env
OPENCLAW_BASE_URL=https://<your-openclaw-host>/api/v1
OPENCLAW_CHAT_PATH=/chat
OPENCLAW_TASKS_PATH=/tasks
OPENCLAW_TASK_DETAIL_PATH=/tasks/:id
OPENCLAW_TASK_ARTIFACTS_PATH=/tasks/:id/artifacts
OPENCLAW_API_KEY=your_token
OPENCLAW_API_KEY_HEADER=Authorization
OPENCLAW_API_KEY_PREFIX=Bearer 
```

현재 앱은 아래 헤더 방식을 지원한다.

- `Authorization: Bearer <TOKEN>`
- `Content-Type: application/json`

추가 헤더가 필요하면:

```env
OPENCLAW_EXTRA_HEADERS_JSON={"X-Tenant":"demo"}
```

## 3. 상태값 규칙

현재 앱이 안전하게 처리하는 상태는 아래 4개다.

- `queued`
- `running`
- `succeeded`
- `failed`

`canceled`를 서버에서 사용하고 싶다면 두 가지 중 하나를 선택해야 한다.

1. 이 앱에 응답할 때만 `failed`로 매핑한다.
2. 프론트 코드를 수정해서 `canceled`를 새 상태로 추가한다.

프론트 수정 없이 바로 붙이려면 `canceled -> failed` 매핑을 권장한다.

## 4. POST /chat

회의 응답 생성용 엔드포인트다.
OpenClaw 내부에서 GPT OAuth를 쓰고 있다면, 이 앱은 별도의 `OPENAI_API_KEY` 없이도 이 경로만으로 회의를 돌릴 수 있다.

### 요청

`POST {OPENCLAW_BASE_URL}{OPENCLAW_CHAT_PATH}`

```json
{
  "agentId": "analyst",
  "phase": "discussion",
  "systemPrompt": "...",
  "message": "비트코인 상황 요약해줘",
  "history": [
    { "role": "user", "content": "비트코인 상황 요약해줘" }
  ],
  "locale": "ko",
  "mode": "meeting"
}
```

### 필드 설명

- `agentId`: `assistant` 또는 `analyst`
- `phase`: 보통 `discussion` 또는 `summary`
- `systemPrompt`: 앱이 역할 정의를 합쳐 만든 시스템 프롬프트
- `message`: 현재 사용자 요청
- `history`: 직전 대화 히스토리
- `locale`: `ko` 또는 `en`
- `mode`: 현재는 항상 `meeting`

### 응답

최소 응답:

```json
{
  "text": "## 핵심 수치 요약\n..."
}
```

권장 응답:

```json
{
  "text": "## 핵심 수치 요약\n...",
  "provider": "openclaw",
  "model": "gpt-oauth",
  "citations": [
    {
      "title": "Example",
      "url": "https://example.com"
    }
  ]
}
```

### 필수 규칙

- `text`는 반드시 비어 있지 않은 문자열이어야 한다.
- Markdown 응답을 권장한다.
- 현재 앱은 `citations`를 별도 UI로 크게 쓰지 않으므로, 중요한 출처는 `text` 본문 안에도 같이 녹여주는 편이 낫다.

### 서버에서 허용하면 좋은 응답 alias

현재 앱은 아래 필드명도 받아들인다.

- `text`
- `message`
- `content`

즉 아래도 허용 가능하다.

```json
{
  "message": "## 결론\n..."
}
```

## 5. POST /tasks

조사 작업 생성 + 실행 시작용 엔드포인트다.

### 현재 프론트가 보내는 요청

```json
{
  "agentId": "assistant",
  "instruction": "오늘 비트코인 관련 최신 뉴스 조사",
  "url": "https://example.com",
  "sessionId": "session_xxx",
  "locale": "ko"
}
```

### 현재 프론트가 기대하는 최소 응답

```json
{
  "id": "tsk_01JPR8Y8W4Q8A9H0K6M2ZP3D1E",
  "status": "queued",
  "summary": "작업이 생성되었습니다.",
  "updated_at": "2026-03-15T01:24:00+09:00"
}
```

### 권장 응답

```json
{
  "id": "tsk_01JPR8Y8W4Q8A9H0K6M2ZP3D1E",
  "session_id": "session_xxx",
  "agent_id": "assistant",
  "instruction": "오늘 비트코인 관련 최신 뉴스 조사",
  "url": "https://example.com",
  "status": "queued",
  "summary": "작업이 생성되었습니다.",
  "logs": [
    {
      "timestamp": "2026-03-15T01:24:00+09:00",
      "level": "info",
      "message": "브라우저 컨텍스트를 준비하고 있습니다."
    }
  ],
  "updated_at": "2026-03-15T01:24:00+09:00"
}
```

### 현재 앱이 허용하는 요청/응답 alias

응답에서 아래 alias를 모두 허용한다.

- task id: `taskId` | `task_id` | `id`
- session id: `sessionId` | `session_id` | `session`
- agent id: `agentId` | `agent_id` | `agent`
- instruction: `instruction` | `prompt`
- 상태: `status` | `state`
- 요약: `summary` | `message`
- 갱신 시각: `updatedAt` | `updated_at`
- 스크린샷: `screenshot` | `image`

### 네가 제안한 Tasks API를 유지하고 싶다면

서버가 아래 요청도 같이 받아주면 된다.

```json
{
  "title": "easypos 전기간 수집",
  "role": "market_analyst_risk_first_v1",
  "input": {
    "prompt": "2025-01-01~2026-02-28 매출+메뉴명 수집"
  }
}
```

하지만 이 앱은 현재 저 형식으로 보내지 않으므로,
프론트 수정 없이 연결하려면 **legacy shape**도 반드시 같이 받아야 한다.

즉 서버는 아래 두 요청 중 하나를 모두 허용하는 편이 가장 좋다.

- 앱 현재 형식: `{ agentId, instruction, url?, sessionId?, locale }`
- 서버 내부 표준 형식: `{ title, role, input, options, artifacts, metadata }`

권장 방식은 **서버에서 앱 요청을 내부 표준으로 변환**하는 adapter를 두는 것이다.

## 6. GET /tasks/:id

작업 상태, 요약, 로그, 스크린샷을 조회한다.

### 현재 프론트가 기대하는 최소 응답

```json
{
  "id": "tsk_01JPR8Y8W4Q8A9H0K6M2ZP3D1E",
  "status": "running",
  "summary": "월별 재시도 진행 중",
  "updated_at": "2026-03-15T01:40:10+09:00"
}
```

### 권장 응답

```json
{
  "id": "tsk_01JPR8Y8W4Q8A9H0K6M2ZP3D1E",
  "title": "easypos 전기간 수집",
  "status": "running",
  "summary": "월별 재시도 진행 중",
  "updated_at": "2026-03-15T01:40:10+09:00",
  "logs": [
    {
      "timestamp": "2026-03-15T01:40:10+09:00",
      "level": "info",
      "message": "월별 재시도 진행 중"
    }
  ],
  "screenshot": "https://files.example.com/tasks/tsk_xxx/preview.png",
  "progress": {
    "percent": 62,
    "step": "api_replay_mode",
    "message": "월별 재시도 진행 중"
  },
  "result": {
    "summary": {
      "months_processed": 14,
      "rows_total": 490,
      "merged_rows": 3
    },
    "error": null
  },
  "metrics": {
    "attempts": 12396,
    "success_count": 0,
    "failure_count": 12396
  },
  "logs_tail": [
    "[LIST-EMPTY] 20250620",
    "[LIST-EMPTY] 20250621"
  ]
}
```

### 중요한 점

네가 제안한 응답처럼 `summary`가 `result.summary` 아래에만 있으면,
현재 앱은 그 값을 바로 읽지 못한다.

따라서 프론트 수정 없이 바로 붙이려면 아래 둘 중 하나가 필요하다.

1. `summary`를 top-level에도 중복으로 넣는다.
2. 프론트에서 `result.summary`를 읽도록 adapter를 수정한다.

가장 빠른 방법은 1번이다.

### 로그 형식

앱은 아래 필드를 로그로 잘 읽는다.

```json
{
  "timestamp": "2026-03-15T01:40:10+09:00",
  "level": "info",
  "message": "월별 재시도 진행 중"
}
```

허용되는 로그 레벨:

- `info`
- `warning`
- `error`
- `success`

## 7. GET /tasks/:id/artifacts

조사 결과의 노트와 스크린샷을 가져온다.

### 현재 프론트가 기대하는 최소 응답

```json
{
  "task_id": "tsk_01JPR8Y8W4Q8A9H0K6M2ZP3D1E",
  "screenshot": "https://files.example.com/tasks/tsk_xxx/preview.png",
  "notes": [
    "페이지 요약 1",
    "페이지 요약 2"
  ]
}
```

### 권장 응답

```json
{
  "task_id": "tsk_01JPR8Y8W4Q8A9H0K6M2ZP3D1E",
  "screenshot": "https://files.example.com/tasks/tsk_xxx/preview.png",
  "notes": [
    "report.json 생성 완료",
    "all_receipts_merged.csv 생성 완료"
  ],
  "items": [
    {
      "name": "report.json",
      "type": "report",
      "size_bytes": 4210,
      "sha256": "8a1c...",
      "created_at": "2026-03-15T01:52:01+09:00",
      "download_url": "https://files.example.com/tasks/tsk.../report.json?sig=..."
    },
    {
      "name": "all_receipts_merged.csv",
      "type": "csv",
      "size_bytes": 3194,
      "sha256": "7b2d...",
      "created_at": "2026-03-15T01:52:01+09:00",
      "download_url": "https://files.example.com/tasks/tsk.../all_receipts_merged.csv?sig=..."
    }
  ]
}
```

### 중요한 점

현재 앱은 `items[]` 목록 자체를 직접 쓰지 않는다.
지금 바로 붙이려면 반드시 아래 둘은 있어야 한다.

- `notes: string[]`
- `screenshot` 또는 `image`

즉 네가 제안한 파일 목록 중심 응답을 유지하더라도,
**top-level `notes[]`와 `screenshot`를 같이 넣어주는 adapter**가 필요하다.

## 8. 에러 표준

현재 앱은 비정상 응답일 때 `response.ok === false`면 응답 본문 텍스트를 읽어서 예외를 만든다.
따라서 아래 형식을 권장한다.

```json
{
  "error": {
    "code": "TASK_NOT_FOUND",
    "message": "task id not found",
    "details": {
      "task_id": "tsk_xxx"
    }
  }
}
```

권장 상태 코드는 아래와 같다.

- `400 BAD_REQUEST`
- `401 UNAUTHORIZED`
- `403 FORBIDDEN`
- `404 NOT_FOUND`
- `409 CONFLICT`
- `422 UNPROCESSABLE_ENTITY`
- `429 TOO_MANY_REQUESTS`
- `500 INTERNAL_SERVER_ERROR`

## 9. Webhook / Idempotency-Key

둘 다 있으면 좋지만, 현재 프론트는 직접 사용하지 않는다.

- `Idempotency-Key`: 서버가 받아도 좋지만, 앱이 아직 보내지 않는다.
- `webhook_url`, `webhook_events`: 서버 구현에는 유용하지만, 현재 프론트는 polling 방식이다.

즉 **Webhook은 선택 기능**이다.

## 10. 가장 빠른 구현 전략

네가 이미 갖고 있는 Tasks API를 최대한 유지하면서 이 앱과 바로 붙이려면,
서버 쪽에 아래 adapter를 두는 게 가장 빠르다.

### 권장 전략

1. `/chat`를 새로 만든다.
2. `/tasks`는 기존 내부 스키마를 유지하되, 앱의 legacy 요청도 같이 받는다.
3. `/tasks/:id`는 기존 응답을 유지하되, top-level alias를 추가한다.
4. `/tasks/:id/artifacts`는 `items[]`를 유지하되, `notes[]`와 `screenshot`도 같이 내려준다.
5. `canceled`는 이 앱에 대해서만 `failed`로 매핑한다.

## 11. 서버 구현 체크리스트

아래를 만족하면 이 앱에 바로 붙는다.

- `POST /chat`가 `text`를 반환한다.
- `POST /tasks`가 `id`와 `status`를 반환한다.
- `GET /tasks/:id`가 `status`, `summary`, `updated_at`를 반환한다.
- `GET /tasks/:id/artifacts`가 `notes[]`와 `screenshot`를 반환한다.
- 인증은 `Authorization: Bearer <TOKEN>`을 받는다.
- 상태는 `queued | running | succeeded | failed`로 맞춘다.

## 12. 최소 호환 예시

### POST /chat 응답

```json
{
  "text": "## 결론\n지금은 관망보다 분할 대응이 적절합니다."
}
```

### POST /tasks 응답

```json
{
  "id": "tsk_123",
  "status": "queued",
  "summary": "작업이 생성되었습니다.",
  "updated_at": "2026-03-15T01:24:00+09:00"
}
```

### GET /tasks/:id 응답

```json
{
  "id": "tsk_123",
  "status": "running",
  "summary": "브라우저 탐색 중입니다.",
  "updated_at": "2026-03-15T01:25:00+09:00",
  "logs": [
    {
      "timestamp": "2026-03-15T01:25:00+09:00",
      "level": "info",
      "message": "브라우저 탐색 중입니다."
    }
  ]
}
```

### GET /tasks/:id/artifacts 응답

```json
{
  "task_id": "tsk_123",
  "screenshot": "https://files.example.com/tasks/tsk_123/preview.png",
  "notes": [
    "핵심 포인트 1",
    "핵심 포인트 2"
  ]
}
```