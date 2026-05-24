import { createReadStream } from 'fs';
import { resolve } from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { chatCompletion, streamChatCompletion } from '../api.js';

export async function chatCmd(prompt: string, options: { model?: string; stream?: boolean; system?: string; file?: string }): Promise<void> {
  const messages: Array<{ role: string; content: string }> = [];

  if (options.system) {
    messages.push({ role: 'system', content: options.system });
  }

  let content = prompt;
  if (options.file) {
    const filePath = resolve(options.file);
    try {
      const fileContent = await new Promise<string>((res, rej) => {
        let data = '';
        createReadStream(filePath, 'utf-8')
          .on('data', chunk => { data += chunk; })
          .on('end', () => res(data))
          .on('error', rej);
      });
      content = `${prompt}\n\n--- file content ---\n${fileContent}`;
    } catch (err: any) {
      console.error(chalk.red(`Failed to read file: ${err.message}`));
      process.exit(1);
    }
  }

  messages.push({ role: 'user', content });

  if (options.stream) {
    let first = true;
    await streamChatCompletion(
      {
        model: options.model ?? 'auto',
        messages,
      },
      (delta: string) => {
        if (first) {
          console.log(chalk.bold('\nResponse:\n'));
          first = false;
        }
        process.stdout.write(delta);
      }
    );
    if (!first) console.log('\n');
  } else {
    const spinner = ora('Sending...').start();
    try {
      const result = await chatCompletion({
        model: options.model ?? 'auto',
        messages,
      }) as { choices: Array<{ message: { content: string } }> };
      spinner.stop();
      console.log(chalk.bold('\nResponse:\n') + result.choices[0].message.content);
    } catch (err: any) {
      spinner.fail(chalk.red(err.message));
      process.exit(1);
    }
  }
}
