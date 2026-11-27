// One sentence, at most three model calls. An answer that is exact is used as given;
// one that is sound but sloppy is rebuilt; anything still unsettled goes back to the
// model with its own answer and the precise points to correct.
import type {Analysis} from './types.ts';
import {expandAnalysis} from './compact-analysis.ts';
import {validate} from './validate.ts';
import {Issues,parseLoose,rebuild} from './repair.ts';

export type Usage={input:number,output:number};
export type Follow={assistant:string,user:string};
export type Ask=(system:string,user:string,limit:number,onText?:(text:string)=>void,follow?:Follow)=>Promise<{answer:string,usage?:Usage}>;
export type Plain={skeleton:string,skeletonZh?:string,simple:string[],zh:string};
export type Outcome={analysis?:Analysis,plain?:Plain,origin:'model'|'static',usage:Usage,tries:number,repaired:boolean,problems:string[][]};

export function read(source:string,raw:unknown,settle?:{final?:boolean,flat?:boolean}):{analysis:Analysis,repaired:boolean} {
  if(!settle){
    try{return {analysis:validate(expandAnalysis(source,raw),source),repaired:false};}catch{/* rebuilt below */}
  }
  return {analysis:validate(rebuild(source,raw,settle),source),repaired:true};
}
function plainOf(raw:unknown):Plain|undefined {
  const r=raw as {core?:unknown,coreZh?:unknown,zh?:unknown}|null;
  if(typeof r?.core!=='string'||typeof r.zh!=='string'||!r.core||!r.zh)return undefined;
  return {skeleton:r.core.slice(0,1800),skeletonZh:typeof r.coreZh==='string'&&/\p{Script=Han}/u.test(r.coreZh)?r.coreZh.slice(0,1600):undefined,simple:[],zh:r.zh.slice(0,3200)};
}

export async function generate(source:string,system:string,ask:Ask,onText?:(text:string)=>void,attempts=3):Promise<Outcome> {
  const usage={input:0,output:0},request=JSON.stringify({sentence:source});
  const answers:unknown[]=[],problems:string[][]=[];
  let plain:Plain|undefined,follow:Follow|undefined;
  for(let attempt=0;attempt<attempts;attempt++){
    const reply=await ask(system,request,9000,attempt?undefined:onText,follow);
    usage.input+=reply.usage?.input||0;usage.output+=reply.usage?.output||0;
    let found:string[];
    try{
      const raw=parseLoose(reply.answer);answers.unshift(raw);
      plain=plainOf(raw)||plain;
      return {...read(source,raw),origin:'model',usage,tries:attempt+1,problems};
    }catch(e){found=e instanceof Issues?e.list:[String(e instanceof Error?e.message:e).slice(0,900)];}
    problems.push(found);
    // The same objection twice means the model is not going to fix it; settle what there is.
    if(problems.length>1&&problems.at(-2)!.join()===found.join())break;
    follow={assistant:reply.answer.slice(0,12000),user:'That JSON cannot be used yet:\n'+found.map(p=>'- '+p).join('\n')
      +'\nReturn the complete compact JSON again with these points corrected. Keep everything else exactly as it was.'};
  }
  // Nothing passed as it stands. Settle the newest usable answer rather than show no lesson.
  for(const settle of [{final:true},{final:true,flat:true}])for(const raw of answers){
    try{return {...read(source,raw,settle),origin:'model',usage,tries:problems.length,problems};}catch{/* try the next */}
  }
  if(!plain)throw Error('No usable model result.');
  return {plain,origin:'static',usage,tries:problems.length,repaired:false,problems};
}
