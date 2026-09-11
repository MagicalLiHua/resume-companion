import { MODEL_KEY,ModelConfigSchema,ModelInputSchema,type ModelState,type ModelInput } from '../domain/model';
import {releasePreviousServer} from './permissions';
const slot=(id:string)=>`resume_model_key_${id}`;
export async function modelAccess(){
  const data=(await chrome.storage.local.get(MODEL_KEY))[MODEL_KEY] as {config?:unknown;key?:unknown}|undefined;
  if(!data?.config)return null;
  const config=ModelConfigSchema.parse(data.config);
  const key=config.remember?data.key:(await chrome.storage.session.get(slot(config.id)))[slot(config.id)];
  return {config,key:typeof key==='string'?key:null};
}
export async function modelState():Promise<ModelState>{
  const stored=(await chrome.storage.local.get(MODEL_KEY))[MODEL_KEY] as {revision?:number}|undefined;
  const a=await modelAccess();return {config:a?.config??null,configured:Boolean(a?.key),revision:a?.config.revision??stored?.revision??0};
}
export async function saveModel(input:ModelInput,expected:number):Promise<ModelState>{
  const value=ModelInputSchema.parse(input),old=await modelAccess(),state=await modelState();
  if(expected!==state.revision)throw new Error('模型设置已在其他窗口更新，请刷新后重试');
  const same=old?.config.baseUrl===value.baseUrl&&old?.config.protocol===value.protocol;
  const key=value.key||(same?old?.key:null);if(!key)throw new Error('请输入此提供商的 API Key');
  const {key:_key,...settings}=value;
  const config={...settings,id:crypto.randomUUID(),revision:state.revision+1};
  if(!config.remember)await chrome.storage.session.set({[slot(config.id)]:key});
  try{await chrome.storage.local.set({[MODEL_KEY]:{config,...(config.remember?{key}:{})}});}catch(e){await chrome.storage.session.remove(slot(config.id));throw e;}
  if(old)await chrome.storage.session.remove(slot(old.config.id));
  if(old)await releasePreviousServer(old.config.baseUrl,config.baseUrl);
  return modelState();
}
export async function clearModel(expected:number):Promise<ModelState>{
  const old=await modelAccess(),state=await modelState();if(expected!==state.revision)throw new Error('模型设置已变化，请刷新后重试');
  await chrome.storage.local.set({[MODEL_KEY]:{config:null,revision:state.revision+1}});
  if(old){await chrome.storage.session.remove(slot(old.config.id));try{await chrome.permissions.remove({origins:[`${new URL(old.config.baseUrl).origin}/*`]});}catch{/* Already revoked. */}}
  return modelState();
}
export async function restoreModelSettings(settings:{protocol:'anthropic'|'openai';baseUrl:string;model:string}|null){
  const state=await modelState();await clearModel(state.revision);
  if(settings)await chrome.storage.local.set({[MODEL_KEY]:{config:ModelConfigSchema.parse({...settings,id:crypto.randomUUID(),revision:state.revision+2,remember:false})}});
}
