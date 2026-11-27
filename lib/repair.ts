// A model answer is often sound in substance and sloppy in form: rows quoted in the
// original wording, an object clause labelled as an inner skeleton, a head described
// instead of copied, a core written in the wrong vocabulary. This module rebuilds a
// strict analysis from such an answer, and says exactly what it could not settle so
// the model can be asked to correct that and nothing else.

export class Issues extends Error {
  list:string[];
  constructor(list:string[]){super(list.join('\n'));this.list=list;}
}
type Tok={text:string,start:number,end:number};
type Swap={big:string,small:string,zh:string,startIndex:number};
// One word of the sentence, or one replaced expression in both of its wordings.
type Unit={hard:string[],easy:string[],src:[number,number],shr:[number,number],swap:boolean,row:number};
type Tag='s'|'i'|'p'|'c';
type Row={k:number,quote:string,words:string[],tag:Tag,declared:number,zh:string,rest:string[],from:number,to:number,
  opener:number,parent:number,head?:{text:string,index:number}};

const WORD=/[\p{L}\p{N}]+(?:[-’'][\p{L}\p{N}]+)*/gu;
const toks=(s:string):Tok[]=>[...s.matchAll(WORD)].map(m=>({text:m[0],start:m.index!,end:m.index!+m[0].length}));
const fold=(w:string)=>w.toLowerCase().replace(/’/g,"'");
const han=(s:unknown):s is string=>typeof s==='string'&&/\p{Script=Han}/u.test(s);
const str=(v:unknown)=>typeof v==='string'?v.trim():typeof v==='number'?String(v):'';
const bounded=(needle:string)=>new RegExp('(?<![\\p{L}\\p{N}])'+needle.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?![\\p{L}\\p{N}])','giu');
const brief=(s:string,n=70)=>JSON.stringify(s.length>n?s.slice(0,n)+'…':s);
const tags:Record<string,Tag>={s:'s',i:'i',p:'p',c:'c',skeleton:'s','inner-skeleton':'i',phrase:'p',clause:'c','(':'p','[':'c'};
const small=new Set('the a an of to in on at by for with from and or but nor that which who whom whose it its is are was were be been being will would can could shall should may might must has have had do does did not no this these those their his her our your my as so than'.split(' '));

// Reads the rows of one array of arrays, even when a later part of the reply is damaged.
function rowsAfter(text:string,key:string){
  const rows:unknown[]=[];
  const at=text.search(new RegExp('"'+key+'"\\s*:\\s*\\['));
  if(at<0)return rows;
  let depth=0,quoted=false,slash=false,start=-1;
  for(let i=text.indexOf('[',at);i<text.length;i++){
    const ch=text[i];
    if(quoted){if(slash)slash=false;else if(ch==='\\')slash=true;else if(ch==='"')quoted=false;continue;}
    if(ch==='"'){if(depth===1)break;quoted=true;continue;}     // the array was never closed
    if(ch==='['){if(++depth===2)start=i;continue;}
    if(ch!==']')continue;
    if(--depth===0)break;
    if(depth===1&&start>=0){try{rows.push(JSON.parse(text.slice(start,i+1)));}catch{/* skip a damaged row */}start=-1;}
  }
  return rows;
}
// Tolerates text around the object, an array left open and a damaged roles table.
export function parseLoose(answer:string):unknown {
  const body=answer.slice(answer.indexOf('{'),answer.lastIndexOf('}')+1);
  for(const candidate of [answer,body,body.replace(/,(\s*[\]}])/g,'$1')]){
    try{const value=JSON.parse(candidate);if(value&&typeof value==='object')return value;}catch{/* try the next reading */}
  }
  const field=(key:string)=>{
    const m=new RegExp('"'+key+'"\\s*:\\s*("(?:[^"\\\\]|\\\\.)*")').exec(answer);
    try{return m?JSON.parse(m[1]) as string:undefined;}catch{return undefined;}
  };
  const salvaged={swaps:rowsAfter(answer,'swaps'),lines:rowsAfter(answer,'lines'),roles:rowsAfter(answer,'roles'),
    core:field('core'),hardCore:field('hardCore'),coreZh:field('coreZh'),hardCoreZh:field('hardCoreZh'),zh:field('zh')};
  if(salvaged.lines.length&&salvaged.core&&salvaged.zh)return salvaged;
  throw new Issues(['The reply was not one valid JSON object. Return the complete compact JSON object only.']);
}

