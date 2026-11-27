import {z} from 'zod';
import type {Analysis} from './types.ts';

const text = z.string().max(4800);
const swaps = z.array(z.tuple([text.min(1), text.min(1), text.min(1)])).max(260);
const kinds = {s:'skeleton', i:'inner-skeleton', p:'phrase', c:'clause'} as const;
const line = z.tuple([text.min(1), z.enum(['s','i','p','c']), z.number().int().min(0).max(12), text.min(1), text.min(1)]).rest(text);
const compact = z.object({
  swaps, lines:z.array(line).min(1).max(300), core:text.min(1), hardCore:text.min(1),
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
    skeleton:{text:a.core,original:a.hardCore,table:a.roles.map(([q,a,term])=>({q,a,term}))},
    add:chunks.flatMap((c,i)=>c.bracket?[{chunkIndex:i,describes:c.describes,question:c.job}]:[]),
    zh:a.zh,originalZh:a.zh,
  };
}

// Read each completed row once, even when a network frame splits a quoted string.
export function streamRows(source:string, onPreview:(p:Preview)=>void, onChunk:(c:LiveChunk)=>void) {
  let seen=0, rowStart=-1, depth=0, quoted=false, slash=false, stage:'swaps'|'between'|'lines'|'done'='swaps';
  let prefix='', cursor=0, preview:Preview|undefined;
  const entries:unknown[]=[];
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
          const c=chunkFrom(line.parse(row));
          const start=preview!.shrunk.indexOf(c.text,cursor);
          if(start<cursor || preview!.shrunk.slice(cursor,start).trim() || !/\p{Script=Han}/u.test(c.zh)
            || (c.bracket && (!c.signalWhy || !c.describes || !preview!.shrunk.toLowerCase().includes(c.describes.toLowerCase())))){
            stage='done';return;
          }
          cursor=start+c.text.length;
          onChunk({text:c.text,zh:c.zh,bracket:c.bracket,describes:c.describes,reason:c.signalWhy});
        } catch {stage='done';return;}
      } else if(depth===0){
        if(stage==='lines'){stage='done';return;}
        try{preview=applySwaps(source,entries);onPreview(preview);}catch{stage='done';return;}
        stage='between';
      }
    }
  };
}
