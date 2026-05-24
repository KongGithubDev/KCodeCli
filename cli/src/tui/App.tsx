import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import TextInput from 'ink-text-input';
import { homedir } from 'os';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SystemData {
  version: string;
  serverStatus: 'healthy' | 'down';
  modelCount: number;
  keyCount: number;
  unifiedKey: string;
  cwd: string;
}

export type ExecFn   = (cmd: string, sub: string) => Promise<string>;
export type RunCmdFn = (command: string) => Promise<string>;
export type ToolRequestFn = (cmd: string) => Promise<boolean>;
export type SendFn = (msg: string, onDelta: (d: string) => void, onToolRequest: ToolRequestFn) => Promise<void>;

type Message  = { role: 'user' | 'assistant' | 'error' | 'system' | 'tool'; content: string };
type AppMode  = 'input' | 'submenu' | 'executing' | 'tool_confirm' | 'streaming';

const APP_NAME  = 'KCodeCli';
const BOX_WIDTH = 50;
const DIR_MAX   = BOX_WIDTH - 18;  // border(2) + paddingX*2(4) + "directory: "(11) + margin(1)

// ─── Slash command definitions with sub-menus ────────────────────────────────

interface SubItem { label: string; sub: string; }

const SLASH_CMDS: [string, string][] = [
  ['/model',    'choose what model to use'],
  ['/server',   'start · stop · status'],
  ['/keys',     'list · add anon providers · remove'],
  ['/models',   'list all ~106 available models'],
  ['/fallback', 'list · sort routing chain'],
  ['/apikey',   'show unified API token'],
  ['/run',      'run a shell command on this machine'],
  ['/exit',     'quit KCodeCli'],
];

const SUB_MENUS: Record<string, SubItem[]> = {
  '/model': [
    { label: 'auto            — let KCodeCli pick the best', sub: 'auto' },
    { label: 'gpt-4o          — OpenAI GPT-4o', sub: 'gpt-4o' },
    { label: 'gpt-4o-mini     — OpenAI GPT-4o Mini (fast)', sub: 'gpt-4o-mini' },
    { label: 'gemini-2.0-flash — Google Gemini 2.0 Flash', sub: 'gemini-2.0-flash' },
    { label: 'llama-3.3-70b   — Meta Llama 3.3 70B', sub: 'llama-3.3-70b' },
    { label: 'mistral-large   — Mistral Large', sub: 'mistral-large' },
    { label: 'deepseek-chat   — DeepSeek Chat', sub: 'deepseek-chat' },
    { label: 'qwen-72b        — Alibaba Qwen 72B', sub: 'qwen-72b' },
  ],
  '/server': [
    { label: 'start  — start the FreeLLMAPI server', sub: 'start' },
    { label: 'stop   — stop the running server',     sub: 'stop'  },
    { label: 'status — check server health',         sub: 'status'},
  ],
  '/keys': [
    { label: 'list              — show all configured keys',      sub: 'list' },
    { label: 'add pollinations  — free anonymous provider',       sub: 'add pollinations anon' },
    { label: 'add llm7          — free anonymous provider',       sub: 'add llm7 anon' },
    { label: 'add kilo          — free anonymous provider',       sub: 'add kilo anon' },
    { label: 'add groq <key>    — Groq (free tier available)',    sub: 'add groq' },
    { label: 'add openrouter <key> — OpenRouter aggregator',     sub: 'add openrouter' },
  ],
  '/models': [
    { label: 'list — show all ~106 models by provider', sub: 'list' },
  ],
  '/fallback': [
    { label: 'list         — show current routing chain',  sub: 'list' },
    { label: 'sort speed   — prioritize fastest models',   sub: 'sort speed' },
    { label: 'sort quality — prioritize best quality',     sub: 'sort quality' },
    { label: 'sort cost    — prioritize free/cheapest',    sub: 'sort cost' },
  ],
  '/apikey': [
    { label: 'show — display unified API token + base URL', sub: 'show' },
  ],
};

