/** Center and hit-test a snapshot target before delegating a pointer click.
 * Puppeteer's visible/in-viewport checks alone do not exclude fixed footers. */
export async function preparePointerTarget(handle:any):Promise<void> {
 const nativeOption=await handle.evaluate((el:Element)=>el.tagName==='OPTION');
 if(nativeOption)return; // Upstream selects native options through their SELECT.
 await handle.evaluate((el:Element)=>el.scrollIntoView({block:'center',inline:'center'}));
 let previous='';
 for(let i=0;i<12;i++){
  const probe=await handle.evaluate((el:Element)=>{
   if(!el.isConnected)throw new Error('target_detached_before_click');
   const rect=el.getBoundingClientRect();let x=rect.x+rect.width/2,y=rect.y+rect.height/2;
   let doc=el.ownerDocument,expected:Element=el;
   let hit=rect.width>0&&rect.height>0;
   try{
    while(hit){
     const top=doc.elementFromPoint(x,y);hit=Boolean(top&&(top===expected||expected.contains(top)));
     const host=doc.defaultView?.frameElement;if(!host)break;
     const box=host.getBoundingClientRect();x+=box.x+(host as HTMLElement).clientLeft;y+=box.y+(host as HTMLElement).clientTop;expected=host;doc=host.ownerDocument;
    }
   }catch{hit=false;}
   return {hit,box:[rect.x,rect.y,rect.width,rect.height].join(',')};
  });
  if(probe.hit&&probe.box===previous)return;
  previous=probe.box;await new Promise<void>(resolve=>setTimeout(resolve,50));
 }
 throw new Error('target_obscured: the requested control is covered; no click was dispatched');
}