const vowelSound=(w:string)=>/^(?:[aeio]|u(?!ni|se|su|ti|ro|ke)|h(?:our|onest|onou?r|eir))/i.test(w)&&!/^(?:one|once|eu|ew)/i.test(w);
// Swaps are located wherever they occur, so a list given out of reading order still applies.
export function locateSwaps(source:string,raw:unknown,articles=true){
  const shrink:Swap[]=[];let cursor=0;
  for(const entry of Array.isArray(raw)?raw.slice(0,260):[]){
    if(!Array.isArray(entry))continue;
    const big=str(entry[0]);let easy=str(entry[1]).split(/\s+[/／]\s+/)[0].trim();
    if(!big||!easy||han(easy)||fold(big)===fold(easy)||!toks(big).length||!toks(easy).length)continue;
    const hits=[...source.matchAll(bounded(big))].map(m=>({at:m.index!,text:m[0]}))
      .filter(h=>!shrink.some(p=>h.at<p.startIndex+p.big.length&&p.startIndex<h.at+h.text.length));
    let hit=hits.find(h=>h.at>=cursor)||hits[0];
    if(!hit)continue;
    const article=/(?<![\p{L}\p{N}])(an?)(\s+)$/iu.exec(source.slice(0,hit.at));
    if(article&&articles){
      const suits=(word:string)=>vowelSound(word)?'an':'a',now=fold(article[1]),start=hit.at-article[0].length;
      if(now===suits(hit.text)&&now!==suits(easy)&&!shrink.some(p=>start<p.startIndex+p.big.length&&p.startIndex<hit.at)){
        const fixed=suits(easy);
        easy=(article[1][0]===article[1][0].toUpperCase()?fixed[0].toUpperCase()+fixed.slice(1):fixed)+article[2]+easy;
        hit={at:start,text:source.slice(start,hit.at+hit.text.length)};
      }
    }
    if(/^\p{Lu}/u.test(hit.text)&&/^\p{Ll}/u.test(easy)&&!/[\p{L}\p{N}]/u.test(source.slice(0,hit.at)))easy=easy[0].toUpperCase()+easy.slice(1);
    shrink.push({big:hit.text,small:easy,zh:str(entry[2])||easy,startIndex:hit.at});
    cursor=Math.max(cursor,hit.at+hit.text.length);
  }
  shrink.sort((l,r)=>l.startIndex-r.startIndex);
  let shrunk='',end=0;
  for(const s of shrink){shrunk+=source.slice(end,s.startIndex)+s.small;end=s.startIndex+s.big.length;}
  return {shrink,shrunk:shrunk+source.slice(end)};
}

export function unitsOf(source:string,shrink:Swap[]):Unit[] {
  const tokens=toks(source);
  // A replacement owns every word it touches; replacements sharing a word form one unit.
  const groups:{a:number,b:number,swaps:Swap[]}[]=[];
  for(const s of shrink){
    let a=s.startIndex,b=a+s.big.length;
    for(const t of tokens)if(t.end>s.startIndex&&t.start<s.startIndex+s.big.length){a=Math.min(a,t.start);b=Math.max(b,t.end);}
    const last=groups.at(-1);
    if(last&&a<last.b){last.b=Math.max(last.b,b);last.swaps.push(s);}else groups.push({a,b,swaps:[s]});
  }
  const units:Unit[]=[];let shift=0,t=0;
  const plain=(k:Tok)=>units.push({hard:[k.text],easy:[k.text],src:[k.start,k.end],shr:[k.start+shift,k.end+shift],swap:false,row:-1});
  for(const g of groups){
    for(;t<tokens.length&&tokens[t].end<=g.a;t++)plain(tokens[t]);
    let text='',at=g.a;
    for(const s of g.swaps){text+=source.slice(at,s.startIndex)+s.small;at=s.startIndex+s.big.length;}
    text+=source.slice(at,g.b);
    const start=g.a+shift;shift+=text.length-(g.b-g.a);
    units.push({hard:toks(source.slice(g.a,g.b)).map(x=>x.text),easy:toks(text).map(x=>x.text),src:[g.a,g.b],shr:[start,start+text.length],swap:true,row:-1});
    for(;t<tokens.length&&tokens[t].start<g.b;t++);
  }
  for(;t<tokens.length;t++)plain(tokens[t]);
  return units;
}

const within=(words:string[],part:string[])=>part.length>0&&words.some((_,i)=>part.every((w,n)=>words[i+n]===w));
// A row may have corrected an article after a replacement.
const same=(l:string,r:string)=>l===r||(/^an?$/.test(l)&&/^an?$/.test(r));
// How many of the row's words, from position i, spell this unit in either wording.
function matchUnit(unit:Unit,w:string[],i:number){
  let best:{n:number,form:string[],full:boolean}|null=null;
  for(const form of unit.swap?[unit.easy,unit.hard]:[unit.hard]){
    let n=0;while(n<form.length&&i+n<w.length&&same(fold(form[n]),w[i+n]))n++;
    const full=n===form.length;
    if(n&&(!best||(full&&!best.full)||(full===best.full&&n>best.n)))best={n,form,full};
  }
  return best;
}

