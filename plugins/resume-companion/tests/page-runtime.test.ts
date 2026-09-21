import {expect, test} from 'vitest';
import {ensurePageRuntime} from '../src/browser/page-runtime.js';

test('healthy contexts do not toggle Runtime or execute page scripts', async () => {
  const frame = {mainRealm:()=>({hasContext:()=>true}),isolatedRealm:()=>({hasContext:()=>true})};
  await ensurePageRuntime({frames:()=>[frame]});
});

test('missing contexts sharing one session are resynchronized once', async () => {
  let ready = false;
  const calls:string[] = [];
  const client = {send:async (method:string)=>{calls.push(method);if(method==='Runtime.enable')ready=true;}};
  const frame = {client,mainRealm:()=>({hasContext:()=>ready}),isolatedRealm:()=>({hasContext:()=>ready})};
  await ensurePageRuntime({frames:()=>[frame,frame]});
  expect(calls).toEqual(['Runtime.disable','Runtime.enable']);
});

test('unsynchronized contexts fail closed with no automatic navigation', async () => {
  const calls:string[] = [];
  const frame = {client:{send:async(method:string)=>{calls.push(method);}},mainRealm:()=>({hasContext:()=>false}),isolatedRealm:()=>({hasContext:()=>false})};
  await expect(ensurePageRuntime({frames:()=>[frame]})).rejects.toThrow('page_context_unavailable');
  expect(calls).toEqual(['Runtime.disable','Runtime.enable']);
});
