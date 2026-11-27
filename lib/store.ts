import {DatabaseSync} from 'node:sqlite';
import {createHash,createHmac,createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import type {Analysis} from './types.ts';
export class Problem extends Error {status:number;constructor(status:number,message:string){super(message);this.status=status;}}
let conn:DatabaseSync|undefined;
function db(){
  if(conn)return conn;
  const dir=process.env.DATA_DIR||'data';mkdirSync(dir,{recursive:true,mode:0o700});
  conn=new DatabaseSync(join(dir,'usage.sqlite'));
  conn.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS usage(day TEXT PRIMARY KEY, input INTEGER DEFAULT 0, output INTEGER DEFAULT 0, reserved INTEGER DEFAULT 0, calls INTEGER DEFAULT 0, hits INTEGER DEFAULT 0); CREATE TABLE IF NOT EXISTS cache(id TEXT PRIMARY KEY, payload BLOB, created INTEGER);');
  return conn;
}
function day(){return new Date(Date.now()+8*3600000).toISOString().slice(0,10);}
function daily(){const d=day();db().prepare('INSERT OR IGNORE INTO usage(day) VALUES (?)').run(d);return d;}
export function reserve(amount:number){
  const d=daily();const cap=Number(process.env.DAILY_TOKEN_BUDGET||1250000);
  const change=db().prepare('UPDATE usage SET reserved=reserved+? WHERE day=? AND input+output+reserved+?<=?').run(amount,d,amount,Number.isFinite(cap)?cap:0);
  if(!change.changes)throw new Problem(429,'今日用量已满，请明天再试。 Daily limit reached. Please return tomorrow.');
  return (input:number,output:number)=>db().prepare('UPDATE usage SET reserved=reserved-?, input=input+?,output=output+?,calls=calls+1 WHERE day=?').run(amount,input,output,d);
}
export function stats(){return db().prepare('SELECT * FROM usage ORDER BY day DESC LIMIT 31').all();}
const salt=randomBytes(32);
const counters=new Map<string,number[]>();
let cleaned=0;
export function limit(req:Request,scope:'analyze'|'ocr',count=1){
  const now=Date.now();if(now-cleaned>60000){for(const [k,v] of counters)if(v.at(-1)!<=now-3600000)counters.delete(k);cleaned=now;}
  const ip=req.headers.get('x-tb-client')||'local';const key=createHmac('sha256',salt).update(scope+':'+ip).digest('hex');
  const recent=(counters.get(key)||[]).filter(t=>t>now-3600000);
  if(recent.length+count>(scope==='ocr'?10:30))throw new Problem(429,'本小时次数已满，请稍后再试。 Hourly limit reached.');
  counters.set(key,recent.concat(Array(count).fill(now)));
}
// Only a visitor holding the matching sentence can supply the material needed to decrypt its cached answer.
function cacheKey(source:string,lang:string){
  const secret=process.env.CACHE_SECRET;if(!secret)return null;
  const norm=source.trim().replace(/\s+/g,' ');
  const material=createHmac('sha256',secret).update('v3-12steps\0'+lang+'\0'+norm).digest();
  return {material,id:createHash('sha256').update(material).digest('hex')};
}
export function cached(source:string,lang:string):Analysis|null{
  const key=cacheKey(source,lang);if(!key)return null;
  const row=db().prepare('SELECT payload FROM cache WHERE id=? AND created>?').get(key.id,Date.now()-7*86400000);
  if(!row)return null;
  const b=Buffer.from(row.payload as Uint8Array);
  const cipher=createDecipheriv('aes-256-gcm',key.material,b.subarray(0,12));cipher.setAuthTag(b.subarray(12,28));
  const a=JSON.parse(Buffer.concat([cipher.update(b.subarray(28)),cipher.final()]).toString());
  if(a.original!==source){
    const stored=[...String(a.original).matchAll(/\S+/g)], current=[...source.matchAll(/\S+/g)];
    if(stored.length!==current.length||stored.some((w,i)=>w[0]!==current[i][0]))return null;
    const offset=(i:number)=>{const j=stored.findIndex(w=>w.index!<=i&&i<w.index!+w[0].length);return j<0?-1:current[j].index!+i-stored[j].index!;};
    for(const swap of a.shrink){const start=offset(swap.startIndex),last=offset(swap.startIndex+swap.big.length-1);if(start<0||last<start)return null;swap.startIndex=start;swap.big=source.slice(start,last+1);}
    a.original=source;
  }
  db().prepare('UPDATE usage SET hits=hits+1 WHERE day=?').run(daily());return a;
}
export function save(source:string,lang:string,a:Analysis){
  const key=cacheKey(source,lang);if(!key)return;
  const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',key.material,iv);
  const body=Buffer.concat([cipher.update(JSON.stringify(a)),cipher.final()]);
  db().prepare('DELETE FROM cache WHERE created<=?').run(Date.now()-7*86400000);
  db().prepare('INSERT OR REPLACE INTO cache VALUES(?,?,?)').run(key.id,Buffer.concat([iv,cipher.getAuthTag(),body]),Date.now());
}
