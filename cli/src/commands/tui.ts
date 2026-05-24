import React from 'react';
import { render } from 'ink';
import chalk from 'chalk';
import ora from 'ora';
import { spawn, exec } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { type as osType, release as osRelease } from 'os';
import { App, type SystemData, type ExecFn, type RunCmdFn } from '../tui/App.js';
import { getHealth, getModels, getKeys, addKey, deleteKey, getUnifiedKey, getFallback, sortFallback, streamChatCompletion } from '../api.js';
import { findProjectRoot, getServerDistPath, getEnvPath, isServerBuilt } from '../utils/config.js';
import { savePid, getPid, isProcessRunning, removePid } from '../utils/pid.js';

const VERSION        = '0.1.0';
const ANON_PROVIDERS = ['pollinations', 'llm7', 'kilo'];

function getOsName(): string {
  const platform = process.platform;
  const rel      = osRelease();
  const arch     = process.arch === 'x64' ? '64-bit' : process.arch;

  if (platform === 'win32') {
    const build = parseInt(rel.split('.')[2] ?? '0', 10);
    const name  = build >= 22000 ? 'Windows 11' : build >= 10240 ? 'Windows 10' : 'Windows';
    return `${name} ${arch} (build ${build})`;
  }
  if (platform === 'darwin') {
    return `macOS ${rel} ${arch}`;
  }
  return `${osType()} ${rel} ${arch}`;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function isHealthy(): Promise<boolean> {
  return getHealth().then(() => true).catch(() => false);
}

async function waitForHealth(maxMs = 15000): Promise<boolean> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    if (await isHealthy()) return true;
    await new Promise(r => setTimeout(r, 600));
  }
  return false;
}

