# OpenClawWEB

OpenClawWEB은 웹에서 AI 에이전트 회의, 음성 입력/출력, 회의록, 시장 탭, OpenClaw 조사를 한 화면에서 사용하는 프로젝트입니다.

이 문서는 컴퓨터를 쓸 줄 아는 사람이 처음 저장소를 받아서 아래 두 가지를 가장 쉽게 끝내도록 작성했습니다.

- 웹 버전을 직접 실행해 보기
- 자기 OpenClaw를 연결해서 실제 회의 답변을 받아 보기

## 이 PC에 먼저 설치되어 있어야 하는 것

### 필수

1. Git  
   저장소를 내려받을 때 필요합니다.
2. Node.js 20 이상  
   이 프로젝트의 웹 앱을 실행할 때 필요합니다. `Node.js 22 LTS`를 권장합니다.
3. npm  
   Node.js를 설치하면 같이 설치됩니다.
4. Chrome 또는 Edge  
   브라우저 STT/TTS와 마이크 사용 확인이 가장 쉽습니다.

### 선택

1. Python 3  
   로컬 OpenClaw 백엔드 스텁이나 데스크톱 보조 기능을 쓸 때만 필요합니다.
2. Playwright Chromium  
   로컬 OpenClaw 백엔드 스텁에서 브라우저 자동화를 쓸 때 필요합니다. 자동 설치 스크립트가 같이 처리할 수 있습니다.

### 내 PC에 설치되어 있는지 확인하는 방법

아래 명령을 PowerShell에 그대로 넣어 보세요.

```powershell
git --version
node -v
npm -v
py --version
```

버전 숫자가 보이면 설치된 상태입니다.  
명령을 찾을 수 없다고 나오면, 그 프로그램을 먼저 설치해야 합니다.

## 가장 쉬운 시작 방법

### 1. 저장소 받기

```powershell
git clone https://github.com/synuson/OpenclawWeb.git
cd OpenclawWEB
```

### 2. 웹용 자동 준비 실행

아래 명령 하나면 웹 버전에 필요한 기본 준비를 자동으로 합니다.

```powershell
npm run setup:web
```

이 명령이 하는 일:

- `npm install` 실행
- `apps/web/.env.local` 파일이 없으면 자동 생성
- 루트 `.env.local` 파일이 없으면 자동 생성
- 이미 있는 `.env.local` 파일은 덮어쓰지 않음

### 3. 웹 서버 실행

```powershell
npm run dev
```

### 4. 브라우저에서 열기

```text
http://localhost:3000/meeting
```

여기까지 되면 데모 모드로 바로 화면을 볼 수 있습니다.

## 데모 모드와 실제 OpenClaw 연결의 차이

### 데모 모드

`apps/web/.env.local`에 아무 값도 넣지 않아도 됩니다.

이 경우 바로 볼 수 있는 것:

- 회의실 UI
- 브라우저 STT/TTS
- 회의록 생성
- 시장 탭
- 데모 회의 흐름

### 실제 OpenClaw 연결

`apps/web/.env.local`에 자기 OpenClaw 주소를 넣으면 회의 답변이 OpenClaw를 사용합니다.

## 내 OpenClaw를 연결하는 가장 쉬운 방법

### 1. 먼저 `apps/web/.env.local` 파일을 엽니다

웹 버전은 이 파일을 가장 중요하게 읽습니다.

### 2. 아래 예시 중 하나를 넣습니다

#### 예시 A. 커스텀 API 서버

OpenClaw가 `https://example.com/api/chat` 같은 주소를 제공한다면 보통 이렇게 넣습니다.

```env
OPENCLAW_BASE_URL=https://your-openclaw-host/api
OPENCLAW_API_KEY=your_token
```

#### 예시 B. stock OpenClaw gateway

OpenClaw가 `/v1/chat/completions` 또는 `/v1/responses`를 루트에 노출한다면 보통 이렇게 넣습니다.

```env
OPENCLAW_BASE_URL=https://your-openclaw-host
OPENCLAW_API_KEY=your_token
```

중요:  
stock gateway에서는 `OPENCLAW_BASE_URL` 뒤에 `/api`를 붙이면 오히려 안 될 수 있습니다.

### 3. 저장 후 개발 서버를 다시 시작합니다

```powershell
Ctrl + C
npm run dev
```

### 4. 화면에서 연결을 확인합니다

1. `http://localhost:3000/meeting`를 엽니다.
2. 오른쪽 패널에서 `편집` 탭을 엽니다.
3. `OpenClaw 연결` 카드의 `연결 테스트`를 누릅니다.

정상이라면 아래가 보입니다.

- `연결 확인됨`
- 사용 중인 base URL
- 사용 중인 chat 경로

## 내 OpenClaw 주소와 API key를 어디서 찾는가

이 부분이 가장 자주 막히는 지점입니다.  
자기 상황에 맞는 항목만 읽으면 됩니다.

### 1. 내 컴퓨터에서 OpenClaw를 직접 실행하는 경우

보통 가장 쉽습니다.

찾는 방법:

- OpenClaw 실행 창이나 로그에서 `http://127.0.0.1:포트번호`를 찾습니다.
- 설정 파일이나 실행 화면에서 `gateway`, `port`, `chat completions`, `responses` 같은 단어를 찾습니다.
- 이런 경우는 API key가 아예 없을 수도 있습니다.

예:

```env
OPENCLAW_BASE_URL=http://127.0.0.1:18789
```

### 2. 회사, 팀, 서비스에서 제공한 OpenClaw를 쓰는 경우

