# OpenClaw 로컬 FastAPI 백엔드

이 폴더는 OpenClawWEB이 바로 연결할 수 있는 로컬 OpenClaw 호환 FastAPI 스텁이다.
현재 버전은 아래 4개 엔드포인트를 제공한다.

- `POST /api/chat`
- `POST /api/tasks`
- `GET /api/tasks/{task_id}`
- `GET /api/tasks/{task_id}/artifacts`

편의를 위해 기존 루트 경로도 같이 제공한다.

- `POST /chat`
- `POST /tasks`
- `GET /tasks/{task_id}`
- `GET /tasks/{task_id}/artifacts`

## 포함된 기능

- OpenClawWEB 회의 응답용 `/api/chat`
- 조사 패널용 비동기 task lifecycle 스텁
- `notes`, `screenshot`, `items`가 포함된 artifacts 응답
- 선택형 Bearer 인증
- 허용 도메인 allowlist 검사

## 실행 방법

1. Python 가상환경을 만든다.
2. 아래 명령으로 의존성을 설치한다.

```powershell
cd F:\Dev\OpenclawWEB\apps\desktop\openclaw-backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

3. 서버를 실행한다.

```powershell
python main.py
```

기본 포트는 `18374`다.

- health: `http://127.0.0.1:18374/api/health`
- chat: `http://127.0.0.1:18374/api/chat`

## OpenClawWEB 연결 예시

루트 `.env.local`에 아래처럼 넣으면 된다.

```env
OPENCLAW_BASE_URL=http://127.0.0.1:18374/api
OPENCLAW_CHAT_PATH=/chat
OPENCLAW_TASKS_PATH=/tasks
OPENCLAW_TASK_DETAIL_PATH=/tasks/:id
OPENCLAW_TASK_ARTIFACTS_PATH=/tasks/:id/artifacts
```

토큰 인증을 켜려면 서버 환경변수에 `OPENCLAW_API_TOKEN` 또는 `OPENCLAW_API_KEY`를 넣고,
프론트 `.env.local`에도 같은 토큰을 넣으면 된다.

```env
OPENCLAW_API_KEY=your_token_here
```

## 지원 환경변수

- `PORT`
  - 기본값: `18374`
- `OPENCLAW_API_TOKEN`
  - 설정하면 `Authorization: Bearer <token>`이 필수다.
- `OPENCLAW_API_KEY`
  - `OPENCLAW_API_TOKEN` 대신 사용할 수 있는 동일 의미의 토큰 env
- `OPENCLAW_CHAT_MODEL`
  - `/api/chat` 응답의 `model` 필드에 들어간다.
- `OPENCLAW_ALLOWED_DOMAINS`
  - 쉼표 구분 allowlist
  - 기본값에는 네이버 금융, 로이터, 블룸버그, 업비트, DART 등이 들어 있다.

## 현재 스텁 동작 방식

- `/api/chat`
  - `text`와 `reply`를 모두 반환한다.
  - 내부적으로 `summarizer.py`의 경량 응답 생성기를 사용한다.
- `/api/tasks`
  - 작업을 `queued`로 만들고 메모리에 저장한다.
- `/api/tasks/{task_id}`
  - 시간 경과에 따라 `queued -> running -> succeeded`로 자동 전환된다.
- `/api/tasks/{task_id}/artifacts`
  - `screenshot`, `notes`, `items`를 반환한다.

즉 지금은 "실제 브라우저 자동화 엔진"이 아니라,
OpenClawWEB 프론트 연결 검증용 호환 스텁에 가깝다.

## 다음 확장 포인트

나중에 실제 OpenClaw로 바꾸려면 아래만 교체하면 된다.

- `meeting_chat()` 내부의 `build_meeting_reply()` 호출
- `create_task_record()` 내부의 placeholder task 생성
- `build_artifacts()`의 placeholder screenshot / notes 생성

## 패키징 메모

향후 desktop 배포에서는 이 폴더를 PyInstaller 대상으로 사용할 수 있다.

예시:

```powershell
pyinstaller --onefile main.py
```