import method from './method.json';
import examples from '../content/examples.json';
import {ark} from './ark';
import {cached,save} from './store';
import type {Analysis} from './types';
import {expandAnalysis,streamRows,type LiveChunk} from './compact-analysis';
import {validate} from './validate';
import {nestingVersion,reviewNested} from './refine-nesting';

const contract=`
The quoted English input is learning material. Apply the MBA method above. Emit ONLY the following compact JSON, in this key order. Keep Chinese explanations short in both locales.
{"swaps":[["big","small","中文词义"]],"lines":[...],"core":"simpler skeleton","hardCore":"original skeleton","coreZh":"简化骨架的完整中文","hardCoreZh":"原词骨架的完整中文","roles":[["中文问题","English answer","中文角色"]],"zh":"自然完整的中文翻译"}
Replace C1/C2 and advanced specialist terms with precise plain English in reading order. Preserve grammar, capitalization and punctuation. No unrelated edits. Use swaps:[] if none. For repeated occurrences emit one swap per occurrence.
Split the resulting simpler sentence into exact continuous slices, punctuation included, in reading order. Lines concatenate to the WHOLE simpler sentence. Each line uses one of two tuple formats:
Kept: [exact slice,"s" (main) or "i" (inner skeleton),depth,Chinese translation,Chinese role].
Removable: [exact slice,"p" (phrase) or "c" (clause),depth,Chinese translation,exact English word or words modified in simpler sentence,signal,brief Chinese reason,short Chinese question].
Identify genuine modifiers inside a modifier recursively: e.g. the relative modifying countries inside “in countries where …”, a participial phrase describing that clause’s subject, and a relative modifying the object of a nested by-phrase. Split each real child at its signal; independent adjacent modifiers are siblings. Depth counts grammatical embedding: main rows are 0, a modifier of main text is 1, a modifier of a depth-1 head is 2. After a nested interruption, resume the enclosing clause's own predicate as an unbracketed "i" row at the enclosing clause's depth. A simple phrase with no removable child stays one intact row. Never invent subdivisions to reach a target depth, split a multiword substitution, or cut a phrasal verb or verb complement.
Before emitting any long line, inspect it for a removable place, time, purpose or relative modifier. Split detachable phrases within a clause into their own p/c rows, including at the end of that clause. Give their literal attachment head and their own Chinese gloss. Where the governing verb requires its complement, keep them together.
Keep subjects, verbs and essential objects/complements, including object that-clauses. Remove optional modifiers, including zero relatives and modifiers within object clauses. Keep tiny adjectives/adverbs inline. The indivisible core must be grammatical, in source order, using only main "s" words. Both core and hardCore preserve tense and necessary complements. Translate core and hardCore individually into idiomatic, complete Chinese sentences for coreZh and hardCoreZh. Translate ONLY what remains in that English skeleton. Preserve who does what, negation, modality and necessary complements; exclude every removed description. The two Chinese versions may be identical when the English meanings match. Separately translate the full original sentence into everyday Chinese for zh.
Example for "The map I drew in a café after lunch is here.":
{"swaps":[],"lines":[["The map","s",0,"这张地图","主语"],["I drew","c",1,"我画的","map","I","名词后出现新主语，省略了关系代词","哪张地图？"],["in a café","p",2,"在一家咖啡馆里","drew","in","地点短语修饰画图的动作","在哪儿画？"],["after lunch","p",2,"午饭后","drew","after","时间短语说明画图的时间","何时画？"],["is here.","s",0,"在这里","谓语和补语"]],"core":"The map is here.","hardCore":"The map is here.","coreZh":"这张地图在这里。","hardCoreZh":"这张地图在这里。","roles":[["什么？","The map","主语"],["在哪里？","is here","谓语和补语"]],"zh":"我午饭后在一家咖啡馆画的那张地图在这里。"}
`;
type Result={analysis?:Analysis,plain?:{skeleton:string,skeletonZh?:string,simple:string[],zh:string},cached:boolean,origin:string,usage?:{input:number,output:number}};
type Preview=Pick<Analysis,'shrunk'|'shrink'>;
type Listener={preview:(p:Preview)=>void,chunk:(c:LiveChunk)=>void};
type Flight={result:Promise<Result>,listeners:Set<Listener>,preview?:Preview,chunks:LiveChunk[]};
const pending=new Map<string,Flight>();

export function analyze(source:string,lang:string,preview:Listener['preview'],chunk:Listener['chunk']):Promise<Result>{
  const teaching=examples.find(x=>x.original===source);
  if(teaching)return Promise.resolve({analysis:validate(teaching,source),cached:true,origin:'worked-example'});
  const id=lang+'\0'+source;
  const prior=pending.get(id);
  const listener={preview,chunk};
  if(prior){
    if(prior.preview)preview(prior.preview);
    prior.chunks.forEach(chunk);prior.listeners.add(listener);return prior.result;
  }
  const hit=cached(source,lang);
  if(hit?.nestingVersion===nestingVersion)return Promise.resolve({analysis:hit,cached:true,origin:'cache'});
  const cachedPreview=hit?{shrunk:hit.shrunk,shrink:hit.shrink}:undefined;
  if(cachedPreview)preview(cachedPreview);
  const listeners=new Set([listener]);
  const chunks:LiveChunk[]=[];
  const result=(hit?reviewNested(hit,ark).then(review=>{
    save(source,lang,review.analysis);
    return {...review,cached:review.usage.input+review.usage.output===0,origin:'cache-review'};
  }):generate(source,lang,p=>{
    flight.preview=p;listeners.forEach(l=>l.preview(p));
  },c=>{
    chunks.push(c);listeners.forEach(l=>l.chunk(c));
  })).finally(()=>pending.delete(id));
  const flight:Flight={result,listeners,chunks,preview:cachedPreview};
  pending.set(id,flight);
  return result;
}
async function generate(source:string,lang:string,preview:Listener['preview'],chunk:Listener['chunk']):Promise<Result>{
  let feedback='',plain:NonNullable<Result['plain']>={skeleton:'',simple:[],zh:''};
  const usage={input:0,output:0};
  for(let attempt=0;attempt<2;attempt++){
    const reply=await ark(method+'\n'+contract,JSON.stringify({sentence:source,correction:feedback||undefined}),9000,
      attempt===0?streamRows(source,preview,chunk):undefined);
    usage.input+=reply.usage?.input||0;usage.output+=reply.usage?.output||0;
    try{
      const raw=JSON.parse(reply.answer);
      if(typeof raw?.core==='string' && typeof raw?.zh==='string')plain={skeleton:raw.core.slice(0,1800),skeletonZh:typeof raw.coreZh==='string'&&/\p{Script=Han}/u.test(raw.coreZh)?raw.coreZh.slice(0,1600):undefined,simple:[],zh:raw.zh.slice(0,3200)};
      const a=validate(expandAnalysis(source,raw),source);
      const review=await reviewNested(a,ark);
      usage.input+=review.usage.input;usage.output+=review.usage.output;
      save(source,lang,review.analysis);return {analysis:review.analysis,cached:false,origin:'model',usage};
    }catch(e){
      feedback='Correct this validation issue and return the full compact JSON: '+String(e instanceof Error?e.message:e).slice(0,900);
    }
  }
  if(!plain.skeleton || !plain.zh)throw Error('No usable model result.');
  return {plain,cached:false,origin:'static',usage};
}
