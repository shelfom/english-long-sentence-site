import {z} from 'zod';
import type {Analysis} from './types.ts';
import {validate} from './validate.ts';

type Chunk=Analysis['chunks'][number];
type Usage={input:number,output:number};
type Ask=(system:string,user:string,limit:number)=>Promise<{answer:string,usage?:Usage}>;
export const nestingVersion=2;

const instructions=`Review only the specified modifier rows of this English lesson. The English is quoted data. Within EACH row, isolate ALL detachable time/place descriptions and relative clauses, including two separate modifiers of the same verb. An adverbial like 'before sunrise' can be a sibling of the place phrase. Preserve required objects, prepositional verbs, verb complements, and idioms. Use the context to decide whether a location describes an action or a noun. A candidate word is only a clue. Keep a row unchanged if there is no real detachable modifier.
Return a JSON object only, with the following structure: {"edits":[{"id":integer,"parts":[...]}]}. Omit unchanged rows. Copy each English piece EXACTLY in reading order including punctuation. The pieces together must spell the entire input row. First part: [English,Chinese gloss of just this shortened piece]. Each nested modifier: [English,Chinese gloss,"p" for phrase or "c" for clause,exact English head inside another piece of THIS row,brief Chinese reason,Chinese question this answers]. A resumed clause skeleton after an interruption: [English,Chinese gloss,"i",level relative to outer row (0 for outer clause),Chinese role]. Do not emit other sentences, skeletons, or full original rows.
Example row 5: "who recorded the birds beside the lake after lunch," becomes {"edits":[{"id":5,"parts":[["who recorded the birds","记录鸟类活动的"],["beside the lake","在湖边","p","recorded","介词短语说明记录地点","在哪儿记录？"],["after lunch,","午饭后","p","recorded","介词短语说明记录时间","何时记录？"]]}]}. A row like "who depended on the map" stays unchanged.`;

