"use client";

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { Analysis } from "../lib/types";
import type {LiveChunk} from "../lib/compact-analysis";
import {playCue} from "../lib/lesson-audio";
import "./lesson.css";

type Lang = "zh" | "en";
type Chunk = Analysis["chunks"][number];
type Preview = Pick<Analysis, "shrink" | "shrunk">;
type Props = { data: Analysis | null; lang: Lang; source: string; previewShrunk?: Preview | null; liveChunks?:LiveChunk[]; onNextSentence?:()=>void; nextSentenceNumber?:number; onBackToInput?:()=>void; onShowPartial?:()=>void };
type Move = "cut" | "swap" | "minus" | "skeleton" | "add" | "translate" | "restore";
const sequence: { n: number | null; move: Move; zh: string; en: string }[] = [
  { n: 1, move: "cut", zh: "切割", en: "Cut" }, { n: 2, move: "swap", zh: "换词", en: "Swap words" },
  { n: 3, move: "minus", zh: "减法", en: "Minus" }, { n: 4, move: "skeleton", zh: "骨架", en: "Skeleton" },
  { n: 5, move: "add", zh: "加法", en: "Add" }, { n: 6, move: "translate", zh: "翻译", en: "Translate" },
  { n: null, move: "restore", zh: "原句", en: "Restore the original" },
  { n: 7, move: "cut", zh: "切割", en: "Cut" }, { n: 8, move: "minus", zh: "减法", en: "Minus" },
  { n: 9, move: "skeleton", zh: "骨架", en: "Skeleton" }, { n: 10, move: "add", zh: "加法", en: "Add" },
  { n: 11, move: "translate", zh: "翻译", en: "Translate" },
];
const words = (text: string) => [...text.matchAll(/\S+/gu)];
const normalize = (text: string) => text.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
const formatCount = (n: number, lang: Lang, type: "word" | "stop") => lang === "zh"
  ? n + (type === "word" ? " 词" : " 个句号") : n + " " + (type === "word" ? "word" : "full stop") + (n === 1 ? "" : "s");
