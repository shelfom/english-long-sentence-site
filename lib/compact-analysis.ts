import {z} from 'zod';
import type {Analysis} from './types.ts';
import {hardSwaps,rowWalker,type Easier} from './repair.ts';
import {simpler} from './easy-words.ts';

const text = z.string().max(4800);
const swaps = z.array(z.tuple([text.min(1), text.min(1), text.min(1)])).max(260);
const kinds = {s:'skeleton', i:'inner-skeleton', p:'phrase', c:'clause'} as const;
const line = z.tuple([text.min(1), z.enum(['s','i','p','c']), z.number().int().min(0).max(12), text.min(1), text.min(1)]).rest(text);
const compact = z.object({
  swaps, lines:z.array(line).min(1).max(300), core:text.min(1), hardCore:text.min(1), coreZh:text.min(1), hardCoreZh:text.min(1),
  roles:z.array(z.tuple([text.min(1),text.min(1),text])).max(20), zh:text.min(1),
});
type Preview = Pick<Analysis,'shrunk'|'shrink'>;
export type LiveChunk = {text:string;zh:string;bracket:'('|'['|null;describes:string;reason:string};

function applySwaps(source:string, raw:unknown):Preview {
  const shrink:Analysis['shrink'] = [];
  let cursor=0, shrunk='';
  for (const [big,small,zh] of swaps.parse(raw)) {
    const escaped=big.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const matcher=new RegExp('(?<![\\p{L}\\p{N}])'+escaped+'(?![\\p{L}\\p{N}])','giu');
    matcher.lastIndex=cursor;
    const match=matcher.exec(source);
    if(!match) throw Error('Swap absent or out of order: '+big);
    if(!simpler(match[0],small)) throw Error('Replacement no easier than the original: '+big);
    shrink.push({big:match[0],small,zh,startIndex:match.index});
    shrunk+=source.slice(cursor,match.index)+small;
    cursor=match.index+match[0].length;
  }
  return {shrink,shrunk:shrunk+source.slice(cursor)};
}

function chunkFrom(row:z.infer<typeof line>) {
  const [text,tag,depth,zh,head,signal='',reason='',question='']=row;
  const bracket=tag==='p'?'(':tag==='c'?'[':null;
  return {text, kind:kinds[tag], depth,zh,bracket,keep:!bracket,role:bracket?'':head,
    describes:bracket?head:'',signal,signalWhy:reason,job:question} as const;
}
export function expandAnalysis(source:string, raw:unknown) {
  const a=compact.parse(raw);
  const chunks=a.lines.map(chunkFrom);
  return {
    original:source,...applySwaps(source,a.swaps),chunks,
    skeleton:{text:a.core,original:a.hardCore,zh:a.coreZh,originalZh:a.hardCoreZh,table:a.roles.map(([q,a,term])=>({q,a,term}))},
    add:chunks.flatMap((c,i)=>c.bracket?[{chunkIndex:i,describes:c.describes,question:c.job}]:[]),
    zh:a.zh,originalZh:a.zh,
  };
}

// Read each completed row once, even when a network frame splits a quoted string.
// With `ease`, a replacement that is still too hard is first exchanged for an easier one; the
// preview and the rows wait for that answer so that the learner never sees a wording change.
export function streamRows(source:string, onPreview:(p:Preview)=>void, onChunk:(c:LiveChunk)=>void, ease?:(swaps:unknown)=>Promise<Easier>) {
  let seen=0, rowStart=-1, depth=0, quoted=false, slash=false, stage:'swaps'|'between'|'lines'|'done'='swaps';
  let prefix='', walk:ReturnType<typeof rowWalker>|undefined, held:unknown[]|null=null, broken=false;
  const entries:unknown[]=[];
  const words=(v:unknown)=>typeof v==='string'?v.trim():'';
  // Rows are followed along the sentence in either wording, so a stray bracket or an
  // unswapped word does not stop the preview. The slice shown is the sentence's own.
  const show=(given:unknown)=>{
    if(broken)return;
    const row:unknown[]=Array.isArray(given)?given:[];
    const tag=words(row[1]).toLowerCase(),zh=words(row[3]),text=row.length&&walk?walk.next(words(row[0])):null;
    if(!text||!/\p{Script=Han}/u.test(zh)){broken=true;return;}
    const bracket=tag==='p'?'(':tag==='c'?'[':null,head=words(row[4]);
    onChunk({text,zh,bracket,describes:bracket&&head&&walk!.preview.shrunk.toLowerCase().includes(head.toLowerCase())?head:'',reason:bracket?words(row[6]):''});
  };
  const begin=(easier?:Easier)=>{
    try{walk=rowWalker(source,entries,easier);onPreview(walk.preview);}catch{broken=true;}
    // Rows that arrived meanwhile are shown now, even if the reply has ended since.
    const rows=held||[];held=null;
    rows.forEach(show);
  };
  return (full:string)=>{
    if(stage==='done')return;
    for(;seen<full.length;seen++) {
      const ch=full[seen];
      if(stage==='between') {
        if(ch==='['){
          if(!/^\s*,\s*"lines"\s*:\s*$/.test(prefix)){stage='done';return;}
          stage='lines';depth=1;prefix='';
        }
        else prefix+=ch;
        continue;
      }
      if(quoted){
        if(slash)slash=false;
        else if(ch==='\\')slash=true;
        else if(ch==='"')quoted=false;
        continue;
      }
      if(ch==='"'){quoted=true;continue;}
      if(ch==='['){
        if(depth===0 && !/^\s*\{\s*"swaps"\s*:\s*$/.test(full.slice(0,seen))){stage='done';return;}
        if(++depth===2)rowStart=seen;
        continue;
      }
      if(ch!==']')continue;
      if(--depth===1 && rowStart>=0){
        try {
          const row=JSON.parse(full.slice(rowStart,seen+1));rowStart=-1;
          if(stage==='swaps'){entries.push(row);continue;}
          if(held)held.push(row);else show(row);
          if(broken){stage='done';return;}
        } catch {stage='done';return;}
      } else if(depth===0){
        if(stage==='lines'){stage='done';return;}
        let hard=false;
        try{hard=Boolean(ease)&&hardSwaps(source,entries).length>0;}catch{/* shown as it is */}
        if(hard){held=[];void ease!(entries).then(begin,()=>begin());}
        else begin();
        if(broken){stage='done';return;}
        stage='between';
      }
    }
  };
}