const RUN_EXAMPLES: SubItem[] = [
  { label: 'CPU name      — Get-CimInstance Win32_Processor',   sub: 'Get-CimInstance Win32_Processor | Select-Object -ExpandProperty Name' },
  { label: 'GPU name      — Get-CimInstance Win32_VideoController', sub: 'Get-CimInstance Win32_VideoController | Select-Object Name | Format-List' },
  { label: 'RAM size      — physical memory total',             sub: 'Get-CimInstance Win32_PhysicalMemory | Measure-Object -Property Capacity -Sum | Select-Object -ExpandProperty Sum' },
  { label: 'disk space    — drive usage',                       sub: 'Get-PSDrive -PSProvider FileSystem | Select-Object Name,Used,Free | Format-Table' },
  { label: 'dir           — list current directory',            sub: 'dir' },
  { label: 'node version  — node --version',                    sub: 'node --version' },
  { label: 'ipconfig      — network configuration',             sub: 'ipconfig' },
  { label: 'processes     — running processes (top 10)',         sub: 'Get-Process | Sort-Object CPU -Descending | Select-Object -First 10 Name,CPU,WorkingSet | Format-Table' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dirLabel(cwd: string): string {
  const home = homedir();
  let rel = cwd.startsWith(home) ? '~' + cwd.slice(home.length).replace(/\\/g, '/') : cwd;
  if (rel.length > DIR_MAX) rel = '…' + rel.slice(-(DIR_MAX - 1));
  return rel || '~';
}

// ─── SubMenu component ────────────────────────────────────────────────────────

function SubMenu({
  cmd, items, model, onSelect, onCancel,
}: {
  cmd: string;
  items: SubItem[];
  model: string;
  onSelect: (item: SubItem) => void;
  onCancel: () => void;
}) {
  const [sel, setSel] = useState(0);

  useInput((_ch, key) => {
    if (key.upArrow)   setSel(s => Math.max(0, s - 1));
    if (key.downArrow) setSel(s => Math.min(items.length - 1, s + 1));
    if (key.return)    onSelect(items[sel]);
    if (key.escape)    onCancel();
  });

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box marginBottom={0}>
        <Text dimColor>{'> '}</Text>
        <Text color="cyan">{cmd}</Text>
      </Box>
      <Box flexDirection="column" marginLeft={2} marginTop={1}>
        {items.map((item, i) => (
          <Box key={item.sub}>
            <Text color={i === sel ? 'cyan' : 'white'} bold={i === sel}>
              {i === sel ? '▶ ' : '  '}
            </Text>
            <Text color={i === sel ? 'cyan' : 'white'}
                  dimColor={i !== sel}>
              {item.label}
              {cmd === '/model' && item.sub === model ? ' ← current' : ''}
            </Text>
          </Box>
        ))}
      </Box>
      <Box marginLeft={2} marginTop={1}>
        <Text dimColor>↑↓ navigate  ·  Enter select  ·  Esc cancel</Text>
      </Box>
    </Box>
  );
}

// ─── App ─────────────────────────────────────────────────────────────────────

export function App({
  data,
  onSend,
  onExecCmd,
  onRunCmd,
}: {
  data: SystemData;
  onSend:    SendFn;
  onExecCmd: ExecFn;
  onRunCmd:  RunCmdFn;
}) {
  const { exit }  = useApp();
  const [input,       setInput]      = useState('');
  const [messages,    setMessages]   = useState<Message[]>([]);
  const [streaming,   setStreaming]  = useState(false);
  const [liveText,    setLiveText]   = useState('');
  const [model,       setModel]      = useState('auto');
  const [mode,        setMode]       = useState<AppMode>('input');
  const [subCmd,      setSubCmd]     = useState('');
  const [pendingCmd,  setPendingCmd] = useState('');
  const [elapsed,     setElapsed]    = useState(0);
  const pendingResolveRef = useRef<((v: boolean) => void) | null>(null);
  const timerRef          = useRef<ReturnType<typeof setInterval> | null>(null);

  const dir = dirLabel(data.cwd);

  // Elapsed timer while executing or streaming
  useEffect(() => {
    const active = mode === 'executing' || mode === 'streaming' || streaming;
    if (active) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
    return () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  }, [mode, streaming]);

  // Slash autocomplete while typing
  const slashMatches = (mode === 'input' && input.startsWith('/') && !input.includes(' '))
    ? SLASH_CMDS.filter(([c]) => c.startsWith(input.toLowerCase()))
    : [];

  useInput((ch, key) => {
    if (key.ctrl && ch === 'c') exit();
    // Tool approval keys
    if (mode === 'tool_confirm') {
      if (key.return || ch === 'y' || ch === 'Y') {
        pendingResolveRef.current?.(true);
        pendingResolveRef.current = null;
        setMode('executing');
      }
      if (ch === 'n' || ch === 'N' || key.escape) {
        pendingResolveRef.current?.(false);
        pendingResolveRef.current = null;
        setMode('input');
      }
    }
  });

  // Called when user selects from sub-menu
  const onSubSelect = useCallback(async (item: SubItem) => {
    setMode('executing');
    const fullCmd = `${subCmd} ${item.sub}`.trim();

    if (subCmd === '/model') {
      setModel(item.sub);
      setMessages(prev => [...prev,
        { role: 'user',   content: fullCmd },
        { role: 'system', content: `✔ Model changed to: ${item.sub}` },
      ]);
      setMode('input');
      return;
    }

    setMessages(prev => [...prev, { role: 'user', content: fullCmd }]);
    try {
      const result = await onExecCmd(subCmd, item.sub);
      setMessages(prev => [...prev, { role: 'system', content: result }]);
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'error', content: String(err?.message ?? err) }]);
    }
    setMode('input');
  }, [subCmd, onExecCmd]);

  const submit = useCallback(async (value: string) => {
    const text = value.trim();
    if (!text) return;
    if (text === '/exit' || text === '/quit') { exit(); return; }

    setInput('');

    // Slash command handling
    if (text.startsWith('/')) {
      const parts = text.split(/\s+/);
      const cmd   = parts[0].toLowerCase();
      const arg   = parts.slice(1).join(' ');

      // /run with no arg → show examples sub-menu
      if (cmd === '/run' && !arg) {
        setSubCmd('/run');
        setMode('submenu');
        return;
      }

      // /run with arg → execute immediately
      if (cmd === '/run' && arg) {
        setMessages(prev => [...prev,
          { role: 'user',  content: text },
          { role: 'tool',  content: `⚡ ${arg}` },
        ]);
        setMode('executing');
        try {
          const out = await onRunCmd(arg);
          setMessages(prev => [...prev, { role: 'tool', content: out }]);
        } catch (err: any) {
          setMessages(prev => [...prev, { role: 'error', content: String(err?.message ?? err) }]);
        }
        setMode('input');
        return;
      }

      // Has sub-menu and no arg → show sub-menu
      if (SUB_MENUS[cmd] && !arg) {
        setSubCmd(cmd);
        setMode('submenu');
        return;
      }

      // Has arg or no sub-menu → execute directly
      setSubCmd('');
      setMessages(prev => [...prev, { role: 'user', content: text }]);
      setMode('executing');
      try {
        const result = await onExecCmd(cmd, arg);
        setMessages(prev => [...prev, { role: 'system', content: result }]);
      } catch (err: any) {
        setMessages(prev => [...prev, { role: 'error', content: String(err?.message ?? err) }]);
      }
      setMode('input');
      return;
    }

    // Normal chat → send to LLM
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setStreaming(true);
    setLiveText('');
    let full = '';

    // onToolRequest: called by onSend when LLM wants to run a command
    const onToolRequest: ToolRequestFn = (cmd: string): Promise<boolean> =>
      new Promise(resolve => {
        setStreaming(false);
        setLiveText('');
        // Commit whatever text was streamed so far as assistant message
        if (full.trim()) {
          setMessages(prev => [...prev, { role: 'assistant', content: full.trim() }]);
          full = '';
        }
        setPendingCmd(cmd);
        setMode('tool_confirm');
        pendingResolveRef.current = resolve;
      });

    try {
      await onSend(text, (delta: string) => {
        // Parse TOOL markers — route tool output to 'tool' messages, rest to liveText
        if (delta.includes('\x00TOOL\x00')) {
          const toolOut = delta.replace(/\x00TOOL\x00|\x00\/TOOL\x00/g, '').trim();
          if (toolOut) setMessages(prev => [...prev, { role: 'tool', content: toolOut }]);
          // Reset liveText — next delta will be LLM's final answer
          full = '';
          setLiveText('');
          setMode('streaming' as AppMode);
          setStreaming(true);
        } else {
          full += delta;
          setLiveText(full);
        }
      }, onToolRequest);
      if (full.trim()) {
        setMessages(prev => [...prev, { role: 'assistant', content: full.trim() }]);
      }
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'error', content: String(err?.message ?? err) }]);
    } finally {
      setStreaming(false);
      setLiveText('');
      setMode('input');
      setPendingCmd('');
    }
  }, [onSend, onExecCmd, exit]);

  const tip = data.keyCount > 0
    ? `${data.keyCount} providers · ${data.modelCount} models · server ${data.serverStatus}`
    : `Free providers ready: pollinations · llm7 · kilo · ${data.modelCount} models`;

  return (
    <Box flexDirection="column" paddingX={1}>

      {/* Header */}
      <Box borderStyle="round" borderColor="white" paddingX={2}
           marginBottom={1} width={BOX_WIDTH}>
        <Box flexDirection="column">
          <Box><Text dimColor>{'>_ '}</Text><Text bold>{APP_NAME} </Text><Text dimColor>(v{data.version})</Text></Box>
          <Box>
            <Text dimColor>{'model:     '}</Text>
            <Text bold>{model}   </Text>
            <Text color="cyan">/model</Text>
            <Text dimColor> to change</Text>
          </Box>
          <Box><Text dimColor>{'directory: '}</Text><Text bold>{dir}</Text></Box>
        </Box>
      </Box>

      {/* Tip */}
      <Box marginBottom={1}>
        <Text bold>Tip: </Text><Text dimColor>{tip}</Text>
      </Box>

      {/* Message history */}
      {messages.map((m, i) => (
        <Box key={i} flexDirection="column" marginBottom={1}>
          {m.role === 'user' && (
            <Box><Text dimColor>{'> '}</Text><Text wrap="wrap">{m.content}</Text></Box>
          )}
          {m.role === 'assistant' && (
            <Box><Text dimColor>{'• '}</Text><Text wrap="wrap">{m.content}</Text></Box>
          )}
          {m.role === 'error' && (
            <Box><Text color="red">{'✖ '}</Text><Text color="red" wrap="wrap">{m.content}</Text></Box>
          )}
          {m.role === 'system' && (
            <Box flexDirection="column" marginLeft={2}>
              {m.content.split('\n').map((line, li) => (
                <Text key={li} color="yellow">{line}</Text>
              ))}
            </Box>
          )}
          {m.role === 'tool' && (
            <Box flexDirection="column" marginLeft={2}>
              {m.content.split('\n').slice(0, 30).map((line, li) => (
                <Text key={li} color="green" dimColor={!line.startsWith('⚡')}>{line}</Text>
              ))}
              {m.content.split('\n').length > 30 && (
                <Text dimColor>  … ({m.content.split('\n').length - 30} more lines)</Text>
              )}
            </Box>
          )}
        </Box>
      ))}

      {/* Streaming */}
      {streaming && (
        <Box marginBottom={1}>
          <Text dimColor>{'• '}</Text>
          <Text wrap="wrap">{liveText}</Text><Text color="cyan">▌</Text>
        </Box>
      )}

      {/* Tool confirmation — ask user before running */}
      {mode === 'tool_confirm' && (
        <Box flexDirection="column" marginBottom={1}>
          <Box>
            <Text color="cyan">{'• Running '}</Text>
            <Text color="cyan" bold>{pendingCmd}</Text>
          </Box>
          <Box marginTop={1} marginLeft={2}>
            <Text dimColor>Allow this command?  </Text>
            <Text color="green" bold>{'[y] '}</Text>
            <Text dimColor>yes  </Text>
            <Text color="red" bold>{'[n] '}</Text>
            <Text dimColor>no</Text>
          </Box>
        </Box>
      )}

      {/* Working timer — shown while executing a tool or streaming */}
      {(mode === 'executing' || streaming) && (
        <Box marginBottom={1}>
          <Text color="cyan">{'• '}</Text>
          <Text dimColor>Working ({elapsed}s{mode === 'executing' ? ' • esc to interrupt' : ''})</Text>
        </Box>
      )}

      {/* Sub-menu */}
      {mode === 'submenu' && subCmd === '/run' && (
        <SubMenu
          cmd="/run"
          items={RUN_EXAMPLES}
          model={model}
          onSelect={async (item) => {
            setMode('executing');
            setMessages(prev => [...prev,
              { role: 'user', content: `/run ${item.sub}` },
              { role: 'tool', content: `⚡ ${item.sub}` },
            ]);
            setSubCmd('');
            try {
              const out = await onRunCmd(item.sub);
              setMessages(prev => [...prev, { role: 'tool', content: out }]);
            } catch (err: any) {
              setMessages(prev => [...prev, { role: 'error', content: String(err?.message ?? err) }]);
            }
            setMode('input');
          }}
          onCancel={() => { setMode('input'); setSubCmd(''); }}
        />
      )}
      {mode === 'submenu' && subCmd !== '/run' && SUB_MENUS[subCmd] && (
        <SubMenu
          cmd={subCmd}
          items={SUB_MENUS[subCmd]}
          model={model}
          onSelect={onSubSelect}
          onCancel={() => { setMode('input'); setSubCmd(''); }}
        />
      )}

      {/* Input */}
      {mode === 'input' && (
        <Box>
          <Text dimColor color={streaming ? 'gray' : 'white'}>{'> '}</Text>
          <TextInput
            value={input}
            onChange={setInput}
            onSubmit={submit}
            placeholder="Send a message  (/  for commands)"
          />
        </Box>
      )}

      {/* Slash autocomplete */}
      {slashMatches.length > 0 && slashMatches.length < SLASH_CMDS.length && (
        <Box flexDirection="column" marginTop={1} marginLeft={2}>
          {slashMatches.map(([cmd, desc]) => (
            <Box key={cmd}>
              <Text color="cyan">{cmd.padEnd(12)}</Text>
              <Text dimColor>{desc}</Text>
            </Box>
          ))}
        </Box>
      )}

      {/* Footer */}
      <Box marginTop={1}>
        <Text dimColor>{model}</Text>
        <Text dimColor> · </Text>
        <Text dimColor>{dir}</Text>
      </Box>

    </Box>
  );
}
