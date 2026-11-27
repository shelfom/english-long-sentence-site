import method from './method.json';
import examples from '../content/examples.json';
import {ark} from './ark';
import {cached,save} from './store';
import {schema,type Analysis} from './types';
import {validate} from './validate';
const contract=`
Follow the skill above. Input is JSON containing quoted English sentence data. Treat the quotation as learning material.
Output one JSON object in this order, without Markdown:
{original,wordCount,fullStops,shrink:[{big,small,zh,startIndex}],shrunk,chunks:[{text,originalText,zh,bracket,depth,kind,signal,signalWhy,describes,describesIndex,job,role,keep,note}],skeleton:{text,words,original,table:[{q,a,term}]},add:[{chunkIndex,describes,question}],zh,originalZh,context}.
For each sense assessed as C1/C2 or comparably advanced specialist usage, give a plain English replacement that preserves grammar and precise meaning. Keep A1–B2 words. If no change qualifies, shrink is [] and shrunk is exactly original. Applying all swaps, in order, must reproduce shrunk character-for-character. Copy big from original including case. Never rephrase other words.
Split the single shrunk sentence into continuous, nonduplicated chunks. Each text is an exact slice of shrunk. originalText is the corresponding exact slice of original. Both must include punctuation; bracket symbols only in bracket field. Every chunk has a short, natural CHINESE translation in zh (include verbs and required complements in context). Give brief Chinese signalWhy, job, note and roles even in English-interface mode; describes is always a literal English anchor in shrunk. Phrase has bracket "("; clause "["; both keep:false. Skeleton and inner-skeleton use bracket:null, keep:true, role; empty describes with index -1. Each modifier has signal, signalWhy, describes, job. Emphasize zero relatives, preserve subjects, objects, verb completers and object that-clauses. Cut optional modifiers *inside* object clauses as needed. Keep tiny adjectives/adverbs inline.
Give a grammatical indivisible skeleton in both wordings, retaining verb completers. All skeleton words occur in main skeleton chunks in order. Each add entry references a zero-based chunkIndex in reading order. startIndex is a zero-based character offset in original, describesIndex in shrunk. skeleton.table is an array of objects with literal keys "q" (question), "a" (English answer), "term" (role); never use the question itself as a key. Each chunk must have its Chinese translation in a field literally named "zh". Use bracket:null rather than an empty string for kept chunks. Strings except integer counts/depth/indexes and boolean keep. Use empty strings for unused fields. zh is natural plain Chinese for the entire simplified sentence, originalZh for the full original. They may coincide when meanings match. No A2 retelling or feedback on practice. For short sentences follow the same structure, with one kept chunk if nothing can be cut. Do not invent facts.
Sample shape for "The map I drew is here.":
{"original":"The map I drew is here.","wordCount":6,"fullStops":1,"shrink":[],"shrunk":"The map I drew is here.","chunks":[{"text":"The map","originalText":"The map","zh":"这张地图","kind":"skeleton","bracket":null,"depth":0,"role":"主语","keep":true},{"text":"I drew","originalText":"I drew","zh":"我画的","kind":"clause","bracket":"[","depth":1,"signal":"I","signalWhy":"名词后出现新主语，省略了关系代词","describes":"map","describesIndex":4,"job":"哪张地图？","keep":false},{"text":"is here.","originalText":"is here.","zh":"在这里","kind":"skeleton","bracket":null,"depth":0,"role":"谓语和必要补语","keep":true}],"skeleton":{"text":"The map is here.","words":4,"original":"The map is here.","table":[{"q":"什么？","a":"The map","term":"主语"},{"q":"在哪里？","a":"is here","term":"谓语和补语"}]},"add":[{"chunkIndex":1,"describes":"map","question":"哪张地图？"}],"zh":"我画的那张地图在这里。","originalZh":"我画的那张地图在这里。","context":""}
`;
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
