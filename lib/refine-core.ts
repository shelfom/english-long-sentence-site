// The skeleton is the heart of the lesson: the indivisible minimum, the shortest correct
// sentence that can be cut out of the kept lines. The long analysis sometimes leaves an
// adjective or an adverb in it, above all inside a replacement of several words ("taking
// strict action against"), so one small, focused request per wording looks at it again.
// That second look may only take modifier words out. Whatever else it does is ignored:
// a word added or reworded, a deleted article, preposition, verb helper or negative.
// What can be settled without a model is settled here too: a or an before the word that now
// follows it, a capital and a closing mark, and the questions under the skeleton, which may
// quote only words the skeleton still has.
import type {Analysis} from './types.ts';
import {validate,words} from './validate.ts';

type Usage={input:number,output:number};
type Ask=(system:string,user:string,limit:number)=>Promise<{answer:string,usage?:Usage}>;
type Skeleton=Analysis['skeleton'];
type Track='text'|'originalText';
type Placed={word:string,from:number,to:number};
type Checked={skeleton:string,zh?:string};
export type CoreReview={text?:Checked,original?:Checked,usage:Usage};

const instructions=`You check the skeleton of an English sentence in a reading lesson.
Input: the main-line words of the sentence in reading order ("kept", lines separated by " / ") and the skeleton cut from them.
The skeleton is the main line with every modifier taken out. Find the modifier words still in it and delete them: one-word adjectives, adverbs, nouns that modify another noun, numbers and quantity words. Delete single words only; every other word stays where it is, unchanged.
A word stays if the sentence needs it: the nouns that head the subject, the object and the complement; verbs; articles, prepositions, pronouns and conjunctions; every negative word (not, no, never, few, little, hardly); the word after how, so, too, as, more or less; only; a name in full.
If the skeleton holds no such modifier, return it unchanged.
Give the complete, natural Chinese of the result, translating exactly what remains.
Return JSON only: {"skeleton":"…","zh":"…"}`;

