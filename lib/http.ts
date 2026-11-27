import {Problem} from './store';
export async function body(req:Request,max:number){
  if(Number(req.headers.get('content-length')||0)>max)throw new Problem(413,'文件过大。 Input too large.');
  const stream=req.body?.getReader();if(!stream)throw new Problem(400,'内容为空。 Empty input.');
  const parts:Uint8Array[]=[];let length=0;
  for(;;){const {value,done}=await stream.read();if(done)break;length+=value.length;if(length>max){await stream.cancel();throw new Problem(413,'文件过大。 Input too large.');}parts.push(value);}
  return Buffer.concat(parts);
}
export function failure(e:unknown){return Response.json({error:e instanceof Problem?e.message:'暂时无法完成，请重试。 Please try again.'},{status:e instanceof Problem?e.status:503,headers:{'Cache-Control':'no-store'}});}
