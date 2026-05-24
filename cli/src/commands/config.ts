import chalk from 'chalk';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { findProjectRoot, getEnvPath } from '../utils/config.js';
import { getUnifiedKey, regenerateUnifiedKey } from '../api.js';

export async function showConfig(): Promise<void> {
  const root = findProjectRoot();
  if (!root) {
    console.error(chalk.red('Not inside a freellmapi project.'));
    process.exit(1);
  }
  const envPath = getEnvPath(root);
  if (!existsSync(envPath)) {
    console.log(chalk.gray('No .env file found.'));
    return;
  }
  console.log(chalk.bold('\nEnvironment variables:'));
  const content = readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    if (line.trim() && !line.startsWith('#')) {
      const [key, ...rest] = line.split('=');
      if (key && rest.length) {
        const val = rest.join('=');
        const display = key.toLowerCase().includes('key') ? val.slice(0, 4) + '****' : val;
        console.log(`  ${key}=${display}`);
      }
    }
  }
  console.log();
}

export async function showUnifiedKey(): Promise<void> {
  try {
    const { apiKey } = await getUnifiedKey();
    console.log(chalk.bold('\nYour FreeLLMAPI unified key:'));
    console.log(chalk.cyan(`  ${apiKey}`));
    console.log(chalk.gray('\nUse this as your bearer token:'));
    console.log(chalk.gray(`  Authorization: Bearer ${apiKey}`));
    console.log(chalk.gray(`\nOr set env var: FREELLMAPI_KEY=${apiKey}\n`));
  } catch (err: any) {
    console.error(chalk.red(`Failed: ${err.message} (is the server running?)`));
    process.exit(1);
  }
}

export async function rotateUnifiedKey(): Promise<void> {
  try {
    const { apiKey } = await regenerateUnifiedKey();
    console.log(chalk.bold('\nNew FreeLLMAPI unified key:'));
    console.log(chalk.cyan(`  ${apiKey}`));
    console.log(chalk.yellow('\nOld key is now invalid. Update all clients.\n'));
  } catch (err: any) {
    console.error(chalk.red(`Failed: ${err.message} (is the server running?)`));
    process.exit(1);
  }
}

export async function setConfig(key: string, value: string): Promise<void> {
  const { writeFileSync } = await import('fs');
  const root = findProjectRoot();
  if (!root) {
    console.error(chalk.red('Not inside a freellmapi project.'));
    process.exit(1);
  }
  const envPath = getEnvPath(root);
  let content = '';
  if (existsSync(envPath)) {
    content = readFileSync(envPath, 'utf-8');
  }
  const lines = content.split('\n');
  let found = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith(`${key}=`) || lines[i].startsWith(`${key} `)) {
      lines[i] = `${key}=${value}`;
      found = true;
      break;
    }
  }
  if (!found) {
    lines.push(`${key}=${value}`);
  }
  writeFileSync(envPath, lines.join('\n') + '\n');
  console.log(chalk.green(`Set ${key}=${value}`));
}
