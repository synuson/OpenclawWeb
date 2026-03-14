# OpenClawWEB 빠른 안내

OpenClawWEB은 Next.js 14 App Router 기반의 금융 미팅룸 프로토타입입니다. 웹 버전과 데스크톱 패키징 버전을 함께 관리하며, 2인 에이전트 회의, STT/TTS, 회의록, 시장 탭, OpenClaw 조사 연동을 한 화면에서 다룹니다.

## 빠른 가이드

다른 사용자가 이 저장소를 받아서 바로 써보려면 아래 순서만 따라가면 됩니다.

1. 저장소를 clone 합니다.
2. 프로젝트 루트에서 `npm install`을 실행합니다.
3. `.env.local.example`을 복사해서 `.env.local`을 만듭니다.

   이 단계는 예시 파일을 바탕으로 실제 설정 파일을 하나 더 만든다는 뜻입니다.

   탐색기에서 하는 방법:
   프로젝트 폴더에서 `.env.local.example`을 복사한 뒤, 같은 폴더에 붙여넣고 파일 이름을 `.env.local`로 바꾸면 됩니다.

   PowerShell에서 하는 방법:

   ```powershell
   cd F:\Dev\OpenclawWEB
   Copy-Item .env.local.example .env.local
   ```

   `.env.local`을 만든 뒤에는 필요한 값만 채우면 됩니다. 데모 모드로만 써볼 경우에는 비워둬도 됩니다.

   최소 OpenClaw 연결 예시:

   ```env
   OPENCLAW_BASE_URL=http://localhost:8080
   OPENCLAW_CHAT_PATH=/chat
   ```

   `.env.local`을 수정한 뒤에는 dev 서버를 다시 시작해야 반영됩니다.
4. 아무 키도 넣지 않아도 데모 모드로 실행할 수 있습니다.
5. 웹 버전은 `npm run dev`, 데스크톱 UI 확인은 `npm run dev:desktop`, Electron 실행은 `npm run electron:dev`를 사용합니다.
6. 브라우저에서 `http://localhost:3000/meeting` 또는 `http://localhost:3001/meeting`으로 들어갑니다.

## 1분 체험용

아무 설정 없이도 아래 기능은 바로 확인할 수 있습니다.

- 2인 에이전트 회의 UI
- 브라우저 STT/TTS
- 회의록 생성과 로컬 저장
- BTC / 국내 / 미국 / 모의투자 탭
- OpenClaw mock 조사 task

## 핵심 기능

- `이안(분석가) -> 서윤(진행자)` 구조의 2인 회의 흐름
- 브라우저 STT/TTS 기본 지원, 필요 시 Whisper / ElevenLabs 확장
- 회의록 생성, 최근 세션 저장, Markdown 내보내기
- 비트코인 / 국내주식 / 미국증시 / 모의투자 탭
- OpenClaw를 회의 provider와 조사 task 양쪽에 연결 가능
- `apps/web`, `apps/desktop`, `packages/shared` 구조의 모노레포

## 회의 provider 선택 순서

회의 응답 provider는 아래 순서로 결정됩니다.

1. `MEETING_LLM_PROVIDER`가 명시되어 있으면 그 값을 우선 사용
2. `OPENCLAW_BASE_URL`이 있으면 `openclaw`를 기본 회의 provider로 선택
3. OpenClaw chat 실패 시 `OPENAI_API_KEY -> ANTHROPIC_API_KEY -> CEREBRAS_API_KEY -> mock` 순으로 폴백
4. 아무 설정도 없으면 `mock` provider 사용

즉, OpenClaw 쪽에서 GPT/OAuth를 관리하고 있으면 앱에 `OPENAI_API_KEY`가 없어도 회의 응답을 만들 수 있습니다.

## 설치와 실행

1. `.env.local.example`을 `.env.local`로 복사합니다.
2. `npm install`을 실행합니다.
3. 웹 버전은 `npm run dev`를 실행합니다.
4. 데스크톱 Next 앱은 `npm run dev:desktop`을 실행합니다.
5. Electron 셸까지 띄우려면 `npm run electron:dev`를 사용합니다.
6. 브라우저 또는 앱에서 `/meeting` 화면을 엽니다.

## `.env.local` 체크리스트

| 목적 | 필수 env | 선택 env | 설정하면 켜지는 기능 |
| --- | --- | --- | --- |
| 데모 모드로 빠르게 실행 | 없음 | 없음 | mock 회의, 기본 시세, 회의록, mock OpenClaw task |
| OpenClaw를 회의 응답 provider로 사용 | `OPENCLAW_BASE_URL` | `OPENCLAW_CHAT_PATH`, `OPENCLAW_API_KEY`, `OPENCLAW_API_KEY_HEADER`, `OPENCLAW_API_KEY_PREFIX`, `OPENCLAW_EXTRA_HEADERS_JSON` | OpenClaw chat 기반 회의 응답 |
| direct LLM으로 회의 응답 생성 | `OPENAI_API_KEY` 또는 `ANTHROPIC_API_KEY` 또는 `CEREBRAS_API_KEY` | `MEETING_LLM_PROVIDER`, 각 provider model env | OpenClaw 없이도 실제 LLM 회의 응답 |
| Whisper STT 사용 | `OPENAI_API_KEY` | `OPENAI_MODEL` | Whisper 음성 인식 |
| 브라우저 STT/TTS 사용 | 없음 | 없음 | 브라우저 내장 음성 기능 |
| ElevenLabs TTS 사용 | `ELEVENLABS_API_KEY` | `ELEVENLABS_MODEL_ID`, `NEXT_PUBLIC_ELEVENLABS_DEFAULT_VOICE_ID` | ElevenLabs 음성 합성 |
| 미국 시세 실데이터 사용 | `TWELVE_DATA_API_KEY` | 없음 | 미국 탭 실시간/준실시간 데이터 |
| 국내 시세 / 모의투자 실연동 | `KIWOOM_PROXY_BASE_URL` | `KIWOOM_PROXY_TOKEN` | 국내 시세와 키움 호환 모의투자 |
| OpenClaw 조사 task 사용 | `OPENCLAW_BASE_URL` | `OPENCLAW_TASKS_PATH`, `OPENCLAW_TASK_DETAIL_PATH`, `OPENCLAW_TASK_ARTIFACTS_PATH` | 원격 OpenClaw 조사 task 연동 |

