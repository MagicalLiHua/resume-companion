import type {JobMetadata} from '../domain/journal';
import {applicationUrl} from '../domain/journal';
export function readJobMetadata():JobMetadata{
  let company='',role='';
  const scripts=[...document.querySelectorAll('script[type="application/ld+json"]')].slice(0,20);
  for(const script of scripts){if((script.textContent?.length??0)>100000)continue;try{
    const raw=JSON.parse(script.textContent??'null');const items=Array.isArray(raw)?raw:[...(raw?.['@graph']??[]),raw];
    const job=items.find(item=>item?.['@type']==='JobPosting');if(job){company=typeof job.hiringOrganization?.name==='string'?job.hiringOrganization.name:'';role=typeof job.title==='string'?job.title:'';break;}
  }catch{/* Malformed page metadata is ignored. */}}
  if(!role)role=document.querySelector('h1')?.textContent?.trim()??'';
  return {company:company.slice(0,160),role:role.slice(0,200),url:applicationUrl(location.href)};
}
let activeKey:string|null=null,submitted=false,observer:MutationObserver|null=null,timer:ReturnType<typeof setTimeout>|undefined;
export function armJournal(sessionKey:string){installJournal();activeKey=sessionKey;submitted=false;observer?.disconnect();clearTimeout(timer);return readJobMetadata();}
function notify(evidence:'submit_detected'|'success_detected'){
  if(!activeKey)return;void chrome.runtime.sendMessage({type:'JOURNAL_SIGNAL',sessionKey:activeKey,evidence,metadata:readJobMetadata()}).catch(()=>{});
}
function onSubmit(event:Event){
  if(!activeKey||!event.isTrusted||submitted)return;
  submitted=true;notify('submit_detected');
  const success=()=>/提交成功|投递成功|申请成功|已成功申请|application (?:has been )?submitted|thank you for applying|application received/i.test(document.body.innerText.slice(0,50000));
  const existed=success();let queued=false;
  observer=new MutationObserver(()=>{if(queued)return;queued=true;setTimeout(()=>{queued=false;if(!existed&&success()){notify('success_detected');observer?.disconnect();}},300);});
  observer.observe(document.body,{childList:true,subtree:true,characterData:true});timer=setTimeout(()=>observer?.disconnect(),120000);
}
export function installJournal(){document.removeEventListener('submit',onSubmit,true);document.addEventListener('submit',onSubmit,true);}

