# OpenClawWEB

OpenClawWEB은 웹에서 AI 에이전트 회의, 음성 입력/출력, 회의록, 시장 탭, OpenClaw 조사를 한 화면에서 사용하는 프로젝트입니다.

이 README는 저장소를 처음 clone한 사람이 아래 두 가지를 가장 빨리 끝내도록 작성했습니다.

- 웹 버전을 바로 실행해 보기
- 자기 OpenClaw를 연결해 실제 회의 답변에 쓰기

복잡한 API 스펙, 데스크톱 패키징, 로컬 FastAPI 스텁은 뒤쪽 링크로 분리했습니다.

## 5분 시작

### 1. 저장소 받기

```powershell
git clone https://github.com/synuson/OpenclawWeb.git
cd OpenclawWEB
```

### 2. 의존성 설치

```powershell
npm install
```

### 3. 환경 변수 파일 만들기

웹 버전에서 실제로 읽는 파일은 `apps/web/.env.local`입니다.
가장 쉬운 방법은 루트의 예시 파일을 그대로 복사하는 것입니다.

```powershell
Copy-Item .env.local.example apps/web/.env.local
```

선택 사항:
저장소 루트에도 같은 값을 두고 싶다면 아래 파일도 함께 만들어 두면 편합니다.

```powershell
Copy-Item .env.local.example .env.local
```

의미는 아래와 같습니다.

- `.env.local.example`: 예시 파일
- `apps/web/.env.local`: 웹 앱이 실제로 읽는 설정 파일
- `.env.local`: 루트 기준으로 같은 값을 공유하고 싶을 때 쓰는 선택 파일

### 4. 먼저 데모 모드로 실행해 보기

처음에는 `apps/web/.env.local`을 비워 둔 채로 시작해도 됩니다.
아무 값도 넣지 않으면 데모 모드로 실행됩니다.

### 5. 웹 서버 실행

```powershell
npm run dev
```

### 6. 브라우저에서 열기

```text
http://localhost:3000/meeting
```

여기까지 되면 기본 UI, 브라우저 STT/TTS, 회의록, 시장 탭, 데모 회의 흐름을 바로 확인할 수 있습니다.

## 가장 쉬운 사용 방법 2가지

### A. 아무 설정 없이 데모로 먼저 보기

아래처럼 `apps/web/.env.local`을 비워 둬도 됩니다.

```env
# 비워 둬도 실행 가능
```

이 경우 바로 확인할 수 있는 것:

- 회의실 UI
- 브라우저 음성 입력/출력
- 회의록 생성과 로컬 저장
- BTC / 국내 / 미국 / 모의투자 탭
- OpenClaw 대체 조사 흐름

### B. 내 OpenClaw를 연결해서 실제 회의 답변 쓰기

가장 간단한 설정은 아래 중 하나입니다.

예시 1. OpenClaw가 `https://example.com/api/chat` 같은 커스텀 API를 제공하는 경우

```env
OPENCLAW_BASE_URL=https://your-openclaw-host/api
OPENCLAW_API_KEY=your_token
```

예시 2. stock OpenClaw gateway처럼 `/v1/chat/completions`를 루트에 노출하는 경우

```env
OPENCLAW_BASE_URL=https://your-openclaw-host
OPENCLAW_API_KEY=your_token
```

설정 위치:

- 필수: `apps/web/.env.local`
- 선택: `.env.local`에도 같은 값 복사

값을 저장한 뒤에는 `npm run dev`를 다시 실행해야 반영됩니다.

## 내 OpenClaw 연결하기

### 1. 가장 기본적인 설정

대부분은 아래 둘 중 하나로 시작하면 됩니다.

커스텀 `/api` 서버라면:

```env
OPENCLAW_BASE_URL=https://your-openclaw-host/api
OPENCLAW_API_KEY=your_token
```

stock OpenClaw gateway처럼 `/v1/chat/completions`가 루트에 있다면:

