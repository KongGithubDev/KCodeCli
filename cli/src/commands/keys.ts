import chalk from 'chalk';
import ora from 'ora';
import { getKeys, addKey, deleteKey, toggleKey } from '../api.js';

export async function listKeys(): Promise<void> {
  const spinner = ora('Fetching keys...').start();
  try {
    const keys = await getKeys() as Array<{
      id: number; platform: string; label: string; maskedKey: string;
      status: string; enabled: boolean;
    }>;
    spinner.stop();
    if (!keys.length) {
      console.log(chalk.gray('No API keys configured.'));
      return;
    }
    console.log(chalk.bold(`\n${'ID'.padEnd(6)} ${'Platform'.padEnd(14)} ${'Label'.padEnd(18)} ${'Key'.padEnd(16)} ${'Status'.padEnd(12)} ${'Enabled'}`));
    console.log('-'.repeat(70));
    for (const k of keys) {
      const id = String(k.id).padEnd(6);
      const platform = k.platform.padEnd(14);
      const label = (k.label || '').padEnd(18);
      const masked = k.maskedKey.padEnd(16);
      const status = k.status.padEnd(12);
      const enabled = k.enabled ? chalk.green('yes') : chalk.red('no');
      console.log(`${id} ${platform} ${label} ${masked} ${status} ${enabled}`);
    }
    console.log();
  } catch (err: any) {
    spinner.fail(chalk.red(err.message));
    process.exit(1);
  }
}

export async function addKeyCmd(platform: string, key: string, label?: string): Promise<void> {
  const spinner = ora('Adding key...').start();
  try {
    const result = await addKey(platform, key, label) as { platform: string; id: number };
    spinner.succeed(chalk.green(`Added ${result.platform} key (ID ${result.id})`));
  } catch (err: any) {
    spinner.fail(chalk.red(err.message));
    process.exit(1);
  }
}

export async function removeKeyCmd(id: string): Promise<void> {
  const numId = parseInt(id, 10);
  if (isNaN(numId)) {
    console.error(chalk.red('Invalid key ID'));
    process.exit(1);
  }
  const spinner = ora('Removing key...').start();
  try {
    await deleteKey(numId);
    spinner.succeed(chalk.green('Key removed.'));
  } catch (err: any) {
    spinner.fail(chalk.red(err.message));
    process.exit(1);
  }
}

export async function toggleKeyCmd(id: string, enabled: boolean): Promise<void> {
  const numId = parseInt(id, 10);
  if (isNaN(numId)) {
    console.error(chalk.red('Invalid key ID'));
    process.exit(1);
  }
  const spinner = ora(`${enabled ? 'Enabling' : 'Disabling'} key...`).start();
  try {
    await toggleKey(numId, enabled);
    spinner.succeed(chalk.green(`Key ${enabled ? 'enabled' : 'disabled'}.`));
  } catch (err: any) {
    spinner.fail(chalk.red(err.message));
    process.exit(1);
  }
}
