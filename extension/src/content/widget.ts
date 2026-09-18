let widgetToken='',host:HTMLDivElement|null=null;
let enabled=true,refresh:(()=>void)|undefined;
export function setWidgetVisible(value:boolean){enabled=value;if(host)host.hidden=!value;if(value)refresh?.();}
export function isWidgetSender(sender:chrome.runtime.MessageSender,message:Record<string,unknown>){
  if(!widgetToken||message.widgetToken!==widgetToken||sender.id!==chrome.runtime.id||!sender.url)return false;
  try{const u=new URL(sender.url);return u.protocol==='chrome-extension:'&&u.hostname===chrome.runtime.id&&u.pathname==='/sidepanel.html'&&u.searchParams.has('widget');}catch{return false;}
}
function looksLikeApplication(){
  if(/(?:job|career|recruit|zhaopin|51job|iguopin|yingjiesheng|lever\.co|greenhouse|mokahr|zhipin|campus|talent)/i.test(location.hostname+location.pathname))return true;
  const heading=(document.title+' '+document.querySelector('h1')?.textContent).slice(0,500);
  if(/招聘|应聘|简历|职位|投递|careers|apply.*job|job.*application/i.test(heading))return true;
  const text=document.body.innerText.slice(0,30000);return /姓名|full name/i.test(text)&&/教育经历|工作经历|求职意向|项目经历|employment history|work experience/i.test(text);
}
export function installWidget(){
  if(window.top!==window.self||!/^https?:$/.test(location.protocol))return;
  let queued=false,creating=false;
  async function update(){
    queued=false;if(creating||!enabled)return;
    if(!looksLikeApplication()){if(host)host.hidden=true;return;}
    if(host){host.hidden=false;return;}
    creating=true;
    try{
      const registration=await chrome.runtime.sendMessage({type:'WIDGET_REGISTER'});if(!registration?.ok)return;if(!registration.data.enabled){enabled=false;return;}
      // Reloading an unpacked extension leaves the old isolated world's DOM behind.
      document.querySelectorAll('#resume-companion-widget').forEach(node=>node.remove());
      widgetToken=registration.data.token;host=document.createElement('div');host.id='resume-companion-widget';
      host.style.cssText='all:initial;position:fixed;right:24px;bottom:24px;z-index:2147483646;display:block;width:54px;height:54px;';
      const shadow=host.attachShadow({mode:'closed'}),style=document.createElement('style');
      style.textContent='button{font:14px -apple-system,BlinkMacSystemFont,"Microsoft YaHei",sans-serif;cursor:pointer;border:1px solid #ddd} .ball{width:54px;height:54px;border-radius:50%;background:#222;color:#fff;font-size:23px;box-shadow:0 5px 22px #0003}.ball:hover{background:#444}.window{position:absolute;right:0;bottom:68px;width:min(430px,calc(100vw - 40px));height:min(680px,calc(100vh - 110px));min-height:250px;background:#fafafa;border:1px solid #ccc;border-radius:15px;box-shadow:0 12px 48px #0003;overflow:hidden}.window iframe{border:0;width:100%;height:calc(100% - 35px);display:block;background:#fafafa}.bar{height:35px;display:flex;align-items:center;justify-content:space-between;padding:0 10px;font:12px sans-serif;background:#eee;color:#444}.close{background:transparent;border:0;padding:4px 9px;font-size:20px}button:focus-visible{outline:3px solid #888;outline-offset:3px}';
      shadow.append(style);const ball=document.createElement('button');ball.className='ball';ball.type='button';ball.textContent='简';ball.setAttribute('aria-label','打开简历随行悬浮窗口');ball.title='选择简历并填写';shadow.append(ball);
      let windowNode:HTMLDivElement|null=null;
      ball.onclick=()=>{
        if(windowNode){windowNode.remove();windowNode=null;ball.setAttribute('aria-expanded','false');return;}
        windowNode=document.createElement('div');windowNode.className='window';const bar=document.createElement('div');bar.className='bar';bar.textContent='简历随行 · 本次填写';
        const close=document.createElement('button');close.className='close';close.textContent='×';close.setAttribute('aria-label','收起填写窗口');close.onclick=()=>{windowNode?.remove();windowNode=null;ball.setAttribute('aria-expanded','false');ball.focus();};bar.append(close);
        const frame=document.createElement('iframe');frame.title='选择简历并填写';frame.src=chrome.runtime.getURL('sidepanel.html')+'?widget=1#'+widgetToken;
        windowNode.append(bar,frame);shadow.append(windowNode);ball.setAttribute('aria-expanded','true');
      };
      document.documentElement.append(host);
    }catch{/* The toolbar remains available if this page blocks the floating frame. */}finally{creating=false;}
  }
  const observer=new MutationObserver(()=>{if(!queued){queued=true;setTimeout(()=>void update(),800);}});observer.observe(document.body,{childList:true,subtree:true});
  refresh=()=>void update();
  window.addEventListener('popstate',()=>void update());window.addEventListener('hashchange',()=>void update());void update();
}
