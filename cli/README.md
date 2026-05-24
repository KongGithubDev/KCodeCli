# KCodeCli

> An AI coding assistant for the terminal — powered by [FreeLLMAPI](https://github.com/tashfeenahmed/freellmapi).

```
 ╭────────────────────────────────────────────────╮
 │  >_ KCodeCli (v0.1.0)                          │
 │  model:     auto   /model to change            │
 │  directory: ~/project/my-app                   │
 ╰────────────────────────────────────────────────╯

 Tip: 3 providers · 106 models · server healthy

 > What CPU am I using?

 • Running  Get-CimInstance Win32_Processor | Select-Object -ExpandProperty Name
   Allow this command?  [y] yes  [n] no
```

KCodeCli is a terminal UI (TUI) built with [Ink](https://github.com/vadimdemedes/ink) that wraps the FreeLLMAPI server. It lets you chat with LLMs, run shell commands on your local machine with user approval, and read/write files — all from the terminal.

---

## Features

- **Interactive TUI** — Ink-based chat REPL with slash command autocomplete
- **Tool calling** — LLM can run PowerShell commands and write files, with explicit `[y/n]` approval before execution
- **106+ models** — Routes through free providers (Pollinations, LLM7, Kilo) by default; add any provider key for more
- **Server management** — Auto-starts the FreeLLMAPI server if not running
- **Agentic loop** — Up to 3 chained tool calls per query (read file → edit → confirm result)
- **Clean output** — Strips ANSI codes, braille art, and graphical characters from tool output
- **Slash commands** — `/model`, `/server`, `/keys`, `/models`, `/fallback`, `/apikey`, `/run`, `/exit`

---

## Requirements

- Node.js ≥ 18
- FreeLLMAPI server built (`npm run build` from the monorepo root)
- Windows (PowerShell), macOS, or Linux

---

## Quick Start

```bash
# From monorepo root — build everything
npm install
npm run build

# Launch KCodeCli (starts server automatically if not running)
node cli/dist/index.js
```

Or with the bin alias after installing globally:

```bash
npm install -g .
freellmapi
```

---

## TUI Slash Commands

Type `/` in the prompt to see the autocomplete menu. Press `↑↓` to navigate, `Enter` to select, `Esc` to cancel.

| Command | Sub-options | Description |
|---|---|---|
| `/model` | `auto`, `gpt-4o`, `gemini-2.0-flash`, … | Switch the active model |
| `/server` | `start`, `stop`, `status` | Manage the FreeLLMAPI server |
| `/keys` | `list`, `add pollinations anon`, `add groq <key>`, … | Manage provider API keys |
| `/models` | `list` | List all ~106 models grouped by provider |
| `/fallback` | `list`, `sort speed`, `sort quality`, `sort cost` | View/sort the routing chain |
| `/apikey` | `show` | Display the unified API token and base URL |
| `/run` | (example commands) | Run a PowerShell command with approval |
| `/exit` | — | Quit KCodeCli |

---

## Tool Calling

The LLM can use two special tags in its response. Both require explicit user approval (`[y] Allow  [n] Skip`) before executing.

### `<run>` — Execute a shell command

```
<run>Get-CimInstance Win32_Processor | Select-Object -ExpandProperty Name</run>
```

- Runs via `powershell.exe` on Windows, `/bin/sh` on Unix
- Timeout: 20 seconds
- Output is sanitised (ANSI codes, braille, box-drawing characters stripped)
- `fastfetch`, `neofetch`, and other ASCII-art tools are blocked

### `<write>` — Write a file

```
<write>
path/to/file.txt
line 1
line 2
line 3
</write>
```

- First line inside the tag = file path (relative to the working directory)
- Remaining lines = file content
- Parent directories are created automatically
- File is UTF-8 encoded

### Agentic loop

Each user message allows up to **3 rounds** of tool calls. This lets the LLM:
1. Read a file with `<run>Get-Content file</run>`
2. Write an updated version with `<write>…</write>`
3. Verify the result with another `<run>`

---

## Non-interactive Commands

KCodeCli also exposes traditional CLI sub-commands (no TUI):

```bash
# Server
freellmapi server start
freellmapi server stop
freellmapi server status

# API keys
freellmapi keys list
freellmapi keys add <platform> <key> [--label <label>]
freellmapi keys remove <id>

# Models
freellmapi models list

# Fallback routing chain
freellmapi fallback list
freellmapi fallback sort <intelligence|speed|budget>

# One-off chat (non-interactive)
freellmapi chat "Hello, what can you do?" --stream
freellmapi chat "Summarize this" --file ./doc.txt --model gemini-2.5-flash

# Unified API token
freellmapi apikey show

# .env configuration
freellmapi config show
freellmapi config set PORT 3002
```

---

## Free Providers (no API key required)

Add these to get started immediately:

```bash
freellmapi keys add pollinations anon
freellmapi keys add llm7 anon
freellmapi keys add kilo anon
```

These give access to GPT-class models at no cost. Rate limits apply.

---

## Adding Provider Keys

```bash
freellmapi keys add groq        <GROQ_API_KEY>
freellmapi keys add openrouter  <OPENROUTER_API_KEY>
freellmapi keys add openai      <OPENAI_API_KEY>
freellmapi keys add gemini      <GEMINI_API_KEY>
freellmapi keys add cerebras    <CEREBRAS_API_KEY>
```

After adding a key, all 106+ models on that provider become available through the unified endpoint.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `FREELLMAPI_URL` | `http://localhost:3001` | FreeLLMAPI server URL |
| `FREELLMAPI_KEY` | _(auto-fetched)_ | Unified bearer token |

---

## Project Structure

```
cli/
├── src/
│   ├── index.ts          # CLI entry point (Commander)
│   ├── api.ts            # FreeLLMAPI HTTP client functions
│   ├── commands/
│   │   ├── tui.ts        # KCodeCli TUI bootstrap + onSend / tool-calling logic
│   │   ├── server.ts     # server start/stop/status
│   │   ├── keys.ts       # key management
│   │   ├── models.ts     # model listing
│   │   ├── fallback.ts   # routing chain management
│   │   ├── chat.ts       # non-interactive chat command
│   │   └── config.ts     # .env show/set
│   ├── tui/
│   │   └── App.tsx       # Ink TUI component (chat screen, tool approval UI)
│   └── utils/
│       ├── config.ts     # project root, paths, server build detection
│       └── pid.ts        # PID file management for server process
├── package.json
└── tsconfig.json
```

---

## Development

```bash
# Watch mode (no build needed)
npm run dev -w cli

# Build
npm run build -w cli

# Run built binary
node cli/dist/index.js
```
