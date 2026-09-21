import assert from 'node:assert/strict';
import {createServer} from 'node:net';
import {mkdtemp,readFile,rm,writeFile,chmod} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
const plugin=resolve('plugins/resume-companion');
const version=JSON.parse(await readFile(join(plugin,'.codex-plugin/plugin.json'),'utf8')).version;
if(process.platform==='win32'){console.log('Legacy Unix discovery test does not apply on Windows');process.exit(0);}
const root=await mkdtemp('/tmp/rc-migration-');
const profile=join(root,'profile'),hash=createHash('sha256').update(profile).digest('hex').slice(0,12);
const endpoint=join(root,`rc-browser-${hash}.sock`);
let mode='ready';const kinds=[];
const server=createServer(socket=>{
 let buffer='';socket.setEncoding('utf8');
 socket.once('data',chunk=>{
  buffer+=chunk;const hello=JSON.parse(buffer.trim());kinds.push(hello.kind);
  socket.write(JSON.stringify({status:mode,supervisor_version:mode==='ready'?version:'0.0.1',protocol:1})+'\n');
  if(mode==='ready')setTimeout(()=>socket.end('legacy-browser-kept\n'),30);else socket.end();
 });
});
await new Promise(resolve=>server.listen(endpoint,resolve));
async function launch(){
 const child=spawn(process.execPath,[join(plugin,'chrome-launcher.bundle.mjs')],{env:{...process.env,TMPDIR:root,RESUME_COMPANION_CHROME_DATA_DIR:profile,RESUME_COMPANION_ALLOW_BROWSER_RESTART:'0'},stdio:['pipe','pipe','pipe']});
 let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
 const timeout=setTimeout(()=>child.kill('SIGTERM'),10000);
 const code=await new Promise(resolve=>child.once('exit',resolve));clearTimeout(timeout);return {code,stdout,stderr};
}
try{
 const reuse=await launch();assert.equal(reuse.code,0,reuse.stderr);assert.match(reuse.stdout,/legacy-browser-kept/);
 mode='upgrade_required';const upgrade=await launch();assert.equal(upgrade.code,1);assert.match(upgrade.stderr,/browser_upgrade_pending/);
 assert.deepEqual(kinds,['connect','connect'],'discovery must neither restart nor shut down the legacy service');
 const mock=join(root,'codex-mock');await writeFile(mock,'#!/bin/sh\nexec 0<&-\nsleep 1\necho "failed to connect to socket" >&2\nexit 1\n');await chmod(mock,0o700);
 const runReload=async flags=>{const child=spawn(process.execPath,[join(plugin,'scripts/reload-codex-mcp.mjs'),...flags],{env:{...process.env,TMPDIR:root,RESUME_COMPANION_CHROME_DATA_DIR:profile,RESUME_COMPANION_CODEX_BIN:mock},stdio:['ignore','pipe','pipe']});let out='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>out+=b);const code=await new Promise(resolve=>child.once('exit',resolve));return {code,out};};
 const safe=await runReload([]);assert.equal(safe.code,0,safe.out);assert.match(safe.out,/Preserved the dedicated browser/);assert.deepEqual(kinds,['connect','connect']);
 mode='shutting_down';const explicit=await runReload(['--restart-browser']);assert.equal(explicit.code,0,explicit.out);assert.equal(kinds.at(-1),'shutdown');assert.match(explicit.out,/Stopped the previous/);
 console.log('Legacy endpoint reuse and refusal to silently discard unsaved browser state: OK');
}finally{await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});}
