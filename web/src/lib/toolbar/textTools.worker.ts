import {transformText} from './commands/textTools';
self.onmessage=(event:MessageEvent<{id:string;input:string;params:Record<string,string>}>)=>{const {id,input,params}=event.data;self.postMessage(transformText(id,input,params));};
