import { createHash } from 'node:crypto';
import { homedir, tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { createConnection } from 'node:net';

function profileDir() {
  const configured = process.env.RESUME_COMPANION_CHROME_DATA_DIR;
  if (configured) {
    const expanded = configured === '~' ? homedir() : configured.startsWith('~/') ? join(homedir(), configured.slice(2)) : configured;
    return isAbsolute(expanded) ? resolve(expanded) : resolve(process.cwd(), expanded);
  }
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'Resume Companion', 'chrome-profile');
  if (process.platform === 'win32') return join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'Resume Companion', 'chrome-profile');
  return join(process.env.XDG_STATE_HOME || join(homedir(), '.local', 'state'), 'resume-companion', 'chrome-profile');
}

const profile = profileDir();
const hash = createHash('sha256').update(profile).digest('hex').slice(0, 12);
const endpoint = process.env.RESUME_COMPANION_DEBUG_SOCKET || (process.platform === 'win32'
  ? `\\\\.\\pipe\\resume-companion-debug-${hash}`
  : join(tmpdir(), `rc-debug-${hash}.sock`));
const [command = 'status', pageId, target, scope] = process.argv.slice(2);
const request = command === 'pages'
  ? { command: 'list_pages' }
  : command === 'observe'
    ? { command: 'observe', page_id: Number(pageId), mode: target ? 'focus' : 'overview', target, scope, include_values: 'state' }
    : { command: 'status' };

const response = await new Promise((resolveResponse, reject) => {
  const socket = createConnection(endpoint);
  let buffer = '';
  socket.setEncoding('utf8');
  socket.once('connect', () => socket.write(`${JSON.stringify(request)}\n`));
  socket.on('data', chunk => { buffer += chunk; });
  socket.once('end', () => {
    try { resolveResponse(JSON.parse(buffer)); } catch (error) { reject(error); }
  });
  socket.once('error', error => reject(new Error(`debug_bridge_unavailable: ${error.message}`)));
});

console.log(JSON.stringify(response, null, 2));
