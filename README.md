<div align="center">

# KCodeCli

**An AI coding assistant for your terminal — 106+ free LLM models, tool calling, file writing.**

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/Node.js-20%2B-brightgreen)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)](#)

```
 ╭────────────────────────────────────────────────╮
 │  >_ KCodeCli (v0.1.0)                          │
 │  model:     auto   /model to change            │
 │  directory: ~/project/my-app                   │
 ╰────────────────────────────────────────────────╯

 Tip: 3 providers · 106 models · server healthy

 > Create a file hello.py that prints Hello World

 • Write file: hello.py
   Allow this command?  [y] yes  [n] no

   ✔ Written: hello.py  (1 lines)
 • Done! hello.py has been created.
```

KCodeCli is a terminal UI (TUI) built with [Ink](https://github.com/vadimdemedes/ink), powered by [FreeLLMAPI](https://github.com/tashfeenahmed/freellmapi) — a self-hosted proxy that stacks free tiers from 12 AI providers into one OpenAI-compatible endpoint.

</div>

---

## Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [Tool Calling](#tool-calling)
- [Slash Commands](#slash-commands)
- [Free Providers](#free-providers)
- [Adding Provider Keys](#adding-provider-keys)
- [Using the API](#using-the-api)
- [How FreeLLMAPI works](#how-freellmapi-works)
- [Supported Providers](#supported-providers)
- [Limitations](#limitations)
- [Contributing](#contributing)
- [Disclaimer](#disclaimer)

## Features

### KCodeCli (Terminal UI)
- **Interactive TUI** — Ink-based chat REPL with slash command autocomplete and arrow-key navigation
- **Tool calling** — LLM runs PowerShell/shell commands and writes files, with explicit `[y] Allow  [n] Skip` approval before every action
- **Agentic loop** — up to 3 chained tool calls per query (read → edit → verify)
- **File writing** — LLM can create/overwrite files via `<write>` tag with user approval
- **106+ models** — auto-routes across free providers; switch with `/model`
- **Slash commands** — `/model`, `/server`, `/keys`, `/models`, `/fallback`, `/apikey`, `/run`, `/exit`
- **Clean output** — strips ANSI codes, braille, and ASCII-art characters from tool output
- **Auto-server** — starts the FreeLLMAPI backend automatically if not running

### FreeLLMAPI (Backend Engine)
- **OpenAI-compatible** — `POST /v1/chat/completions` works with any OpenAI SDK, just change `base_url`
- **Automatic fallover** — 429 / 5xx → cooldown + retry on next model (up to 20 attempts)
- **Per-key rate tracking** — RPM, RPD, TPM, TPD counters per key so the router stays under every cap
- **Encrypted key storage** — AES-256-GCM at rest in SQLite
- **Admin dashboard** — React + Vite UI for key management, fallback chain, analytics, playground
- **Runs anywhere** — Windows, macOS, Linux, Raspberry Pi — ~40 MB RSS at idle

---

## Quick Start

**Prerequisites:** Node.js 20+, npm

```bash
git clone https://github.com/KongGithubDev/KCodeCli.git
cd KCodeCli
npm install

# Generate encryption key
cp .env.example .env
echo "ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")" >> .env

# Build everything
npm run build

# Launch KCodeCli
node cli/dist/index.js
```

KCodeCli auto-starts the FreeLLMAPI server on first launch. Add free provider keys when prompted and start chatting.

---

## Tool Calling

The LLM can use two tools, both requiring `[y/n]` approval:

### `<run>` — Execute a shell command

```
> What CPU am I using?

• Running  Get-CimInstance Win32_Processor | Select-Object -ExpandProperty Name
  Allow this command?  [y] yes  [n] no

  Intel(R) Core(TM) i9-13900K CPU @ 5.80GHz

• You are using an Intel Core i9-13900K processor.
```

- Windows: runs via `powershell.exe` · Unix: `/bin/sh`
- Timeout: 20 seconds
- `fastfetch`, `neofetch`, and ASCII-art tools are blocked

### `<write>` — Write a file

```
> Create number.txt containing the numbers 1 to 100

• Write file: number.txt
  Allow this command?  [y] yes  [n] no

  ✔ Written: number.txt  (100 lines)
• Done! number.txt has been created with numbers 1–100.
```

- First line inside the tag = file path (relative to working directory)
- Remaining lines = file content, UTF-8
- Parent directories are created automatically

### Agentic loop

Each query allows up to **3 rounds** of tool calls, letting the LLM read → edit → verify:

```
> Fix the bug in app.py on line 42

1. <run>Get-Content app.py</run>       ← reads current file
2. <write>app.py
   ...fixed content...</write>         ← writes fixed version
3. <run>python app.py</run>            ← verifies it runs
```

---

## Slash Commands

Type `/` in the chat prompt to open the autocomplete menu. Press `↑↓` to navigate, `Enter` to select, `Esc` to cancel.

| Command | Sub-options | Description |
|---|---|---|
| `/model` | `auto`, `gpt-4o`, `gemini-2.0-flash`, `llama-3.3-70b`, … | Switch the active model |
| `/server` | `start`, `stop`, `status` | Manage the FreeLLMAPI server |
| `/keys` | `list`, `add pollinations anon`, `add groq <key>`, … | Manage provider API keys |
| `/models` | `list` | List all ~106 models grouped by provider |
| `/fallback` | `list`, `sort speed`, `sort quality`, `sort cost` | View/sort the routing chain |
| `/apikey` | `show` | Display the unified API token + base URL |
| `/run` | (example commands) | Run a shell command with approval |
| `/exit` | — | Quit KCodeCli |

---

## Free Providers

No sign-up or credit card needed. Add via `/keys` or CLI:

```bash
node cli/dist/index.js keys add pollinations anon
node cli/dist/index.js keys add llm7 anon
node cli/dist/index.js keys add kilo anon
```

These give access to GPT-class models at no cost. Rate limits apply.

---

## Adding Provider Keys

```bash
node cli/dist/index.js keys add groq        <GROQ_API_KEY>
node cli/dist/index.js keys add openrouter  <OPENROUTER_API_KEY>
node cli/dist/index.js keys add openai      <OPENAI_API_KEY>
node cli/dist/index.js keys add gemini      <GEMINI_API_KEY>
node cli/dist/index.js keys add cerebras    <CEREBRAS_API_KEY>
```

After adding a key, all models on that provider become available through the unified endpoint.

---

## Using the API

The FreeLLMAPI backend is OpenAI-compatible. Any OpenAI SDK works — just change `base_url`:

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:3001/v1",
    api_key="freellmapi-your-unified-key",  # get via /apikey show in KCodeCli
)

resp = client.chat.completions.create(
    model="auto",   # router picks best available; or specify "gemini-2.5-flash" etc.
    messages=[{"role": "user", "content": "Hello!"}],
)
print(resp.choices[0].message.content)
```

```bash
curl http://localhost:3001/v1/chat/completions \
  -H "Authorization: Bearer freellmapi-your-unified-key" \
  -H "Content-Type: application/json" \
  -d '{"model":"auto","messages":[{"role":"user","content":"hi"}]}'
```

Every response includes `X-Routed-Via: <platform>/<model>` so you can see which provider served the request.

---

## How FreeLLMAPI Works

```
KCodeCli TUI  ──▶  FreeLLMAPI (:3001)  ──▶  Router
                                              │
               ┌──────────────────────────────┤
               ▼          ▼          ▼        ▼
            Google       Groq    Cerebras   OpenRouter  …9 more
```

1. Router picks the highest-priority model with a healthy key under its rate limits
2. On 429 / 5xx → cooldown + retry next model (up to 20 attempts)
3. Per-key RPM/RPD/TPM/TPD tracked in SQLite so every free tier cap is respected
4. API keys encrypted AES-256-GCM at rest; decrypted in-memory only per request

---

## Supported Providers

| Provider | Free tier | Notes |
|---|---|---|
| **Pollinations** | ✅ Anonymous | No key needed — add with `anon` |
| **LLM7** | ✅ Anonymous | No key needed — add with `anon` |
| **Kilo** | ✅ Anonymous | No key needed — add with `anon` |
| **Groq** | ✅ Free tier | Fast inference — Llama, Qwen, GPT-OSS |
| **Google Gemini** | ✅ Free tier | Gemini 2.5 Flash/Pro |
| **Cerebras** | ✅ Free tier | Qwen3 235B — very fast |
| **SambaNova** | ✅ Free tier | DeepSeek V3, Llama 4 |
| **Mistral** | ✅ Free tier | Codestral, Devstral |
| **OpenRouter** | ✅ Free tier | 42 free models |
| **Cloudflare** | ✅ Free tier | Llama, Qwen, GLM |
| **GitHub Models** | ✅ Free tier | GPT-4o, GPT-4.1 |
| **Cohere** | ✅ Trial | Command R+ |

---

## Limitations

- **No frontier models** — tops out at Llama 3.3 70B / Gemini 2.5 Pro range. Not GPT-5 / Claude Opus class.
- **Intelligence degrades through the day** — top models have low daily caps; router falls to smaller models as they run out. Resets at UTC midnight.
- **Variable latency** — Cerebras/Groq are fast; others vary.
- **Free tiers change** — providers modify caps without notice. Re-seed scripts in `server/src/scripts/`.
- **Local-first** — no multi-tenant auth. Run for yourself; don't expose to the internet.

---

## Contributing

```bash
npm install
npm run dev      # server :3001 + dashboard :5173 with HMR
npm test         # vitest — 75 tests
```

Good first PRs: add a provider adapter, improve the router, dashboard polish, more client examples.

---

## Disclaimer

**For personal experimentation and learning, not production.** Free tiers are for prototyping — not stable inference backends. Your relationship with each upstream provider is governed by their ToS, which still apply when traffic is proxied. Use responsibly.

---

## License

[MIT](./LICENSE) · Forked from [tashfeenahmed/freellmapi](https://github.com/tashfeenahmed/freellmapi)
