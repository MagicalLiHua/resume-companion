import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { Client } from '../../plugins/resume-companion/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StdioClientTransport } from '../../plugins/resume-companion/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
export const textOf = (result) =>
  (result.content || [])
    .filter((x) => x.type === 'text')
    .map((x) => x.text)
    .join('\n');
export const dataOf = (result) => result.structuredContent ?? JSON.parse(textOf(result));
export async function harness({ baseline = false, fixtureRoot } = {}) {
  const root = resolve(import.meta.dirname, '../..');
  const plugin = resolve(
    root,
    baseline
      ? 'artifacts/resume-companion-0.16.2/plugins/resume-companion'
      : 'plugins/resume-companion',
  );
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (!/^\/[a-z0-9.-]+$/.test(path)) throw 0;
      const body = await readFile(resolve(fixtureRoot || resolve(import.meta.dirname, 'dist'), path.slice(1)));
      res.setHeader(
        'Content-Type',
        { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' }[
          extname(path)
        ] || 'text/plain',
      );
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const profileRoot = await mkdtemp(resolve(tmpdir(), 'resume-real-controls-'));
  const profile = resolve(profileRoot, 'chrome-profile');
  const connections=[];
  const dataDir=resolve(profileRoot,'profiles');
  let profileClient;
  async function profileCall(name,args){
    if(!profileClient){profileClient=new Client({name:'prepare-profile-fixture',version:'1.0.0'});await profileClient.connect(new StdioClientTransport({command:process.execPath,args:['server.bundle.mjs'],cwd:plugin,env:{...process.env,RESUME_COMPANION_DATA_DIR:dataDir},stderr:'pipe'}));connections.push({client:profileClient});}
    return profileClient.callTool({name,arguments:args});
  }
  async function connectPeer() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['chrome-launcher.bundle.mjs'],
    cwd: plugin,
    env: {
      ...process.env,
      RESUME_COMPANION_DATA_DIR:dataDir,
      RESUME_COMPANION_CHROME_DATA_DIR: profile,
      RESUME_COMPANION_CHROME_HEADLESS: '1',
      RESUME_COMPANION_SUPERVISOR_EPHEMERAL: '1',
      RESUME_COMPANION_TEST_DIAGNOSTICS: '1',
    },
    stderr: 'pipe',
  });
  if (process.env.RC_VERBOSE) transport.stderr?.on('data', (b) => process.stderr.write(b));
  const client = new Client({ name: 'real-controls-test', version: '1.0.0' });
  await client.connect(transport);
  const call = async (name, args, options) =>
    client.callTool({ name, arguments: ['form_run','form_journey'].includes(name)?{detail:'full',...args}:args }, undefined, { timeout: 90_000, ...options });
  const connection={client,call};connections.push(connection);return connection;
  }
  const {client,call}=await connectPeer();
  let pageId;
  const evalPage = async (functionCode) => {
    const result = await call('evaluate_script', {
      pageId,
      function: functionCode,
      waitForStableDom: false,
    });
    if (result.isError) throw new Error(textOf(result));
    const match = textOf(result).match(/```json\s*([\s\S]*?)\s*```/);
    return JSON.parse(match?.[1] || 'null');
  };
  return {
    client,
    profileCall,
    connectPeer,
    call,
    evalPage,
    get pageId() {
      return pageId;
    },
    async open(family, delay = 0) {
      const url = `http://127.0.0.1:${server.address().port}/${family}.html?delay=${delay}`;
      if (pageId) await call('navigate_page', { pageId, type: 'url', url });
      else {
        const result = await call('new_page', { url });
        pageId = Number(
          textOf(result)
            .split('\n')
            .find((line) => line.includes('[selected]'))
            ?.match(/^(\d+):/)?.[1],
        );
        if (!pageId) throw new Error(textOf(result));
      }
      for (let i = 0; i < 50; i++) {
        if (await evalPage('() => Boolean(window.fixtureOracle?.().ready)')) return;
        await new Promise((r) => setTimeout(r, 50));
      }
      throw new Error('fixture never became ready');
    },
    async close() {
      await Promise.allSettled(connections.map(connection=>connection.client.close()));
      server.close();
      await new Promise((r) => setTimeout(r, 300));
      await rm(profileRoot, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
    },
  };
}
