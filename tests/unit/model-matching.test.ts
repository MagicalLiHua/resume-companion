import {describe,it,expect} from 'vitest';
import {demoProfile} from '../../extension/src/domain/profile';
import {sources,sourceCompatible,suggestSource} from '../../extension/src/domain/rules';
import {prepareDisclosure,validateDisclosure,validateMatches} from '../../extension/src/domain/matcher';
import {modelBase,modelEndpoint,defaultModel,type ModelConfig} from '../../extension/src/domain/model';
import {requestModel} from '../../extension/src/network/models';
import type {Field} from '../../extension/src/domain/types';
const f=(extra:Partial<Field>={}):Field=>({id:'a',label:'你当前落脚的城市',kind:'text',groupId:'g',groupLabel:'个人信息',section:'basic',currentValue:'页面中已有秘密',options:[],maxLength:-1,required:false,blocked:null,...extra});
const config:ModelConfig={...defaultModel,id:'one',revision:1};
describe('最少字段描述与受约束模型匹配',()=>{
  it('发送内容没有资料值、网页已有值或真实条目 ID',()=>{
    const p=demoProfile(),all=sources(p),d=prepareDisclosure([f()],all,{});
    for(const value of [p.basic.full_name!,p.basic.email!,p.basic.phone!,'页面中已有秘密',p.education[0].id,p.education[0].school!])expect(d.text).not.toContain(value);
    expect(d.text).toContain('你当前落脚的城市');expect(d.data.fields[0].allowedSources.length).toBeGreaterThan(0);
  });
  it('不可自动混用联系人或明确不同分组，未知联系方式留给核对',()=>{
    const all=sources(demoProfile()),name=all.find(s=>s.ref==='basic/full_name')!;
    expect(sourceCompatible(f({label:'姓名',groupLabel:'紧急联系人'}),name)).toBe(false);
    expect(suggestSource(f({label:'学校',section:'experience'}),all,{})).toBeUndefined();
    expect(suggestSource(f({label:'联系方式'}),all,{})).toBeUndefined();
  });
  it('用户可编辑含义说明，不能扩展来源权限或篡改 ID',()=>{
    const d=prepareDisclosure([f()],sources(demoProfile()),{}),data=JSON.parse(d.text);data.fields[0].label='本人当前居住的城市';expect(validateDisclosure(JSON.stringify(data),d).fields[0].label).toContain('本人');data.fields[0].allowedSources.push('not-allowed');expect(()=>validateDisclosure(JSON.stringify(data),d)).toThrow();
  });
  it('结果必须是合法的来源引用，不能带生成值、重复项或不一致状态',()=>{
    const all=sources(demoProfile()),field=f(),d=prepareDisclosure([field],all,{}),ref=Object.keys(d.sourceMap).find(k=>d.sourceMap[k]==='basic/city')!;
    const output={matches:[{fieldId:'f1',status:'matched',sourceRefs:[ref]}]};expect(validateMatches(output,d,[field],all,{})[0].candidates[0].sourceRef).toBe('basic/city');
    expect(()=>validateMatches({matches:[{...output.matches[0],value:'模型编造的值'}]},d,[field],all,{})).toThrow();
    for(const sourceRefs of [[ref,ref],['unavailable'],[]])expect(()=>validateMatches({matches:[{...output.matches[0],sourceRefs}]},d,[field],all,{})).toThrow();
  });
  it('未绑定多段经历不会向模型提供任选经历的入口',()=>{const field=f({label:'就读院校',section:'education'}),all=sources(demoProfile());expect(prepareDisclosure([field],all,{}).data.sources).toEqual([]);expect(prepareDisclosure([field],all,{'g:education':'edu-master'}).data.sources.some(s=>s.label==='学校')).toBe(true);});
});
describe('模型协议与网络边界',()=>{
  it('合法地址和端点拼接，不允许查询密钥、HTTP 或用户信息',()=>{
    expect(modelEndpoint(config)).toBe('https://api.deepseek.com/anthropic/v1/messages');expect(modelEndpoint({...config,baseUrl:'https://example.com/v1'})).toBe('https://example.com/v1/messages');expect(modelEndpoint({...config,protocol:'openai',baseUrl:'https://example.com/v1'})).toBe('https://example.com/v1/chat/completions');
    for(const base of ['http://example.com','https://user:key@example.com','https://example.com?key=secret'])expect(()=>modelBase(base)).toThrow();
  });
  it.each(['anthropic','openai'] as const)('正常解析 %s，认证只放请求头',async protocol=>{
    const calls:{url:string;init:RequestInit}[]=[];
    const fetcher=(async(url,init)=>{calls.push({url:String(url),init:init!});return Response.json(protocol==='anthropic'?{role:'assistant',stop_reason:'tool_use',content:[{type:'tool_use',name:'field_matches',input:{matches:[]}}]}:{choices:[{finish_reason:'stop',message:{role:'assistant',content:'{"matches":[]}'}}]});}) as typeof fetch;
    const result=await requestModel({...config,protocol},'synthetic-test-key','system','fields',{},new AbortController().signal,fetcher);
    expect(result.data).toEqual({matches:[]});expect(calls[0].init.body).not.toContain('synthetic-test-key');expect(calls[0].init).toMatchObject({credentials:'omit',redirect:'error'});
  });
  it('失败、输出截断及超限响应不能作为成功建议',async()=>{
    const call=(fetcher:typeof fetch)=>requestModel(config,'synthetic-test-key','s','u',{},new AbortController().signal,fetcher);
    await expect(call((async()=>new Response('',{status:401})) as typeof fetch)).rejects.toThrow('认证');
    await expect(call((async()=>Response.json({role:'assistant',stop_reason:'max_tokens',content:[]})) as typeof fetch)).rejects.toThrow('不完整');
    await expect(call((async()=>new Response('x'.repeat(70000))) as typeof fetch)).rejects.toThrow('64 KiB');
  });
});