// Linking words a row may have left out at its start; they rejoin the row that follows.
const links=new Set('that which who whom whose and but or nor so yet although though because when while whereas if unless until since after before once where whether as than then'.split(' '));
// Walks rows along the sentence. Each row may quote the simpler or the original wording.
// Returns null when the rows fit; otherwise the reason, in words the model can act on.
export function alignRows(rows:{words:string[],k:number,quote:string,from:number,to:number,tag?:Tag}[],units:Unit[]):string|null {
  let u=0,mended=0;
  const say=(from:number,to:number)=>brief(units.slice(from,to).map(x=>x.easy.join(' ')).join(' '));
  const rule=' Lines copy the simpler sentence word for word, in reading order, every word exactly once. To simplify a word, list the replacement in "swaps"; otherwise copy it unchanged.';
  const fitsAt=(w:string[],p:number)=>{for(let i=0;i<w.length;p++){const hit=p<units.length?matchUnit(units[p],w,i):null;if(!hit)return -1;i+=hit.n;}return p;};
  for(let r=0;r<rows.length;r++){
    const row=rows[r],w=row.words,name='lines['+row.k+'] '+brief(row.quote);row.from=row.to=u;
    if(!w.length)continue;
    const fits=(p:number)=>fitsAt(w,p)>=0;
    const next=rows.slice(r+1).find(x=>x.words.length);
    // A word or short expression respelt inside a row: the sentence's own words stand there.
    // Never fewer row words than sentence words, which would hide a skipped word.
    const resync=(i:number):[number,number]|null=>{
      if(mended>2)return null;
      for(const [di,du] of [[1,1],[2,1],[2,2],[3,1],[3,2],[3,3],[4,1],[4,2]]){
        if(i+di>w.length||u+du>units.length)continue;
        const rest=w.length-i-di;
        if(!rest?(next?u+du<units.length&&Boolean(matchUnit(units[u+du],next.words,0)):u+du===units.length)
          :u+du<units.length&&Boolean(matchUnit(units[u+du],w,i+di))&&(rest<2||fits2(u+du,i+di)))return [di,du];
      }
      return null;
    };
    const fits2=(p:number,i:number)=>{const hit=matchUnit(units[p],w,i);return Boolean(hit&&(i+hit.n>=w.length||(p+1<units.length&&matchUnit(units[p+1],w,i+hit.n))));};
    if(u>=units.length||!matchUnit(units[u],w,0)){
      const outer=rows.slice(0,r).findLast(x=>x.to>x.from);
      let inside=outer?outer.from+1:0;
      while(outer&&inside<outer.to&&!fits(inside))inside++;
      let skip=1;while(skip<=2&&!(u+skip<units.length&&matchUnit(units[u+skip],w,0)&&units.slice(u,u+skip).every(x=>!x.swap&&links.has(fold(x.hard[0])))))skip++;
      let far=1;while(far<=3&&!(u+far<units.length&&fits(u+far)))far++;
      if(skip<=2)u+=skip;        // a linking word or two dropped at a row boundary rejoins the row that follows
      else if(outer&&inside<outer.to){
        // The row before also spans this one. Follow the rows it contains.
        let end=inside,count=0;
        for(let n=r;n<rows.length;n++){const stop=rows[n].words.length?fitsAt(rows[n].words,end):end;if(stop<0||stop>outer.to)break;end=stop;count++;}
        if(end===outer.to)outer.to=row.from=u=inside;      // they run to its end: it stops where they begin
        else if(outer.tag==='p'||outer.tag==='c'){
          // They sit in its middle. The bracketed row stays whole; a later pass may divide it again.
          for(let n=r;n<r+count;n++)rows[n].words=[];
          r+=count-1;continue;
        }else return name+' repeats words that are already inside lines['+rows[rows.indexOf(outer)].k+']. Divide that row into the part before, this modifier and the part after, each with its own Chinese, in reading order.'+rule;
      }
      else if(u<units.length&&resync(0)){/* mended in the loop below */}
      else if(far<=3){if(outer)outer.to=u+far;u+=far;row.from=outer?u:row.from;}   // a few words left out stay with the row they follow
      else{
        if(u>=units.length)return name+' comes after the sentence has already ended. Remove repeated or invented text.'+rule;
        let gap=4;while(gap<=12&&!(u+gap<units.length&&fits(u+gap)))gap++;
        return gap<=12?name+' leaves out the words '+say(u,u+gap)+' that come before it. Give them a row of their own, with its Chinese, or include them in a neighbouring row.'+rule
          :name+' does not follow the sentence there. The words that come next are '+say(u,u+7)+'.'+rule;
      }
    }
    for(let i=0;i<w.length;){
      const hit=u<units.length?matchUnit(units[u],w,i):null;
      if(!hit){
        const jump=u<units.length?resync(i):null;
        if(!jump)return name+' does not follow the sentence there. The words that come next are '+say(u,u+7)+'.'+rule;
        mended++;i+=jump[0];u+=jump[1];continue;
      }
      i+=hit.n;
      // A replacement divided between two rows stays whole in the row where it begins.
      if(!hit.full&&i===w.length&&next){
        let q=0;while(hit.n+q<hit.form.length&&q<next.words.length&&same(fold(hit.form[hit.n+q]),next.words[q]))q++;
        next.words.splice(0,q);
      }
      u++;
    }
    row.to=u;
  }
  if(units.length-u>3)return 'The lines stop before the sentence ends. Still missing: '+say(u,u+7)+'. Lines must cover the whole simpler sentence.';
  const last=rows.findLast(row=>row.to>row.from);
  if(last)last.to=units.length;
  return null;
}