```env
OPENCLAW_BASE_URL=https://your-openclaw-host
OPENCLAW_API_KEY=your_token
```

인증이 필요 없으면 `OPENCLAW_API_KEY`는 비워 둬도 됩니다.

### 2. Bearer 방식이 아닐 때

어떤 OpenClaw는 `Authorization: Bearer ...`가 아니라 다른 헤더를 씁니다.
이 경우는 아래도 함께 넣어야 합니다.

```env
OPENCLAW_API_KEY_HEADER=X-API-Key
OPENCLAW_API_KEY_PREFIX=
OPENCLAW_EXTRA_HEADERS_JSON={"X-Tenant":"demo"}
```

즉 아래처럼 이해하면 됩니다.

- `OPENCLAW_API_KEY_HEADER`: 토큰을 어떤 헤더 이름으로 보낼지
- `OPENCLAW_API_KEY_PREFIX`: 토큰 앞에 `Bearer ` 같은 글자를 붙일지
- `OPENCLAW_EXTRA_HEADERS_JSON`: 추가 헤더가 더 필요한지

잘 모르겠으면 먼저 아래처럼 가장 기본값으로 시작하세요.

```env
OPENCLAW_API_KEY_HEADER=Authorization
OPENCLAW_API_KEY_PREFIX=Bearer 
```

### 3. 기본 경로가 아닌 경우에만 추가 설정

앱은 기본적으로 아래 경로를 사용합니다.

- 회의 응답: `/chat`
- 조사 작업 생성: `/tasks`
- 조사 작업 상태: `/tasks/:id`
- 조사 결과물: `/tasks/:id/artifacts`

만약 네 OpenClaw가 다른 경로를 쓴다면 `apps/web/.env.local`에 경로를 직접 넣으면 됩니다.

```env
OPENCLAW_CHAT_PATH=/my/chat/path
OPENCLAW_TASKS_PATH=/my/tasks
OPENCLAW_TASK_DETAIL_PATH=/my/tasks/:id
OPENCLAW_TASK_ARTIFACTS_PATH=/my/tasks/:id/artifacts
```

### 4. stock OpenClaw gateway를 쓰는 경우

만약 네 OpenClaw가 `/chat` 대신 OpenAI 호환 경로만 제공해도 괜찮습니다.
이 앱은 연결 테스트와 회의 호출에서 아래 순서로 시도합니다.

- `OPENCLAW_CHAT_PATH` 기본값인 `/chat`
- `/v1/chat/completions`
- `/v1/responses`

중요:
이 경우 `OPENCLAW_BASE_URL`은 보통 `https://host/api`가 아니라 `https://host`입니다.
왜냐하면 앱이 그 뒤에 `/v1/chat/completions`를 자동으로 붙이기 때문입니다.

### 5. 내 OpenClaw 주소와 API key를 어떻게 찾는가

모든 사용자가 처음부터 이 값을 알고 있는 것은 아닙니다.
아래 셋 중 어디에 해당하는지 먼저 확인하세요.

#### 1) 내 컴퓨터에서 OpenClaw를 직접 실행하는 사람

보통 가장 쉽습니다.

- OpenClaw 실행 로그에 `http://127.0.0.1:포트번호`가 표시되는지 확인합니다.
- 설정 파일이나 실행 화면에 `gateway`, `port`, `chat completions`, `responses` 같은 단어가 있는지 봅니다.
- 이 경우는 API key가 아예 없을 수도 있습니다.

예:

```env
OPENCLAW_BASE_URL=http://127.0.0.1:18789
```

#### 2) 회사/팀/서비스에서 제공한 OpenClaw 서버를 쓰는 사람

이 경우는 보통 아래 두 개를 받아야 합니다.

- Base URL
- API key 또는 토큰

보통 찾는 곳:

- OpenClaw 관리자 페이지
- 서비스 대시보드
- 팀 문서
- 서버 관리자에게 문의

#### 3) 텔레그램에서만 OpenClaw를 써 본 사람

이 경우는 대개 아직 이 프로젝트에 넣을 API 정보를 모르는 상태입니다.

