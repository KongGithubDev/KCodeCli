import { existsSync, readFileSync, mkdirSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { homedir } from 'os';

export function findProjectRoot(cwd: string = process.cwd()): string | null {
  let dir = resolve(cwd);
  const root = resolve('/');
  while (dir !== root) {
    if (existsSync(join(dir, 'server', 'package.json')) && existsSync(join(dir, 'package.json'))) {
      try {
        const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8'));
        if (pkg.name === 'freellmapi') {
          return dir;
        }
      } catch {}
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function getServerDistPath(root: string): string {
  return join(root, 'server', 'dist', 'index.js');
}

export function getServerSrcPath(root: string): string {
  return join(root, 'server', 'src', 'index.ts');
}

export function isServerBuilt(root: string): boolean {
  return existsSync(getServerDistPath(root));
}

export function getEnvPath(root: string): string {
  return join(root, '.env');
}

export function getDataDir(): string {
  return join(homedir(), '.freellmapi');
}

export function getPidFile(): string {
  return join(getDataDir(), 'server.pid');
}

export function ensureDataDir(): void {
  const dir = getDataDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}
