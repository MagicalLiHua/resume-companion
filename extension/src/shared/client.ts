import {emptyProfile,type Profile} from '../domain/profile';
import {freshState,STATE_KEY,type LocalState} from '../domain/state';
export const inExtension=Boolean(globalThis.chrome?.runtime?.id);
export interface ProfileState {profile:Profile|null;hasBackup:boolean;revision:number;state:LocalState}
const demoState=freshState();
export const widgetMode=typeof location!=='undefined'&&new URLSearchParams(location.search).has('widget');
export const widgetToken=widgetMode?location.hash.slice(1):undefined;
export async function action<T>(type:string,payload:Record<string,unknown>={}):Promise<T>{
  if(inExtension){const result=await chrome.runtime.sendMessage({type,...payload,widgetToken});if(!result?.ok)throw new Error(result?.error??'插件后台没有响应，请重新加载插件');if(type==='PROFILE_LOAD'&&!result.data?.state)throw new Error('插件文件已升级，后台仍是旧版本。请在 chrome://extensions 点击本插件的“重新加载”，然后重新打开资料页。');return result.data;}
  if(type==='PROFILE_LOAD')return {profile:demoState.current?.profile??null,hasBackup:false,revision:demoState.revision,state:demoState} as T;
  if(type==='MODEL_STATE')return {config:null,configured:false,revision:0} as T;
  throw new Error('请在 Chrome 中加载正式插件后使用此功能');
}
export const profileAction=(type:'PROFILE_LOAD'|'PROFILE_SAVE'|'PROFILE_CLEAR'|'PROFILE_RESTORE',profile?:Profile,expectedRevision?:number)=>action<ProfileState>(type,{profile,expectedRevision});
export function openOptions(){if(inExtension)void chrome.runtime.openOptionsPage();else window.open('./options.html','_blank','noopener');}
export function openModelSettings(){if(inExtension)void chrome.tabs.create({url:chrome.runtime.getURL('options.html#models')});else window.open('./options.html#models','_blank','noopener');}
export function openJournal(id?:string){const path=`journal.html${id?`#${encodeURIComponent(id)}`:''}`;if(inExtension)void chrome.tabs.create({url:chrome.runtime.getURL(path)});else window.open('./'+path,'_blank','noopener');}
export function downloadFile(filename:string,value:unknown,type='application/json'){
  const blob=new Blob([typeof value==='string'?value:JSON.stringify(value,null,2)],{type});const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function downloadProfile(profile:unknown){downloadFile('我的简历备份.json',profile);}
export {emptyProfile,STATE_KEY};