중요:

- 텔레그램 봇 토큰 = 이 프로젝트에 넣는 OpenClaw API key 가 아닙니다.
- 텔레그램에서 답변을 잘한다고 해도, HTTP API 주소가 없으면 이 프로젝트와 바로 연결할 수 없습니다.

즉 텔레그램만 쓰는 상태라면 먼저 아래를 확인해야 합니다.

- OpenClaw가 HTTP API 주소를 제공하는지
- 그 주소에 토큰이 필요한지

### 6. 화면에서 연결 확인하기

1. `npm run dev`로 웹 앱을 실행합니다.
2. `http://localhost:3000/meeting`를 엽니다.
3. 오른쪽 도킹 패널을 열고 `편집` 탭으로 이동합니다.
4. `OpenClaw 연결` 카드에서 `연결 테스트`를 누릅니다.

정상이라면 아래를 확인할 수 있습니다.

- 상태가 `연결 확인됨`으로 표시됨
- base URL과 사용 중인 경로가 보임
- 이후 회의 답변이 OpenClaw provider로 내려옴

### 7. 무엇이 실제로 OpenClaw를 쓰는가

OpenClaw를 연결하면 아래 동작이 바뀝니다.

- 회의 답변: 내 OpenClaw가 응답 생성
- 조사 패널: 내 OpenClaw의 task API가 있으면 원격 task 사용
- 조사 패널: task API가 없을 때는 일부 경우에만 대체 흐름으로 동작

즉 가장 중요한 회의 답변은 `OPENCLAW_BASE_URL`만 맞아도 바로 붙고,
조사 패널을 더 풍부하고 안정적으로 쓰려면 `/tasks` 계열 API가 있는 편이 좋습니다.

현재 코드 기준으로는 `/tasks` 호출이 `404`, `405`, `501`처럼
"이 경로를 지원하지 않음"으로 돌아올 때만 대체 흐름으로 내려갑니다.
`401`, `403`, `500` 같은 오류는 그대로 실패할 수 있습니다.

## `.env.local`을 어떻게 채우면 되는지

아래 표는 "내가 뭘 하고 싶은지" 기준으로 보면 됩니다.

| 하고 싶은 것 | 꼭 필요한 값 | 있으면 좋은 값 | 결과 |
| --- | --- | --- | --- |
| 일단 화면만 보기 | 없음 | 없음 | 데모 모드로 웹 실행 |
| 내 OpenClaw로 회의 답변 만들기 | `OPENCLAW_BASE_URL` | `OPENCLAW_API_KEY` | 회의 답변이 OpenClaw를 사용 |
| Bearer가 아닌 인증 쓰기 | `OPENCLAW_API_KEY_HEADER`, `OPENCLAW_API_KEY_PREFIX` | `OPENCLAW_EXTRA_HEADERS_JSON` | 커스텀 인증 헤더 사용 |
| OpenClaw 경로가 기본값과 다름 | `OPENCLAW_*_PATH` | 없음 | 커스텀 경로 사용 |
| OpenClaw 실패 시 직접 LLM으로 폴백 | `OPENAI_API_KEY` 또는 `ANTHROPIC_API_KEY` 또는 `CEREBRAS_API_KEY` | `MEETING_LLM_PROVIDER` | OpenClaw 실패 시 direct LLM 사용 |
| Whisper STT 쓰기 | `OPENAI_API_KEY` | `OPENAI_MODEL` | Whisper 음성 인식 사용 |
| ElevenLabs TTS 쓰기 | `ELEVENLABS_API_KEY` | `ELEVENLABS_MODEL_ID`, `NEXT_PUBLIC_ELEVENLABS_DEFAULT_VOICE_ID` | ElevenLabs 음성 합성 사용 |
| 미국 시세 실데이터 쓰기 | `TWELVE_DATA_API_KEY` | 없음 | 미국 탭 실데이터 사용 |
| 국내 시세/모의투자 실연동 | `KIWOOM_PROXY_BASE_URL` | `KIWOOM_PROXY_TOKEN` | 국내 시세/모의투자 실연동 |