## 최소 설정 예시

### 1. OpenClaw만 연결

```env
OPENCLAW_BASE_URL=http://localhost:8080
OPENCLAW_CHAT_PATH=/chat
```

### 2. OpenClaw + OpenAI 폴백

```env
OPENCLAW_BASE_URL=http://localhost:8080
OPENCLAW_CHAT_PATH=/chat
OPENAI_API_KEY=your_openai_api_key
```

### 3. OpenAI를 직접 회의 provider로 강제

```env
OPENAI_API_KEY=your_openai_api_key
MEETING_LLM_PROVIDER=openai
```

## OpenClaw 연결 방법

다른 사용자가 자기 OpenClaw를 붙이려면 보통 아래 두 줄이면 시작할 수 있습니다.

```env
OPENCLAW_BASE_URL=http://localhost:8080
OPENCLAW_CHAT_PATH=/chat
```

추가 인증이 필요하면 다음 값을 함께 넣습니다.

- `OPENCLAW_API_KEY`
- `OPENCLAW_API_KEY_HEADER`
- `OPENCLAW_API_KEY_PREFIX`
- `OPENCLAW_EXTRA_HEADERS_JSON`

## OpenClaw API 계약

이 저장소를 fork 받은 다른 사용자도 자기 OpenClaw 서버를 쉽게 연결할 수 있도록 계약을 느슨하게 잡았습니다.

### OpenClaw chat 계약

`POST {OPENCLAW_BASE_URL}{OPENCLAW_CHAT_PATH}`

요청 예시:

```json
{
  "agentId": "analyst",
  "phase": "analysis",
  "systemPrompt": "...",
  "message": "비트코인 시황 요약해줘",
  "history": [
    { "role": "user", "content": "비트코인 시황 요약해줘" }
  ],
  "mode": "meeting"
}
```

응답 예시:

```json
{
  "text": "## 핵심 수치 요약\n...",
  "provider": "openclaw",
  "model": "gpt-oauth",
  "citations": [
    { "title": "Example", "url": "https://example.com" }
  ]
}
```

### OpenClaw task 계약

- `POST /tasks`
- `GET /tasks/:id`
- `GET /tasks/:id/artifacts`

이 adapter는 아래 alias를 받아들입니다.

- task ID: `taskId` | `task_id` | `id`
- session ID: `sessionId` | `session_id` | `session`
- agent ID: `agentId` | `agent_id` | `agent`
- 상태: `status` | `state`
- 요약: `summary` | `message`
- 스크린샷: `screenshot` | `image` | `artifacts.screenshot` | `artifacts.image`
- 갱신 시각: `updatedAt` | `updated_at`

### 에이전트 내재형 조사 모드

`POST /api/meeting/round`는 필요할 때 OpenClaw task를 자동으로 실행할 수 있습니다. 이때 메인 채팅은 OpenClaw 로그를 그대로 노출하지 않고, 에이전트가 조사 결과를 사람처럼 정리해서 전달합니다.

직접 OpenClaw를 붙일 때 권장 사항:

- `POST /tasks`는 가능한 한 짧은 시간 안에 `taskId`, `status`, `summary`를 반환
- `GET /tasks/:id`는 `queued`, `running`, `succeeded`, `failed` 중 하나를 안정적으로 반환
- `GET /tasks/:id/artifacts`는 `notes[]`를 우선 주고, 가능하면 `screenshot`도 함께 제공
- 메인 답변에서 에이전트가 다시 서술할 수 있도록 artifact의 `notes[]`는 짧고 사실 전달형으로 유지
- 조사 자체가 실패해도 회의 라운드 전체가 무너지지 않도록 실패 응답에도 최소한의 `summary`를 포함

## 주요 라우트

- `POST /api/meeting/round`
- `POST /api/meeting/chat`
- `GET /api/system/capabilities`
- `POST /api/meeting/tasks`
- `GET /api/meeting/tasks/:id`
- `GET /api/meeting/tasks/:id/artifacts`

## 문제 생기면 먼저 확인할 것

- `npm run typecheck:all`
- `npm run build:web`
- `npm run build:desktop`
- dev 서버에서 CSS/JS 404가 나면 `.next` 캐시를 비우고 다시 실행
- OpenClaw 응답이 안 오면 `/api/system/capabilities`에서 `openclawRemote`, `openclawChat` 상태 확인

## 현재 제한 사항

- 국내 실데이터 / 모의투자 실연동은 별도 Kiwoom 호환 프록시가 필요합니다.
- 브라우저 STT/TTS 품질은 사용자 브라우저와 OS에 영향을 받습니다.
- OpenClaw는 회의 provider와 조사 task를 모두 맡을 수 있지만, 서버 구현에 따라 실제 품질과 동작은 달라질 수 있습니다.
