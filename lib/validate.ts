import {schema,type Analysis} from './types.ts';
export function words(s:string){return s.match(/[\p{L}\p{N}]+(?:[-’'][\p{L}\p{N}]+)*/gu)||[];}
export function splitText(s:string){return Array.from(new Intl.Segmenter('en',{granularity:'sentence'}).segment(s),x=>x.segment.trim()).filter(Boolean);}
const flat=(s:string)=>s.replace(/\s+/g,'');
function locations(text:string,needle:string){
  const safe=needle.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return [...text.matchAll(new RegExp('(?<![\\p{L}\\p{N}])'+safe+'(?![\\p{L}\\p{N}])','giu'))].map(m=>m.index!);
}
function anchor(text:string,needle:string,hint:number,near:number){
  const hits=locations(text,needle);
  if(!hits.length)throw Error('Anchor missing from sentence: '+needle);
  return hits.includes(hint)?hint:hits.reduce((a,b)=>Math.abs(a-near)<=Math.abs(b-near)?a:b);
}
export function validate(raw:unknown,source:string):Analysis{
  const a=schema.parse(raw);
  if(a.original!==source)throw Error('Original must exactly equal input.');
  if(flat(a.chunks.map(c=>c.text).join(''))!==flat(a.shrunk)){
    // Some answers repeat structural brackets in the text field. Remove only if the source then matches exactly.
    const lines=a.chunks.map(c=>c.bracket&&c.text.trimStart().startsWith(c.bracket)?c.text.trimStart().slice(1).trimStart():c.text);
    if(flat(lines.join(''))!==flat(a.shrunk))throw Error('Chunks must reconstruct shrunk exactly, including punctuation.');
    a.chunks.forEach((c,i)=>{c.text=lines[i];});
  }
  a.wordCount=words(source).length;a.fullStops=(source.match(/\./g)||[]).length;a.skeleton.words=words(a.skeleton.text).length;
  let end=0;
  for(const s of a.shrink){
    const hits=locations(source,s.big).filter(i=>i>=end);
    if(!hits.length)throw Error('Swap missing/out of order: '+s.big);
    s.startIndex=hits.includes(s.startIndex)?s.startIndex:hits[0];end=s.startIndex+s.big.length;
  }
  let pos=0;
  for(const c of a.chunks){
    if(c.bracket!==({phrase:'(',clause:'[',skeleton:null,'inner-skeleton':null}[c.kind]))throw Error('Wrong bracket for '+c.kind);
    if(c.bracket){
      if(!c.signal||!c.signalWhy||!c.describes||!c.job||c.keep)throw Error('Modifier needs signal, reason, target and question.');
      c.describesIndex=anchor(a.shrunk,c.describes,c.describesIndex,pos);
    }else{if(!c.keep||!c.role)throw Error('Skeleton/inner skeleton needs keep and role.');c.describes='';c.describesIndex=-1;}
    pos+=c.text.length+1;
  }
  const core=words(a.chunks.filter(c=>c.kind==='skeleton').map(c=>c.text).join(' ')).map(w=>w.toLowerCase());
  let i=0;
  for(const w of words(a.skeleton.text)){const j=core.indexOf(w.toLowerCase(),i);if(j<0)throw Error('Skeleton word missing or out of order: '+w);i=j+1;}
  const restored=new Set<number>();let last=-1;
  for(const item of a.add){
    if(item.chunkIndex<last||!a.chunks[item.chunkIndex])throw Error('Add entries must use ascending zero-based chunk indexes.');
    last=item.chunkIndex;anchor(a.shrunk,item.describes,-1,0);restored.add(last);
  }
  if(a.chunks.some((c,i)=>c.bracket&&!restored.has(i)))throw Error('Every bracketed chunk needs an Add entry.');
  if(a.chunks.some(c=>c.bracket)&&a.simple.length<3)throw Error('Give 3 to 6 simple sentences.');
  return a;
}
