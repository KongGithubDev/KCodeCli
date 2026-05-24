import chalk from 'chalk';
import ora from 'ora';
import { getModels } from '../api.js';

export async function listModels(): Promise<void> {
  const spinner = ora('Fetching models...').start();
  try {
    const models = await getModels() as Array<{
      id: number; platform: string; modelId: string; displayName: string;
      keyCount?: number; fallbackEnabled?: boolean;
    }>;
    spinner.stop();
    console.log(chalk.bold(`\n${'ID'.padEnd(6)} ${'Platform'.padEnd(14)} ${'Model ID'.padEnd(30)} ${'Display Name'.padEnd(26)} ${'Keys'} ${'Fallback'}`));
    console.log('-'.repeat(95));
    for (const m of models) {
      const id = String(m.id).padEnd(6);
      const platform = m.platform.padEnd(14);
      const modelId = m.modelId.padEnd(30);
      const display = (m.displayName || '').slice(0, 24).padEnd(26);
      const keys = String(m.keyCount ?? 0).padEnd(5);
      const fb = m.fallbackEnabled ? chalk.green('yes') : chalk.gray('no');
      console.log(`${id} ${platform} ${modelId} ${display} ${keys} ${fb}`);
    }
    console.log();
  } catch (err: any) {
    spinner.fail(chalk.red(err.message));
    process.exit(1);
  }
}
