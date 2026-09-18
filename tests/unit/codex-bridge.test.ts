import {afterEach,expect,it,vi} from 'vitest';
import {startCodexBridge} from '../../extension/src/background/codex-bridge';

class Socket {
 static CONNECTING=0;static OPEN=1;static all:Socket[]=[];
 readyState=0;sent:string[]=[];listeners=new Map<string,((event:any)=>void)[]>();
 constructor(public url:string){Socket.all.push(this)}
 addEventListener(type:string,callback:(event:any)=>void){this.listeners.set(type,[...(this.listeners.get(type)??[]),callback])}
 emit(type:string,event:any={}){for(const callback of this.listeners.get(type)??[])callback(event)}
 open(){this.readyState=1;this.emit('open')}
 send(value:string){this.sent.push(value)}
 close(){this.readyState=3;this.emit('close')}
}
const flush=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve()};
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();Socket.all=[]});
it('关闭桥接不连接；开关即时生效，保存资料不会中断保活',async()=>{
 vi.useFakeTimers();vi.stubGlobal('WebSocket',Socket);vi.stubGlobal('chrome',{runtime:{id:'test',getManifest:()=>({version:'test'})}});
 let enabled=false;const refresh=startCodexBridge(async()=>({}),async()=>enabled);
 await flush();expect(Socket.all).toHaveLength(0);
 enabled=true;refresh();await flush();expect(Socket.all).toHaveLength(1);const first=Socket.all[0];first.open();
 refresh();await flush();await vi.advanceTimersByTimeAsync(20_000);
 expect(Socket.all).toHaveLength(1);expect(first.sent.map(s=>JSON.parse(s).type)).toEqual(['hello','ping']);
 enabled=false;refresh();await flush();expect(first.readyState).toBe(3);
 await vi.advanceTimersByTimeAsync(5000);expect(Socket.all).toHaveLength(1);
});
it('旧连接未完成请求的结果不会发往重连后的浏览器会话',async()=>{
 vi.useFakeTimers();vi.stubGlobal('WebSocket',Socket);vi.stubGlobal('chrome',{runtime:{id:'test',getManifest:()=>({version:'test'})}});
 let finish!:(value:unknown)=>void;startCodexBridge(()=>new Promise(resolve=>{finish=resolve}),async()=>true);
 await flush();const first=Socket.all[0];first.open();first.emit('message',{data:JSON.stringify({id:'old',method:'scan'})});first.close();
 await vi.advanceTimersByTimeAsync(1500);const next=Socket.all[1];next.open();finish({private:'synthetic'});await flush();
 expect(next.sent.map(s=>JSON.parse(s).type)).toEqual(['hello']);
});
