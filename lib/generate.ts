// One sentence, at most three model calls. An answer that is exact is used as given;
// one that is sound but sloppy is rebuilt; anything still unsettled goes back to the
// model with its own answer and the precise points to correct.
import type {Analysis} from './types.ts';
import {expandAnalysis} from './compact-analysis.ts';
import {validate} from './validate.ts';
import {Glossless,Issues,easierKey,hardSwaps,parseLoose,rebuild,type Easier} from './repair.ts';

export type Usage={input:number,output:number};
export type Follow={assistant:string,user:string};
export type Ask=(system:string,user:string,limit:number,onText?:(text:string)=>void,follow?:Follow)=>Promise<{answer:string,usage?:Usage}>;
export type Plain={skeleton:string,skeletonZh?:string,simple:string[],zh:string};
// `settled` marks a lesson fitted from an answer the model did not correct; 'flat' is the plainest fit, without head words.
export type Outcome={analysis?:Analysis,plain?:Plain,origin:'model'|'static',usage:Usage,tries:number,repaired:boolean,problems:string[][],settled?:'final'|'flat'};

type Settle={final?:boolean,flat?:boolean,gloss?:Map<string,string>,divide?:boolean,easier?:Easier};
export function read(source:string,raw:unknown,settle?:Settle):{analysis:Analysis,repaired:boolean} {
  const {easier,...how}=settle||{};
  if(!Object.keys(how).length&&!easier?.size){
    try{return {analysis:validate(expandAnalysis(source,raw),source),repaired:false};}catch{/* rebuilt below */}
  }
  return {analysis:validate(rebuild(source,raw,settle),source),repaired:true};
}
function plainOf(raw:unknown):Plain|undefined {
  const r=raw as {core?:unknown,coreZh?:unknown,zh?:unknown}|null;
  if(typeof r?.core!=='string'||typeof r.zh!=='string'||!r.core||!r.zh)return undefined;
  return {skeleton:r.core.slice(0,1800),skeletonZh:typeof r.coreZh==='string'&&/\p{Script=Han}/u.test(r.coreZh)?r.coreZh.slice(0,1600):undefined,simple:[],zh:r.zh.slice(0,3200)};
}

const glossing='You are given an English sentence and pieces cut from it, in reading order. Give each piece a brief, natural Chinese rendering that covers only that piece as it is used in the sentence. Return JSON only: {"zh":["…"]} with exactly one string for each piece.';
// A row divided around the rows it contains leaves parts without Chinese of their own.
// One small request supplies it; if that fails, the row is left undivided instead.
async function readFully(source:string,raw:unknown,ask:Ask,usage:Usage,easier?:Easier){
  try{return read(source,raw,{easier});}
  catch(e){
    if(!(e instanceof Glossless))throw e;
    try{
      const reply=await ask(glossing,JSON.stringify({sentence:e.sentence,pieces:e.pieces}),200+80*e.pieces.length);
      usage.input+=reply.usage?.input||0;usage.output+=reply.usage?.output||0;
      const zh=(JSON.parse(reply.answer) as {zh?:unknown}).zh;
      if(Array.isArray(zh)&&zh.length===e.pieces.length&&zh.every(x=>typeof x==='string'&&/\p{Script=Han}/u.test(x)))
        return read(source,raw,{easier,gloss:new Map(e.pieces.map((piece,i)=>[piece,String(zh[i]).trim().slice(0,300)]))});
    }catch(again){if(again instanceof Issues&&!(again instanceof Glossless))throw again;}
    return read(source,raw,{easier,divide:false});
  }
}

