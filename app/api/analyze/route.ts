import {analyze} from '../../../lib/analysis';
import {splitText} from '../../../lib/validate';
import {body,failure} from '../../../lib/http';
import {limit,Problem} from '../../../lib/store';
export const runtime='nodejs';
export async function POST(req:Request){
  try{
    if(!req.headers.get('content-type')?.includes('application/json'))throw new Problem(415,'JSON required.');
    const bytes=await body(req,10000);let input;try{input=JSON.parse(bytes.toString());}catch{throw new Problem(400,'Invalid JSON.');}
    if(typeof input?.text!=='string'||!input.text.trim()||input.text.length>1500||!/[A-Za-z]/.test(input.text))throw new Problem(400,'请输入英文，最多 1,500 个字符。 Enter up to 1,500 characters of English.');
    const sentences=splitText(input.text);const lang=input.lang==='en'?'en':'zh';limit(req,'analyze',sentences.length);
    return new Response(new ReadableStream({async start(controller){
      let closed=false;const send=(event:unknown)=>{if(!closed){try{controller.enqueue(new TextEncoder().encode(JSON.stringify(event)+'\n'));}catch{closed=true;}}};
      send({type:'start',sentences});
      try{for(const [index,source] of sentences.entries()){
        if(req.signal.aborted||closed)break;
        try{const result=await analyze(source,lang,part=>send({type:'shrink',index,part}),chunk=>send({type:'chunk',index,chunk}));send({type:'result',index,...result});}
        catch(e){
          // The learner sees a plain message; the cause goes to the server log, without the sentence.
          if(!(e instanceof Problem))console.error('[analyze] failed:',e instanceof Error?(e.stack||e.message)+(e.cause?' | cause: '+String(e.cause):''):String(e));
          send({type:'error',index,error:e instanceof Problem?e.message:'讲解暂时无法完成，请重试。 Please try again.'});
        }
      }}finally{send({type:'done'});if(!closed)controller.close();}
    }}),{headers:{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store, no-transform','X-Accel-Buffering':'no'}});
  }catch(e){return failure(e);}
}