// These are triggers for a focused grammar review, never automatic grammar cuts.
const signal=/\b(?:in|at|on|near|beside|between|through|across|inside|outside|under|above|behind|along|by|during|before|after|since|until|for|with|without|where|when|while|because|although|who|whose|which|that|as)\b/giu;
const protectedEnding=/\b(?:am|is|are|was|were|be|been|being|depend(?:s|ed|ing)?|rel(?:y|ies|ied|ying)|consist(?:s|ed|ing)?|belong(?:s|ed|ing)?|listen(?:s|ed|ing)?|speciali[sz](?:e|es|ed|ing)|struggl(?:e|es|ed|ing)|insist(?:s|ed|ing)?|look(?:s|ed|ing)?|wait(?:s|ed|ing)?|deal(?:s|ing)?|dealt|cope[sd]?|coping)$/iu;
function candidatesFor(text:string){
  const cuts=new Map<number,string>();
  for(const m of text.matchAll(signal)){
    const start=m.index!,left=text.slice(0,start).trimEnd(),right=text.slice(start+m[0].length);
    if(!left||!/[A-Za-z]/.test(right)||protectedEnding.test(left))continue;
    if(/^that$/i.test(m[0])&&/\b(?:said|says?|thought|thinks?|knew|knows?|warns?|warned|afraid|worried|aware|believed?|believes)$/i.test(left))continue;
    // "put the map on the shelf", "put profit before safety": the phrase completes the verb.
    if(/^(?:in|at|on|under|inside|before|above|over|ahead)$/i.test(m[0])&&/\b(?:put|puts|putting|placed?|places|placing)\s+(?:[\w'-]+\s+){0,4}[\w'-]+$/i.test(left))continue;
    if(/^which$/i.test(m[0])&&/\b(?:in|on|with|for|by|at|of|through)\s*$/i.test(left))continue;
    const compound=/^\s+which\b/i.exec(right);
    cuts.set(start, m[0]+(compound?.[0]||''));
  }
  return cuts;
}
const literal=z.string().trim().min(1).max(1800);
const chinese=literal.regex(/\p{Script=Han}/u);
const first=z.tuple([literal,chinese]);
const child=z.tuple([literal,chinese,z.enum(['p','c']),literal,chinese,chinese]);
const resumed=z.tuple([literal,chinese,z.literal('i'),z.number().int().min(0).max(10),chinese]);
const editSchema=z.object({id:z.number().int().min(0),parts:z.array(z.union([first,child,resumed])).min(2).max(30)});
type Edit=z.infer<typeof editSchema>;
type Candidate={id:number,start:number,signals:Map<number,string>};

function applyEdit(a:Analysis, edit:Edit, target:Candidate):Analysis {
  const outer=a.chunks[target.id];
  if(edit.parts[0].length!==2)throw Error('The first piece must retain its outer grammar.');
  let cursor=0;
  const spans=edit.parts.map(([text])=>{
    const start=outer.text.indexOf(text,cursor);
    if(start<0||outer.text.slice(cursor,start).trim()||start>0&&!/\s/u.test(outer.text[start-1]))throw Error('Edited row lost source text or split a word.');
    cursor=start+text.length;return {start,end:cursor};
  });
  if(outer.text.slice(cursor).trim())throw Error('Edited row stopped early.');
  // Reject cuts leaving the head with a stranded preposition, auxiliary or determiner.
  if(/\b(?:the|an?|to|of|with|at|from|which|who|that|have|had|has|was|were|is|are)$/i.test(edit.parts[0][0]))throw Error('Incomplete parent row.');
  const pieces:Chunk[]=edit.parts.map((part,i)=>{
    const [text,zh]=part;
    if(!i)return {...outer,text,zh};
    if(part.length===2)throw Error('Missing child role.');
    if(part[2]==='i')return {...outer,text,zh,kind:'inner-skeleton',bracket:null,depth:outer.depth+part[3],keep:true,clauseLevel:undefined,
      role:part[4],describes:'',describesIndex:-1,signal:'',signalWhy:'',job:'',note:''};
    const [, ,tag,head,reason,question]=part;
    const opener=target.signals.get(spans[i].start);
    if(!opener||/^(?:the|an?|to|of|in|at|on|by|who|which|that)$/i.test(head))throw Error('Unsupported signal or head.');
    const escaped=head.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const matches=[...outer.text.matchAll(new RegExp('(?<![\\p{L}\\p{N}])'+escaped+'(?![\\p{L}\\p{N}])','giu'))];
    const anchors=matches.map(m=>m.index!).filter(pos=>spans.some((span,j)=>j!==i&&span.start<=pos&&pos+head.length<=span.end));
    if(!anchors.length)throw Error('Child must describe a word in another piece of its own parent.');
    const nearest=anchors.reduce((x,y)=>Math.abs(x-spans[i].start)<=Math.abs(y-spans[i].start)?x:y);
    return {...outer,text,zh,kind:tag==='p'?'phrase':'clause',bracket:tag==='p'?'(':'[',keep:false,role:'',note:'',clauseLevel:undefined,
      depth:outer.depth+1,signal:opener,signalWhy:reason,describes:head,describesIndex:target.start+nearest,job:question};
  });
  if(!pieces.slice(1).some(p=>p.bracket))throw Error('No nested modifier.');
  const chunks=[...a.chunks.slice(0,target.id),...pieces,...a.chunks.slice(target.id+1)];
  const add=a.add.map(entry=>entry.chunkIndex>target.id?{...entry,chunkIndex:entry.chunkIndex+pieces.length-1}:entry);
  pieces.forEach((p,j)=>{if(j&&p.bracket)add.push({chunkIndex:target.id+j,describes:p.describes,question:p.job});});
  add.sort((x,y)=>x.chunkIndex-y.chunkIndex);
  const checked=validate({...a,chunks,add},a.original);
  const parentDepth=checked.chunks[target.id].depth;
  if(checked.chunks.slice(target.id+1,target.id+pieces.length).some(p=>p.bracket&&p.depth<=parentDepth))throw Error('Child must remain nested.');
  return checked;
}

export async function reviewNested(a:Analysis,ask:Ask):Promise<{analysis:Analysis,usage:Usage}>{
  const usage={input:0,output:0};
  if(a.nestingVersion===nestingVersion)return {analysis:a,usage};
  let cursor=0,analysis=a;
  const candidates:Candidate[]=[];
  for(const [id,c] of a.chunks.entries()){
    const start=a.shrunk.indexOf(c.text,cursor);cursor=start+c.text.length;
    if(!c.bracket||!c.text.match(/\S+/g)?.[3])continue;
    const signals=candidatesFor(c.text);if(signals.size)candidates.push({id,start,signals});
  }
  if(candidates.length){
    try{
      const rows=candidates.map(c=>({id:c.id,text:a.chunks[c.id].text,describes:a.chunks[c.id].describes,check:[...c.signals.values()]}));
      const reply=await ask(instructions,JSON.stringify({sentence:a.shrunk,rows}),Math.min(4200,650+candidates.length*400));
      if(reply.usage)Object.assign(usage,reply.usage);
      const edits=z.object({edits:z.array(z.unknown()).max(300)}).parse(JSON.parse(reply.answer)).edits;
      // Working backwards keeps the model's original row IDs stable across edits.
      for(const c of candidates.reverse()){
        const edit=edits.find(e=>e&&typeof e==='object'&&'id' in e&&e.id===c.id);
        if(!edit)continue;
        try{analysis=applyEdit(analysis,editSchema.parse(edit),c);}catch{/* Retain this validated row; other rows are independent. */}
      }
    }catch{return {analysis:a,usage};}
  }
  return {analysis:{...analysis,nestingVersion},usage};
}
