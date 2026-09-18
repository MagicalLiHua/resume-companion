import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import WebSocket from 'ws';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..'),extensionId='feifaflnkjdihpbbhnihidjjkeapamnh';
const baseEnv=Object.fromEntries(Object.entries(process.env).filter(([,v])=>typeof v==='string'));
for(const [index,mode] of ['core','legacy','all'].entries()){
 const port=47000+process.pid%500+index,client=new Client({name:'core-contract',version:'1.0'});
 const transport=new StdioClientTransport({command:process.execPath,args:['server.bundle.mjs'],cwd:root,env:{...baseEnv,RESUME_COMPANION_BRIDGE_PORT:String(port),RESUME_COMPANION_TOOLSET:mode},stderr:'pipe'});
 await client.connect(transport);let socket;
 try{
  const listed=(await client.listTools()).tools;assert.equal(listed.length,mode==='core'?8:mode==='legacy'?14:19);
  if(mode==='core'){assert(listed.some(t=>t.name==='resume_act'));assert(!listed.some(t=>t.name==='resume_fill_plan'))}
  socket=await new Promise((resolve,reject)=>{const ws=new WebSocket(`ws://127.0.0.1:${port}`,{origin:`chrome-extension://${extensionId}`});ws.on('open',()=>resolve(ws));ws.on('error',reject)});
  socket.send(JSON.stringify({type:'hello',extensionId,version:'0.6.0',epoch:'epoch-test',protocolVersion:'1.0'}));let forwarded=0,cancelled=false;
  socket.on('message',raw=>{const message=JSON.parse(String(raw));if(message.type==='cancel'){cancelled=true;return}forwarded++;if(message.method==='wait')return;socket.send(JSON.stringify({id:message.id,ok:true,result:{received:message.method,params:message.params}}))});
  if(mode!=='legacy'){
   const observed=await client.callTool({name:'resume_observe',arguments:{tab_id:12,mode:'overview'}});assert.equal(observed.structuredContent.received,'observe');
   const invalid=await client.callTool({name:'resume_act',arguments:{session_id:'s',snapshot_id:'p',operation_id:'o',action:{kind:'press_key',ref:'e1',key:'Enter'}}});assert.equal(invalid.isError,true);assert.equal(forwarded,1);
   for(const args of [{},{tab_id:12,mode:'verify'},{tab_id:12,selector:'input'}]){const rejected=await client.callTool({name:'resume_observe',arguments:args});assert.equal(rejected.isError,true);assert.equal(forwarded,1);}
   const aborted=new AbortController();const pending=client.callTool({name:'resume_wait',arguments:{session_id:'s',snapshot_id:'p',condition:{kind:'visible',ref:'e1'}}},undefined,{signal:aborted.signal}).catch(()=>null);
   while(forwarded<2)await new Promise(r=>setTimeout(r,10));aborted.abort();await pending;
   for(let i=0;i<30&&!cancelled;i++)await new Promise(r=>setTimeout(r,10));assert.equal(cancelled,true,'MCP cancellation must reach the extension');
  }
 }finally{socket?.close();await client.close()}
}
console.log('Core/legacy/all toolsets, strict actions, MCP cancellation: OK');