const easing='You are given an English sentence and terms from it. Each term came with a replacement that is still too hard for a beginner. For each term, find one to three everyday words that a beginner already knows (CEFR A2, the 1,500 most common English words) and that can stand exactly where the term stands: same part of speech and form. A plural noun stays a plural noun, a verb keeps its tense and its object, a describing word before a noun still reads well before that noun. A rough everyday word is right. First write the few words around the term with your replacement in place, as "inPlace", and check that it is correct English; then give the replacement alone as "easier". Where nothing reads correctly, use null for both. Return JSON only: {"terms":[{"inPlace":"…","easier":"…"}]} with exactly one entry for each term, in order.';
// Where the model replaced a big word with another big word, one small request asks for
// everyday words instead. The live preview and the finished lesson share the answer.
export function easer(source:string,ask:Ask){
  const usage:Usage={input:0,output:0},asked=new Map<string,Promise<Easier>>();
  async function request(swaps:unknown):Promise<Easier> {
    const hard=hardSwaps(source,swaps),found:Easier=new Map();
    if(!hard.length)return found;
    const reply=await ask(easing,JSON.stringify({sentence:source,terms:hard.map(x=>({term:x.big,tooHard:x.small}))}),200+90*hard.length);
    usage.input+=reply.usage?.input||0;usage.output+=reply.usage?.output||0;
    const list=(JSON.parse(reply.answer) as {terms?:unknown}).terms;
    if(Array.isArray(list)&&list.length===hard.length)hard.forEach((x,i)=>{
      const word=(list[i] as {easier?:unknown}|null)?.easier;
      if(typeof word==='string'&&word.trim())found.set(easierKey(x.big,x.small),word.trim().slice(0,80));
    });
    return found;
  }
  return {usage,ease(swaps:unknown):Promise<Easier> {
    const key=JSON.stringify(swaps??null);
    let answer=asked.get(key);
    if(!answer){answer=request(swaps).catch(()=>new Map());asked.set(key,answer);}
    return answer;
  }};
}

// A failure before anything has reached the learner (a dropped connection, an interrupted
// reply) is tried once more. `attempt` calls `shown` as soon as it has put something on screen.
export async function persist<T>(attempt:(shown:()=>void)=>Promise<T>,final:(e:unknown)=>boolean=()=>false):Promise<T> {
  let seen=false;
  try{return await attempt(()=>{seen=true;});}
  catch(e){if(seen||final(e))throw e;}
  return attempt(()=>{});
}

export async function generate(source:string,system:string,ask:Ask,onText?:(text:string)=>void,attempts=3,ease?:(swaps:unknown)=>Promise<Easier>):Promise<Outcome> {
  const usage={input:0,output:0},request=JSON.stringify({sentence:source});
  // A sound answer takes 10 to 20 tokens a word. The ceiling leaves it well over twice that,
  // and stops a reply that has gone astray long before the old fixed limit would have.
  const ceiling=Math.min(9000,Math.max(1800,700+45*source.split(/\s+/).length));
  const answers:{raw:unknown,easier?:Easier}[]=[],problems:string[][]=[];
  let plain:Plain|undefined,follow:Follow|undefined;
  for(let attempt=0;attempt<attempts;attempt++){
    const reply=await ask(system,request,ceiling,attempt?undefined:onText,follow);
    usage.input+=reply.usage?.input||0;usage.output+=reply.usage?.output||0;
    let found:string[];
    try{
      const raw=parseLoose(reply.answer);
      const easier=ease?await ease((raw as {swaps?:unknown}).swaps):undefined;
      answers.unshift({raw,easier});
      plain=plainOf(raw)||plain;
      return {...await readFully(source,raw,ask,usage,easier),origin:'model',usage,tries:attempt+1,problems};
    }catch(e){found=e instanceof Issues?e.list:[String(e instanceof Error?e.message:e).slice(0,900)];}
    problems.push(found);
    // The same objection twice means the model is not going to fix it; settle what there is.
    if(problems.length>1&&problems.at(-2)!.join()===found.join())break;
    follow={assistant:reply.answer.slice(0,12000),user:'That JSON cannot be used yet:\n'+found.map(p=>'- '+p).join('\n')
      +'\nReturn the complete compact JSON again with these points corrected. Keep everything else exactly as it was.'};
  }
  // Nothing passed as it stands. Settle the newest usable answer rather than show no lesson.
  for(const settle of [{final:true},{final:true,flat:true}])for(const {raw,easier} of answers){
    try{return {...read(source,raw,{...settle,easier}),origin:'model',usage,tries:problems.length,problems,settled:settle.flat?'flat':'final'};}catch{/* try the next */}
  }
  if(!plain)throw Error('No usable model result.');
  return {plain,origin:'static',usage,tries:problems.length,repaired:false,problems};
}
