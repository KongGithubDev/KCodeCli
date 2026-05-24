import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { getPidFile, ensureDataDir } from './config.js';

export function savePid(pid: number): void {
  ensureDataDir();
  writeFileSync(getPidFile(), String(pid), 'utf-8');
}

export function getPid(): number | null {
  if (!existsSync(getPidFile())) return null;
  try {
    const pid = parseInt(readFileSync(getPidFile(), 'utf-8').trim(), 10);
    if (isNaN(pid)) return null;
    return pid;
  } catch {
    return null;
  }
}

export function removePid(): void {
  if (existsSync(getPidFile())) {
    unlinkSync(getPidFile());
  }
}

export function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