// Last resort, once the model has had its chances: fit rows to the sentence by their longest
// common run of words, so that words a row left out, added or respelt no longer cost the lesson.
// Words no row claims stay with the row before them. False when the rows are not this sentence.
export function forceRows(rows:{words:string[],from:number,to:number}[],units:Unit[]):boolean {
  const said=rows.flatMap((row,r)=>row.words.map(w=>({w,r})));
  const owner=Array<number>(units.length).fill(-1);
  let matched=0,total=0;
  for(const track of ['easy','hard'] as const){
    const text=units.flatMap((unit,j)=>unit[track].map(x=>({w:fold(x),j})));
    const n=said.length,m=text.length,table=new Uint16Array((n+1)*(m+1)),at=(i:number,j:number)=>i*(m+1)+j;
    for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)table[at(i,j)]=same(said[i].w,text[j].w)?table[at(i+1,j+1)]+1:Math.max(table[at(i+1,j)],table[at(i,j+1)]);
    if(track==='easy'||table[0]>matched){
      const fresh=track==='easy'||table[0]>matched;
      if(fresh&&track==='hard')owner.fill(-1);
      for(let i=0,j=0;i<n&&j<m;){
        if(same(said[i].w,text[j].w)&&table[at(i,j)]===table[at(i+1,j+1)]+1){if(owner[text[j].j]<0)owner[text[j].j]=said[i].r;i++;j++;}
        else if(table[at(i+1,j)]>=table[at(i,j+1)])i++;else j++;
      }
      matched=table[0];total=m;
    }
  }
  if(!total||matched<total*0.8)return false;
  // Unclaimed words: a linking word goes with the row after it, anything else with the row before.
  for(let j=0,before=-1;j<units.length;j++){
    if(owner[j]>=0){before=owner[j];continue;}
    const after=owner.slice(j).find(r=>r>=0)??-1;
    owner[j]=before<0||(after>=0&&!units[j].swap&&links.has(fold(units[j].hard[0])))?(after>=0?after:before):before;
  }
  for(let j=1;j<units.length;j++)if(owner[j]<owner[j-1])owner[j]=owner[j-1];   // rows never go backwards
  rows.forEach((row,r)=>{row.from=owner.indexOf(r);row.to=owner.lastIndexOf(r)+1;if(row.from<0)row.from=row.to=0;});
  return true;
}

// Where one slice ends and the next begins: marks glued to the next word go with it.
function boundary(text:string,before:number,at:number){
  const space=text.slice(before,at).search(/\s\S*$/);
  return space<0?at:before+space+1;
}
// Follows rows as they arrive, for the live preview: each call returns that row's exact
// slice of the simpler sentence, or null once the rows stop following the sentence.
export function rowWalker(source:string,rawSwaps:unknown){
  const {shrink,shrunk}=locateSwaps(source,rawSwaps,false);
  const units=unitsOf(source,shrink);let u=0;
  return {preview:{shrink,shrunk},next(quote:string):string|null {
    const w=toks(quote).map(t=>fold(t.text)),from=u;
    if(!w.length||u>=units.length)return null;
    if(!matchUnit(units[u],w,0)){
      let skip=1;while(skip<=2&&!(u+skip<units.length&&matchUnit(units[u+skip],w,0)&&units.slice(u,u+skip).every(x=>!x.swap&&links.has(fold(x.hard[0])))))skip++;
      if(skip>2)return null;
      u+=skip;
    }
    for(let i=0;i<w.length;u++){
      const hit=u<units.length?matchUnit(units[u],w,i):null;
      if(!hit)return null;
      i+=hit.n;
    }
    return shrunk.slice(from?boundary(shrunk,units[from-1].shr[1],units[from].shr[0]):0,
      u<units.length?boundary(shrunk,units[u-1].shr[1],units[u].shr[0]):shrunk.length).trim();
  }};
}

