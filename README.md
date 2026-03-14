# OpenClawWEB 금융 미팅룸

OpenClawWEB은 Next.js 14 App Router 기반의 2인 에이전트 금융 미팅 워크스페이스입니다.

## 기능 개요

- `이안(분석가) -> 서윤(진행자)` 고정 2인 회의 흐름
- 브라우저 STT/TTS 기본 지원, 필요 시 Whisper / ElevenLabs 확장 가능
- 회의록 자동 생성, 최근 세션 로컬 저장, Markdown 내보내기 지원
- 비트코인 / 국내주식 / 미국증시 / 모의투자 탭 제공
- OpenClaw를 웹 조사 보조 패널로 연결 가능

## 데이터 소스와 폴백

- `BTC`: Upbit 스냅샷 + 브라우저 WebSocket 실시간 틱 시도
- `국내 시세`: Kiwoom 호환 프록시가 있으면 사용, 없으면 데모 데이터 사용
- `미국 시세`: Twelve Data 키가 있으면 사용, 없으면 데모 데이터 사용
- `모의투자`: Kiwoom 호환 프록시가 있으면 사용, 없으면 메모리 기반 데모 포트폴리오 사용
- `회의 답변`: 설정된 LLM provider가 있으면 사용, 없으면 로컬 mock 응답 사용

## 시작 방법

1. 실제 외부 연동을 쓰려면 `.env.local.example`을 `.env.local`로 복사합니다.
2. `npm install`로 의존성을 설치합니다.
3. `npm run dev`로 앱을 실행합니다.
4. 브라우저에서 `/meeting`을 엽니다.

## 빠른 `.env.local` 체크리스트

아래 표만 보면 사용자가 어떤 값을 넣어야 어떤 기능이 켜지는지 바로 판단할 수 있습니다.

| 목적 | 최소 env | 선택 env | 비워두면 어떻게 되나 |
| --- | --- | --- | --- |
| 프로토타입 모드로 실행 | 없음 | 없음 | mock 회의 답변, 데모 시세, 데모 모의투자, mock OpenClaw 작업으로 앱이 그대로 동작 |
| 실제 회의 답변 사용 | `OPENAI_API_KEY` 또는 `ANTHROPIC_API_KEY` 또는 `CEREBRAS_API_KEY` | `MEETING_LLM_PROVIDER`, `OPENAI_MODEL`, `ANTHROPIC_MODEL`, `CEREBRAS_MODEL` | 회의 답변이 로컬 `mock`으로 동작 |
| Whisper STT 사용 | `OPENAI_API_KEY` | `OPENAI_MODEL` | Whisper 버튼 비활성화 |
| 브라우저 STT/TTS 사용 | 없음 | 없음 | env와 무관, 브라우저 지원과 마이크 권한에 따라 동작 |
| ElevenLabs TTS 사용 | `ELEVENLABS_API_KEY` | `ELEVENLABS_MODEL_ID`, `NEXT_PUBLIC_ELEVENLABS_DEFAULT_VOICE_ID` | ElevenLabs 비활성화, 브라우저 TTS만 사용 가능 |
| BTC 실데이터 사용 | 없음 | 없음 | 공개 Upbit API로 계속 동작 |
| 미국 시세 실데이터 사용 | `TWELVE_DATA_API_KEY` | 없음 | 미국 탭이 데모 데이터로 동작 |
| 국내 시세 / 국내 모의투자 사용 | `KIWOOM_PROXY_BASE_URL` | `KIWOOM_PROXY_TOKEN` | 국내 탭과 모의투자가 데모 모드로 동작 |
| 사용자 본인 OpenClaw 연결 | `OPENCLAW_BASE_URL` | `OPENCLAW_API_KEY`, `OPENCLAW_API_KEY_HEADER`, `OPENCLAW_API_KEY_PREFIX`, `OPENCLAW_TASKS_PATH`, `OPENCLAW_TASK_DETAIL_PATH`, `OPENCLAW_TASK_ARTIFACTS_PATH`, `OPENCLAW_EXTRA_HEADERS_JSON` | 조사 패널이 내장 mock task 엔진으로 동작 |

### 최소 설정 예시

실제 회의 답변만 켜기:

```env
OPENAI_API_KEY=your_openai_api_key
```

사용자 OpenClaw만 연결:

```env
OPENCLAW_BASE_URL=http://localhost:8080
```

가장 흔한 실사용 조합:

```env
OPENAI_API_KEY=your_openai_api_key
TWELVE_DATA_API_KEY=your_twelve_data_key
OPENCLAW_BASE_URL=http://localhost:8080
```

## 환경변수 참고