## 회의 provider 선택 순서

회의 응답은 아래 순서로 선택됩니다.

1. `MEETING_LLM_PROVIDER`가 있으면 그 값 강제 사용
2. 없고 `OPENCLAW_BASE_URL`이 있으면 OpenClaw 우선
3. OpenClaw 실패 시 `OPENAI_API_KEY -> ANTHROPIC_API_KEY -> CEREBRAS_API_KEY -> mock`
4. 아무 설정도 없으면 `mock`

즉 OpenClaw만 연결해도 회의는 돌아가고,
원하면 direct LLM 키를 추가해서 폴백 안전장치를 둘 수 있습니다.

## 자주 하는 실수

### 1. `.env.local`을 루트에만 만들고 `apps/web/.env.local`을 안 만든 경우

웹 앱은 `apps/web/.env.local`을 먼저 봅니다.
웹만 쓸 거라면 이 파일이 가장 중요합니다.

### 2. 환경 변수를 바꿨는데 화면이 그대로인 경우

`.env.local`을 수정한 뒤에는 dev 서버를 다시 시작해야 합니다.

```powershell
Ctrl + C
npm run dev
```

### 3. OpenClaw 연결 테스트가 실패하는 경우

아래를 순서대로 확인하세요.

- `OPENCLAW_BASE_URL`이 맞는지
- stock gateway인데 `OPENCLAW_BASE_URL` 뒤에 `/api`를 잘못 붙인 건 아닌지
- 토큰이 필요한 서버인데 `OPENCLAW_API_KEY`가 비어 있지 않은지
- Bearer 방식이 아닌데 `OPENCLAW_API_KEY_HEADER`, `OPENCLAW_API_KEY_PREFIX`를 안 넣은 건 아닌지
- 서버가 `/chat` 또는 OpenAI 호환 chat 경로에 응답하는지
- 커스텀 경로를 쓰는데 `OPENCLAW_CHAT_PATH`를 안 넣은 건 아닌지
- 텔레그램만 되고 HTTP API는 없는 상태가 아닌지

### 4. 페이지가 흰 화면이거나 CSS/JS가 깨지는 경우

개발 캐시를 지우고 다시 실행하면 해결되는 경우가 많습니다.

```powershell
Remove-Item -Recurse -Force apps/web/.next
npm run dev
```

## 자주 쓰는 명령

### 웹 버전 실행

```powershell
npm run dev
```

### 웹 프로덕션 빌드 확인

```powershell
npm run build:web
```

### 타입 체크

```powershell
npm run typecheck:web
```

### 데스크톱 Next 앱 실행

```powershell
npm run dev:desktop
```

### Electron 셸 실행

```powershell
npm run electron:dev
```

## 고급 문서

웹만 빠르게 써보려는 경우에는 아래 문서를 바로 읽을 필요는 없습니다.
필요할 때만 보면 됩니다.

- OpenClaw 호환 API 문서: [docs/openclaw-api-compat.md](docs/openclaw-api-compat.md)
- OpenClaw 호환 OpenAPI 문서: [docs/openclaw-api-compat.openapi.yaml](docs/openclaw-api-compat.openapi.yaml)
- 로컬 FastAPI 스텁 백엔드: [apps/desktop/openclaw-backend/README.md](apps/desktop/openclaw-backend/README.md)

## 현재 제한 사항

- 국내 실데이터와 모의투자 실연동은 별도 Kiwoom 호환 프록시가 필요합니다.
- 브라우저 STT/TTS 품질은 브라우저와 OS에 따라 달라집니다.
- OpenClaw task API가 없으면 조사 패널은 일부 경우에만 대체 흐름으로 동작합니다.
- 데스크톱 패키징은 웹 버전보다 설정이 더 많으므로, 먼저 웹에서 동작을 확인한 뒤 진행하는 편이 좋습니다.