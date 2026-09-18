import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const base = resolve('tests/fixtures');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json' };
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    let file;
    if (url.pathname === '/test-engine.js') file = resolve('test-results/test-engine.js');
    else if (url.pathname.startsWith('/preview/')) {
      const root = resolve('dist'); file = resolve(root, '.' + url.pathname.slice('/preview'.length));
      if (!file.startsWith(root + sep)) throw new Error('path');
    } else { file = resolve(base, '.' + (url.pathname === '/' ? '/index.html' : url.pathname)); if (!file.startsWith(base + sep)) throw new Error('path'); }
    const data = await readFile(file); res.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(data);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(4174, '127.0.0.1', () => console.log('本地仿真网申：http://127.0.0.1:4174'));
