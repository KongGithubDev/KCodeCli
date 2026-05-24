import chalk from 'chalk';
import ora from 'ora';
import { getFallback, sortFallback } from '../api.js';

export async function showFallback(): Promise<void> {
  const spinner = ora('Fetching fallback chain...').start();
  try {
    const rows = await getFallback() as Array<{
      modelDbId: number; priority: number; effectivePriority?: number;
      penalty?: number; rateLimitHits?: number; enabled: boolean;
      platform: string; modelId: string; displayName: string;
      keyCount?: number;
    }>;
    spinner.stop();
    console.log(chalk.bold(`\n${'Prio'.padEnd(6)} ${'Platform'.padEnd(14)} ${'Model ID'.padEnd(30)} ${'Display Name'.padEnd(26)} ${'Penalty'} ${'Keys'} ${'Enabled'}`));
    console.log('-'.repeat(100));
    for (const r of rows) {
      const prio = String(r.priority).padEnd(6);
      const platform = r.platform.padEnd(14);
      const modelId = r.modelId.padEnd(30);
      const display = (r.displayName || '').slice(0, 24).padEnd(26);
      const penalty = String(r.penalty ?? 0).padEnd(8);
      const keys = String(r.keyCount ?? 0).padEnd(5);
      const enabled = r.enabled ? chalk.green('yes') : chalk.gray('no');
      console.log(`${prio} ${platform} ${modelId} ${display} ${penalty} ${keys} ${enabled}`);
    }
    console.log();
  } catch (err: any) {
    spinner.fail(chalk.red(err.message));
    process.exit(1);
  }
}

export async function sortFallbackCmd(preset: string): Promise<void> {
  const valid = ['intelligence', 'speed', 'budget'];
  if (!valid.includes(preset)) {
    console.error(chalk.red(`Invalid preset. Use: ${valid.join(', ')}`));
    process.exit(1);
  }
  const spinner = ora(`Sorting by ${preset}...`).start();
  try {
    await sortFallback(preset);
    spinner.succeed(chalk.green(`Fallback chain sorted by ${preset}.`));
  } catch (err: any) {
    spinner.fail(chalk.red(err.message));
    process.exit(1);
  }
}
