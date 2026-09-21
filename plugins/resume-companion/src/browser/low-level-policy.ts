import {createDomFormRuntime} from './form-dom.js';
import {manualReason,type PolicyTarget} from './manual-policy.js';
import {fixtureDiagnosticsAllowed} from './execution-mode.js';
export {fixtureDiagnosticsAllowed} from './execution-mode.js';

type Page={pptrPage:any;getElementByUid:(uid:string)=>Promise<any>};
const describe=new Function('element',`if(!element.isConnected)throw new Error('target_detached_before_policy');return (${createDomFormRuntime.toString()})().describe(element);`) as (element:Element)=>PolicyTarget;
const focused=new Function(`const element=document.activeElement;return element&&element!==document.body ? (${createDomFormRuntime.toString()})().describe(element) : null;`) as ()=>PolicyTarget|null;
const inputs=new Set(['fill','fill_form','click','type_text','press_key','drag','click_at','upload_file','evaluate_script']);

/** Resolve actual DOM targets, not caller-provided semantic hints. Preflight the
 * entire raw batch before dispatching its first write. */
export async function guardLowLevelAction(name:string,params:Record<string,any>,page:Page):Promise<void> {
  if(!inputs.has(name))return;
  const fixture=fixtureDiagnosticsAllowed(page.pptrPage.url());
  if(name==='evaluate_script'){
    if(!fixture)throw new Error('controlled_mode_script_disabled: use form_observe or take_snapshot');
    return;
  }
  if(name==='upload_file'){
    if(!fixture)throw new Error('manual_boundary: upload files in the dedicated browser');
    return;
  }
  if(['drag','click_at'].includes(name))throw new Error('unscoped_action_disabled: use semantic form tools');
  if(name==='press_key'&&!/^(?:Backspace|Delete|ArrowLeft|ArrowRight|ArrowUp|ArrowDown|Home|End|Escape|Tab|Shift\+Tab|Control\+A|Meta\+A)$/.test(params.key))
    throw new Error('unscoped_key_disabled: use semantic form tools');
  if(name==='type_text'&&params.submitKey&&!['Tab','Escape'].includes(params.submitKey))throw new Error('unscoped_key_disabled: use semantic form tools');
  const targets:PolicyTarget[]=[];
  if(name==='type_text'||name==='press_key'){
    const target=await page.pptrPage.evaluate(focused);
    if(!target&&name==='press_key'&&['Tab','Shift+Tab','Escape'].includes(params.key))return;
    if(!target)throw new Error('unscoped_action_disabled: focus a supported form control');
    targets.push(target);
  }else{
    const uids=name==='fill_form'?params.elements?.map((e:{uid:string})=>e.uid):[params.uid];
    if(!uids?.length||uids.some((uid:unknown)=>typeof uid!=='string'))throw new Error('unscoped_action_disabled');
    for(const uid of uids){
      // DOM replacement can happen after UID recovery but before metadata is
      // read. No input has been dispatched: recover only that detached target,
      // then evaluate the policy against the replacement's current context.
      const deadline=Date.now()+1500;
      for(;;){
        const handle=await page.getElementByUid(uid);
        try{targets.push(await handle.evaluate(describe));break;}
        catch(error){
          if(!(error instanceof Error)||!error.message.includes('target_detached_before_policy')||Date.now()>=deadline)throw error;
        }finally{await handle.dispose();}
        await new Promise(resolve=>setTimeout(resolve,50));
      }
    }
  }
  for(const target of targets){
    if(manualReason(target))throw new Error('manual_boundary: this field must be handled by the user');
    if(!target.label)throw new Error('unscoped_action_disabled: use semantic form tools');
    if(name==='click'&&/^(下一步|下一页|保存|next|continue|save)$/i.test(target.label.replace(/\s/g,'')))throw new Error('semantic_transition_required: use form_activate');
  }
}