이 경우는 보통 아래 두 가지를 받아야 합니다.

- Base URL
- API key 또는 토큰

어디서 받는가:

- 관리자 페이지
- 서비스 대시보드
- 팀 문서
- 서버 관리자

### 3. 텔레그램에서만 OpenClaw를 써 본 경우

이 경우는 아직 이 프로젝트에 넣을 HTTP API 정보를 모르는 상태일 가능성이 큽니다.

중요:

- 텔레그램 봇 토큰은 이 프로젝트에 넣는 OpenClaw API key가 아닙니다.
- 텔레그램에서 답변이 잘 나와도, HTTP API 주소가 없으면 이 프로젝트와 바로 연결할 수 없습니다.

즉 먼저 아래를 확인해야 합니다.

- OpenClaw가 HTTP API 주소를 제공하는지
- 그 주소에 토큰이 필요한지

## Bearer 방식이 아닌 인증을 쓰는 경우

어떤 OpenClaw는 `Authorization: Bearer ...` 대신 다른 헤더를 씁니다.  
그럴 때만 아래 값도 추가하세요.

```env
OPENCLAW_API_KEY_HEADER=X-API-Key
OPENCLAW_API_KEY_PREFIX=
OPENCLAW_EXTRA_HEADERS_JSON={"X-Tenant":"demo"}
```

뜻은 아래와 같습니다.

- `OPENCLAW_API_KEY_HEADER`: 토큰을 보낼 헤더 이름
- `OPENCLAW_API_KEY_PREFIX`: 토큰 앞에 붙는 글자
- `OPENCLAW_EXTRA_HEADERS_JSON`: 추가 헤더

잘 모르겠으면 먼저 아래 기본값으로 시작하세요.

```env
OPENCLAW_API_KEY_HEADER=Authorization
OPENCLAW_API_KEY_PREFIX=Bearer 
```

## task API가 없는 OpenClaw도 되는가

회의 답변은 `OPENCLAW_BASE_URL`만 맞아도 붙는 경우가 많습니다.

다만 조사 패널은 `/tasks` 계열 API가 있으면 가장 안정적입니다.  
현재 코드 기준으로는 `/tasks`가 `404`, `405`, `501`처럼  
`이 경로를 지원하지 않음`으로 돌아올 때만 일부 대체 흐름으로 내려갑니다.  
`401`, `403`, `500`은 그대로 실패할 수 있습니다.

## 자주 막히는 문제

### 1. `apps/web/.env.local` 대신 루트 `.env.local`만 만든 경우

웹 버전은 `apps/web/.env.local`을 가장 먼저 확인하세요.  
루트 `.env.local`은 선택 사항입니다.

### 2. 값을 바꿨는데 그대로인 경우

`.env.local`을 바꾼 뒤에는 `npm run dev`를 다시 실행해야 합니다.

### 3. OpenClaw 연결 테스트가 실패하는 경우

아래를 순서대로 확인하세요.

- `OPENCLAW_BASE_URL`이 맞는지
- stock gateway인데 뒤에 `/api`를 잘못 붙인 건 아닌지
- 토큰이 필요한 서버인데 `OPENCLAW_API_KEY`가 비어 있지 않은지
- Bearer 방식이 아닌데 `OPENCLAW_API_KEY_HEADER`, `OPENCLAW_API_KEY_PREFIX`를 안 넣은 건 아닌지
- 서버가 `/chat`, `/v1/chat/completions`, `/v1/responses` 중 하나에 응답하는지
- 텔레그램만 되고 HTTP API는 없는 상태가 아닌지

### 4. 흰 화면이나 CSS/JS 깨짐이 보이는 경우

개발 캐시를 지우고 다시 실행하면 해결되는 경우가 많습니다.

```powershell
Remove-Item -Recurse -Force apps/web/.next
npm run dev
```

## 선택: 로컬 OpenClaw 백엔드 스텁 자동 설치

웹 버전만 쓸 거라면 이 단계는 필요 없습니다.

로컬 FastAPI 스텁과 Playwright까지 준비하려면 아래 명령을 실행하세요.

```powershell
npm run setup:openclaw-backend
```

이 명령이 하는 일:

- `apps/desktop/openclaw-backend/.venv` 생성
- pip 업그레이드
- `requirements.txt` 설치
- Playwright Chromium 설치

## 자주 쓰는 명령

```powershell
npm run setup:web
npm run dev
npm run build:web
npm run typecheck:web
npm run dev:desktop
npm run electron:dev
```

## 고급 문서

필요할 때만 보세요.

- OpenClaw 호환 API 문서: [docs/openclaw-api-compat.md](docs/openclaw-api-compat.md)
- OpenClaw 호환 OpenAPI 문서: [docs/openclaw-api-compat.openapi.yaml](docs/openclaw-api-compat.openapi.yaml)
- 로컬 FastAPI 스텁 백엔드: [apps/desktop/openclaw-backend/README.md](apps/desktop/openclaw-backend/README.md)

## 현재 제한 사항

- 국내 실데이터와 모의투자 실연동은 별도 Kiwoom 호환 프록시가 필요합니다.
- 브라우저 STT/TTS 품질은 브라우저와 OS에 따라 달라집니다.
- OpenClaw task API가 없으면 조사 패널은 일부 경우에만 대체 흐름으로 동작합니다.
- 데스크톱 패키징은 웹 버전보다 설정이 더 많으므로, 먼저 웹 버전부터 성공시키는 편이 좋습니다.
