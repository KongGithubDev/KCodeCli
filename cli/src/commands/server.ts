import { spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { findProjectRoot, isServerBuilt, getServerDistPath, getServerSrcPath, getEnvPath } from '../utils/config.js';
import { savePid, getPid, removePid, isProcessRunning } from '../utils/pid.js';

function getApiHealth(): Promise<boolean> {
  const base = process.env.FREELLMAPI_URL ?? 'http://localhost:3001';
  return fetch(`${base}/api/ping`).then(() => true).catch(() => false);
}

export async function startServer(dev = false): Promise<void> {
  const root = findProjectRoot();
  if (!root) {
    console.error(chalk.red('Error: Could not find freellmapi project root.'));
    console.error(chalk.gray('Make sure you run this command from inside the freellmapi repo.'));
    process.exit(1);
  }

  const existingPid = getPid();
  if (existingPid && isProcessRunning(existingPid)) {
    const healthy = await getApiHealth();
    if (healthy) {
      console.log(chalk.yellow('Server is already running.') + chalk.gray(` (PID ${existingPid})`));
      return;
    }
  }

  const envPath = getEnvPath(root);
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) env[k] = v;
  }
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const idx = line.indexOf('=');
      if (idx > 0 && !line.startsWith('#')) {
        const val = line.slice(idx + 1).trim();
        if (val) env[line.slice(0, idx).trim()] = val;
      }
    }
  }

  const spinner = ora(dev ? 'Starting dev server...' : 'Starting server...').start();
  const command = dev ? 'npx' : 'node';
  const args = dev ? ['tsx', 'watch', getServerSrcPath(root)] : [getServerDistPath(root)];
  const cwd = join(root, 'server');

  if (!dev && !isServerBuilt(root)) {
    spinner.fail(chalk.red('Server not built. Run `npm run build` first, or use `--dev`.'));
    process.exit(1);
  }

  const child = spawn(command, args, {
    cwd,
    env,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });

  child.unref();

  await new Promise(r => setTimeout(r, 2000));
  const healthy = await getApiHealth();
  if (healthy) {
    savePid(child.pid!);
    spinner.succeed(chalk.green(`Server started on http://localhost:${env.PORT ?? 3001}`) + chalk.gray(` (PID ${child.pid})`));
  } else {
    spinner.fail(chalk.red('Server started but health check failed. Check logs.'));
  }
}

export async function stopServer(): Promise<void> {
  const pid = getPid();
  if (!pid) {
    console.log(chalk.yellow('No running server found (no PID file).'));
    return;
  }

  if (!isProcessRunning(pid)) {
    console.log(chalk.yellow(`Server PID ${pid} is not running.`));
    removePid();
    return;
  }

  const spinner = ora(`Stopping server (PID ${pid})...`).start();
  try {
    process.kill(pid, 'SIGTERM');
    for (let i = 0; i < 50; i++) {
      await new Promise(r => setTimeout(r, 100));
      if (!isProcessRunning(pid)) break;
    }
    if (isProcessRunning(pid)) {
      process.kill(pid, 'SIGKILL');
    }
    removePid();
    spinner.succeed(chalk.green('Server stopped.'));
  } catch (err: any) {
    spinner.fail(chalk.red(`Failed to stop server: ${err.message}`));
    process.exit(1);
  }
}

export async function serverStatus(): Promise<void> {
  const pid = getPid();
  if (!pid) {
    console.log(chalk.gray('Server status: ') + chalk.red('not running') + chalk.gray(' (no PID file)'));
    const healthy = await getApiHealth();
    if (healthy) {
      console.log(chalk.yellow('However, a server is responding at the configured URL.'));
    }
    return;
  }

  const running = isProcessRunning(pid);
  const healthy = await getApiHealth();

  if (running && healthy) {
    console.log(chalk.gray('Server status: ') + chalk.green('running & healthy') + chalk.gray(` (PID ${pid})`));
  } else if (running) {
    console.log(chalk.gray('Server status: ') + chalk.yellow('running but unhealthy') + chalk.gray(` (PID ${pid})`));
  } else {
    console.log(chalk.gray('Server status: ') + chalk.red('not running') + chalk.gray(` (stale PID ${pid})`));
    removePid();
  }
}
