import {Problem,reserve} from './store.ts';
type Part={type:'text',text:string}|{type:'image_url',image_url:{url:string}};
export type Usage={input:number,output:number};
export async function ark(system:string,user:string|Part[],outLimit:number,onText?:(text:string)=>void){
  if(!process.env.ARK_API_KEY)throw new Problem(503,'模型暂未连接。 Model unavailable.');
  const inputBound=Buffer.byteLength(system)+(typeof user==='string'?Buffer.byteLength(user):18000)+512;
  const settle=reserve(inputBound+outLimit);
  let received=false,usage:Usage|undefined;
  try{
    const res=await fetch('https://ark.cn-beijing.volces.com/api/v3/chat/completions',{
      method:'POST',headers:{Authorization:'Bearer '+process.env.ARK_API_KEY,'Content-Type':'application/json'},
      signal:AbortSignal.timeout(150000),body:JSON.stringify({model:'doubao-seed-2-0-pro-260215',thinking:{type:'disabled'},temperature:0.1,
        max_tokens:outLimit,stream:true,stream_options:{include_usage:true},response_format:{type:'json_object'},
        messages:[{role:'system',content:system},{role:'user',content:user}]})
    });
    if(!res.ok||!res.body)throw new Problem(503,'模型暂时繁忙，请重试。 The model is busy. Please retry.');
    received=true;let buffer='',answer='';
    const reader=res.body.pipeThrough(new TextDecoderStream()).getReader();
    function line(row:string){
      if(!row.startsWith('data:'))return;const data=row.slice(5).trim();if(!data||data==='[DONE]')return;
      const frame=JSON.parse(data);if(frame.error)throw Error('Upstream interrupted');
      if(frame.usage)usage={input:frame.usage.prompt_tokens,output:frame.usage.completion_tokens};
      const delta=frame.choices?.[0]?.delta?.content;if(typeof delta==='string'){answer+=delta;onText?.(answer);}
    }
    for(;;){const part=await reader.read();if(part.done)break;buffer+=part.value;const rows=buffer.split('\n');buffer=rows.pop()||'';for(const row of rows)line(row);}
    line(buffer);return {answer,usage};
  }finally{settle(usage?.input??(received?inputBound:0),usage?.output??(received?outLimit:0));}
}
