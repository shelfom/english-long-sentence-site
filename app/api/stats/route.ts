import {createHash,timingSafeEqual} from 'node:crypto';
import {stats} from '../../../lib/store';
export const dynamic='force-dynamic';
const hash=(v:string)=>createHash('sha256').update(v).digest();
export function GET(req:Request){
  if(!process.env.STATS_TOKEN||!timingSafeEqual(hash(req.headers.get('Authorization')||''),hash('Bearer '+process.env.STATS_TOKEN)))return new Response(null,{status:401});
  return Response.json({timezone:'Asia/Shanghai',days:stats()},{headers:{'Cache-Control':'no-store'}});
}
