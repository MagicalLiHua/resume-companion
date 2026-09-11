import {modelEndpoint,type ModelConfig} from '../domain/model';
export interface ModelReply {data:unknown;model:string;milliseconds:number;usage:{input:number;output:number}}
export async function requestModel(config:ModelConfig,key:string,system:string,user:string,schema:Record<string,unknown>,signal:AbortSignal,fetcher:typeof fetch=fetch):Promise<ModelReply>{
  const headers:Record<string,string>={'Content-Type':'application/json'};
  const body:Record<string,unknown>={model:config.model,stream:false,max_tokens:2000,temperature:0};
  const anthropic=config.protocol==='anthropic';
  if(anthropic){
    headers['x-api-key']=key;headers['anthropic-version']='2023-06-01';
    Object.assign(body,{system,messages:[{role:'user',content:user}],tools:[{name:'field_matches',description:'Return classification data only.',input_schema:schema}],tool_choice:{type:'tool',name:'field_matches'}});
  }else{
    headers.Authorization=`Bearer ${key}`;
    Object.assign(body,{messages:[{role:'system',content:system},{role:'user',content:user}],response_format:{type:'json_object'}});
  }
  if(new URL(config.baseUrl).hostname==='api.deepseek.com')body.thinking={type:'disabled'};
  const payload=JSON.stringify(body);if(new TextEncoder().encode(payload).length>65536)throw new Error('请求过大，请减少字段数量');
  const started=performance.now();
  try{
    const response=await fetcher(modelEndpoint(config),{method:'POST',headers,body:payload,credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(30000)])});
    if(!response.ok)throw new Error(response.status===401||response.status===403?'认证失败，请检查 API Key 和模型权限':response.status===429||response.status===402?'模型额度不足或请求被限流，请稍后重试':`模型服务暂不可用（HTTP ${response.status}）`);
    if(!response.body)throw new Error('模型返回了空响应');
    const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let raw='',size=0;
    try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>65536){await reader.cancel();throw new Error('模型响应超过 64 KiB，已停止读取');}raw+=decoder.decode(part.value,{stream:true});}raw+=decoder.decode();}finally{reader.releaseLock();}
    const parsed=JSON.parse(raw);let data:unknown;
    if(anthropic){
      if(parsed.role!=='assistant'||parsed.stop_reason!=='tool_use'||!Array.isArray(parsed.content))throw new Error('模型输出不完整或格式不兼容');
      const calls=parsed.content.filter((c:{type:string})=>c.type==='tool_use');
      if(calls.length!==1||calls[0].name!=='field_matches'||parsed.content.some((c:{type:string})=>!['text','tool_use'].includes(c.type)))throw new Error('模型输出不符合工具返回格式');
      data=calls[0].input;
    }else{
      const c=parsed.choices?.[0];if(parsed.choices?.length!==1||c.finish_reason!=='stop'||c.message?.role!=='assistant'||c.message.tool_calls||c.message.refusal)throw new Error('模型输出不完整或格式不兼容');
      data=JSON.parse(c.message.content);
    }
    return {data,model:typeof parsed.model==='string'?parsed.model.slice(0,120):config.model,milliseconds:performance.now()-started,usage:{input:Number(parsed.usage?.input_tokens??parsed.usage?.prompt_tokens??0)||0,output:Number(parsed.usage?.output_tokens??parsed.usage?.completion_tokens??0)||0}};
  }catch(e){
    if(signal.aborted)throw new Error('模型请求已取消');
    if(e instanceof Error&&e.name==='TimeoutError')throw new Error('模型请求超过 30 秒，请稍后重试或手动选择');
    if(e instanceof SyntaxError)throw new Error('模型返回的 JSON 格式无效');
    if(e instanceof TypeError)throw new Error('模型网络请求失败，请检查网络、域名授权或提供商浏览器访问支持');
    throw e;
  }
}
export async function testModel(config:ModelConfig,key:string,signal:AbortSignal){
  const reply=await requestModel(config,key,'Return only the JSON object {"ok":true}.','Connection test; no personal data.',{type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false},signal);
  if(!reply.data||typeof reply.data!=='object'||Object.keys(reply.data).length!==1||(reply.data as {ok?:unknown}).ok!==true)throw new Error('连接成功，但模型返回格式不兼容');
  return reply;
}
