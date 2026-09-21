import {describe,expect,test} from 'vitest';
import {PagePresentation} from '../src/browser/page-presentation.js';

describe('dedicated browser presentation',()=>{
 test('ordinary new tabs and selection stay in the background',async()=>{
  const p=new PagePresentation(),calls:any[]=[];
  const handler=async(args:any)=>{calls.push(args);return {};};
  await p.run('new_page',{url:'https://example.test'},'a',handler);
  await p.run('select_page',{pageId:3},'a',handler);
  expect(calls).toEqual([{url:'https://example.test',background:true},{pageId:3,bringToFront:false}]);
 });
 test('only explicit handoff reasons can focus, and each event focuses once',async()=>{
  const p=new PagePresentation(),focus:boolean[]=[];
  const handler=async(args:any)=>{focus.push(args.bringToFront);return {};};
  const args={pageId:3,bringToFront:true,attention_reason:'manual_action',attention_event_id:'journey:2:photo'};
  await expect(p.run('select_page',{pageId:3,bringToFront:true},'a',handler)).rejects.toThrow('attention_reason_required');
  await expect(p.run('select_page',{...args,attention_event_id:undefined},'a',handler)).rejects.toThrow('attention_event_id_required');
  await p.run('select_page',args,'a',handler);await p.run('select_page',args,'a',handler);
  await p.run('select_page',{...args,attention_event_id:'journey:3:statement'},'a',handler);
  expect(focus).toEqual([true,false,true]);
 });
 test('an explicit user request may show the page again and failed attempts are not marked shown',async()=>{
  const p=new PagePresentation(),args={pageId:3,bringToFront:true,attention_reason:'completed',attention_event_id:'run:1'};
  await p.run('select_page',args,'a',async()=>({isError:true}));
  let focused=0;const handler=async(a:any)=>{if(a.bringToFront)focused++;return {};};
  await p.run('select_page',args,'a',handler);
  await p.run('select_page',{...args,attention_reason:'user_request'},'a',handler);
  await p.run('select_page',{...args,attention_reason:'user_request'},'a',handler);
  expect(focused).toBe(3);
 });
});