// Words a core may add or respell without changing what it selects.
const fillers=new Set('the a an it this that there something someone somebody anything'.split(' '));
const helpers=new Set([...fillers,...'is are was were be been being am have has had do does did will would can could shall should may might must'.split(' ')]);
const stem=(w:string)=>w.replace(/['’]s$/,'').replace(/ies$/,'y').replace(/(?:es|s|ed|d|ing)$/,'').replace(/e$/,'');
const akin=(l:string,r:string)=>l===r||(l.length>3&&r.length>3&&!helpers.has(l)&&!helpers.has(r)&&stem(l)===stem(r));
type Track='easy'|'hard'|'either';
const forms=(unit:Unit,track:Track)=>track==='hard'?[unit.hard]:track==='easy'?[unit.easy]:[unit.easy,unit.hard];

// Chooses the sentence words a core is made of, leaving bracketed rows alone when it can.
// Returns the units used, or null when the core is not an in-order selection of the sentence.
// `forgive` 1 admits an inflected form of the sentence's word and up to two filler words that
// are not in the sentence; 2, used once the model has had its chances, also drops stray auxiliaries.
function alignCore(text:string,units:Unit[],track:Track,allowed:(row:number)=>boolean,costly:(row:number)=>boolean,forgive=0):number[]|null {
  const all=toks(text).map(t=>fold(t.text));
  function solve(cw:string[],loose:boolean):number[]|null {
    if(!cw.length)return null;
    const has=(j:number,w:string)=>forms(units[j],track).some(f=>f.some(x=>loose?akin(fold(x),w):fold(x)===w));
    const m=units.length,INF=1e9;
    // cost[j]: fewest bracketed rows entered when the latest core word sits on unit j.
    let cost=Array<number>(m).fill(INF);const back:number[][]=[];
    for(let i=0;i<cw.length;i++){
      const next=Array<number>(m).fill(INF),from=Array<number>(m).fill(-1);
      let any=INF,anyAt=-1;const inRow=new Map<number,[number,number]>();
      for(let j=0;j<m;j++){
        if(allowed(units[j].row)&&has(j,cw[i])){
          const enter=costly(units[j].row)?1:0,stay=inRow.get(units[j].row);
          if(!i)next[j]=enter;
          else{
            if(any<INF){next[j]=any+enter;from[j]=anyAt;}
            if(stay&&stay[0]<next[j]){next[j]=stay[0];from[j]=stay[1];}
            if(units[j].swap&&cost[j]<next[j]){next[j]=cost[j];from[j]=j;}   // a replacement of several words
          }
        }
        if(cost[j]>=INF)continue;
        if(cost[j]<any){any=cost[j];anyAt=j;}
        const stay=inRow.get(units[j].row);
        if(!stay||cost[j]<stay[0])inRow.set(units[j].row,[cost[j],j]);
      }
      cost=next;back.push(from);
    }
    let end=-1;
    for(let j=0;j<m;j++)if(cost[j]<INF&&(end<0||cost[j]<cost[end]))end=j;
    if(end<0)return null;
    const used:number[]=[];
    for(let i=cw.length-1,j=end;i>=0;j=back[i][j],i--)used.unshift(j);
    return [...new Set(used)];
  }
  const exact=solve(all,false);
  if(exact||!forgive)return exact;
  const spare=all.map((w,i)=>(forgive>1?helpers:fillers).has(w)?i:-1).filter(i=>i>=0).slice(0,10);
  for(const drop of [[],...spare.map(i=>[i]),...spare.flatMap((i,n)=>spare.slice(n+1).map(j=>[i,j]))]){
    const rest=all.filter((_,i)=>!drop.includes(i));
    const found=rest.length>2?solve(rest,true):null;
    if(found)return found;
  }
  return null;
}
// The first word of a core that the sentence does not have at that point, for the correction request.
function firstMiss(text:string,units:Unit[]){
  let j=-1,prev='';
  for(const t of toks(text)){
    const w=fold(t.text),at=(k:number)=>forms(units[k],'either').some(f=>f.some(x=>fold(x)===w));
    let k=j>=0&&units[j].swap&&at(j)?j:j+1;
    while(k<units.length&&!at(k))k++;
    if(k>=units.length)return prev?'the sentence does not have "'+prev+'" followed by "'+t.text+'"':'"'+t.text+'" is not in the sentence';
    j=k;prev=t.text;
  }
  return '';
}

function render(used:number[],units:Unit[],track:'easy'|'hard',sentence:string){
  const span=(j:number)=>track==='easy'?units[j].shr:units[j].src;
  let out='';
  used.forEach((j,n)=>{
    if(n){
      const gap=sentence.slice(span(used[n-1])[1],span(j)[0]);
      // Punctuation between neighbours stays. Where words were removed, what stays is a clause
      // break and any quote or bracket that belongs to the word on either side.
      out+=j===used[n-1]+1?gap.replace(/\s+/g,' ')
        :(/^["'”’)\]]+/.exec(gap)?.[0]||'')+(/[;:]/.exec(gap)?.[0]||'')+' '+(/["'“‘(\[]+$/.exec(gap)?.[0]||'');
    }
    out+=sentence.slice(...span(j));
  });
  out=out.trim().replace(/[,;:—–-]+$/,'').trim();
  const tail=/([.!?])(["”]*)\s*$/.exec(sentence);
  const open=(out.match(/"/g)||[]).length%2===1||(out.match(/“/g)||[]).length>(out.match(/”/g)||[]).length;
  return out[0].toUpperCase()+out.slice(1)+(tail?.[1]||'.')+(open?tail?.[2]||'':'');
}

function findHead(head:string,row:Row,rows:Row[],units:Unit[],source:string,shrunk:string){
  const own:[number,number]=[units[row.from].shr[0],units[row.to-1].shr[1]];
  const ownSource:[number,number]=[units[row.from].src[0],units[row.to-1].src[1]];
  const nearest=(hits:number[],at:number)=>hits.reduce((a,b)=>Math.abs(a-at)<=Math.abs(b-at)?a:b);
  function look(needle:string){
    const easy=[...shrunk.matchAll(bounded(needle))].map(m=>m.index!).filter(i=>i+needle.length<=own[0]||i>=own[1]);
    if(easy.length){const index=nearest(easy,own[0]);return {text:shrunk.slice(index,index+needle.length),index};}
    // A head quoted in the original wording is carried over to the simpler sentence.
    const hard=[...source.matchAll(bounded(needle))].map(m=>m.index!).filter(i=>i+needle.length<=ownSource[0]||i>=ownSource[1]);
    if(!hard.length)return null;
    const at=nearest(hard,ownSource[0]);
    const covered=units.filter(u=>u.src[1]>at&&u.src[0]<at+needle.length);
    if(!covered.length||covered.some(u=>u.row===rows.indexOf(row)))return null;
    const index=covered[0].shr[0];
    return {text:shrunk.slice(index,covered.at(-1)!.shr[1]),index};
  }
  const clean=head.replace(/^[\s"'“”‘’(\[]+|[\s"'“”‘’)\].,;:!?…]+$/g,'').replace(/\s+/g,' ');
  if(!clean||han(clean))return null;
  const exact=look(clean);
  if(exact)return exact;
  const parts=toks(clean).map(t=>t.text);
  if(parts.length<2||parts.length>4)return null;
  for(const word of [parts.at(-1)!,parts[0]])if(!small.has(fold(word))){const hit=look(word);if(hit)return hit;}
  return null;
}

type Options={final?:boolean,flat?:boolean};
// Builds the same structure expandAnalysis returns, from a loosely shaped answer.
// `final` settles what a correction could have improved; `flat` also gives up word-level heads.
export function rebuild(source:string,raw:unknown,options:Options={}){
  const input=(raw&&typeof raw==='object'?raw:{}) as Record<string,unknown>;
  const problems:string[]=[];
  const {shrink,shrunk}=locateSwaps(source,input.swaps);
  const units=unitsOf(source,shrink);

  // Rows: tolerate nulls, stray brackets and a bracket standing on a row of its own.
  let rows:Row[]=[];let pending:Row|null=null;
  for(const [k,line] of (Array.isArray(input.lines)?input.lines.slice(0,300):[]).entries()){
    if(!Array.isArray(line))continue;
    const quote=str(line[0]).replace(/&#?\w+;/g,' ').trim(),tag=tags[str(line[1]).toLowerCase()];
    if(!tag){problems.push('lines['+k+'] has tag '+JSON.stringify(line[1])+'. Use "s", "i", "p" or "c".');continue;}
    const number=Number(line[2]);
    const row:Row={k,quote,words:toks(quote).filter(t=>!han(t.text)).map(t=>fold(t.text)),tag,declared:Number.isFinite(number)?Math.min(12,Math.max(0,Math.round(number))):0,
      zh:str(line[3]),rest:line.slice(4).map(str),from:0,to:0,opener:-1,parent:-1};
    if(!row.words.length){if(tag==='p'||tag==='c')pending=row;continue;}
    if(pending){row.tag=pending.tag;row.declared=pending.declared;row.rest=pending.rest;row.zh=han(pending.zh)?pending.zh+row.zh:row.zh;pending=null;}
    rows.push(row);
  }
  if(!rows.length)throw new Issues(['"lines" is missing. Return the complete compact JSON with every key.']);
  if(problems.length)throw new Issues(problems);
  const spoken=rows.map(row=>[...row.words]);
  const misfit=alignRows(rows,units);
  if(misfit){
    rows.forEach((row,r)=>{row.words=spoken[r];});
    if(!options.final||!forceRows(rows,units))throw new Issues([misfit]);
  }
  rows=rows.filter(r=>r.to>r.from&&r.words.length);
  rows.forEach((row,r)=>{for(let u=row.from;u<row.to;u++)units[u].row=r;});
  for(const row of rows){
    if(!han(row.zh))problems.push('lines['+row.k+'] '+brief(row.quote)+' needs its Chinese translation as the fourth item.');
    if(row.tag==='i'&&!row.declared)row.tag='s';          // an essential clause on the main line is main skeleton
    else if(row.tag==='s'&&row.declared)row.tag='i';      // skeleton below the main line belongs to its clause
  }

  // Which bracket an inner skeleton resumes and which bracket encloses each modifier.
  // An inner skeleton with no bracket open above it is main skeleton.
  function settle(){
    const stack:number[]=[];
    rows.forEach((row,r)=>{
      row.opener=row.parent=-1;
      if(row.tag==='i'){
        // Where the answer names, in the role slot, a word of the row this one continues, that settles it.
        const hint=han(row.rest[0])?[]:toks(row.rest[0]||'').map(t=>fold(t.text));
        const holds=(x:Row)=>(['easy','hard'] as const).some(track=>within(units.slice(x.from,x.to).flatMap(unit=>unit[track]).map(fold),hint));
        const named=hint.some(w=>!small.has(w))&&!holds(row)?rows.slice(0,r).findLastIndex(holds):-1;
        const target=named<0?-2:rows[named].tag==='s'?-1:rows[named].tag==='i'?rows[named].opener:named;
        if(target===-1){row.tag='s';stack.length=0;return;}
        if(target>=0&&stack.includes(target)){while(stack.at(-1)!==target)stack.pop();row.opener=target;return;}
        while(stack.length&&rows[stack.at(-1)!].declared>row.declared)stack.pop();
        // Some answers number a clause's own words one deeper than its opener. Then a finished
        // modifier sitting right before this row has the same number, and the row resumes the
        // clause around that modifier, not the modifier.
        const top=stack.at(-1);
        if(top===r-1&&rows[top].declared===row.declared&&stack.length>1&&rows[stack.at(-2)!].declared===row.declared-1)stack.pop();
        if(stack.length)row.opener=stack.at(-1)!;else row.tag='s';
      }
      if(row.tag==='s'){stack.length=0;return;}
      if(row.tag==='i')return;
      while(stack.length&&rows[stack.at(-1)!].declared>=row.declared)stack.pop();
      row.parent=stack.length?stack.at(-1)!:-1;
      stack.push(r);
    });
  }
  settle();

  // Cores: accept either wording, and let a core claim rows the model left bracketed.
  const kept=(r:number)=>rows[r].tag==='s';
  const text={easy:str(input.core),hard:str(input.hardCore)},zh={easy:str(input.coreZh),hard:str(input.hardCoreZh)};
  if(!han(zh.easy))zh.easy=zh.hard;
  if(!han(zh.hard))zh.hard=zh.easy;
  if(!han(zh.easy))problems.push('coreZh and hardCoreZh must be complete Chinese sentences.');
  if(!str(input.zh))problems.push('"zh", the Chinese translation of the whole sentence, is missing.');
  const everywhere=()=>true;
  const brackets=rows.filter(r=>r.tag==='p'||r.tag==='c').length;
  type Pick={used:number[],claims:Set<number>,from:'easy'|'hard'};
  // A core that claims every modifier would leave nothing to subtract, so it is no reference.
  const swallows=(p:Pick)=>brackets>1&&rows.every((row,r)=>(row.tag!=='p'&&row.tag!=='c')||p.claims.has(r));
  const picks:Pick[]=[];
  for(const [mode,forgive] of [['own',0],['either',0],['own',1],['either',1],...(options.final?[['own',2],['either',2]] as const:[])] as const){
    for(const track of ['easy','hard'] as const){
      const wording=mode==='own'?track:'either';
      let used=text[track]?alignCore(text[track],units,wording,everywhere,r=>!kept(r),forgive):null;
      if(!used)continue;
      // One stray word is no reason to keep a whole bracketed row.
      const count=new Map<number,number>();
      for(const u of used)if(!kept(units[u].row))count.set(units[u].row,(count.get(units[u].row)||0)+1);
      const weak=new Set([...count].filter(([r,n])=>n===1&&rows[r].to-rows[r].from>2).map(([r])=>r));
      if(weak.size)used=alignCore(text[track],units,wording,r=>!weak.has(r),r=>!kept(r),Math.max(forgive,1))||used;
      picks.push({used,claims:new Set(used.map(u=>units[u].row).filter(r=>!kept(r))),from:track});
    }
    if(picks.some(p=>!swallows(p)))break;
  }
  // The core needing the fewest bracketed rows is the reference for both wordings.
  const reference=picks.filter(p=>!swallows(p)).sort((l,r)=>l.claims.size-r.claims.size)[0];
  const core={easy:'',hard:''};
  if(reference&&!options.flat){
    for(const r of reference.claims)rows[r].tag='s';
    for(const track of ['easy','hard'] as const){
      const fits=text[track]&&alignCore(text[track],units,track,kept,()=>false);
      if(fits)core[track]=text[track];
      else{core[track]=render(reference.used,units,track,track==='easy'?shrunk:source);zh[track]=zh[reference.from];}
    }
  }else if(options.final||options.flat){
    // Last resort: the core is everything the rows keep on the main line.
    const used=units.map((_,j)=>j).filter(j=>kept(units[j].row));
    if(!used.length)problems.push('No main skeleton rows ("s") were given.');
    else{core.easy=render(used,units,'easy',shrunk);core.hard=render(used,units,'hard',source);}
  }else{
    for(const [key,track] of [['core','easy'],['hardCore','hard']] as const){
      const miss=text[track]?firstMiss(text[track],units):'is missing';
      problems.push('"'+key+'" '+(text[track]?brief(text[track],110)+': ':'')+(miss||'keeps every modifier, so nothing would be removed')+'.');
    }
    problems.push('Each core selects words of the sentence in their original order and leaves out the bracketed rows: no rewording, no reordering, no added words. Keep the words it needs to stay grammatical.');
  }
  if(problems.length)throw new Issues(problems);

  // What each modifier hangs on: a word of the sentence where one can be found.
  settle();
  if(!options.flat)for(const row of rows)if(row.tag==='p'||row.tag==='c'){
    const head=findHead(row.rest[0]||'',row,rows,units,source,shrunk);
    if(head)row.head=head;
  }
  const span=(row:Row):[number,number]=>[units[row.from].shr[0],units[row.to-1].shr[1]];
  const depths=new Map<number,number>(),visiting=new Set<number>();
  function depth(r:number):number {
    const row=rows[r];
    if(row.tag==='s')return 0;
    const known=depths.get(r);if(known!==undefined)return known;
    if(visiting.has(r)){row.head=undefined;return 1;}       // a circular pair falls back to its position
    visiting.add(r);
    let d:number;
    if(row.tag==='i')d=depth(row.opener);
    else{
      const parent=row.head?rows.findIndex(x=>span(x)[0]<=row.head!.index&&row.head!.index<span(x)[1]):-1;
      d=1+(parent>=0?depth(parent):row.parent>=0?depth(row.parent):0);
      if(parent<0)row.head=undefined;
    }
    visiting.delete(r);d=Math.min(12,Math.max(1,d));depths.set(r,d);return d;
  }
  // Each slice ends where the next begins.
  const starts=rows.map((row,r)=>{
    if(!r)return 0;
    const before=units[row.from-1].shr[1],at=units[row.from].shr[0],gap=shrunk.slice(before,at);
    // A dash or quote the model put at the head of a row stays at its head.
    const lead=/^[—–"“‘-]+/u.exec(row.quote.replace(/^[([]\s+/,''))?.[0],held=lead?gap.lastIndexOf(lead):-1;
    return held>=0&&!gap.slice(held+lead!.length).trim()?before+held:boundary(shrunk,before,at);
  });
  const chunks=rows.map((row,r)=>{
    const slice=shrunk.slice(starts[r],r+1<rows.length?starts[r+1]:shrunk.length).trim();
    if(row.tag==='s'||row.tag==='i'){
      const d=depth(r);
      const role=row.rest.find(han)||(row.tag==='s'?'句子主干':'从句主干');
      return {text:slice,kind:row.tag==='s'?'skeleton':'inner-skeleton',depth:d,zh:row.zh,bracket:null,keep:true,role,describes:'',describesIndex:-1,signal:'',signalWhy:'',job:''};
    }
    const d=depth(r);
    const [stated,signal,reason,question]=row.rest;
    const described=(stated||'').replace(/\s+/g,' ').trim();
    return {text:slice,kind:row.tag==='p'?'phrase':'clause',depth:d,zh:row.zh,bracket:row.tag==='p'?'(':'[',keep:false,role:'',
      // A modifier of a whole clause has no single word to point at.
      ...(row.head?{describes:row.head.text,describesIndex:row.head.index}:{describes:described||(d>1?'所在分句':'主句'),describesIndex:-1,clauseLevel:true}),
      signal:signal||toks(slice)[0]?.text||slice,signalWhy:reason||'补充说明所修饰的内容',job:question||'补充了什么信息？'};
  });
  const table=(Array.isArray(input.roles)?input.roles:[]).flatMap(entry=>Array.isArray(entry)&&str(entry[0])&&str(entry[1])?[{q:str(entry[0]),a:str(entry[1]),term:str(entry[2])}]:[]).slice(0,20);
  return {
    original:source,shrink,shrunk,chunks,
    skeleton:{text:core.easy,original:core.hard,zh:zh.easy,originalZh:zh.hard,table},
    add:chunks.flatMap((c,i)=>c.bracket?[{chunkIndex:i,describes:c.describes,question:c.job}]:[]),
    zh:str(input.zh),originalZh:str(input.zh),
  };
}
