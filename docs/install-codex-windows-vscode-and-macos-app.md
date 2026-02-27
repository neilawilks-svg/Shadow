# Installation Guide: Windows (VS Code Codex Extension) and macOS (Codex App)

This guide is for getting a teammate productive in this repo with Codex.

- Windows path: VS Code + Codex extension in WSL mode (recommended by OpenAI docs).
- macOS path: Codex desktop app (Apple Silicon) in Local mode.

## Repo Prerequisites

Required:
- Node.js 22+
- npm
- OpenAI API key (`OPENAI_API_KEY` in `.env`)

Optional (for Python tests and ingestion scripts):
- Python 3
- Virtual environment support (`python3 -m venv`)

## Repository Setup (Both Platforms)

From project root (`/Users/will.thieme/codex/morgan-virtual-board` on macOS, corresponding clone path on Windows/WSL):

```bash
cp .env.example .env
```

Set at least:
- `OPENAI_API_KEY`

Then install dependencies:

```bash
npm install
```

Bootstrap demo state:

```bash
npm run demo:ready
```

Start app:

```bash
npm run dev
```

Open:
- `http://localhost:3000/meeting`
- `http://localhost:3000/personas`
- `http://localhost:3000/shadow-board`
- `http://localhost:3000/demo`

---

## Windows Track: VS Code + Codex Extension + WSL

### 1. Install WSL and Ubuntu
Run in elevated PowerShell:

```powershell
wsl --install
```

Reboot if prompted, then launch WSL.

### 2. Install VS Code WSL Extension
Install extension:
- [WSL extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-wsl)

### 3. Open the Project from WSL
In WSL terminal:

```bash
cd ~/code
# clone or copy repository here
code .
```

Confirm status bar shows `WSL: <distro>`.

### 4. Install Codex Extension in VS Code
Install from marketplace:
- [Codex IDE Extension Setup](https://developers.openai.com/codex/ide/#extension-setup)
- [Visual Studio Code Marketplace entry](https://marketplace.visualstudio.com/items?itemName=openai.chatgpt)

### 5. Force Codex to Run in WSL Context
Add this to VS Code `settings.json`:

```json
{
  "chatgpt.runCodexInWindowsSubsystemForLinux": true
}
```

Reference:
- [Codex Security: OS-level sandbox (WSL setting)](https://developers.openai.com/codex/security/#os-level-sandbox)
- [Codex Windows Guide](https://developers.openai.com/codex/windows/)

### 6. Sign In to Codex in VS Code
Use ChatGPT account or API key.

Notes:
- API key sign-in can have fewer features than ChatGPT sign-in.
- WSL workspace is the recommended Windows path for reliability/performance.

### 7. Run Project Commands in WSL Terminal

```bash
npm install
npm run demo:ready
npm run dev
```

Validation:

```bash
npm run lint
npm run test
npm run build
npm run smoke:cab
```

Python tests (optional):

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
npm run test:py
```

---

## macOS Track: Codex Desktop App

### 1. Confirm Platform
- Codex app currently requires macOS on Apple Silicon.

References:
- [Codex Quickstart Setup](https://developers.openai.com/codex/quickstart/#setup)
- [Codex App Overview / Getting Started](https://developers.openai.com/codex/app/)

### 2. Install Codex App
Download and install DMG from official docs:
- [Codex app download page](https://developers.openai.com/codex/app/)

### 3. Sign In
Open app and sign in with ChatGPT account or API key.

### 4. Select This Project
Open project folder:
- `/Users/will.thieme/codex/morgan-virtual-board`

Ensure **Local** mode is selected before running tasks.

### 5. Run Project Boot Commands in Codex App Terminal

```bash
npm install
npm run demo:ready
npm run dev
```

Validation:

```bash
npm run lint
npm run test
npm run build
npm run smoke:cab
npm run test:py
```

Python test setup (if needed):

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
npm run test:py
```

---

## Troubleshooting

### Windows: Extension installed but unresponsive
- Ensure VS Code is actually running as WSL remote (`WSL: <distro>` in status bar).
- Restart VS Code after installing the Codex extension.
- Review Windows troubleshooting in OpenAI docs:
  - [Codex Windows Guide](https://developers.openai.com/codex/windows/)

### Windows: Slow performance
- Do not run repo from `/mnt/c/...`.
- Keep repo under Linux home, e.g. `~/code/...`.
- Run:

```powershell
wsl --update
wsl --shutdown
```

### Windows: `codex` command not found in WSL terminal
Even if using extension, CLI can be installed for debugging:

```bash
npm i -g @openai/codex
which codex
```

### macOS: App opens but no project context
- Reopen folder at `/Users/will.thieme/codex/morgan-virtual-board`.
- Confirm Local mode is active.

### Repo runtime issues
- `OPENAI_API_KEY` missing: `/api/demo/health` returns `apiKeyConfigured: false`.
- Port in use: run `DEMO_PORT=3030 npm run demo:ready` and/or start dev with `npm run dev -- --port 3030`.
- Demo seed mismatch: rerun `npm run demo:ready` then inspect `data/demo-ready-shadow-board-report.md`.