function Words({text, cls, mark, offset = 0, keep, keepFrom = 0, bare = false, head, tail}: {text: string; cls?: string; mark?: [number,number]; offset?: number; keep?: boolean[]; keepFrom?: number; bare?: boolean; head?: ReactNode; tail?: ReactNode}) {
  let prev = 0;
  const list = words(text);
  return <>{list.map((m,n) => {
    const i = m.index ?? 0, gap = text.slice(prev,i); prev = i + m[0].length;
    const hit = mark && offset + i < mark[1] && offset + prev > mark[0];
    // While the skeleton emerges, each word either stays or recedes.
    const stays = keep ? Boolean(keep[keepFrom+n]) : undefined;
    const word = <span data-word={bare?undefined:""} data-survivor={stays||undefined} className={["mba-word",m[0].length>28&&"mba-long-word",cls,hit && "mba-target",stays===true&&"mba-stays",stays===false&&"mba-fades"].filter(Boolean).join(" ")}>{m[0]}</span>;
    // A bracket never sits alone on a line: it wraps together with the word beside it.
    const opens = n===0 && head, closes = n===list.length-1 && tail;
    return <Fragment key={i}>{gap}{opens || closes ? <span className="mba-endwrap">{opens}{word}{closes}</span> : word}</Fragment>;
  })}{text.slice(prev)}</>;
}
type Section = { title:string; paragraphs?:string[]; lines?:string[]; columns?:string[]; rows?:string[][] };
function handout(a:Analysis,lang:Lang):Section[] {
  const t=(zh:string,en:string)=>lang==="zh"?zh:en;
  const title=(i:number)=>sequence[i].n===null?sequence[i][lang]:sequence[i].n+" · "+sequence[i][lang];
  const count=(s:string)=>formatCount(words(s).length,lang,"word");
  const cut=punctuationParts(a.original).map(x=>x.trim());
  const bracket=(original:boolean)=>a.chunks.map(c=>"  ".repeat(c.depth)+(c.bracket?c.bracket+" ":"")+(original?c.originalText:c.text)+"  ·  "+c.zh);
  const addRows=(original:boolean)=>chunkLayout(a,original).addIndices.map(i=>[original?a.chunks[i].originalText:a.chunks[i].text,a.chunks[i].zh]);
  return [
    {title:title(0),paragraphs:[formatCount(a.wordCount,lang,"word")+" · "+formatCount(a.fullStops,lang,"stop")],lines:cut},
    {title:title(1),paragraphs:[a.shrunk,...(!a.shrink.length?[t("没有需要替换的 C1+ 词语。","No C1+ terms need replacing.")]:[])],columns:[t("原词","Original"),t("换成","Replacement"),t("词义","Meaning")],rows:a.shrink.map(s=>[s.big,s.small,s.zh])},
    {title:title(2),lines:bracket(false),columns:[t("分块","Chunk"),t("信号与理由","Signal and reason"),t("修饰谁","Describes"),t("作用","Role")],rows:a.chunks.map(c=>[c.text,[c.signal,c.signalWhy].filter(Boolean).join(" · "),c.describes,[c.keep&&"✓",c.role,c.job,c.note].filter(Boolean).join(" · ")])},
    {title:title(3),paragraphs:[a.skeleton.text,a.skeleton.zh,count(a.skeleton.text)],columns:[t("问题","Question"),t("答案","Answer")],rows:a.skeleton.table.map(r=>[r.q,r.a])},
    {title:title(4),paragraphs:[a.shrunk,a.zh],columns:[t("加回","Add"),t("中文","Chinese")],rows:addRows(false)},
    {title:title(5),paragraphs:[a.shrunk,a.zh]},
    {title:title(6),columns:[t("小词","Simpler word"),t("原词","Original word")],rows:a.shrink.map(s=>[s.small,s.big]),paragraphs:[a.original]},
    {title:title(7),lines:cut},{title:title(8),lines:bracket(true)},
    {title:title(9),paragraphs:[a.skeleton.original,a.skeleton.originalZh,count(a.skeleton.original)]},
    {title:title(10),columns:[t("加回原文","Restore original chunks"),t("中文","Chinese")],rows:addRows(true),paragraphs:[a.original,a.originalZh]},
    {title:title(11),paragraphs:[a.original,a.originalZh]},
  ];
}
function markdown(a:Analysis,lang:Lang) {
  const cell=(s:string)=>s.replace(/\|/g,"\\|").replace(/\r?\n/g," ");
  return handout(a,lang).map(s=>[
    "## "+s.title,
    s.lines?.length ? "```\n"+s.lines.join("\n")+"\n```" : "",
    s.rows?.length&&s.columns ? [
      "| "+s.columns.join(" | ")+" |","| "+s.columns.map(()=>"---").join(" | ")+" |",
      ...s.rows.map(r=>"| "+r.map(cell).join(" | ")+" |"),
    ].join("\n"):"",
    ...(s.paragraphs||[]),
  ].filter(Boolean).join("\n\n")).join("\n\n")+"\n\nMBA · Minus Before Add — 海归湾国际教育 Turtle Bay International Education";
}
function punctuationParts(source: string) {
  const parts: string[] = [];
  let start = 0;
  for (const m of source.matchAll(/(?:[,;:!?，；：！？。]|\.{1,3}|[—–])(?:["'”’»)]*)(?=\s|$)|[—–]/gu)) {
    const i = m.index ?? 0;
    // Keep decimals, initials, honorifics and common abbreviations inside their phrase.
    if (m[0].startsWith(".") && i < source.length - 1 &&
        /(?:\b(?:Mr|Mrs|Ms|Dr|Prof|St|e\.g|i\.e)|\b[A-Z])$/i.test(source.slice(0,i))) continue;
    const end = i + m[0].length, part = source.slice(start,end);
    if (part.trim()) parts.push(part);
    start = end;
  }
  if (source.slice(start).trim()) parts.push(source.slice(start));
  return parts.length ? parts : [source];
}

type SheetProps = { children: ReactNode; cue: string; mode?: "fit" | "smart" | "follow"; big?: number; mobileBig?:number; min?: number; reduced: boolean; className?: string };
function Sheet({children,cue,mode="smart",big=43,mobileBig,min=20,reduced,className=""}: SheetProps) {
  const pane = useRef<HTMLDivElement>(null), sheet = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const viewport = pane.current, body = sheet.current;
    if (!viewport || !body) return;
    let active = true, sizedWidth = -1, sizedHeight = -1;
    function layout(resize = false) {
      if (!active || !viewport || !body) return;
      const h = viewport.clientHeight, w = viewport.clientWidth;
      if (!(h && w)) return;
      if (resize && h === sizedHeight && w === sizedWidth) return;
      sizedHeight = h; sizedWidth = w;
      const wide = window.innerWidth > 750;
      let hi = wide ? big : mobileBig ?? Math.max(24,Math.round(big * .72));
      let lo = mode === "fit" ? 7 : wide ? min : Math.max(16,min - 2);
      // Fit using actual wrapped geometry and the selected fonts, before playback paints.
      const fits = (size: number) => {
        body.style.fontSize = size + "px";
        return body.scrollHeight <= h - 8 && body.scrollWidth <= w + 1;
      };
      if (mode !== "follow") {
        while (lo < hi) { const mid = Math.ceil((lo+hi)/2); if (fits(mid)) lo=mid; else hi=mid-1; }
      } else lo=hi;
      fits(lo);
      const follow = mode === "follow" || (mode === "smart" && body.scrollHeight > h - 8);
      viewport.dataset.fit = !follow ? "true" : "false";
      viewport.style.setProperty("--follow-space",follow ? Math.floor(h*.48) + "px" : "0px");
      const focus = body.querySelector<HTMLElement>("[data-focus=true]");
      if (follow && focus) {
        const v = viewport.getBoundingClientRect(), f = focus.getBoundingClientRect();
        const target = viewport.scrollTop + f.top - v.top + Math.min(f.height,h*.8)/2 - h/2;
        viewport.scrollTo({top:Math.max(0,target),behavior:reduced || resize ? "instant" : "smooth"});
      } else if (!follow) viewport.scrollTop=0;
    }
    layout();
    const observer = new ResizeObserver(() => layout(true)); observer.observe(viewport);
    document.fonts.ready.then(() => { if (active) layout(); });
    return () => { active=false; observer.disconnect(); };
  },[cue,mode,big,mobileBig,min,reduced]);
  return <div ref={pane} className={"mba-pane " + className} data-pane="" tabIndex={0}>
    <div className="mba-align"><div className="mba-sheet" ref={sheet}>{children}</div></div>
  </div>;
}

function Cut({parts,frame,reduced}: {parts:string[]; frame:number; reduced:boolean}) {
  return <Sheet cue={"cut"+frame+parts.join("")} mode="fit" big={46} reduced={reduced} className="mba-cut">
    {parts.map((part,i) => {
      const trimmed=part.trim(), last=words(trimmed).at(-1), split=last?.index ?? 0, cut=i<=frame && /[,;:!?，；：！？。.—–]["'”’»)]*$/u.test(trimmed);
      return <Fragment key={i}><span data-punctuation-block={i} className={i===frame?"mba-current-cut":""}>
        {cut?<><Words text={trimmed.slice(0,split)}/><span className="mba-endwrap"><Words text={trimmed.slice(split)}/><span className="mba-return" aria-label="Enter"> ↵</span></span></>:<Words text={trimmed}/>}
      </span>{i<parts.length-1&&(cut?<br/>:" ")}</Fragment>;
    })}
  </Sheet>;
}

type Swap = Analysis["shrink"][number];
function Swaps({source,swaps,frame,reverse,reduced}: {source:string; swaps:Swap[]; frame:number; reverse:boolean; reduced:boolean}) {
  const activeIndex=Math.floor(frame/2), after=frame%2===1;
  const blocks=useMemo(()=>punctuationParts(source),[source]);
  let blockStart=0;
  return <Sheet cue={"swap"+reverse+frame+source} mode="smart" big={46} min={20} reduced={reduced} className="mba-swap">
    {blocks.map((block,blockIndex)=>{
      const start=blockStart, end=start+block.length; blockStart=end;
      let cursor=start;
      const pieces:ReactNode[]=[];
      swaps.forEach((swap,i)=>{
        const from=swap.startIndex,to=from+swap.big.length;
        if(to<=start || from>=end)return;
        if(cursor<from)pieces.push(<Words key={"gap"+from} text={source.slice(cursor,from)}/>);
        const active=i===activeIndex;
        const useSmall=reverse ? i>activeIndex || (active&&!after) : i<activeIndex || (active&&after);
        // A multi-word replacement occasionally spans punctuation. Keep the
        // original block boundaries, including on the frames before and after it.
        const originalSlice=source.slice(Math.max(start,from),Math.min(end,to));
        const piece=useSmall ? from>=start?swap.small:"" : originalSlice;
        pieces.push(<span key={from} data-focus={active} data-inplace-swap={active?(after?"after":"before"):undefined}
          className={active?(after?"mba-incoming":"mba-outgoing"):""}><Words text={piece}/></span>);
        cursor=Math.min(to,end);
      });
      return <div data-punctuation-block={blockIndex} className="mba-punct-block" key={blockIndex}>{pieces}<Words text={source.slice(cursor,end)}/></div>;
    })}
  </Sheet>;
}

function chunkText(c:Chunk,original:boolean) { return original ? c.originalText : c.text; }
function chunkLayout(a:Analysis,original:boolean) {
  const texts=a.chunks.map(c=>chunkText(c,original));
  const sentence=original?a.original:a.shrunk;
  let p=0;
  const offsets=texts.map(text=>{const index=sentence.indexOf(text,p); const offset=index>=0?index:p; p=offset+text.length; return offset;});
  const target=words(original?a.skeleton.original:a.skeleton.text).map(m=>normalize(m[0]));
  let next=0;
  const masks=texts.map((text,i)=>words(text).map(m=>{
    const keep=a.chunks[i].kind==="skeleton" && next<target.length && normalize(m[0])===target[next];
    if(keep)next++;
    return keep;
  }));
  const addIndices=a.chunks.map((_,i)=>i).filter(i=>a.chunks[i].kind!=="skeleton" || masks[i].some(keep=>!keep));
  return {texts,offsets,masks,addIndices};
}
type Layout = ReturnType<typeof chunkLayout>;
function tone(c:Chunk) { return c.bracket === "(" ? "mba-phrase" : c.bracket === "[" ? "mba-clause" : ""; }

// A bracket opens where its chunk starts and closes after the last chunk nested
// inside it. A clause also runs on through its own resumed predicate.
function closingBrackets(chunks:Chunk[]) {
  const out:{bracket:"("|"[";from:number}[][]=chunks.map(()=>[]);
  chunks.forEach((c,i)=>{
    if(!c.bracket)return;
    let j=i;
    while(j+1<chunks.length && (chunks[j+1].depth>c.depth ||
      (c.bracket==="[" && chunks[j+1].kind==="inner-skeleton" && chunks[j+1].depth===c.depth)))j++;
    out[j].push({bracket:c.bracket,from:i});
  });
  out.forEach(list=>list.sort((l,r)=>r.from-l.from));
  return out;
}
type MinusPhase="cut"|"settle"|"gone";
function Minus({a,layout,frame,fast,reduced,phase="cut"}: {a:Analysis;layout:Layout;frame:number;fast:boolean;reduced:boolean;phase?:MinusPhase}) {
  const sentence=fast?a.original:a.shrunk;
  const active=a.chunks[frame];
  const cutting=phase==="cut";
  const mark:[number,number]|undefined=cutting && !fast && active?.describes && active.describesIndex>=0
    ?[active.describesIndex,active.describesIndex+active.describes.length]:undefined;
  const closers=useMemo(()=>closingBrackets(a.chunks),[a.chunks]);
  const blocks=useMemo(()=>{
    let offset=0, chunk=0;
    return punctuationParts(sentence).map(text=>{
      const start=offset,end=start+text.length;offset=end;
      const spans:{index:number;start:number;end:number;first:boolean;last:boolean;wordsBefore:number}[]=[];
      while(chunk<layout.texts.length && layout.offsets[chunk]<end){
        const from=layout.offsets[chunk],to=from+layout.texts[chunk].length;
        if(to>start){
          const begin=Math.max(start,from);
          spans.push({index:chunk,start:begin,end:Math.min(end,to),first:from>=start,last:to<=end,
            wordsBefore:words(layout.texts[chunk].slice(0,begin-from)).length});
        }
        if(to>end)break;
        chunk++;
      }
      return {start,end,spans};
    });
  },[sentence,layout]);
  // The hidden copy holds the finished layout, so the type keeps one size and
  // the lines already cut stay where they are while the rest is divided.
  const rows=(upTo:number,bare:boolean)=>blocks.map((block,b)=>{
    let cursor=block.start;
    return <div className="mba-punct-block mba-minus-block" data-punctuation-block={bare?undefined:b} key={b}>{block.spans.map(span=>{
      const i=span.index,chunk=a.chunks[i],opened=i<=upTo,selected=!bare && i===upTo;
      const gap=sentence.slice(cursor,span.start);cursor=span.end;
      const bracket=opened && span.first && chunk.bracket;
      const closing=opened && span.last ? closers[i] : [];
      const gloss=opened && span.first;
      return <Fragment key={i}>{gap}<span data-chunk={bare?undefined:i} data-depth={opened&&!bare?chunk.depth:undefined} data-focus={selected && span.first}
        className={opened?"mba-subdivision "+tone(chunk)+(selected?" mba-active-line":""):"mba-upcoming"}>
        <span className="mba-chunk-en" data-minus-active={selected?i:undefined}
          style={opened?{"--depth":Math.min(chunk.depth,8)} as CSSProperties:undefined}>
          <Words text={sentence.slice(span.start,span.end)} mark={bare?undefined:mark} offset={span.start} bare={bare}
            keep={cutting?undefined:layout.masks[i]} keepFrom={span.wordsBefore}
            head={bracket?<b className="mba-bracket mba-bracket-open" data-bracket={bare?undefined:bracket}>{bracket}{" "}</b>:undefined}
            tail={closing.length?<>{" "}<span className="mba-closers">{closing.map(c=><b key={c.from} data-bracket-close={bare?undefined:c.from}
              className={"mba-bracket mba-bracket-close "+(c.bracket==="("?"mba-phrase":"mba-clause")}>{c.bracket==="("?")":"]"}</b>)}</span></>:undefined}/>
        </span>{gloss && <span className="mba-minus-gloss" lang="zh-CN" data-minus-zh={bare?undefined:i}>{chunk.zh}</span>}
      </span></Fragment>;
    })}{sentence.slice(cursor,block.end)}</div>;
  });
  return <Sheet cue={"minus"+fast+(cutting?frame:"core")+sentence} mode={cutting?"smart":"fit"} big={36} mobileBig={26} min={22} reduced={reduced}
    className={"mba-minus"+(cutting?"":" mba-settle"+(phase==="gone"?" mba-gone":""))}>
    <div className="mba-stack">
      {cutting && <div className="mba-stack-sizer" aria-hidden="true">{rows(a.chunks.length,true)}</div>}
      <div className="mba-stack-live">{rows(frame,false)}</div>
    </div>
  </Sheet>;
}

// The skeleton is never a new slide. The modifiers recede where they stand, then
// the surviving words travel from their lines into the centre.
function Skeleton({a,layout,original,frame,reduced}: {a:Analysis;layout:Layout;original:boolean;frame:number;reduced:boolean}) {
  const skeleton=original?a.skeleton.original:a.skeleton.text;
  const from=useRef<HTMLDivElement>(null),to=useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{
    if(frame<1 || reduced)return;
    let moves:(Animation|null)[]=[],live=true;
    // Start after the sheet's own font-ready refit, which is queued before this
    // and must measure the words at rest.
    queueMicrotask(()=>{
      if(!live)return;
      const stay=[...(from.current?.querySelectorAll<HTMLElement>("[data-survivor]")||[])];
      const land=[...(to.current?.querySelectorAll<HTMLElement>("[data-core] [data-word]")||[])];
      if(!stay.length || stay.length!==land.length)return;
      moves=land.map((el,i)=>{
        const was=stay[i].getBoundingClientRect(),now=el.getBoundingClientRect();
        if(!was.width || !now.width)return null;
        return el.animate([
          {transformOrigin:"0 0",transform:"translate("+(was.left-now.left)+"px,"+(was.top-now.top)+"px) scale("+was.height/now.height+")"},
          {transformOrigin:"0 0",transform:"none"},
        ],{duration:original?760:1050,delay:i*(original?35:60),easing:"cubic-bezier(.2,.8,.2,1)",fill:"backwards"});
      });
    });
    return()=>{live=false;moves.forEach(m=>m?.cancel());};
  },[frame,reduced,original,skeleton]);
  return <div className="mba-spine-panel" data-core-phase={frame>0?"gathered":"emerging"}>
    {!reduced && <div ref={from} className="mba-core-source" data-core-source="" aria-hidden={frame>0}>
      <Minus a={a} layout={layout} frame={a.chunks.length} fast={original} reduced={reduced} phase={frame>0?"gone":"settle"}/></div>}
    {frame>0 && <div ref={to} className="mba-center-spine"><Sheet cue={"core"+skeleton} reduced={reduced} mode="fit" big={67}>
      <strong className="mba-spine" data-core=""><Words text={skeleton}/></strong>
      <p className="mba-core-zh" data-core-zh="" lang="zh-CN">{original?a.skeleton.originalZh:a.skeleton.zh}</p></Sheet></div>}
  </div>;
}

// The sentence grows back in its own place. Every word keeps one identity, so
// words already on the page slide aside for each returning chunk.
function Add({a,layout,original,frame,reduced}: {a:Analysis;layout:Layout;original:boolean;frame:number;reduced:boolean}) {
  const order=layout.addIndices, active=order[frame-1], expanded=new Set(order.slice(0,frame));
  const full=original?a.original:a.shrunk, fullZh=original?a.originalZh:a.zh, done=frame>order.length;
  const skeleton=original?a.skeleton.original:a.skeleton.text;
  const live=useRef<HTMLDivElement>(null), seen=useRef(new Map<string,[number,number]>());
  const all=useMemo(()=>layout.texts.flatMap((text,i)=>words(text).map((m,n)=>({key:i+"-"+n,chunk:i,word:m[0],kept:layout.masks[i][n]}))),[layout]);
  const shown=all.map(w=>done || w.kept || expanded.has(w.chunk));
  const first=shown.indexOf(true), final=shown.lastIndexOf(true);
  const stop=final<all.length-1 ? (skeleton.match(/[.!?。！？]+["'”’)]*$/u)?.[0] || ".") : "";
  const longest=order.reduce((best,i)=>a.chunks[i].zh.length>best.length?a.chunks[i].zh:best,"");
  useLayoutEffect(()=>{
    const root=live.current;
    if(!root)return;
    const nodes=[...root.querySelectorAll<HTMLElement>("[data-add-word]")];
    // Words must be at rest whenever the sheet measures itself.
    nodes.forEach(el=>el.getAnimations().forEach(x=>x.cancel()));
    let current=true;
    queueMicrotask(()=>{
      if(!current)return;
      const base=root.getBoundingClientRect(), next=new Map<string,[number,number]>();
      let arriving=0;
      nodes.forEach(el=>{
        const r=el.getBoundingClientRect(), key=el.dataset.addWord||"", x=r.left-base.left, y=r.top-base.top, old=seen.current.get(key);
        next.set(key,[x,y]);
        if(reduced)return;
        if(old){
          if(Math.abs(old[0]-x)>1 || Math.abs(old[1]-y)>1)
            el.animate([{transform:"translate("+(old[0]-x)+"px,"+(old[1]-y)+"px)"},{transform:"none"}],{duration:original?420:620,easing:"cubic-bezier(.2,.7,.2,1)"});
        }else if(seen.current.size)
          el.animate([{opacity:0,transform:"translateY(.4em)"},{opacity:1,transform:"none"}],
            {duration:original?260:380,delay:(original?180:300)+(original?45:85)*arriving++,easing:"ease-out",fill:"backwards"});
      });
      seen.current=next;
    });
    return()=>{current=false;};
  },[frame,reduced,original]);
  return <Sheet cue={"add"+original+frame+a.original} mode="smart" reduced={reduced} big={42} min={20} className="mba-add-sentence">
    <div className="mba-add-grow">
      {/* Reserve the finished sentence and its translation, so the type never resizes while it grows. */}
      <div className="mba-add-sizer" aria-hidden="true">
        <div>{words(full).map((m,i)=><Fragment key={i}>{i?" ":""}<span className="mba-word">{m[0]}</span></Fragment>)}</div>
        <div className="mba-add-foot"><p className="mba-add-zh">{fullZh}</p><p className="mba-add-gloss">{longest}</p></div>
      </div>
      <div className="mba-add-live" ref={live} data-add-frame={frame}>
        <div className="mba-add-en" data-add-done={done||undefined}>
          {layout.texts.map((_,i)=>{
            const mine=all.map((w,n)=>({...w,n})).filter(w=>w.chunk===i && shown[w.n]);
            if(!mine.length)return null;
            return <Fragment key={i}>{mine[0].n>first?" ":null}<span data-add-chunk={i} data-focus={active===i}
              className={!done && expanded.has(i)?tone(a.chunks[i]):""}>{mine.map((w,k)=>{
                let text=w.word;
                if(!shown[w.n+1] && w.n<all.length-1)text=text.replace(/[,;:]+$/u,"");
                if(w.n===first && w.n>0)text=text.replace(/^\p{Ll}/u,c=>c.toUpperCase());
                return <Fragment key={w.key}>{k?" ":""}<span data-word="" data-add-word={w.key}
                  className={"mba-word"+(active===i && !w.kept?" mba-added":"")}>{text}</span></Fragment>;
              })}</span></Fragment>;
          })}{stop && <span className="mba-add-stop">{stop}</span>}
        </div>
        <div className="mba-add-foot">{done
          ? <p className="mba-add-zh" data-add-complete-zh="" lang="zh-CN">{fullZh}</p>
          : active!==undefined && <p key={active} className="mba-add-gloss" data-chunk-zh={active} lang="zh-CN">{a.chunks[active].zh}</p>}</div>
      </div>
    </div>
  </Sheet>;
}

function chinesePhrases(text:string) {
  return text.match(/[^，。；！？：、,.!?;]+[，。；！？：、,.!?;]*|[，。；！？：、,.!?;]+/gu)||[text];
}
function Translation({en,zh,frame,reduced}: {en:string;zh:string;frame:number;reduced:boolean}){
  const phrases=useMemo(()=>chinesePhrases(zh),[zh]);
  return <div className={"mba-translation "+(frame>0?"mba-translated":"")}>
    <Sheet cue={"translation"+(frame>0)+en} mode="fit" big={frame?33:45} reduced={reduced}><Words text={en}/></Sheet>
    {frame>0&&<div className="mba-translation-zh" lang="zh-CN"><span>中文意译</span>
      <Sheet cue={"zh"+frame+zh} mode="smart" big={22} mobileBig={17} min={17} reduced={reduced}><p>{phrases.map((part,i)=>
        <span key={i} data-focus={i===frame-1} className={i>=frame?"mba-zh-next":i===frame-1?"mba-zh-current":""}>{part}</span>)}</p></Sheet></div>}
  </div>;
}

function ReadingNote({lang,step,frame,a,layout,swaps}: {lang:Lang;step:number;frame:number;a:Analysis|null;layout:Layout|null;swaps:Swap[]}) {
  const t=(zh:string,en:string)=>lang==="zh"?zh:en;
  const move=sequence[step].move,fast=step>=7;
  let note:ReactNode=null;
  if(move==="cut") note=<>{a&&<span>{formatCount(a.wordCount,lang,"word")} · {formatCount(a.fullStops,lang,"stop")}</span>}<kbd>Enter ↵</kbd><span>{t("遇到标点，换一行。","Start a new line at each punctuation mark.")}</span></>;
  if(move==="swap" || move==="restore") {
    const s=swaps[Math.floor(frame/2)]; if(s)note=<><b>{move==="restore"?s.small:s.big}</b><i>→</i><b>{move==="restore"?s.big:s.small}</b>{move==="swap"&&<span lang="zh-CN">{s.zh}</span>}</>;
  }
  if(move==="swap" && swaps.length===0)note=t("没有需要替换的 C1+ 词语。","No C1+ terms need replacing.");
  if(move==="skeleton"&&a&&frame>0)note=<><b>{formatCount(fast?words(a.skeleton.original).length:a.skeleton.words,lang,"word")}</b>
    {!fast&&a.skeleton.table.map((r,i)=><span className="mba-role" key={i}>{r.q.split(/\s+[·|]\s+/)[lang==="zh"?0:1] || r.q} <b>{r.a}</b></span>)}</>;
  if(move==="minus"&&a){
    const c=a.chunks[frame];
    if(c) {
      const splitter=(s:string)=>s.split(/\s+[·|]\s+/).filter(Boolean);
      const chinese=(s:string)=>splitter(s).find(x=>/[\p{Script=Han}]/u.test(x)) || s;
      if(fast)note=c.bracket ? <><b>{c.bracket}</b><span>{t("修饰语","Modifier")}</span></> : <><b>✓</b><span>{c.kind==="inner-skeleton"?t("接回从句主干","Resume the clause"):t("保留主干","Keep the core")}</span></>;
      else note=c.bracket ? <><b>{c.signal || t("省略关系词","Zero relative")}</b><span>{lang==="zh"?chinese(c.signalWhy):c.signalWhy}</span><span className="mba-note-target">{t("修饰","Describes")} <b>{c.describes}</b></span></> :
        <><b>✓ {t("保留","Keep")}</b><span>{lang==="zh"?chinese(c.role || c.job):c.role || c.job}</span>{c.note&&<span>{lang==="zh"?chinese(c.note):c.note}</span>}</>;
    }
  }
  return <div className="mba-note" data-reading-note="">{note}</div>;
}

function All({a,lang}: {a:Analysis;lang:Lang}) {
  return <div className="mba-static" data-static="">{handout(a,lang).map(section=><section key={section.title}>
    <h3 tabIndex={-1}>{section.title}</h3>
    {section.lines&&<pre>{section.lines.join("\n")}</pre>}
    {section.rows?.length&&section.columns?<div className="mba-table-scroll"><table><thead><tr>{section.columns.map(c=><th key={c}>{c}</th>)}</tr></thead><tbody>
      {section.rows.map((row,i)=><tr key={i}>{row.map((cell,j)=><td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>:null}
    {section.paragraphs?.map((p,i)=><p key={i}>{p}</p>)}
  </section>)}</div>;
}
// While the analysis is still on its way, the sentence shows where the work is: chunks already
// analysed stand apart with their Chinese, and a reading mark keeps moving over what comes next.
function Scan({text,chunks,settled,lang,reduced,playing}:{text:string;chunks:LiveChunk[];settled:boolean;lang:Lang;reduced:boolean;playing:boolean}){
  const t=(zh:string,en:string)=>lang==="zh"?zh:en;
  const [head,setHead]=useState(0);
  useEffect(()=>{
    if(reduced || !playing)return;
    const id=setInterval(()=>setHead(h=>h+1),130);return()=>clearInterval(id);
  },[reduced,playing]);
  const rows:LiveChunk[]=[];let cursor=0;
  for(const c of chunks){
    const at=text.indexOf(c.text,cursor);
    if(at<0 || text.slice(cursor,at).trim())break;
    rows.push(c);cursor=at+c.text.length;
  }
  const rest=words(text.slice(cursor));
  // The mark shuttles over the stretch being worked on: the whole sentence while its
  // hard words are being found, then the dozen words after the last chunk.
  const span=Math.max(1,settled?Math.min(rest.length,12):rest.length), at=head%span;
  // Once every chunk is in, the skeleton and translations are still being checked: the mark goes down the rows.
  const checking=rows.length>0 && !rest.length, row=checking?Math.floor(head/4)%rows.length:-1;
  const status=checking?t("已拆出 "+rows.length+" 块，正在核对骨架和中文","Found "+rows.length+" chunks, checking the skeleton and Chinese")
    :rows.length?t("已拆出 "+rows.length+" 块，正在分析下一处","Found "+rows.length+(rows.length===1?" chunk":" chunks")+", working on the next")
    :settled?t("正在找修饰语","Looking for modifiers"):t("正在读句子，找难词","Reading the sentence for hard words");
  return <div className="mba-scan" data-testid="reading-pass" data-live={rows.length>0} data-scan-head={checking?row:at} data-scan-rows={rows.length} data-scan-phase={checking?"check":rows.length?"chunks":settled?"modifiers":"words"}>
    <p className="mba-read-label" role="status"><i className="mba-working" aria-hidden="true"/>{status}</p>
    {/* One steady type size; the pane follows the place being worked on. */}
    <Sheet cue={"scan"+rows.length+text} reduced={reduced} mode="follow" big={32} mobileBig={23} className="mba-minus mba-scan-pane">
      {rows.map((c,i)=><div key={i} data-scan-row={i} data-focus={!rest.length&&i===rows.length-1} className={"mba-subdivision "+(c.bracket==="("?"mba-phrase":c.bracket==="["?"mba-clause":"")+(i===rows.length-1?" mba-active-line":"")+(i===row&&!reduced?" mba-scan-check":"")}>
        <span className="mba-chunk-en">{c.bracket&&<b className="mba-bracket mba-bracket-open">{c.bracket}{" "}</b>}<Words text={c.text}/></span>
        <span className="mba-minus-gloss" lang="zh-CN">{c.zh}</span></div>)}
      {rest.length>0&&<div className="mba-scan-rest" data-scan-rest="" data-focus="true">{rest.map((m,i)=><Fragment key={i}>{i?" ":""}
        <span data-word="" className={"mba-word"+(reduced?"":i===at?" mba-scan-at":i<span&&(at-i+span)%span<3?" mba-scan-near":"")}>{m[0]}</span></Fragment>)}</div>}
    </Sheet>
  </div>;
}

// The full translation used to appear in one cue. Split its reading time between
// its phrases, giving even a short phrase time to register on its own.
function translationTime(text:string,frame:number,fast:boolean) {
  if(frame===0)return fast?800:2800;
  const phrases=chinesePhrases(text);
  const total=fast?3600:Math.min(26000,Math.max(7000,text.length*175));
  const base=Math.min(fast?550:1000,total*.6/phrases.length);
  const lengths=phrases.map(p=>Math.max(1,p.trim().length));
  return base+(total-base*phrases.length)*(lengths[frame-1]||1)/lengths.reduce((sum,n)=>sum+n,0);
}

// Reading time for one cut and its reason, in the guided pass.
function grammarTime(text:string,why:string) {
  return Math.min(9000,Math.max(3200,1900+(text.length+why.length)*50));
}
// The replay of the original only recalls what was just taught, so each chunk is brief.
const recallTime=(zh:string)=>Math.min(3400,Math.max(2000,1200+zh.length*60));

function holdTime(move:Move,frame:number,last:number,fast:boolean,a:Analysis|null,layout:Layout|null) {
  if(move==="translate")return translationTime((fast?a?.originalZh:a?.zh)||"",frame,fast);
  // Punctuation is already cut on first paint. Spread the previous opening
  // reading beat through its visible cuts so the instant start stays unhurried.
  if(move==="cut"){
    const initial=fast?600:2200;
    return (frame===last?(fast?1200:3000):(fast?650:1650))+initial/(last+1);
  }
  if(fast){
    if(move==="minus" && a?.chunks[frame])return recallTime(a.chunks[frame].zh);
    if(move==="add" && a && layout){
      const i=layout.addIndices[frame-1];
      return i===undefined ? (frame?2600:1200) : recallTime(a.chunks[i].zh);
    }
    if(move==="skeleton")return frame?3000:1100;
    return frame===last?1200:650;
  }
  if(move==="swap")return frame===last?2600:frame%2?1650:1050;
  if(move==="restore")return frame===last?2100:frame%2?1000:680;
  if(move==="minus"&&a){
    const c=a.chunks[frame];
    return c?grammarTime(c.text,c.signalWhy+c.zh):4500;
  }
  if(move==="skeleton")return frame?4600:2400;
  if(move==="add"){
    const i=layout?.addIndices[frame-1];
    return a&&i!==undefined?Math.min(9500,Math.max(3300,1900+a.chunks[i].text.length*48+a.chunks[i].zh.length*105)):2800;
  }
  return 3200;
}

const stillPreferred=()=>typeof matchMedia==="function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
// The small live signal shown while the analysis is still running.
function Analysing({lang,settled,found}:{lang:Lang;settled:boolean;found:number}){
  const t=(zh:string,en:string)=>lang==="zh"?zh:en;
  return <span className="mba-pending-inline" role="status" data-analysing={found}><i className="mba-working" aria-hidden="true"/>
    <span className="mba-analysing-long">{found?t("已拆出 "+found+" 块，继续分析中","Found "+found+(found===1?" chunk":" chunks")+", still analysing")
      :settled?t("正在找修饰语","Looking for modifiers"):t("正在分析这句话","Analysing the sentence")}</span>
    <span className="mba-analysing-short">{t("分析中","Analysing")}{found?" · "+found:""}</span></span>;
}

function Player({data:a,lang,source,previewShrunk,liveChunks,onNextSentence,nextSentenceNumber,onBackToInput,onShowPartial}:Props) {
  const t=(zh:string,en:string)=>lang==="zh"?zh:en;
  // The lesson only ever mounts in the browser, so the motion preference is known from the first render.
  const [reduced,setReduced]=useState(stillPreferred),[speed,setSpeed]=useState(1),[review,setReview]=useState(false);
  const [step,setStep]=useState(0),[frame,setFrame]=useState(()=>stillPreferred()?Infinity:0),[play,setPlay]=useState(()=>!stillPreferred());
  const [finished,setFinished]=useState(false);
  const scene=useRef<HTMLElement>(null),primary=useRef<HTMLButtonElement>(null);
  const [all,setAll]=useState(false),[menu,setMenu]=useState(false),[copied,setCopied]=useState("");
  const [reading,setReading]=useState(false);
  const lastSound=useRef(""),manualSound=useRef(false);
  const [visible,setVisible]=useState(true);
  const original=a?.original || source, preview=a || previewShrunk, item=sequence[step], fast=step>=7;
  const parts=useMemo(()=>punctuationParts(original),[original]);
  const scanText=preview?.shrunk || original;
  const verifiedLive=useMemo(()=>(liveChunks||[]).filter(c=>c.text.trim() && scanText.includes(c.text)),[liveChunks,scanText]);
  const swaps=useMemo(()=>[...(preview?.shrink || [])].sort((l,r)=>l.startIndex-r.startIndex),[preview?.shrink]);
  const layout=useMemo(()=>a?chunkLayout(a,fast):null,[a,fast]);
  function lastAt(position:number) {
    switch(sequence[position].move){
      case "cut": return Math.max(0,parts.length-1);
      case "swap": case "restore": return swaps.length*2;
      case "minus": return Math.max(0,(a?.chunks.length || 1)-1);
      case "skeleton": return 1;
      case "translate": return a?chinesePhrases(position===11?a.originalZh:a.zh).length:1;
      case "add": return a ? chunkLayout(a,position>=7).addIndices.length+1 : 1;
      default: return 0;
    }
  }
  const last=lastAt(step),at=Math.min(frame,last),maxStep=a?sequence.length-1:preview?1:0;
  const addComplete=item.move==="add" && at===last;
  // A finished Add has just shown the translation, so its standalone page is passed over.
  const nextPosition=step+(addComplete?2:1),next=sequence[nextPosition];
  // Nothing follows the original's Add (or its translation page): the sentence is done.
  const closing=Boolean(a) && !next;
  const destinationAvailable=(step<maxStep && Boolean(next)) || closing || Boolean(onShowPartial);
  const canFinish=useRef(destinationAvailable);
  useLayoutEffect(()=>{canFinish.current=destinationAvailable;},[destinationAvailable]);
  const bridging=reading;
  const staticOnly=Boolean(a?.staticNotice);
  const staticView=staticOnly || all;
  const ready=addComplete || finished || (!play && at===last && !bridging);
  const canAdvance=step<maxStep;
  // From step 7 the replay of the original runs on by itself. A step opened from Review plays alone.
  const autoRun=fast && !review;
  useLayoutEffect(()=>{
    const heading=scene.current?.querySelector<HTMLElement>(staticView?".mba-static h3":".mba-step-title h2");
    heading?.focus({preventScroll:true});
  },[step,staticView]);
  useEffect(()=>{
    function enter(e:KeyboardEvent){
      if(e.key!=="Enter" || e.defaultPrevented || document.hidden)return;
      const node=e.target;
      if(e.repeat || e.isComposing || e.keyCode===229 || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey){
        if(node===primary.current || (e.repeat && node instanceof HTMLElement && node.closest("button")))e.preventDefault();
        return;
      }
      if(node instanceof HTMLElement && (node.isContentEditable ||
        node.closest("button, a[href], select, input, textarea, summary, [role=button], [role=combobox]")))return;
      if(!primary.current || primary.current.disabled || menu)return;
      e.preventDefault();primary.current.click();
    }
    window.addEventListener("keydown",enter);return()=>window.removeEventListener("keydown",enter);
  },[menu]);
  const teachingTime=holdTime(item.move,at,last,fast,a,layout)+(at===0&&item.move!=="skeleton"?(fast?300:600):0);
  const delay=Math.round((bridging?1300:teachingTime)*.95/speed);
  useEffect(()=>{
    const sync=()=>setVisible(!document.hidden);sync();
    document.addEventListener("visibilitychange",sync);return()=>document.removeEventListener("visibilitychange",sync);
  },[]);
  useEffect(()=>{
    const mq=matchMedia("(prefers-reduced-motion: reduce)");
    const sync=()=>{setReduced(mq.matches);if(mq.matches){setPlay(false);setFrame(Infinity);}};
    sync();mq.addEventListener("change",sync);return()=>mq.removeEventListener("change",sync);
  },[]);
  useEffect(()=>{
    if(!play || !visible || staticView || menu || reading)return;
    const id=setTimeout(()=>{
      if(at<last){setFrame(at+1);return;}
      // The skeleton is the visual outcome of the final subtraction, so it follows without a press.
      if(item.move==="minus"){setStep(step+1);setFrame(0);setFinished(false);return;}
      if(autoRun && next && canFinish.current){setStep(nextPosition);setFrame(0);setFinished(false);return;}
      if(canFinish.current){setFinished(true);setPlay(false);return;}
      // The step is over and the next is not ready: show the analysis at work.
      setReading(true);
    },delay);
    return()=>clearTimeout(id);
  },[at,last,step,play,visible,staticView,delay,reduced,review,menu,reading,autoRun,nextPosition]);
  // The moment the next step can be shown, the scan gives way and the Next button calls for a press.
  useEffect(()=>{
    if(reading && destinationAvailable){setReading(false);setFinished(true);setPlay(false);}
  },[reading,destinationAvailable]);
  const soundKey=bridging?"scan-"+verifiedLive.length:"stage-"+step+"-"+at;
  useEffect(()=>{
    const manual=manualSound.current;manualSound.current=false;
    if(lastSound.current===soundKey)return;
    lastSound.current=soundKey;
    if(document.hidden || menu || staticView || (!manual && (!play || matchMedia("(prefers-reduced-motion: reduce)").matches)))return;
    const c=a?.chunks[at],live=verifiedLive.at(-1);
    let sound:Parameters<typeof playCue>[0]|null=null;
    if(bridging)sound=live?.bracket==="["?"square":live?.bracket==="("?"round":"type";
    else if(item.move==="cut")sound=/[,;:!?，；：！？。.—–]["'”’»)]*$/u.test(parts[at]?.trim()||"")?"enter":"type";
    else if(item.move==="minus")sound=c?.bracket==="["?"square":c?.bracket==="("?"round":at===0?"type":"cut";
    else if(item.move==="swap"||item.move==="restore")sound=last===0?"type":at===last?"enter":at%2?"swap":"type";
    else if(item.move==="add")sound=at===0?"core":"add";
    else if(item.move==="skeleton")sound=at===0?"cut":"core";
    else if(item.move==="translate")sound=at===0?"type":"translate";
    if(sound)playCue(sound);
  },[soundKey,item.move,at,last,a,bridging,verifiedLive,parts,play,reduced,menu,staticView]);
  useEffect(()=>{
    if(!copied)return;
    const id=setTimeout(()=>setCopied(""),2500);return()=>clearTimeout(id);
  },[copied]);
  function go(index:number,one=false){
    if(index<0 || index>maxStep)return;
    manualSound.current=true;setFinished(false);setReading(false);setStep(index);setFrame(reduced?Infinity:0);setPlay(!reduced);
    setReview(one);setMenu(false);setAll(false);
  }
  function togglePlay(){
    if(!play && ready){setFinished(false);setReading(false);setFrame(0);setPlay(true);return;}
    setPlay(!play);
  }
  function cue(d:number){
    if(d>0&&at>=last && item.move==="minus"){
      go(step+1);setFrame(1);setFinished(true);setPlay(false);return;
    }
    if(d>0&&at>=last || d<0&&at<=0)return;
    const nextFrame=Math.max(0,Math.min(last,at+d));
    manualSound.current=true;setPlay(false);setMenu(false);setReading(false);
    setFrame(nextFrame);setFinished(nextFrame===last);
  }
  async function copy(){
    if(!a)return;
    try { await navigator.clipboard.writeText(markdown(a,lang));setCopied(t("已复制","Copied")); }
    catch { setCopied(t("请选择文本复制","Select text to copy")); }
  }
  const title=item.n===null?item[lang]:item.n+" · "+item[lang];
  const target=next?(next.n===null?next[lang]:next.n+" · "+next[lang]):"";
  const nextSentenceTitle=nextSentenceNumber?t("下一句 · 第 "+nextSentenceNumber+" 句","Next sentence · "+nextSentenceNumber):t("下一句","Next sentence");
  // The sentence is over once its last page has played to the end.
  const done=closing && ready && !staticView && !onShowPartial;
  let action="next-stage",label="",gateState="",gateDisabled=false;
  let activate:()=>void=()=>{
    go(nextPosition);
    if(item.move==="minus"){setFrame(1);setFinished(true);setPlay(false);}
  };
  if(staticView){
    if(!staticOnly){action="return";label=t("返回 · ","Return to ")+title;activate=()=>setAll(false);}
    else if(onNextSentence){action="next-sentence";label=nextSentenceTitle;activate=onNextSentence;}
    else if(onBackToInput){action="input";label=t("分析另一句","Analyse another sentence");activate=onBackToInput;}
    else{action="print";label=t("打印全文","Print full analysis");activate=()=>window.print();}
  }else if(onShowPartial){
    action="show-partial";activate=onShowPartial;gateDisabled=!ready;
    gateState=ready?"ready":play?"playing":"paused";
    label=ready?t("查看骨架与中文","View skeleton and Chinese"):t("完成本步后查看骨架与中文","Finish this step to view the skeleton and Chinese");
  }else if(done){
    // The button itself says the sentence is over, and leads on.
    gateState="ready";
    if(onNextSentence){action="next-sentence";label=t("✓ 这句讲完了 · ","✓ Done · ")+nextSentenceTitle;activate=onNextSentence;}
    else if(onBackToInput){action="input";label=t("✓ 讲完了 · 换一个句子","✓ Done · Try a new sentence");activate=onBackToInput;}
    else{action="replay";label=t("✓ 讲完了 · 从头再看","✓ Done · Watch again");activate=()=>go(0);}
  }else if(closing){
    action="finish";gateState=play?"playing":"paused";label=t("直接看完这一步","Show the end of this step");
    activate=()=>{setFrame(last);setFinished(true);setPlay(false);};
  }else if(!canAdvance){
    gateDisabled=true;gateState="pending";label=t("分析中 · ","Analysing · ")+target;
  }else{
    gateState=ready?"ready":play?"playing":"paused";
    label=(ready?t("下一步 · ","Next step · "):t("提前进入 · ","Skip ahead · "))+target;
  }
  const phase=done?(onNextSentence?t("讲完了 · 可以回看，或看下一句","DONE · REVIEW IT OR GO TO THE NEXT SENTENCE"):t("讲完了 · 可以回看，或换一个句子","DONE · REVIEW IT OR TRY A NEW SENTENCE"))
    :item.n===null?t("还原原句","RESTORE"):fast?(autoRun?t("原句速读 · 自动播放","ORIGINAL REPLAY · AUTOMATIC"):t("原句速读","ORIGINAL REPLAY")):t("逐步拆解","GUIDED READING");
  return <section ref={scene} className="mba-player" data-testid="lesson" data-pending={!a} aria-label={t("MBA 拆句","MBA lesson")}>
    {staticView&&a ? <div className="mba-static-scroll">
        <All a={a} lang={lang}/></div>:
      <div className="mba-stage" data-testid="lesson-stage" data-step={item.n??"original"} data-position={step}
        data-ready={ready} data-gate={gateState} data-frame={at} data-frame-end={last} data-delay={delay} data-review={review} data-fast={fast} data-move={item.move}
        data-auto={autoRun||undefined} data-done={done||undefined}>
          <header key={"heading"+step} className="mba-step-title" aria-live="polite">
            <div className="mba-phase" data-phase={done?"done":undefined}>{phase}</div>
            <h2 tabIndex={-1}><span>{item.n===null?"":String(item.n).padStart(2,"0")}</span>{item[lang]}</h2>
            <div className="mba-progress" aria-hidden="true"><i style={{width:100*(step+(at+1)/(last+1))/sequence.length+"%"}}/></div>
          </header>
          <div className="mba-stage-body" key={"body"+step}>
            {bridging?<Scan text={scanText} chunks={verifiedLive} settled={Boolean(preview)} lang={lang} reduced={reduced} playing={play&&visible}/>:<>
            {item.move==="cut"&&<Cut parts={parts} frame={at} reduced={reduced}/>}
            {(item.move==="swap"||item.move==="restore")&&preview&&<Swaps source={original} swaps={swaps} frame={at} reverse={item.move==="restore"} reduced={reduced}/>}
            {item.move==="minus"&&a&&layout&&<Minus a={a} layout={layout} frame={at} fast={fast} reduced={reduced}/>}
            {item.move==="skeleton"&&a&&layout&&<Skeleton a={a} layout={layout} original={fast} frame={at} reduced={reduced}/>}
            {item.move==="add"&&a&&layout&&<Add a={a} layout={layout} original={fast} frame={at} reduced={reduced}/>}
            {item.move==="translate"&&a&&<Translation en={fast?a.original:a.shrunk} zh={fast?a.originalZh:a.zh} frame={at} reduced={reduced}/>}
            </>}
          </div>
          {!bridging&&item.move!=="add"&&<ReadingNote lang={lang} step={step} frame={at} a={a} layout={layout} swaps={swaps}/>}
          {!a&&!bridging&&<Analysing lang={lang} settled={Boolean(preview)} found={verifiedLive.length}/>}
      </div>}
    <footer className="mba-rail" aria-label={t("播放控制","Lesson controls")}>
      {!staticView&&<>
        <div className="mba-transport">
          <button type="button" data-testid="lesson-prev" disabled={!step} onClick={()=>go(step-1)}>{t("上一步","Back")}</button>
          <button type="button" className="mba-play" data-testid="lesson-play" aria-pressed={play}
            onClick={togglePlay}>{play?t("暂停","Pause"):ready?t("重播本步","Replay step"):t("播放","Play")}</button>
          {!play&&!done&&<button type="button" data-testid="lesson-next-cue" disabled={at>=last&&item.move!=="minus"} onClick={()=>cue(1)}>{t("下一处","Next cue")}</button>}
          {done&&<button type="button" data-testid="lesson-restart" onClick={()=>go(0)}>{t("从头再看","Watch again")}</button>}
        </div>
        <label className="mba-review"><span>{t("复习步骤","Review")}</span>
          <select data-testid="lesson-review" aria-label={t("复习某一步","Review a step")} value={step}
            onChange={e=>go(Number(e.target.value),true)}>{sequence.map((s,i)=><option key={i} value={i} disabled={i>maxStep}>
              {s.n===null?s[lang]:s.n+" · "+s[lang]}{i>=7?t("（原句）"," (original)"):""}</option>)}</select>
        </label>
      </>}
      {staticView&&<><button data-testid="lesson-copy" type="button" onClick={copy}>{copied||t("复制文本","Copy text")}</button>
        <button type="button" onClick={()=>window.print()}>{t("打印","Print")}</button>
        </>}
      {!staticView&&<div className="mba-more">
        <button type="button" className="mba-more-button" data-testid="lesson-more" aria-expanded={menu} aria-label={t("更多播放选项","More playback options")} onClick={()=>setMenu(!menu)}>•••</button>
        {menu&&<div className="mba-popover">
          <label>{t("速度","Speed")} <select aria-label={t("播放速度","Playback speed")} value={speed} onChange={e=>setSpeed(Number(e.target.value))}>{[.5,.75,1,1.5,2].map(s=><option key={s} value={s}>{s}×</option>)}</select></label>
          <div className="mba-cues"><button type="button" data-testid="lesson-prev-cue" disabled={at===0} onClick={()=>cue(-1)}>{t("上一处","Previous cue")}</button>
            <button type="button" disabled={at===last&&item.move!=="minus"} onClick={()=>cue(1)}>{t("下一处","Next cue")}</button></div>
          <button type="button" data-testid="lesson-replay" onClick={()=>go(0)}>{t("从头播放","Replay lesson")}</button>
          <button type="button" data-testid="lesson-all" disabled={!a} onClick={()=>{setAll(true);setPlay(false);setMenu(false);}}>{t("展开全文","Show all")}</button>
          <button type="button" data-testid="lesson-copy" disabled={!a} onClick={copy}>{copied||t("复制文本","Copy text")}</button>
        </div>}
      </div>}
      <div className="mba-stage-gate" data-gate-state={gateState||action}>
        <button type="button" ref={primary} aria-keyshortcuts="Enter" className="mba-continue" data-testid={action==="return"?"lesson-all":"lesson-next"} data-action={action}
          disabled={gateDisabled} onClick={activate}>{label}<span className="mba-key-hint" aria-hidden="true">{gateDisabled?"…":"Enter ↵"}</span></button>
      </div>
    </footer>
    <span className="mba-sr" aria-live="polite">{title}</span>
  </section>;
}
export default function Lesson(props:Props){return <Player key={props.source} {...props}/>;}
