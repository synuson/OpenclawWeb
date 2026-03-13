# OpenClaw Local Backend

This folder is the future PyInstaller source tree for the desktop edition.

Current state:
- `main.py` exposes a local FastAPI stub for `/tasks` and `/artifacts`.
- `browser.py` returns placeholder artifacts until a real Playwright workflow is bundled.
- `summarizer.py` keeps a lightweight local summary path for development.

Expected packaging command later:

```bash
pyinstaller --onefile main.py
```
