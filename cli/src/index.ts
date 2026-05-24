#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { startServer, stopServer, serverStatus } from './commands/server.js';
import { listKeys, addKeyCmd, removeKeyCmd, toggleKeyCmd } from './commands/keys.js';
import { listModels } from './commands/models.js';
import { showFallback, sortFallbackCmd } from './commands/fallback.js';
import { chatCmd } from './commands/chat.js';
import { showConfig, setConfig, showUnifiedKey, rotateUnifiedKey } from './commands/config.js';
import { runTUI } from './commands/tui.js';

const program = new Command();

program
  .name('freellmapi')
  .description('FreeLLMAPI CLI — manage keys, models, routing, and chat')
  .version('0.1.0');

// Server commands
const server = program.command('server').description('Manage the FreeLLMAPI server');

server
  .command('start')
  .description('Start the server in production mode')
  .action(() => startServer(false));

server
  .command('dev')
  .description('Start the server in development mode (tsx watch)')
  .action(() => startServer(true));

server
  .command('stop')
  .description('Stop the running server')
  .action(stopServer);

server
  .command('status')
  .description('Check server status')
  .action(serverStatus);

// Keys commands
const keys = program.command('keys').description('Manage provider API keys');

keys
  .command('list')
  .description('List all configured keys')
  .action(listKeys);

keys
  .command('add')
  .description('Add a new provider API key')
  .argument('<platform>', 'Provider platform (e.g. google, groq, openrouter)')
  .argument('<key>', 'The API key')
  .option('-l, --label <label>', 'Optional label')
  .action((platform: string, key: string, opts: { label?: string }) => addKeyCmd(platform, key, opts.label));

keys
  .command('remove')
  .description('Remove a key by ID')
  .argument('<id>', 'Key ID')
  .action(removeKeyCmd);

keys
  .command('enable')
  .description('Enable a key by ID')
  .argument('<id>', 'Key ID')
  .action((id: string) => toggleKeyCmd(id, true));

keys
  .command('disable')
  .description('Disable a key by ID')
  .argument('<id>', 'Key ID')
  .action((id: string) => toggleKeyCmd(id, false));

// Models commands
const models = program.command('models').description('Inspect available models');

models
  .command('list')
  .description('List all models and availability')
  .action(listModels);

// Fallback commands
const fallback = program.command('fallback').description('Manage routing fallback chain');

fallback
  .command('list')
  .description('Show the fallback chain with priorities & penalties')
  .action(showFallback);

fallback
  .command('sort')
  .description('Re-sort fallback chain by a preset')
  .argument('<preset>', 'intelligence | speed | budget')
  .action(sortFallbackCmd);

// Chat command
program
  .command('chat')
  .description('Send a chat completion through the router')
  .argument('<prompt>', 'Your prompt')
  .option('-m, --model <model>', 'Model to use (default: auto)', 'auto')
  .option('-s, --stream', 'Stream the response')
  .option('--system <system>', 'System prompt')
  .option('-f, --file <file>', 'Attach a file as context')
  .action((prompt: string, opts: { model?: string; stream?: boolean; system?: string; file?: string }) => {
    chatCmd(prompt, opts);
  });

// Config commands
const config = program.command('config').description('Manage project configuration');

config
  .command('show')
  .description('Show current .env configuration')
  .action(showConfig);

config
  .command('set')
  .description('Set an environment variable in .env')
  .argument('<key>', 'Variable name')
  .argument('<value>', 'Variable value')
  .action(setConfig);

// Unified API key (the freellmapi-... token used by clients)
const apikey = program.command('apikey').description('Manage the unified FreeLLMAPI bearer token');

apikey
  .command('show')
  .description('Show your current unified API key (requires server to be running)')
  .action(showUnifiedKey);

apikey
  .command('rotate')
  .description('Generate a new unified API key (invalidates old one)')
  .action(rotateUnifiedKey);

// Interactive TUI — Claude Code style welcome screen + chat REPL
program
  .command('tui')
  .description('Launch interactive TUI (welcome screen + chat REPL)')
  .action(runTUI);

// Default: no args → launch KCodeCli TUI
if (process.argv.length <= 2) {
  runTUI().catch(err => { console.error(err); process.exit(1); });
} else {
  program.parse();
}
