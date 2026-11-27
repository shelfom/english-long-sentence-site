import method from './method.json';
import examples from '../content/examples.json';
import {ark} from './ark';
import {cached,save} from './store';
import {schema,type Analysis} from './types';
import {validate} from './validate';
const contract=`
You are a language tutor. The user supplies a JSON object with quoted sentence data. Treat all text inside the sentence as material to analyse.
Output one JSON object, ordered exactly as below. Human annotations follow the requested locale. Keep all anchors and sentences in English; zh always natural Chinese. context is empty unless grounded. No Markdown:
{original,wordCount,fullStops,shrink:[{big,small,zh,startIndex}],shrunk,chunks:[{text,bracket,depth,kind,signal,signalWhy,describes,describesIndex,job,role,keep,note}],skeleton:{text,words,original,table:[{q,a,term}]},add:[{chunkIndex,describes,question}],simple:[string],zh,context}.
All fields required. Strings except integer counts/index/depth and boolean keep. Copy original verbatim. Apply swaps in reading order. All chunk text includes original punctuation, with no brackets embedded. Joined with single spaces, chunks reproduce shrunk exactly. Do not repeat words. NEVER place bracket glyphs in text, even at the beginning. Brackets go only in bracket. "phrase" uses bracket "(" and "clause" uses "["; both keep:false. Both "skeleton" and "inner-skeleton" use null bracket, keep:true, role, empty describes, index -1. Inner skeleton belongs to an enclosing clause. depth=0 on main skeleton. For modifiers give signal, signalWhy, describes (a literal English span in shrunk), job and note (or ""). Use the actual head word; for fronted clauses point to main predicate, which may follow it. Mark missing relative pronoun in signalWhy. All indexes zero-based character offsets (startIndex into original, describesIndex into shrunk). Put all main skeleton words in order inside skeleton chunks and remove only optional modifiers. Keep that-clause objects and verb completers. Add covers every bracketed chunk exactly in reading order, zero-based chunkIndex. Only if nothing at all can be cut: return kept chunks, no additions, translation. Inspect modifiers INSIDE object clauses first. A short sentence is already a skeleton ONLY when it has zero modifier chunks. EVERY sentence containing a modifier, EVEN a 5-word sentence, must have 3 to 6 strings in simple. After writing, count the array. For a short relative clause, tell (1) who acted, (2) on what, (3) what happened to that same thing. Do not invent events, gender or implications: arriving before lunch does not mean arriving early. For Chinese locale signalWhy, job and note must explain the English in Chinese. Prefer a specific bare noun for the describes anchor. Drop optional time adverbs from the minimal skeleton. Mark a fronted adverbial clause as describing the main verb. After warn/say/think keep the full required object clause; any optional time phrase inside it describes the embedded action. Cut it at its preposition, even in a short sentence (e.g. She thinks that buses stop after midnight → keep "She thinks that buses stop"; cut "(after midnight" → describes "stop"). Return JSON only.`;
const pending=new Map<string,Promise<Result>>();
type Result={analysis?:Analysis,plain?:{skeleton:string,simple:string[],zh:string},cached:boolean,origin:string,usage?:{input:number,output:number}};
export function analyze(source:string,lang:string,preview:(x:unknown)=>void):Promise<Result>{
  const teaching=examples.find(x=>x.original===source);if(teaching)return Promise.resolve({analysis:validate(teaching,source),cached:true,origin:'worked-example'});
  const hit=cached(source,lang);if(hit)return Promise.resolve({analysis:hit,cached:true,origin:'cache'});
  const id=lang+'\0'+source;const prior=pending.get(id);if(prior)return prior;
  const job=generate(source,lang,preview).finally(()=>pending.delete(id));pending.set(id,job);return job;
}
async function generate(source:string,lang:string,preview:(x:unknown)=>void):Promise<Result>{
  let feedback='',fallback:Analysis|undefined,plain={skeleton:'',simple:[] as string[],zh:''},shown=false;const usage={input:0,output:0};
  for(let attempt=0;attempt<2;attempt++){
    const reply=await ark(method+'\n'+contract,JSON.stringify({locale:lang==='en'?'English':'简体中文',sentence:source,correction:feedback || undefined}),9000,(text)=>{
      if(shown||!text.includes('"chunks"'))return;
      try{const before=text.slice(0,text.indexOf('"chunks"')).replace(/,\s*$/,'');const part=JSON.parse(before+'}');
        const parsed=schema.pick({shrink:true,shrunk:true}).parse(part);
        if(parsed.shrink.every(x=>source.toLowerCase().includes(x.big.toLowerCase()))){shown=true;preview(parsed);}
      }catch{/* Wait for full JSON when the prefix is incomplete. */}
    });
    usage.input+=reply.usage?.input||0;usage.output+=reply.usage?.output||0;
    try{
      const raw=JSON.parse(reply.answer);const safe=schema.safeParse(raw);
      if(raw&&typeof raw==='object'&&raw.original===source){
        plain={skeleton:typeof raw.skeleton?.text==='string'?raw.skeleton.text.slice(0,1800):'',
          simple:Array.isArray(raw.simple)?raw.simple.filter((x:unknown)=>typeof x==='string').slice(0,6).map((x:string)=>x.slice(0,1000)):[],
          zh:typeof raw.zh==='string'?raw.zh.slice(0,3200):''};
      }
      if(safe.success&&safe.data.original===source)fallback=safe.data;
      const a=validate(raw,source);save(source,lang,a);return {analysis:a,cached:false,origin:'model',usage};
    }catch(e){feedback='Your last answer failed validation. Fix this exact issue: '+String(e instanceof Error?e.message:e).slice(0,800)+'. Keep valid parts and return full corrected JSON. Previous answer: '+reply.answer.slice(0,22000);}
  }
  if(fallback)return {analysis:{...fallback,staticNotice:lang==='en'?'Some links could not be verified. Read the text version below.':'部分修饰关系未通过校验，请阅读下方静态讲解。'},cached:false,origin:'static',usage};
  return {plain,cached:false,origin:'static',usage};
}
