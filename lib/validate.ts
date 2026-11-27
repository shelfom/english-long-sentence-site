import {schema,type Analysis} from './types.ts';
export function words(s:string){return s.match(/[\p{L}\p{N}]+(?:[-’'][\p{L}\p{N}]+)*/gu)||[];}
export {splitText} from './sentences.ts';
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
  // Substitutions preserve meaning. The same natural Chinese is valid for both passes.
  if(!a.originalZh)a.originalZh=a.zh;
  if(a.original!==source)throw Error('Original must exactly equal input.');
  if(flat(a.chunks.map(c=>c.text).join(''))!==flat(a.shrunk)){
    // The source owns punctuation. Recover exact source slices only when every lexical token agrees.
    const tokens=[...a.shrunk.matchAll(/[\p{L}\p{N}]+(?:[-’'][\p{L}\p{N}]+)*/gu)];
    const spans=a.chunks.map(c=>words(c.text));
    const given=spans.flat();
    if(spans.some(span=>!span.length)||given.length!==tokens.length||given.some((w,i)=>w!==tokens[i][0]))
      throw Error('Chunks must reconstruct shrunk exactly, including every word.');
    let start=0,count=0;
    a.chunks.forEach((chunk,i)=>{
      count+=spans[i].length;
      const next=tokens[count]?.index??a.shrunk.length;
      chunk.text=a.shrunk.slice(start,next).trim();start=next;
    });
    if(flat(a.chunks.map(c=>c.text).join(''))!==flat(a.shrunk))throw Error('Unresolved source alignment.');
  }
  a.wordCount=words(source).length;a.fullStops=(source.match(/\./g)||[]).length;a.skeleton.words=words(a.skeleton.text).length;
  let end=0;
  let rebuilt='';
  for(const s of a.shrink){
    const hits=locations(source,s.big).filter(i=>i>=end);
    if(!hits.length)throw Error('Swap missing/out of order: '+s.big);
    s.startIndex=hits.includes(s.startIndex)?s.startIndex:hits[0];
    s.big=source.slice(s.startIndex,s.startIndex+s.big.length);
    rebuilt+=source.slice(end,s.startIndex)+s.small;end=s.startIndex+s.big.length;
  }
  rebuilt+=source.slice(end);
  if(rebuilt!==a.shrunk)throw Error('Apply just the listed swaps to original, preserving capitalization and punctuation.');
  // Reconstruct each harder chunk by reversing exactly the swaps inside its source span.
  let shift=0;
  const reverse=a.shrink.map(s=>{const start=s.startIndex+shift;shift+=s.small.length-s.big.length;return {start,stop:start+s.small.length,big:s.big};});
  let chunkEnd=0;
  for(const c of a.chunks){
    const start=a.shrunk.indexOf(c.text,chunkEnd);
    if(start<0||a.shrunk.slice(chunkEnd,start).trim())throw Error('Chunk text must occur in reading order.');
    chunkEnd=start+c.text.length;
    let harder='',at=start;
    for(const swap of reverse){
      if(swap.stop<=start||swap.start>=chunkEnd)continue;
      if(swap.start<start||swap.stop>chunkEnd)throw Error('A vocabulary replacement crosses a chunk boundary.');
      harder+=a.shrunk.slice(at,swap.start)+swap.big;at=swap.stop;
    }
    c.originalText=harder+a.shrunk.slice(at,chunkEnd);
    if(!/[\p{Script=Han}]/u.test(c.zh))throw Error('Give each chunk a brief Chinese translation.');
  }
  if(flat(a.chunks.map(c=>c.originalText).join(''))!==flat(source))throw Error('Harder chunks must recover original.');
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

  return a;
}