async function autoStartServer(): Promise<boolean> {
  if (await isHealthy()) return true;

  const root = findProjectRoot();
  if (!root) return false;
  if (!isServerBuilt(root)) return false;

  const envPath = getEnvPath(root);
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) { if (v !== undefined) env[k] = v; }
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
      const idx = line.indexOf('=');
      if (idx > 0 && !line.startsWith('#')) {
        const val = line.slice(idx + 1).trim();
        if (val) env[line.slice(0, idx).trim()] = val;
      }
    }
  }

  const child = spawn('node', [getServerDistPath(root)], {
    cwd: join(root, 'server'),
    env,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
  if (child.pid) savePid(child.pid);

  return waitForHealth(15000);
}

async function autoAddAnonProviders(): Promise<number> {
  let added = 0;
  try {
    const keys  = (await getKeys()) as Array<{ platform: string }>;
    const exist = new Set(keys.map(k => k.platform));
    for (const p of ANON_PROVIDERS) {
      if (!exist.has(p)) {
        await addKey(p, 'anon').catch(() => {});
        added++;
      }
    }
  } catch { /* ignore */ }
  return added;
}

// ─── Main ────────────────────────────────────────────────────────────────────

export async function runTUI(): Promise<void> {
  process.stdout.write('\n');
  const tag = chalk.bold.cyan('KCodeCli');

  // 1. Server
  const s1 = ora(`${tag}  Checking server…`).start();
  const alreadyUp = await isHealthy();
  if (alreadyUp) {
    s1.succeed(chalk.green('Server running'));
  } else {
    s1.text = `${tag}  Starting server…`;
    const ok = await autoStartServer();
    ok ? s1.succeed(chalk.green('Server started  ✓')) : s1.warn(chalk.yellow('Server offline — some features limited'));
  }

  // 2. Providers
  const s2 = ora(`${tag}  Checking providers…`).start();
  const added = await autoAddAnonProviders();
  if (added > 0) {
    s2.succeed(chalk.green(`Added ${added} free provider${added > 1 ? 's' : ''}: ${ANON_PROVIDERS.slice(0, added).join(', ')}`));
  } else {
    s2.succeed(chalk.green('Providers ready'));
  }

  // 3. Load data
  const s3 = ora(`${tag}  Loading…`).start();
  let modelCount = 0;
  let keyCount   = 0;
  let unifiedKey = '';
  const serverStatus: 'healthy' | 'down' = await isHealthy() ? 'healthy' : 'down';
  try { modelCount = ((await getModels()) as unknown[]).length; } catch { /* ignore */ }
  try { keyCount   = ((await getKeys())   as unknown[]).length; } catch { /* ignore */ }
  try {
    const r = await getUnifiedKey();
    unifiedKey = r.apiKey;
    process.env.FREELLMAPI_KEY = unifiedKey;
  } catch { /* ignore */ }
  s3.succeed(chalk.green(`Ready  ·  ${modelCount} models  ·  ${keyCount} providers`));
  process.stdout.write('\n');

  // 4. Build runtime context
  const cwd     = process.cwd();
  const osInfo  = getOsName();
  const shell   = process.env.SHELL || process.env.ComSpec || 'terminal';
  const data: SystemData = { version: VERSION, serverStatus, modelCount, keyCount, unifiedKey, cwd };

  // System context injected as first message so LLM knows the environment
  const SYS_CTX = [
    `You are KCodeCli, an AI coding assistant running in the user's terminal.`,
    ``,
    `Environment (static):`,
    `  OS:        ${osInfo}`,
    `  Shell:     ${shell}`,
    `  Directory: ${cwd}`,
    ``,
    `TOOL: You can run ONE shell command by responding with ONLY this exact format (nothing else):`,
    `<run>command here</run>`,
    ``,
    `RULES FOR USING THE TOOL:`,
    `- For ANY question about live system data (CPU, GPU, RAM, disk, processes, network, files), you MUST use <run>.`,
    `- Do NOT describe what you will do. Do NOT say "I will run...". Just emit the <run> tag immediately.`,
    `- After the tool output is provided to you, give a concise natural-language answer.`,
    `- Never include <run> in your final answer (after seeing tool output).`,
    `- NEVER use fastfetch, neofetch, screenfetch, or any command producing ASCII art / graphical output.`,
    `- NEVER use wmic (deprecated). Use Get-CimInstance instead.`,
    `- Keep commands focused — return only the data needed to answer the question.`,
    `- Use PowerShell commands (shell is powershell.exe, NOT cmd.exe):`,
    `    CPU:     <run>Get-CimInstance Win32_Processor | Select-Object -ExpandProperty Name</run>`,
    `    GPU:     <run>Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM | Format-List</run>`,
    `    RAM:     <run>[math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory/1GB,2)</run>`,
    `    Disk:    <run>Get-PSDrive -PSProvider FileSystem | Select-Object Name,@{N='Used(GB)';E={[math]::Round($_.Used/1GB,1)}},@{N='Free(GB)';E={[math]::Round($_.Free/1GB,1)}} | Format-Table</run>`,
    `    OS:      <run>(Get-ComputerInfo).WindowsProductName</run>`,
    `    IP:      <run>Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.*'} | Select-Object IPAddress,InterfaceAlias | Format-Table</run>`,
    `    Network: <run>Get-NetAdapter | Where-Object Status -eq 'Up' | Select-Object Name,LinkSpeed | Format-Table</run>`,
    `    Node:    <run>node --version</run>`,
    `    Git:     <run>git --version</run>`,
    ``,
    `FILE TOOLS:`,
    `- Read file:    <run>Get-Content 'path/to/file.txt'</run>`,
    `- List files:   <run>Get-ChildItem 'path' | Select-Object Name,Length | Format-Table</run>`,
    `- Delete file:  <run>Remove-Item -Path 'file.txt'</run>`,
    `- Create/write file with specific content — use the <write> tag:`,
    `    <write>`,
    `    relative/or/absolute/path.txt`,
    `    line 1 of content`,
    `    line 2 of content`,
    `    </write>`,
    `  The FIRST line inside <write> is the file path. Remaining lines are the file content.`,
    `  Use this for any request to create, write, or overwrite a file with specific content.`,
    ``,
    `EXAMPLE (create number.txt with 1-100):`,
    `User: สร้างไฟล์ number.txt ที่มีเลข 1-100`,
    `Assistant: <write>`,
    `number.txt`,
    `1`,
    `2`,
    `...`,
    `100`,
    `</write>`,
    ``,
    `EXAMPLE (CPU question):`,
    `User: ฉันใช้ CPU อะไร`,
    `Assistant: <run>Get-CimInstance Win32_Processor | Select-Object -ExpandProperty Name</run>`,
    `[Tool output]: Intel(R) Core(TM) i7-12700H`,
    `Assistant: คุณใช้ Intel Core i7-12700H ครับ`,
  ].join('\n');

  const history: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [
    { role: 'system', content: SYS_CTX },
  ];

  // ── Run a shell command on the local machine ──────────────────────────────
  const SHELL = process.platform === 'win32' ? 'powershell.exe' : undefined;

  // Commands that produce ASCII art / graphical output — block them hard
  const BLOCKED_CMD_RE = /\b(fastfetch|neofetch|screenfetch|archey|pfetch|ufetch|uwufetch|macchina)\b/i;

  // Strip braille + ANSI from tool output (aggressive — ASCII+Thai only)
  const cleanOutput = (raw: string): string =>
    raw
      .replace(/\x1b\[[0-9;]*[mGKHFJA-Za-z]/g, '') // ANSI escape codes
      .replace(/[\u2800-\u28ff]/g, '')               // Braille block (ASCII art)
      .replace(/[\u2580-\u259f]/g, '')               // Block elements
      .replace(/[\u2500-\u257f]/g, '')               // Box drawing characters
      .replace(/[^\x09\x0a\x0d\x20-\x7e\u0e00-\u0e7f\u0020-\u007e]/g, '') // keep ASCII + Thai
      .replace(/[ \t]+$/gm, '')                      // trailing whitespace per line
      .replace(/\n{3,}/g, '\n\n')                   // collapse blank lines
      .trim();

  // Strip only braille from LLM text responses (keep emoji, arrows, CJK etc.)
  const cleanLLMText = (raw: string): string =>
    raw
      .replace(/\x1b\[[0-9;]*[mGKHFJA-Za-z]/g, '') // ANSI escape codes
      .replace(/[\u2800-\u28ff]/g, '')               // Braille block
      .replace(/\n{3,}/g, '\n\n')
      .trim();

  const onRunCmd: RunCmdFn = (command: string): Promise<string> => {
    if (BLOCKED_CMD_RE.test(command)) {
      return Promise.resolve(
        `❖ Command blocked: "${command.split(' ')[0]}" produces graphical ASCII art output.\n` +
        `Use a specific PowerShell command instead (e.g. Get-CimInstance Win32_Processor).`
      );
    }
    return new Promise((resolve) => {
      exec(command, { cwd, timeout: 20000, encoding: 'utf8', shell: SHELL }, (err, stdout, stderr) => {
        const raw = stdout + (stderr ? `\nSTDERR: ${stderr}` : '');
        const out = cleanOutput(raw);
        resolve(err && !out ? `✖ ${err.message}` : out || '(no output)');
      });
    });
  };

  // ── Chat with LLM (supports tool-calling via <run> and <write> tags) ──────
  const TOOL_RE  = /<run>([\s\S]*?)<\/run>/;
  const WRITE_RE = /<write>([\s\S]*?)<\/write>/;

  const onSend = async (
    msg: string,
    onDelta: (d: string) => void,
    onToolRequest: (cmd: string) => Promise<boolean>,
  ) => {
    if (unifiedKey) process.env.FREELLMAPI_KEY = unifiedKey;
    history.push({ role: 'user', content: msg });

    // Agentic loop: up to 3 tool-call rounds
    for (let round = 0; round < 3; round++) {
      let full = '';

      // Buffer entire response — prevents <run> tag characters leaking while streaming
      await streamChatCompletion({ model: 'auto', messages: [...history] }, (delta: string) => {
        full += delta;
      });

      const runMatch   = full.match(TOOL_RE);
      const writeMatch = full.match(WRITE_RE);

      // Pick whichever tool tag appears first
      const runPos   = runMatch   ? full.indexOf('<run>')   : Infinity;
      const writePos = writeMatch ? full.indexOf('<write>') : Infinity;

      if (runPos === Infinity && writePos === Infinity) {
        // No tool call — deliver clean text to UI then break
        const clean = cleanLLMText(full.replace(TOOL_RE, '').replace(WRITE_RE, '').trim());
        onDelta(clean);
        history.push({ role: 'assistant', content: clean });
        break;
      }

      if (writePos < runPos && writeMatch) {
        // ── <write> file ───────────────────────────────────────────────────
        const lines    = writeMatch[1].trim().split('\n');
        const filePath = lines[0].trim();
        const content  = lines.slice(1).join('\n');

        const textBefore = cleanLLMText(full.substring(0, writePos).trim());
        if (textBefore) onDelta(textBefore);
        history.push({ role: 'assistant', content: full });

        const approved = await onToolRequest(`Write file: ${filePath}`);
        if (!approved) {
          history.push({ role: 'user', content: '[User declined the file write]' });
          break;
        }

        let toolOut: string;
        try {
          const absPath = filePath.startsWith('/') || /^[A-Za-z]:/.test(filePath)
            ? filePath
            : join(cwd, filePath);
          mkdirSync(dirname(absPath), { recursive: true });
          writeFileSync(absPath, content, 'utf8');
          const lineCount = content.split('\n').length;
          toolOut = `✔ Written: ${filePath}  (${lineCount} lines)`;
        } catch (err: any) {
          toolOut = `✖ Write failed: ${err.message}`;
        }
        onDelta('\x00TOOL\x00' + toolOut + '\x00/TOOL\x00');
        history.push({ role: 'user', content: `[File written: ${filePath}]` });

      } else if (runMatch) {
        // ── <run> command ──────────────────────────────────────────────────
        const toolCmd    = runMatch[1].trim();
        const textBefore = cleanLLMText(full.substring(0, runPos).trim());
        if (textBefore) onDelta(textBefore);
        history.push({ role: 'assistant', content: full });

        const approved = await onToolRequest(toolCmd);
        if (!approved) {
          history.push({ role: 'user', content: '[User declined the command execution]' });
          break;
        }

        const toolOut = await onRunCmd(toolCmd);
        onDelta('\x00TOOL\x00' + toolOut + '\x00/TOOL\x00');
        history.push({ role: 'user', content: `[Tool output for: ${toolCmd}]\n${toolOut}` });
      }

      // Continue loop to let LLM give a final answer
    }
  };

  // ── Execute slash commands ─────────────────────────────────────────────────
  const onExecCmd: ExecFn = async (cmd: string, sub: string): Promise<string> => {
    if (cmd === '/server') {
      if (sub === 'start') {
        if (await isHealthy()) return '✔ Server is already running';
        const ok = await autoStartServer();
        return ok ? '✔ Server started successfully' : '✖ Failed to start — is server built? Run npm run build';
      }
      if (sub === 'stop') {
        const pid = getPid();
        if (!pid || !isProcessRunning(pid)) return '○ Server is not running';
        try { process.kill(pid, 'SIGTERM'); removePid(); return '✔ Server stopped'; }
        catch (e: any) { return `✖ ${e.message}`; }
      }
      if (sub === 'status') {
        const healthy = await isHealthy();
        const pid = getPid();
        return healthy
          ? `● Server running${pid ? ` (PID ${pid})` : ''}  ·  http://localhost:3001`
          : '○ Server stopped';
      }
    }

    if (cmd === '/keys') {
      if (sub === 'list') {
        const keys = (await getKeys()) as Array<{
          id: number; platform: string; label?: string; maskedKey?: string; status?: string; enabled: boolean;
        }>;
        if (keys.length === 0) return '  No keys configured\n  Use /keys → add to add free providers';
        return keys.map((k, i) =>
          `  ${i + 1}. ${k.platform.padEnd(15)} ${k.enabled ? '●' : '○'}  ${(k.label || k.maskedKey || 'anon').padEnd(12)}  ${k.status ?? ''}`
        ).join('\n');
      }
      if (sub.startsWith('add ')) {
        const parts   = sub.split(' ');
        const platform = parts[1];
        const key      = parts[2] || 'anon';
        if (!platform) return '✖ Usage: /keys → add <provider>';
        if (key === 'anon' && !['pollinations', 'llm7', 'kilo'].includes(platform))
          return `✖ Provider "${platform}" requires a real API key`;
        await addKey(platform, key);
        // refresh unified key
        try { const r = await getUnifiedKey(); unifiedKey = r.apiKey; process.env.FREELLMAPI_KEY = unifiedKey; } catch {}
        return `✔ Added provider: ${platform}`;
      }
    }

    if (cmd === '/models') {
      const models = (await getModels()) as Array<{
        id: number; platform: string; modelId: string; displayName?: string; enabled: boolean;
      }>;
      const byProv: Record<string, string[]> = {};
      for (const m of models) {
        const p = m.platform || 'other';
        (byProv[p] ??= []).push(m.modelId || String(m.id));
      }
      const enabled = models.filter(m => m.enabled).length;
      const lines = Object.entries(byProv)
        .sort(([, a], [, b]) => b.length - a.length)
        .map(([p, ms]) => `  ${p.padEnd(18)} ${ms.length} models`);
      return `Total: ${models.length} models (${enabled} enabled) across ${lines.length} providers\n\n${lines.join('\n')}`;
    }

    if (cmd === '/apikey') {
      if (!unifiedKey) {
        try { const r = await getUnifiedKey(); unifiedKey = r.apiKey; } catch {}
      }
      return unifiedKey
        ? `  Token:    ${unifiedKey}\n  Base URL: http://localhost:3001/v1\n\n  Use in any OpenAI-compatible client.`
        : '✖ No unified key — is server running? Try /server start';
    }

    if (cmd === '/fallback') {
      if (sub === 'list') {
        const chain = (await getFallback()) as Array<{ platform?: string; provider?: string; priority?: number }>;
        return chain.map((f, i) =>
          `  ${i + 1}. ${(f.platform || f.provider || '?').padEnd(18)} priority ${f.priority ?? i}`
        ).join('\n');
      }
      if (sub.startsWith('sort ')) {
        const preset = sub.slice(5).trim();
        await sortFallback(preset);
        return `✔ Fallback chain sorted by: ${preset}`;
      }
    }

    return `Unknown command: ${cmd} ${sub}`;
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const { waitUntilExit } = render(React.createElement(App, { data, onSend, onExecCmd, onRunCmd }));
  await waitUntilExit();
}
