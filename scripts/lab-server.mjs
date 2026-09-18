import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const base = resolve('tests/fixtures');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json' };
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/test-engine.js') {
      const data = await readFile(resolve('test-results/test-engine.js'));
      res.writeHead(200, { 'Content-Type': mime['.js'], 'Cache-Control': 'no-store' }); res.end(data); return;
    }
    let file;
    file = resolve(base, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(base + sep)) throw new Error('path');
    let data = await readFile(file);
    if (extname(file) === '.html' && process.env.RESUME_COMPANION_TEST_ENGINE === '1') data = Buffer.from(data.toString('utf8').replace('</body>', '<script src="/test-engine.js"></script><script>window.labEngine=new window.ResumeTest.AutomationEngine()</script></body>'));
    res.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(data);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(4174, '127.0.0.1', () => console.log('本地仿真网申：http://127.0.0.1:4174'));
