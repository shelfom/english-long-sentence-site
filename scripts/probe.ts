// Runs the live analysis loop on a list of sentences and records every model answer,
// so a rejected breakdown can be studied and replayed offline.
//   node scripts/probe.ts sentences.json [parallel] [extra-instructions.txt]      (needs ARK_API_KEY)
// Uses a throwaway usage database and never reads or writes the lesson cache.
import {readFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
process.env.DATA_DIR=mkdtempSync(join(tmpdir(),'mba-probe-'));
delete process.env.CACHE_SECRET;
const {ark}=await import('../lib/ark.ts');
const {generate,easer}=await import('../lib/generate.ts');
const {reviewCore,withCore}=await import('../lib/refine-core.ts');
const method=JSON.parse(readFileSync(new URL('../lib/method.json',import.meta.url),'utf8'));
const contract=/const contract=`([\s\S]*?)`;/.exec(readFileSync(new URL('../lib/analysis.ts',import.meta.url),'utf8'))![1];
const sentences:string[]=JSON.parse(readFileSync(process.argv[2],'utf8'));
const parallel=Number(process.argv[3]||4);
// An optional file of extra instructions, to try a change to the contract before making it.
const extra=process.argv[4]?'\n'+readFileSync(process.argv[4],'utf8'):'';

async function probe(source:string){
  const attempts:{ms:number,answer:string,usage?:{input:number,output:number}}[]=[];
  const began=Date.now();
  try{
    const ask=async(system:string,user:string,limit:number,onText?:(text:string)=>void,follow?:{assistant:string,user:string})=>{
      const at=Date.now(),reply=await ark(system,user,limit,onText,follow);
      attempts.push({ms:Date.now()-at,answer:reply.answer,usage:reply.usage});
      return reply;
    };
    // As on the site: a replacement that is still hard gets one small request for everyday words.
    const words=easer(source,ask);
    const out=await generate(source,method+'\n'+contract+extra,ask,undefined,3,words.ease);
    // As on the site: the skeleton gets its own second look. `firstCore` keeps what the analysis wrote.
    const firstCore=out.analysis?.skeleton.text;
    if(out.analysis&&!process.env.NO_CORE_REVIEW)out.analysis=withCore(out.analysis,await reviewCore(out.analysis,ask));
    return {source,ok:Boolean(out.analysis),tries:out.tries,repaired:out.repaired,problems:out.problems,ms:Date.now()-began,attempts,analysis:out.analysis,firstCore};
  }catch(e){return {source,ok:false,tries:attempts.length,repaired:false,problems:[[String(e)]],ms:Date.now()-began,attempts};}
}
const queue=sentences.map((s,i)=>[i,s] as const),out:unknown[]=[];
await Promise.all(Array.from({length:parallel},async()=>{
  for(let job=queue.shift();job;job=queue.shift()){
    const r=await probe(job[1]);out[job[0]]=r;
    process.stderr.write((r.ok?'ok   ':'FAIL ')+r.tries+' try'+(r.repaired?' repaired ':' ')+r.ms+'ms  '+job[1].slice(0,56)+'\n');
  }
}));
process.stdout.write(JSON.stringify(out));