- `OPENAI_API_KEY`: Whisper STT와 OpenAI 회의 답변 활성화
- `ELEVENLABS_API_KEY`: ElevenLabs TTS 활성화
- `TWELVE_DATA_API_KEY`: 미국 시세 실데이터 활성화
- `KIWOOM_PROXY_BASE_URL`, `KIWOOM_PROXY_TOKEN`: 국내 시세 / 모의투자용 Kiwoom 호환 프록시 연결
- `OPENCLAW_BASE_URL`: 사용자 OpenClaw 서버 연결
- `OPENCLAW_API_KEY_HEADER`, `OPENCLAW_API_KEY_PREFIX`, `OPENCLAW_TASKS_PATH`, `OPENCLAW_TASK_DETAIL_PATH`, `OPENCLAW_TASK_ARTIFACTS_PATH`, `OPENCLAW_EXTRA_HEADERS_JSON`: 사용자 OpenClaw API 스펙에 맞추기 위한 adapter 설정

## 사용자 OpenClaw 연결하기

이 저장소는 다른 사용자가 fork 하거나 다운로드해서 자기 OpenClaw를 연결할 수 있도록 설계했습니다. 소스 수정 없이 환경변수만 바꿔도 되게 맞춰놨습니다.

### 필수 env

- `OPENCLAW_BASE_URL`

### 선택 env

- `OPENCLAW_API_KEY`
- `OPENCLAW_API_KEY_HEADER` 기본값: `Authorization`
- `OPENCLAW_API_KEY_PREFIX` 기본값: `Bearer `
- `OPENCLAW_TASKS_PATH` 기본값: `/tasks`
- `OPENCLAW_TASK_DETAIL_PATH` 기본값: `/tasks/:id`
- `OPENCLAW_TASK_ARTIFACTS_PATH` 기본값: `/tasks/:id/artifacts`
- `OPENCLAW_EXTRA_HEADERS_JSON` 예시: `{"x-api-key":"demo","x-team":"research"}`

경로 템플릿은 `:id` 또는 `{id}` 둘 다 사용할 수 있습니다.

### 이 앱이 보내는 작업 생성 요청 예시

```json
{
  "agentId": "assistant",
  "instruction": "최신 비트코인 ETF 뉴스를 열고 요약해줘",
  "url": "https://example.com",
  "sessionId": "session_123"
}
```

### 이 앱이 받아들일 수 있는 OpenClaw 응답 필드

이 adapter는 아래 alias를 허용하므로, 사용자가 자기 OpenClaw 필드명을 전부 바꾸지 않아도 됩니다.

- 작업 ID: `taskId` | `task_id` | `id`
- 세션 ID: `sessionId` | `session_id` | `session`
- 에이전트 ID: `agentId` | `agent_id` | `agent`
- 상태: `status` | `state`
- 요약: `summary` | `message`
- 스크린샷: `screenshot` | `image` | `artifacts.screenshot` | `artifacts.image`
- 갱신 시각: `updatedAt` | `updated_at`

artifact 응답은 아래 두 형태를 모두 허용합니다.

```json
{
  "screenshot": "https://...",
  "notes": ["note 1", "note 2"]
}
```

또는

```json
{
  "artifacts": {
    "screenshot": "https://...",
    "notes": ["note 1", "note 2"]
  }
}
```

### 에이전트 내재화형 조사 모드

`POST /api/meeting/round`는 필요 시 OpenClaw를 자동으로 호출할 수 있습니다. 이때 메인 채팅에는 `OpenClaw` 로그를 직접 뿌리지 않고, `서윤` 또는 `이안`이 조사 결과를 자기 이름으로 정리해서 답합니다.

직접 OpenClaw를 붙일 때 권장 기준:

- `POST /tasks`는 가능한 한 짧은 시간 안에 `taskId`, `status`, `summary`를 반환
- `GET /tasks/:id`는 `queued/running/succeeded/failed` 중 하나를 안정적으로 반환
- `GET /tasks/:id/artifacts`는 `notes[]`를 항상 주고, 가능하면 `screenshot`도 함께 제공
- 메인 답변은 에이전트가 다시 서술하므로, artifact의 `notes[]`는 짧고 사실 중심으로 유지
- 타임아웃이나 실패가 나더라도 회의 라운드 자체는 끝나야 하므로, 실패 시에도 최소한의 `summary`를 반환하는 편이 좋음

## 주요 라우트

- `POST /api/meeting/round`
- `GET /api/system/capabilities`
- `GET /api/markets/btc`
- `GET /api/markets/kr`
- `GET /api/markets/us`
- `GET /api/trading/account`
- `GET /api/trading/orders`
- `POST /api/trading/orders`

## 현재 제한 사항

- 국내 실시간 시세와 국내 실모의투자는 이 앱이 기대하는 형태를 반환하는 별도 Kiwoom 호환 프록시가 필요합니다.
- 브라우저 STT/TTS 지원 범위는 브라우저마다 다릅니다.
- OpenClaw는 조사 보조 기능이며, 원격 브라우저를 실시간으로 임베드하지는 않습니다.
