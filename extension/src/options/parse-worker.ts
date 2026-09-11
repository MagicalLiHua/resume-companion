import { parseMarkdown } from '../domain/markdown';
self.onmessage=(event:MessageEvent<{text:string}>)=>{try{self.postMessage({ok:true,result:parseMarkdown(event.data.text)});}catch{self.postMessage({ok:false,error:'解析失败，请检查输入格式或减少内容后重试'});}};
