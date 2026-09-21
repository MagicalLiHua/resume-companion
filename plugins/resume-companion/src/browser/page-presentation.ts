type Params=Record<string,any>;
const reasons=new Set(['user_request','manual_action','error','completed']);
/** A presentation request does not grant any permission to fill or navigate.
 * Ordinary calls stay in the background; explicit handoff events focus once. */
export class PagePresentation {
  private shown=new Map<string,number>();
  constructor(private readonly clock=Date.now){}
  async run<T>(tool:string,params:Params,owner:string,handler:(params:Params)=>Promise<T>):Promise<T> {
    if(tool!=='select_page'&&tool!=='new_page')return handler(params);
    const adjusted:Params={...params,...(tool==='new_page'?{background:params.background??true}:{bringToFront:params.bringToFront??false})};
    const foreground=tool==='new_page'?!adjusted.background:adjusted.bringToFront;
    if(!foreground)return handler(adjusted);
    if(!reasons.has(params.attention_reason))throw new Error('attention_reason_required');
    if(params.attention_reason!=='user_request'&&!params.attention_event_id)throw new Error('attention_event_id_required');
    for(const [key,at] of this.shown)if(this.clock()-at>1800000)this.shown.delete(key);
    const key=JSON.stringify([owner,tool,params.pageId??params.url,params.attention_reason,params.attention_event_id]);
    const repeat=params.attention_reason!=='user_request'&&this.shown.has(key);
    if(repeat){if(tool==='new_page')adjusted.background=true;else adjusted.bringToFront=false;}
    const result=await handler(adjusted);
    if(!repeat&&!(result&&typeof result==='object'&&'isError' in result&&result.isError)){
      this.shown.set(key,this.clock());
      while(this.shown.size>256)this.shown.delete(this.shown.keys().next().value!);
    }
    return result;
  }
  clearOwner(owner:string):void {
    for(const key of this.shown.keys())if(JSON.parse(key)[0]===owner)this.shown.delete(key);
  }
}
