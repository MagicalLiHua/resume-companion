import { z } from 'zod';
export const MODEL_KEY='resume_model';
export function modelBase(value:string):string {
  let u:URL;try{u=new URL(value.trim());}catch{throw new Error('请输入有效的 HTTPS 提供商地址');}
  if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.hostname.includes('*')||u.href.length>300)throw new Error('模型地址必须为 HTTPS，不能含账号、查询参数或通配符');
  return u.href.replace(/\/+$/,'');
}
export const ModelInputSchema=z.strictObject({protocol:z.enum(['anthropic','openai']),baseUrl:z.string().transform(modelBase),model:z.string().trim().min(1).max(120),remember:z.boolean(),key:z.string().trim().min(8).max(1024).optional()});
export const ModelConfigSchema=z.strictObject({id:z.string(),protocol:z.enum(['anthropic','openai']),baseUrl:z.string().transform(modelBase),model:z.string().trim().min(1).max(120),remember:z.boolean(),revision:z.number().int().nonnegative()});
export type ModelConfig=z.infer<typeof ModelConfigSchema>;
export type ModelInput=z.input<typeof ModelInputSchema>;
export interface ModelState {config:ModelConfig|null;configured:boolean;revision:number}
export const defaultModel={protocol:'anthropic' as const,baseUrl:'https://api.deepseek.com/anthropic',model:'deepseek-flash',remember:false};
export function modelEndpoint(config:Pick<ModelConfig,'protocol'|'baseUrl'>){
  const base=modelBase(config.baseUrl);
  return config.protocol==='anthropic'?`${base}${base.endsWith('/v1')?'':'/v1'}/messages`:`${base}/chat/completions`;
}
export const modelOrigin=(base:string)=>`${new URL(modelBase(base)).origin}/*`;