const WORD=/[\p{L}\p{N}]+(?:[-’'][\p{L}\p{N}]+)*/gu;
const fold=(w:string)=>w.toLowerCase().replace(/’/g,"'");
const article=(w:string)=>/^an?$/.test(w);
const alike=(l:string,r:string)=>l===r||(article(l)&&article(r));
const negative=(w:string)=>/^(not?|never|nor|neither|none|nothing|nobody|nowhere|few|little|hardly|barely|scarcely|seldom|rarely|without)$|n't$/.test(w);
const han=(s:unknown):s is string=>typeof s==='string'&&/\p{Script=Han}/u.test(s);
const sentenceOf=(a:Analysis,track:Track)=>track==='text'?a.shrunk:a.original;
const coreOf=(s:Skeleton,track:Track)=>track==='text'?s.text:s.original;

// A sentence again: one capital at the start, the closing mark of its source at the end.
function tidy(text:unknown,source:string){
  if(typeof text!=='string')return '';
  let out=text.replace(/\s+/g,' ').trim().replace(/[,;:—–-]+$/u,'').trim();
  if(!out)return '';
  if(!/[.!?。！？]["”’')\]]*$/u.test(out))out+=/([.!?])["”’')\]]*\s*$/u.exec(source)?.[1]||'.';
  return out.replace(/^(["“‘'(\[]*)(\p{Ll})/u,(_,lead:string,ch:string)=>lead+ch.toUpperCase());
}

// The kept lines word by word, each with its place in the sentence.
function keptWords(a:Analysis,track:Track):Placed[] {
  const sentence=sentenceOf(a,track);
  let end=0;
  return a.chunks.flatMap(c=>{
    const text=c[track],found=sentence.indexOf(text,end),start=found<0?end:found;end=start+text.length;
    return c.kind==='skeleton'?[...text.matchAll(WORD)].map(m=>({word:fold(m[0]),from:start+m.index!,to:start+m.index!+m[0].length})):[];
  });
}
// Where each word of a core sits among the kept words, read the way the lesson reads it: the next match in order.
function place(core:string[],kept:Placed[]){
  const at:number[]=[];let i=0;
  for(const w of core){
    let j=i;
    while(j<kept.length&&!alike(kept[j].word,w))j++;
    if(j>=kept.length)return null;
    at.push(j);i=j+1;
  }
  return at;
}

// "an hour", "a university", "an MRI", "an 18-year-old": the sound decides, not the letter.
export function vowelSound(word:string){
  const w=word.replace(/^[^\p{L}\p{N}]+/u,'');
  if(/^\d/.test(w))return /^(8|11(?!\d)|18(?!\d))/.test(w);
  if(/^[A-Z]{2,}s?$/.test(w)){
    if(w[0]==='U')return false;
    // Spelled out letter by letter where it cannot be said as a word.
    if(w.length<=3||!/[AEIOUY]/.test(w.slice(1)))return /^[AEFHILMNORSX]/.test(w);
  }
  const l=w.toLowerCase();
  if(/^(hour|honest|honou?r|heir)/.test(l))return true;
  if(/^(uni(?![nmd])|unanim|us[aeu]|ut[eio]|ubiq|ur[aeio]|eu|ewe|(one|once)(?![a-z]))/.test(l))return false;
  return /^[aeiou]/.test(l);
}
// Where a core left out the word between an article and its noun, the article suits the word that now follows.
export function suit(core:string,kept:Placed[]){
  const found=[...core.matchAll(WORD)],at=place(found.map(m=>fold(m[0])),kept);
  if(!at)return core;
  let out=core;
  for(let i=found.length-2;i>=0;i--){
    const written=found[i][0];
    if(!article(written.toLowerCase()))continue;
    // The sentence itself is the authority while its own next word still follows.
    const want=kept[at[i]+1]?.word===fold(found[i+1][0])&&article(kept[at[i]].word)?kept[at[i]].word:vowelSound(found[i+1][0])?'an':'a';
    if(want===written.toLowerCase())continue;
    out=out.slice(0,found[i].index!)+(written[0]==='A'?'A'+want.slice(1):want)+out.slice(found[i].index!+written.length);
  }
  return out;
}

// A negative that stands right before a word the skeleton keeps, and that the skeleton left out:
// "finds little support" cut to "finds support" says the opposite.
const denies=(w:string)=>/^(not|no|never|few|little|hardly|barely|scarcely|seldom|rarely)$/.test(w);
function lost(a:Analysis,track:Track){
  const core=coreOf(a.skeleton,track),sentence=sentenceOf(a,track),found=[...core.matchAll(WORD)],kept=keptWords(a,track),at=place(found.map(m=>fold(m[0])),kept);
  if(!at)return [];
  const used=new Set(at),touching=(l:Placed,r:Placed)=>/^\s+$/.test(sentence.slice(l.to,r.from));
  return at.flatMap((k,i)=>{
    let j=k;
    while(j>0&&denies(kept[j-1].word)&&!used.has(j-1)&&touching(kept[j-1],kept[j])&&!(j>1&&kept[j-2].word==='a'&&touching(kept[j-2],kept[j-1])))j--;
    return j<k?[{word:found[i],first:kept[j],head:kept[k],text:sentence.slice(kept[j].from,kept[k].to)}]:[];
  });
}
// For the correction request: what the core must keep.
export function lostNegatives(a:Analysis){
  return lost(a,'originalText').map(l=>'"core" and "hardCore" leave "'+a.original.slice(l.first.from,l.first.to)+'" out of "'+l.text+'", which turns the meaning around. A negative word stays in the core: not, no, never, few, little, hardly.').slice(0,2);
}
// Last resort, where the model did not put it back: the negative returns to its place.
function mend(a:Analysis,track:Track){
  let core=coreOf(a.skeleton,track);
  for(const l of lost(a,track).reverse())core=core.slice(0,l.word.index)+sentenceOf(a,track).slice(l.first.from,l.head.to)+core.slice(l.word.index+l.word[0].length);
  return core;
}

// Each wording is checked on its own: a verb that needs its object in one may stand alone in the other.
export async function reviewCore(a:Analysis,ask:Ask):Promise<CoreReview> {
  const out:CoreReview={usage:{input:0,output:0}};
  await Promise.all((['text','originalText'] as const).map(async track=>{
    // With no word replaced the two wordings are one sentence: one look serves both.
    if(track==='originalText'&&a.skeleton.original===a.skeleton.text&&a.original===a.shrunk)return;
    try{
      const reply=await ask(instructions,JSON.stringify({kept:a.chunks.filter(c=>c.kind==='skeleton').map(c=>c[track]).join(' / '),skeleton:tidy(mend(a,track),sentenceOf(a,track))}),320);
      if(reply.usage){out.usage.input+=reply.usage.input;out.usage.output+=reply.usage.output;}
      const answer=JSON.parse(reply.answer) as {skeleton?:unknown,zh?:unknown};
      if(typeof answer.skeleton==='string'&&answer.skeleton.trim())
        out[track==='text'?'text':'original']={skeleton:answer.skeleton,zh:han(answer.zh)&&!/[{}[\]\\<>]/.test(answer.zh)?answer.zh.trim().slice(0,1600):undefined};
    }catch{/* this wording keeps its skeleton */}
  }));
  if(out.text&&!out.original&&a.original===a.shrunk)out.original=out.text;
  return out;
}

// A core with some of its words taken out. Punctuation between two words that both stay is kept;
// where words went, what stays is a clause break and the quote or bracket that belongs to a neighbour.
function without(core:string,found:RegExpExecArray[],keep:boolean[]){
  const stay=found.map((_,i)=>i).filter(i=>keep[i]);
  if(!stay.length)return '';
  const after=(i:number)=>found[i].index+found[i][0].length;
  let out=/["“‘'(\[]*$/.exec(core.slice(0,found[stay[0]].index))![0];
  stay.forEach((i,n)=>{
    out+=found[i][0];
    if(n===stay.length-1){out+=i===found.length-1?core.slice(after(i)):/^["”’')\]]*/.exec(core.slice(after(i)))![0];return;}
    const next=stay[n+1];
    if(next===i+1){out+=core.slice(after(i),found[next].index);return;}
    const breaks=found.slice(i,next).map((_,k)=>core.slice(after(i+k),found[i+k+1].index));
    out+=(/^["”’')\]]+/.exec(breaks[0])?.[0]||'')+(/[;:]/.exec(breaks.join(''))?.[0]||'')+' '+(/["“‘'(\[]+$/.exec(breaks.at(-1)!)?.[0]||'');
  });
  return out;
}
// Words a second look may not take out of a skeleton: the ones that hold a sentence together.
const structural=new Set(('a an the this that these those such of to in on at by for with from into onto over under about after before since during through between among against across beyond within without toward towards upon off out up down '
  +'and or but nor so yet if when while whereas because although though unless until than as whether that which who whom whose what where why how '
  +'is are was were be been being am has have had do does did will would shall should can could may might must ought '
  +'i me my we us our you your he him his she her it its they them their there here one each every all both either any some most many much more less least '
  +'too very quite rather enough only even just also not no').split(' '));
const degree=new Set('how so too as more less most least very such quite rather'.split(' '));
const adverbs=new Set('always often still already now then soon again together once twice ever far long fast hard well indeed however therefore nonetheless nevertheless moreover instead perhaps maybe today yesterday tomorrow'.split(' '));
// The skeleton a second look asks for, as far as it only takes modifier words out of the one that
// stands. `exact` says the answer asked for nothing else, so its Chinese fits the result.
function reduced(previous:string,answer:string){
  const found=[...previous.matchAll(WORD)],list=found.map(m=>fold(m[0])),keep=found.map(()=>false);
  let i=0;
  for(const w of words(answer).map(fold)){
    let j=i;
    while(j<found.length&&!alike(list[j],w))j++;
    if(j>=found.length)return null;
    keep[j]=true;i=j+1;
  }
  // A stretch of deleted words goes only if every word in it is a plain modifier: "strict" goes,
  // "of the collection" and "too" stay, and so does anything that carries a negative. A modifier
  // stands right before a word that stays ("strict action", "chip exports"), or it is an adverb
  // ("risen sharply"). Anything else, the noun in "many villages would" say, is a head.
  const free=(k:number)=>!structural.has(list[k])&&!negative(list[k])&&!(k>0&&degree.has(list[k-1]));
  const adverb=(w:string)=>(w.length>4&&w.endsWith('ly'))||adverbs.has(w);
  let exact=true;
  for(let k=0;k<found.length;){
    if(keep[k]){k++;continue;}
    let end=k;while(end<found.length&&!keep[end])end++;
    const run=list.slice(k,end);
    const leads=end<found.length&&!structural.has(list[end])&&/^\s+$/.test(previous.slice(found[end-1].index+found[end-1][0].length,found[end].index));
    if(!run.every((_,n)=>free(k+n))||!(leads||run.every(adverb))){for(let n=k;n<end;n++)keep[n]=true;exact=false;}
    k=end;
  }
  return keep.every(Boolean)?null:{core:without(previous,found,keep),exact};
}

// Words that carry no answer of their own.
const minor=new Set(('a an the of to in on at by for with from as and or but nor so than that not no is are was were be been being am '
  +'has have had do does did will would shall should can could may might must it its they them their he him his she her we us our you your i me my this these those there').split(' '));
// The words an answer shares with a core, in order, taken as close together as they come:
// "the farmers" is the pair that stands together, not an earlier "the" and a later "farmers".
function shared(answer:string[],core:string[]){
  const walk=(l:string[],r:string[])=>{
    const n=l.length,m=r.length,table=Array.from({length:n+1},()=>new Uint16Array(m+1));
    for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)table[i][j]=alike(l[i],r[j])?table[i+1][j+1]+1:Math.max(table[i+1][j],table[i][j+1]);
    const hit:number[]=[];
    for(let i=0,j=0;i<n&&j<m;){
      if(alike(l[i],r[j])&&table[i][j]===table[i+1][j+1]+1){hit.push(j);i++;j++;}
      else if(table[i+1][j]>=table[i][j+1])i++;else j++;
    }
    return hit;
  };
  // Read backwards for the latest place the answer can start, then forwards from there for the earliest end.
  const back=walk([...answer].reverse(),[...core].reverse());
  if(!back.length)return [];
  const start=core.length-1-back.at(-1)!;
  return walk(answer,core.slice(start)).map(j=>j+start);
}
// The stretch of a core that an answer points at, or nothing where the two share too little.
function stretch(answer:string[],core:string[]){
  const hit=shared(answer,core),n=answer.length;
  const weighty=(list:number[])=>list.filter(j=>!minor.has(core[j])).length;
  const weight=weighty(hit);
  // The whole answer, or a good part of it that says something.
  if(!hit.length||!(hit.length===n||(weight>0&&(hit.length*2>=n||weight>1))))return null;
  let range:[number,number]=[hit[0],hit.at(-1)!];
  if(hit.length<0.6*(range[1]-range[0]+1)){
    // Scattered over the core: the answer is its longest unbroken run that says something.
    const runs:number[][]=[];
    for(const j of hit)if(runs.length&&runs.at(-1)!.at(-1)===j-1)runs.at(-1)!.push(j);else runs.push([j]);
    const best=runs.sort((l,r)=>weighty(r)-weighty(l)||r.length-l.length)[0];
    if(!weighty(best)&&hit.length!==n)return null;
    range=[best[0],best.at(-1)!];
  }
  return {range,weight};
}
// The questions under the skeleton point at pieces of it: each answer becomes the piece of the
// simpler skeleton it points at, and a question about words the skeleton no longer has goes.
function fitTable(a:Analysis):Skeleton['table'] {
  const [easy,hard]=(['text','originalText'] as const).map(track=>{
    const core=coreOf(a.skeleton,track),found=[...core.matchAll(WORD)],list=found.map(m=>fold(m[0])),kept=keptWords(a,track);
    return {core,found,list,kept,at:place(list,kept)};
  });
  // A place in the original sentence, in the simpler one: inside a replacement, its start or its end.
  const across=(o:number,end:boolean)=>{
    let shift=0;
    for(const s of a.shrink){
      const from=s.startIndex,to=from+s.big.length;
      if(end?o<=from:o<from)break;
      if(end?o<=to:o<to)return from+shift+(end?s.small.length:0);
      shift+=s.small.length-s.big.length;
    }
    return o+shift;
  };
  const seen=new Set<string>();
  const table=a.skeleton.table.flatMap(row=>{
    const said=words(row.a).map(fold);
    if(!said.length)return [];
    const inEasy=stretch(said,easy.list),inHard=stretch(said,hard.list);
    let range=inEasy?.range,piece='';
    if(inHard&&easy.at&&hard.at){
      // Said in the original wording: the same stretch of the sentence, in the simpler skeleton.
      const from=across(hard.kept[hard.at[inHard.range[0]]].from,false),to=across(hard.kept[hard.at[inHard.range[1]]].to,true);
      const inside=easy.at.map((k,i)=>easy.kept[k].from>=from&&easy.kept[k].to<=to?i:-1).filter(i=>i>=0);
      const moved:[number,number]|undefined=inside.length?[inside[0],inside.at(-1)!]:undefined;
      // An answer that mixes the two wordings points at both stretches; where they meet, it means them together.
      if(moved&&range&&moved[0]<=range[1]+1&&range[0]<=moved[1]+1)range=[Math.min(range[0],moved[0]),Math.max(range[1],moved[1])];
      else if(moved&&(!range||inHard.weight>inEasy!.weight))range=moved;
    }
    if(range)piece=easy.core.slice(easy.found[range[0]].index!,easy.found[range[1]].index!+easy.found[range[1]][0].length);
    else if(inHard)piece=hard.core.slice(hard.found[inHard.range[0]].index!,hard.found[inHard.range[1]].index!+hard.found[inHard.range[1]][0].length);
    if(!piece||seen.has(piece.toLowerCase()))return [];
    seen.add(piece.toLowerCase());
    return [{...row,a:piece}];
  });
  return table.length?table:a.skeleton.table;
}

// Puts the second look on the lesson. Each step stands on its own: one the lesson cannot
// take (a skeleton no longer cut from its kept lines, or one that says nothing) is skipped.
export function withCore(a:Analysis,checked?:CoreReview):Analysis {
  let best=a;
  const attempt=(change:(now:Analysis)=>Partial<Skeleton>|null)=>{
    try{
      const part=change(best);
      if(!part)return;
      const skeleton={...best.skeleton,...part};
      if(words(skeleton.text).length<2||words(skeleton.original).length<2)return;
      best=validate({...best,skeleton},best.original);
    }catch{/* keep what stands */}
  };
  const answers=[['text',checked?.text],['originalText',checked?.original]] as const;
  const set=(track:Track,core:string)=>track==='text'?{text:core}:{original:core};
  for(const [track] of answers)attempt(now=>set(track,mend(now,track)));
  for(const [track,answer] of answers)attempt(now=>{
    const fit=answer&&reduced(coreOf(now.skeleton,track),answer.skeleton);
    return fit?set(track,fit.core):null;
  });
  attempt(now=>({text:suit(tidy(now.skeleton.text,now.shrunk),keptWords(now,'text')),original:suit(tidy(now.skeleton.original,now.original),keptWords(now,'originalText'))}));
  // The Chinese under a skeleton that changed is the second look's, where that look saw exactly this skeleton.
  const wording=(text:string)=>words(text).map(fold).join(' ');
  for(const [track,answer] of answers)attempt(now=>{
    const core=coreOf(now.skeleton,track);
    if(!answer?.zh||wording(core)===wording(coreOf(a.skeleton,track))||wording(core)!==wording(answer.skeleton))return null;
    return track==='text'?{zh:answer.zh}:{originalZh:answer.zh};
  });
  attempt(now=>({table:fitTable(now)}));
  return best;
}
