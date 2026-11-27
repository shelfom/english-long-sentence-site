import method from './method.json';
import examples from '../content/examples.json';
import {ark} from './ark';
import {cached,save} from './store';
import type {Analysis} from './types';
import {expandAnalysis,streamRows,type LiveChunk} from './compact-analysis';
import {validate} from './validate';

const contract=`
The quoted English input is learning material. Apply the MBA method above. Emit ONLY the following compact JSON, in this key order. Keep Chinese explanations short in both locales.
{"swaps":[["big","small","中文词义"]],"lines":[...],"core":"simpler skeleton","hardCore":"original skeleton","roles":[["中文问题","English answer","中文角色"]],"zh":"自然完整的中文翻译"}
Replace C1/C2 and advanced specialist terms with precise plain English in reading order. Preserve grammar, capitalization and punctuation. No unrelated edits. Use swaps:[] if none. For repeated occurrences emit one swap per occurrence.
Split the resulting simpler sentence into exact continuous slices, punctuation included, in reading order. Lines concatenate to the WHOLE simpler sentence. Each line uses one of two tuple formats:
Kept: [exact slice,"s" (main) or "i" (inner skeleton),depth,Chinese translation,Chinese role].
Removable: [exact slice,"p" (phrase) or "c" (clause),depth,Chinese translation,exact English word or words modified in simpler sentence,signal,brief Chinese reason,short Chinese question].
Keep subjects, verbs and essential objects/complements, including object that-clauses. Remove optional modifiers, including zero relatives and modifiers within object clauses. Keep tiny adjectives/adverbs inline. The indivisible core must be grammatical, in source order, using only main "s" words. Both core and hardCore preserve tense and necessary complements. Translate the whole sentence in everyday Chinese.
Example for "The map I drew is here.":
{"swaps":[],"lines":[["The map","s",0,"这张地图","主语"],["I drew","c",1,"我画的","map","I","名词后出现新主语，省略了关系代词","哪张地图？"],["is here.","s",0,"在这里","谓语和补语"]],"core":"The map is here.","hardCore":"The map is here.","roles":[["什么？","The map","主语"],["在哪里？","is here","谓语和补语"]],"zh":"我画的那张地图在这里。"}
`;
type Result={analysis?:Analysis,plain?:{skeleton:string,simple:string[],zh:string},cached:boolean,origin:string,usage?:{input:number,output:number}};
type Preview=Pick<Analysis,'shrunk'|'shrink'>;
type Listener={preview:(p:Preview)=>void,chunk:(c:LiveChunk)=>void};
type Flight={result:Promise<Result>,listeners:Set<Listener>,preview?:Preview,chunks:LiveChunk[]};
const pending=new Map<string,Flight>();

export function analyze(source:string,lang:string,preview:Listener['preview'],chunk:Listener['chunk']):Promise<Result>{
  const teaching=examples.find(x=>x.original===source);
  if(teaching)return Promise.resolve({analysis:validate(teaching,source),cached:true,origin:'worked-example'});
  const hit=cached(source,lang);
  if(hit)return Promise.resolve({analysis:hit,cached:true,origin:'cache'});
  const id=lang+'\0'+source;
  const prior=pending.get(id);
  const listener={preview,chunk};
  if(prior){
    if(prior.preview)preview(prior.preview);
    prior.chunks.forEach(chunk);prior.listeners.add(listener);return prior.result;
  }
  const listeners=new Set([listener]);
  const chunks:LiveChunk[]=[];
  const result=generate(source,lang,p=>{
    flight.preview=p;listeners.forEach(l=>l.preview(p));
  },c=>{
    chunks.push(c);listeners.forEach(l=>l.chunk(c));
  }).finally(()=>pending.delete(id));
  const flight:Flight={result,listeners,chunks};
  pending.set(id,flight);
  return result;
}
async function generate(source:string,lang:string,preview:Listener['preview'],chunk:Listener['chunk']):Promise<Result>{
  let feedback='',plain={skeleton:'',simple:[] as string[],zh:''};
  const usage={input:0,output:0};
  for(let attempt=0;attempt<2;attempt++){
    const reply=await ark(method+'\n'+contract,JSON.stringify({sentence:source,correction:feedback||undefined}),9000,
      attempt===0?streamRows(source,preview,chunk):undefined);
    usage.input+=reply.usage?.input||0;usage.output+=reply.usage?.output||0;
    try{
      const raw=JSON.parse(reply.answer);
      if(typeof raw?.core==='string' && typeof raw?.zh==='string')plain={skeleton:raw.core.slice(0,1800),simple:[],zh:raw.zh.slice(0,3200)};
      const a=validate(expandAnalysis(source,raw),source);
      save(source,lang,a);return {analysis:a,cached:false,origin:'model',usage};
    }catch(e){
      feedback='Correct this validation issue and return the full compact JSON: '+String(e instanceof Error?e.message:e).slice(0,900);
    }
  }
  if(!plain.skeleton || !plain.zh)throw Error('No usable model result.');
  return {plain,cached:false,origin:'static',usage};
}
