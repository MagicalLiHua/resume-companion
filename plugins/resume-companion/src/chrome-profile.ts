import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, readlink, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';

type LockRecord = {
  format: 'resume-companion-chrome-lock';
  pid: number;
  token: string;
  started_at: string;
  profile_hash: string;
};

export function resolveChromeProfileDir(value = process.env.RESUME_COMPANION_CHROME_DATA_DIR): string {
  if (value) {
    const expanded = value === '~' ? homedir() : value.startsWith('~/') ? join(homedir(), value.slice(2)) : value;
    return isAbsolute(expanded) ? resolve(expanded) : resolve(process.cwd(), expanded);
  }
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'Resume Companion', 'chrome-profile');
  if (process.platform === 'win32') return join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'Resume Companion', 'chrome-profile');
  return join(process.env.XDG_STATE_HOME || join(homedir(), '.local', 'state'), 'resume-companion', 'chrome-profile');
}

export function profileHash(profileDir: string): string {
  return createHash('sha256').update(profileDir).digest('hex').slice(0, 12);
}

function processExists(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EPERM';
  }
}

async function chromeProfileIsBusy(profileDir: string): Promise<boolean> {
  const singletonLock = join(profileDir, 'SingletonLock');
  try {
    const metadata = await lstat(singletonLock);
    if (!metadata.isSymbolicLink()) return true;
    const target = await readlink(singletonLock);
    const pid = /-(\d+)$/.exec(target)?.[1];
    return pid ? processExists(Number(pid)) : true;
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
    if (code === 'ENOENT') return false;
    return true;
  }
}

export class ChromeProfileLock {
  readonly lockPath: string;
  readonly profileDir: string;
  private readonly token = randomUUID();
  private held = false;

  constructor(profileDir: string) {
    this.profileDir = profileDir;
    this.lockPath = join(dirname(profileDir), 'chrome-mcp.lock');
  }

  async acquire(): Promise<void> {
    await mkdir(this.profileDir, { recursive: true, mode: 0o700 });
    await mkdir(dirname(this.lockPath), { recursive: true, mode: 0o700 });
    const record: LockRecord = {
      format: 'resume-companion-chrome-lock',
      pid: process.pid,
      token: this.token,
      started_at: new Date().toISOString(),
      profile_hash: profileHash(this.profileDir),
    };
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const handle = await open(this.lockPath, 'wx', 0o600);
        await handle.writeFile(`${JSON.stringify(record)}\n`, 'utf8');
        await handle.sync();
        await handle.close();
        this.held = true;
        return;
      } catch (error) {
        const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
        if (code !== 'EEXIST') throw error;
        const existing = await this.readExisting();
        if (!existing || processExists(existing.pid)) {
          throw new Error('profile_in_use: Resume Companion 专用 Chrome 正由另一个任务使用；请关闭那个任务后重试');
        }
        if (await chromeProfileIsBusy(this.profileDir)) {
          throw new Error('profile_in_use: 上一个 MCP 进程已退出，但专用 Chrome 仍在使用 Profile；请先关闭该 Chrome 窗口');
        }
        await unlink(this.lockPath).catch(() => undefined);
      }
    }
    throw new Error('profile_in_use: 无法安全取得 Resume Companion 专用 Chrome 的实例锁');
  }

  async release(): Promise<void> {
    if (!this.held) return;
    const existing = await this.readExisting();
    if (existing?.token === this.token) await unlink(this.lockPath).catch(() => undefined);
    this.held = false;
  }

  private async readExisting(): Promise<LockRecord | null> {
    try {
      const raw = JSON.parse(await readFile(this.lockPath, 'utf8')) as Partial<LockRecord>;
      if (raw.format !== 'resume-companion-chrome-lock' || typeof raw.pid !== 'number' || typeof raw.token !== 'string') return null;
      return raw as LockRecord;
    } catch {
      return null;
    }
  }
}
