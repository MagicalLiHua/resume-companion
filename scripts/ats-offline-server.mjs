import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const root = resolve(import.meta.dirname, '../.local-archive/offline-sites');
const port = Number(process.env.ATS_OFFLINE_PORT || 4175);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };
createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    const name = path === '/' ? 'index.html' : path.slice(1);
    if (!/^[a-z0-9.-]+$/.test(name) || req.method !== 'GET') throw Error('request');
    const body = await readFile(resolve(root, name));
    res.writeHead(200, { 'Content-Type': mime[extname(name)] || 'text/plain', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`招聘表单离线样本：http://127.0.0.1:${port}/`));
