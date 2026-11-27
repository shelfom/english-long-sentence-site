"use client";

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Analysis } from "../lib/types";
import type {LiveChunk} from "../lib/compact-analysis";
import {playCue} from "../lib/lesson-audio";
import "./lesson.css";

type Lang = "zh" | "en";
type Chunk = Analysis["chunks"][number];
type Preview = Pick<Analysis, "shrink" | "shrunk">;
type Props = { data: Analysis | null; lang: Lang; source: string; previewShrunk?: Preview | null; liveChunks?:LiveChunk[]; onNextSentence?:()=>void; nextSentenceNumber?:number; onBackToInput?:()=>void; onShowPartial?:()=>void };
type Move = "cut" | "swap" | "minus" | "skeleton" | "add" | "translate" | "restore" | "practice";
const sequence: { n: number | null; move: Move; zh: string; en: string }[] = [
  { n: 1, move: "cut", zh: "切割", en: "Cut" }, { n: 2, move: "swap", zh: "换词", en: "Swap words" },
  { n: 3, move: "minus", zh: "减法", en: "Minus" }, { n: 4, move: "skeleton", zh: "骨架", en: "Skeleton" },
  { n: 5, move: "add", zh: "加法", en: "Add" }, { n: 6, move: "translate", zh: "翻译", en: "Translate" },
  { n: null, move: "restore", zh: "原句", en: "Restore the original" },
  { n: 7, move: "cut", zh: "切割", en: "Cut" }, { n: 8, move: "minus", zh: "减法", en: "Minus" },
  { n: 9, move: "skeleton", zh: "骨架", en: "Skeleton" }, { n: 10, move: "add", zh: "加法", en: "Add" },
  { n: 11, move: "translate", zh: "翻译", en: "Translate" }, { n: 12, move: "practice", zh: "练习", en: "Practice" },
];
const words = (text: string) => [...text.matchAll(/\S+/gu)];
const normalize = (text: string) => text.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
const formatCount = (n: number, lang: Lang, type: "word" | "stop") => lang === "zh"
  ? n + (type === "word" ? " 词" : " 个句号") : n + " " + (type === "word" ? "word" : "full stop") + (n === 1 ? "" : "s");
function Words({text, cls, mark, offset = 0}: {text: string; cls?: string; mark?: [number,number]; offset?: number}) {
  let prev = 0;
  return <>{words(text).map(m => {
    const i = m.index ?? 0, gap = text.slice(prev,i); prev = i + m[0].length;
    const hit = mark && offset + i < mark[1] && offset + prev > mark[0];
    return <Fragment key={i}>{gap}<span data-word="" className={["mba-word",m[0].length>28&&"mba-long-word",cls,hit && "mba-target"].filter(Boolean).join(" ")}>{m[0]}</span></Fragment>;
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
    {title:title(12),paragraphs:[a.original,t("轮到你了。试着用 MBA 自己拆一遍。","Your turn. Try taking the sentence apart with MBA.")]},
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

function Minus({a,layout,frame,fast,reduced}: {a:Analysis;layout:Layout;frame:number;fast:boolean;reduced:boolean}) {
  const sentence=fast?a.original:a.shrunk;
  const active=a.chunks[frame];
  const mark:[number,number]|undefined=!fast && active?.describes && active.describesIndex>=0
    ?[active.describesIndex,active.describesIndex+active.describes.length]:undefined;
  const blocks=useMemo(()=>{
    let offset=0, chunk=0;
    return punctuationParts(sentence).map(text=>{
      const start=offset,end=start+text.length;offset=end;
      const spans:{index:number;start:number;end:number;first:boolean}[]=[];
      while(chunk<layout.texts.length && layout.offsets[chunk]<end){
        const from=layout.offsets[chunk],to=from+layout.texts[chunk].length;
        if(to>start)spans.push({index:chunk,start:Math.max(start,from),end:Math.min(end,to),first:from>=start});
        if(to>end)break;
        chunk++;
      }
      return {start,end,spans};
    });
  },[sentence,layout]);
  return <Sheet cue={"minus"+fast+frame+sentence} mode="smart" big={36} mobileBig={26} min={19} reduced={reduced} className="mba-minus">
    {blocks.map((block,b)=>{
      let cursor=block.start;
      return <div className="mba-punct-block mba-minus-block" data-punctuation-block={b} key={b}>{block.spans.map(span=>{
        const i=span.index,chunk=a.chunks[i],opened=i<=frame,selected=i===frame;
        const gap=sentence.slice(cursor,span.start);cursor=span.end;
        const bracket=opened && span.first && chunk.bracket;
        const activeGloss=selected && span.first;
        return <Fragment key={i}>{gap}<span data-chunk={i} data-depth={opened?chunk.depth:undefined} data-focus={activeGloss}
          className={opened?"mba-subdivision "+tone(chunk)+(selected?" mba-active-line":""):"mba-upcoming"}
          style={opened?{paddingInlineStart:"min("+Math.min(chunk.depth,8)*.7+"em, 16%)"}:undefined}>
          <span className="mba-chunk-en" data-minus-active={selected?i:undefined}>
            {bracket&&<b className="mba-bracket">{bracket}{" "}</b>}<Words text={sentence.slice(span.start,span.end)} mark={mark} offset={span.start}/>
          </span>{activeGloss && <span className="mba-minus-gloss" lang="zh-CN" data-minus-zh={i}>{chunk.zh}</span>}
        </span></Fragment>;
      })}{sentence.slice(cursor,block.end)}</div>;
    })}
  </Sheet>;
}

function MaskText({text,mask,ghost=false}: {text:string;mask:boolean[];ghost?:boolean}) {
  return <>{words(text).map((m,i)=><Fragment key={i}>{i ? " " : ""}<span data-word="" className={"mba-word "+(mask[i]?"mba-survivor":ghost?"mba-grey":"")}>{m[0]}</span></Fragment>)}</>;
}
function Skeleton({a,layout,original,frame,reduced}: {a:Analysis;layout:Layout;original:boolean;frame:number;reduced:boolean}) {
  const skeleton=original?a.skeleton.original:a.skeleton.text;
  return <div className="mba-spine-panel">
    {frame===0 && <Sheet cue={"silhouette"+original+a.original} reduced={reduced} mode="fit" big={42} className="mba-source-before">
      {layout.texts.map((s,i)=><Fragment key={i}>{i?" ":null}<MaskText text={s} mask={layout.masks[i]} ghost /></Fragment>)}
    </Sheet>}
    {frame>0 && <div className="mba-center-spine"><Sheet cue={"core"+skeleton} reduced={reduced} mode="fit" big={67}>
      <strong className="mba-spine" data-core=""><Words text={skeleton}/></strong>
      <p className="mba-core-zh" data-core-zh="" lang="zh-CN">{original?a.skeleton.originalZh:a.skeleton.zh}</p></Sheet></div>}
  </div>;
}

function Add({a,layout,original,frame,reduced}: {a:Analysis;layout:Layout;original:boolean;frame:number;reduced:boolean}) {
  const active=layout.addIndices[frame-1], expanded=new Set(layout.addIndices.slice(0,frame));
  const skeleton=original?a.skeleton.original:a.skeleton.text, done=frame>layout.addIndices.length;
  const items=layout.texts.map((s,i)=>{
    if(expanded.has(i) || done)return s;
    return words(s).filter((_,n)=>layout.masks[i][n]).map(m=>m[0]).join(" ").replace(/[,;:]+$/u,"");
  });
  return <Sheet cue={"add"+original+frame+a.original} mode={frame===0 || done ? "smart":"follow"} reduced={reduced} big={frame===0?64:42}
    className={frame===0?"mba-add-spine":"mba-add-sentence"}>
    {frame===0?<strong className="mba-spine"><Words text={skeleton}/></strong>:done?<><Words text={original?a.original:a.shrunk}/><p className="mba-add-zh" data-add-complete-zh="" lang="zh-CN">{original?a.originalZh:a.zh}</p></>:items.map((s,i)=>s&&
      <Fragment key={i}>{i>0 && items.slice(0,i).some(Boolean)?" ":null}<span data-focus={active===i}
        className={active===i?"mba-added-focus":""}>
        <span className={[expanded.has(i)?tone(a.chunks[i]):"",active===i?"mba-added":""].join(" ")}><Words text={s}/></span>
        {active===i&&<span className="mba-gloss-under" data-chunk-zh={i} lang="zh-CN">{a.chunks[i].zh}</span>}
      </span></Fragment>) }
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
type PracticeEdits={cuts:number[];hidden:number[]};
const blankPractice:PracticeEdits={cuts:[],hidden:[]};
type PracticeTool="cut"|"subtract";

function Practice({source,lang,tool,edits,change,reduced}: {source:string;lang:Lang;tool:PracticeTool;edits:PracticeEdits;change:(next:PracticeEdits)=>void;reduced:boolean}) {
  const tokens=useMemo(()=>words(source),[source]), ref=useRef<HTMLDivElement>(null);
  const [focus,setFocus]=useState(0);
  const cuts=new Set(edits.cuts), hidden=new Set(edits.hidden);
  const t=(zh:string,en:string)=>lang==="zh"?zh:en;
  function update(i:number,end:number,restore:boolean){
    if(restore){
      change({...edits,hidden:edits.hidden.filter(n=>n<i||n>end)});playCue("add");return;
    }
    if(tool==="cut"){
      if(i===tokens.length-1)return;
      change({...edits,cuts:cuts.has(i)?edits.cuts.filter(n=>n!==i):[...edits.cuts,i]});
      playCue(cuts.has(i)?"add":"cut");return;
    }
    let first=i,last=i;
    if(cuts.size){
      while(first>0&&!cuts.has(first-1))first--;
      while(last<tokens.length-1&&!cuts.has(last))last++;
    }
    for(let n=first;n<=last;n++)hidden.add(n);
    setFocus(first);change({...edits,hidden:[...hidden]});playCue("cut");
    requestAnimationFrame(()=>ref.current?.querySelector<HTMLButtonElement>('[data-edit-word="'+first+'"]')?.focus({preventScroll:true}));
  }
  return <div ref={ref} className="mba-practice" data-practice="" onKeyDown={e=>{
    if(!["ArrowLeft","ArrowRight","Home","End"].includes(e.key))return;
    const buttons=[...(ref.current?.querySelectorAll<HTMLButtonElement>("[data-edit-word]")||[])];
    const target=e.target as HTMLButtonElement,index=buttons.indexOf(target);
    if(index<0)return;
    e.preventDefault();const next=e.key==="Home"?0:e.key==="End"?buttons.length-1:Math.max(0,Math.min(index+(e.key==="ArrowRight"?1:-1),buttons.length-1));
    buttons[next]?.focus();
  }}><Sheet cue={"practice"+source+edits.cuts.join(",")+":"+edits.hidden.join(",")} mode="smart" big={43} reduced={reduced}>
    {tokens.map((m,i)=>{
      if(hidden.has(i)&&i>0&&hidden.has(i-1)&&!cuts.has(i-1))return null;
      let end=i;
      if(hidden.has(i))while(end+1<tokens.length&&hidden.has(end+1)&&!cuts.has(end))end++;
      const label=hidden.has(i)?t("加回","Restore")+" "+tokens.slice(i,end+1).map(w=>w[0]).join(" "):
        (tool==="cut"?t("切分或合并","Cut or join after"):t("临时减去","Set aside"))+" "+m[0];
      return <Fragment key={i}>{i>0?(cuts.has(i-1)?<br/>:source.slice((tokens[i-1].index??0)+tokens[i-1][0].length,m.index)):""}
        <button type="button" data-edit-word={i} data-hidden-piece={hidden.has(i)||undefined} data-break={cuts.has(end)||undefined}
          tabIndex={focus===i?0:-1} onFocus={()=>setFocus(i)} onClick={()=>update(i,end,hidden.has(i))} aria-label={label}
          className={"mba-edit-word"+(hidden.has(i)?" mba-edit-gap":"")}>{hidden.has(i)?"⋯":<span data-word="" className="mba-word">{m[0]}</span>}
          {cuts.has(end)&&<sup aria-hidden="true">↵</sup>}</button></Fragment>;
    })}
  </Sheet></div>;
}

function readGroups(source:string){
  const tokens=words(source),groups:string[][]=[];
  let group:string[]=[];
  for(const token of tokens){
    group.push(token[0]);
    if(group.length===4||/[,;:.!?—–]["')\]]*$/u.test(token[0])){groups.push(group);group=[];}
  }
  if(group.length)groups.push(group);
  return groups;
}
function ReadingPass({groups,tick,live,lang,reduced}:{groups:string[][];tick:number;live?:LiveChunk;lang:Lang;reduced:boolean}){
  const t=(zh:string,en:string)=>lang==="zh"?zh:en;
  const index=tick%Math.max(1,groups.length), group=groups[index]||[];
  const wordPass=Math.floor(tick/Math.max(1,groups.length))%2===1;
  const single=groups.length===1&&group.length===1;
  const letter=single?tick%Array.from(group[0]).length:-1;
  return <div className="mba-reading" data-testid="reading-pass" data-beat={tick} data-live={!!live}>
    <p className="mba-read-label">{live?t("已解析的分块","Analysed chunk"):t("原句跟读","Read the original")}</p>
    <Sheet cue={"read"+tick+(live?.text||"")} reduced={reduced} mode="smart" big={58} className="mba-read-pane">
      {live?<div className="mba-reader-group"><b className={live.bracket==="["?"mba-clause":live.bracket==="("?"mba-phrase":""}>{live.bracket}<Words text={live.text}/></b>
        {live.zh&&<small>{live.zh}</small>}{live.describes&&<small>{t("修饰","Describes")} <b>{live.describes}</b></small>}</div>:
        <div className="mba-reader-group" data-reading-text={group.join(" ")}>
          {groups.length>1&&index>0&&<small className="mba-reader-near"><Words text={groups[index-1].join(" ")}/></small>}
          <b>{single?<span data-word="" className="mba-word">{Array.from(group[0]).map((c,i)=><span key={i} className={i===letter?"mba-read-word":""}>{c}</span>)}</span>:
            group.map((word,i)=><Fragment key={i}>{i?" ":""}<span data-word="" className={"mba-word"+(!wordPass||i===tick%group.length?" mba-read-word":"")}>{word}</span></Fragment>)}</b>
          {groups.length>1&&index<groups.length-1&&<small className="mba-reader-near"><Words text={groups[index+1].join(" ")}/></small>}
        </div>}
    </Sheet>
    <span className="mba-reading-position">{live?t("正在接收后续讲解","Receiving the next part"):t("按原文顺序阅读","Reading in source order")+" · "+(index+1)+" / "+groups.length}</span>
  </div>;
}

// The full translation used to appear in one cue. Split its reading time between
// its phrases, giving even a short phrase time to register on its own.
function translationTime(text:string,frame:number,fast:boolean) {
  if(frame===0)return fast?1100:3600;
  const phrases=chinesePhrases(text);
  const total=fast?4600:Math.min(32000,Math.max(8500,text.length*210));
  const base=Math.min(fast?550:1000,total*.6/phrases.length);
  const lengths=phrases.map(p=>Math.max(1,p.trim().length));
  return base+(total-base*phrases.length)*(lengths[frame-1]||1)/lengths.reduce((sum,n)=>sum+n,0);
}

function grammarTime(text:string,why:string) {
  return Math.min(13500,Math.max(4500,2600+(text.length+why.length)*76));
}

function holdTime(move:Move,frame:number,last:number,fast:boolean,a:Analysis|null,layout:Layout|null) {
  if(move==="translate")return translationTime((fast?a?.originalZh:a?.zh)||"",frame,fast);
  // Punctuation is already cut on first paint. Spread the previous opening
  // reading beat through its visible cuts so the instant start stays unhurried.
  if(move==="cut"){
    const initial=fast?780:2200;
    return (frame===last?(fast?1550:3000):(fast?780:1650))+initial/(last+1);
  }
  if(fast){
    if(move==="minus" && a?.chunks[frame])return Math.min(5600,Math.max(3500,2100+a.chunks[frame].zh.length*90));
    if(move==="add" && a && layout){
      const i=layout.addIndices[frame-1];
      return i===undefined ? 1800 : Math.min(5600,Math.max(3500,2100+a.chunks[i].zh.length*90));
    }
    if(move==="skeleton")return frame?2100:560;
    return frame===last?1550:780;
  }
  if(move==="swap")return frame===last?2600:frame%2?1650:1050;
  if(move==="restore")return frame===last?2100:frame%2?1000:680;
  if(move==="minus"&&a){
    const c=a.chunks[frame];
    return c?grammarTime(c.text,c.signalWhy+c.zh):4500;
  }
  if(move==="skeleton")return frame?5400:810;
  if(move==="add"){
    const i=layout?.addIndices[frame-1];
    return a&&i!==undefined?Math.min(13500,Math.max(4600,2700+a.chunks[i].text.length*70+a.chunks[i].zh.length*150)):3600;
  }
  return 3200;
}

function Player({data:a,lang,source,previewShrunk,liveChunks,onNextSentence,nextSentenceNumber,onBackToInput,onShowPartial}:Props) {
  const t=(zh:string,en:string)=>lang==="zh"?zh:en;
  const [step,setStep]=useState(0),[frame,setFrame]=useState(0),[play,setPlay]=useState(true);
  const [reduced,setReduced]=useState(false),[speed,setSpeed]=useState(1),[review,setReview]=useState(false);
  const [finished,setFinished]=useState(false);
  const scene=useRef<HTMLElement>(null),primary=useRef<HTMLButtonElement>(null);
  const [all,setAll]=useState(false),[menu,setMenu]=useState(false),[copied,setCopied]=useState("");
  const [practiceTool,setPracticeTool]=useState<PracticeTool>("cut"),[edits,setEdits]=useState<PracticeEdits>(blankPractice);
  const [reading,setReading]=useState(false),[beat,setBeat]=useState(0),[liveIndex,setLiveIndex]=useState<number|null>(null);
  const nextLive=useRef(0),liveCount=useRef(0),lastSound=useRef(""),manualSound=useRef(false);
  const [visible,setVisible]=useState(true);
  const original=a?.original || source, preview=a || previewShrunk, item=sequence[step], fast=step>=7, practice=item.move==="practice";
  const parts=useMemo(()=>punctuationParts(original),[original]);
  const groups=useMemo(()=>readGroups(original),[original]);
  const verifiedLive=useMemo(()=>(liveChunks||[]).filter(c=>c.text.trim() && (original.includes(c.text)||preview?.shrunk.includes(c.text))),[liveChunks,original,preview?.shrunk]);
  useEffect(()=>{liveCount.current=verifiedLive.length;},[verifiedLive.length]);
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
  const last=lastAt(step),at=Math.min(frame,last),maxStep=a?12:preview?1:0;
  const destinationAvailable=step<maxStep || Boolean(onShowPartial);
  const canFinish=useRef(destinationAvailable);
  useLayoutEffect(()=>{canFinish.current=destinationAvailable;},[destinationAvailable]);
  const bridging=reading;
  const shownLive=liveIndex===null?undefined:verifiedLive[liveIndex];
  const staticOnly=Boolean(a?.staticNotice);
  const staticView=staticOnly || all;
  const addComplete=item.move==="add" && at===last;
  const ready=practice || addComplete || finished || (!play && at===last && !bridging);
  const canAdvance=step<maxStep;
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
  const readingTime=shownLive
    ?grammarTime(shownLive.text,[shownLive.reason,shownLive.zh,shownLive.describes].filter(Boolean).join(" "))
    :Math.min(2200,Math.max(1300,(groups[beat%Math.max(1,groups.length)]?.join(" ").length||8)*65));
  const teachingTime=holdTime(item.move,at,last,fast,a,layout)+(at===0&&item.move!=="skeleton"?950:0);
  const delay=Math.round((bridging?readingTime:teachingTime)*.95/speed);
  useEffect(()=>{
    const sync=()=>setVisible(!document.hidden);sync();
    document.addEventListener("visibilitychange",sync);return()=>document.removeEventListener("visibilitychange",sync);
  },[]);
  useEffect(()=>{
    const mq=matchMedia("(prefers-reduced-motion: reduce)");
    const sync=()=>{setReduced(mq.matches);if(mq.matches){setPlay(false);setFrame(Infinity);}};
    sync();mq.addEventListener("change",sync);return()=>mq.removeEventListener("change",sync);
  },[]);
  function nextReadingBeat(){
    if(!reading){
      setReading(true);setLiveIndex(null);setBeat(0);
    }else if(nextLive.current<liveCount.current){
      setLiveIndex(nextLive.current++);
    }else{
      setLiveIndex(null);setBeat(v=>v+1);
    }
  }
  useEffect(()=>{
    if(!play || !visible || practice || staticView || menu)return;
    // The skeleton is the visual outcome of the final subtraction. Hold it
    // for the reader before the first addition, just like other step endings.
    const id=setTimeout(()=>{
      if(at<last){setFrame(at+1);return;}
      if(item.move==="minus"){
        setStep(step+1);setFrame(0);setFinished(false);return;
      }
      if(canFinish.current){
        setReading(false);setLiveIndex(null);setFinished(true);setPlay(false);return;
      }
      nextReadingBeat();
    },delay);
    return()=>clearTimeout(id);
  },[at,last,step,play,visible,practice,staticView,delay,reduced,review,menu,reading,beat,liveIndex]);
  const soundKey=bridging?"read-"+beat+"-"+(liveIndex??"source")+":"+(shownLive?.text||""):"stage-"+step+"-"+at;
  useEffect(()=>{
    const manual=manualSound.current;manualSound.current=false;
    if(lastSound.current===soundKey)return;
    lastSound.current=soundKey;
    if(document.hidden || menu || staticView || practice || (!manual && (!play || matchMedia("(prefers-reduced-motion: reduce)").matches)))return;
    const c=a?.chunks[at];
    let sound:Parameters<typeof playCue>[0]|null=null;
    if(bridging)sound=shownLive?.bracket==="["?"square":shownLive?.bracket==="("?"round":"type";
    else if(item.move==="cut")sound=/[,;:!?，；：！？。.—–]["'”’»)]*$/u.test(parts[at]?.trim()||"")?"enter":"type";
    else if(item.move==="minus")sound=c?.bracket==="["?"square":c?.bracket==="("?"round":at===0?"type":"cut";
    else if(item.move==="swap"||item.move==="restore")sound=last===0?"type":at===last?"enter":at%2?"swap":"type";
    else if(item.move==="add")sound=at===0?"core":"add";
    else if(item.move==="skeleton")sound=at===0?"cut":"core";
    else if(item.move==="translate")sound=at===0?"type":"translate";
    if(sound)playCue(sound);
  },[soundKey,item.move,at,last,a,bridging,shownLive,parts,play,reduced,menu,practice,staticView]);
  useEffect(()=>{
    if(!copied)return;
    const id=setTimeout(()=>setCopied(""),2500);return()=>clearTimeout(id);
  },[copied]);
  function go(index:number,one=false){
    if(index<0 || index>maxStep)return;
    manualSound.current=true;setFinished(false);setReading(false);setLiveIndex(null);setStep(index);setFrame(reduced?Infinity:0);setPlay(!reduced && sequence[index].move!=="practice");
    setReview(one);setMenu(false);setAll(false);
  }
  function togglePlay(){
    if(practice){go(0);return;}
    if(!play && ready){setFinished(false);setReading(false);setLiveIndex(null);setFrame(0);setPlay(true);return;}
    setPlay(!play);
  }
  function cue(d:number){
    if(d>0&&at>=last && item.move==="minus"){
      go(step+1);setFrame(1);setFinished(true);setPlay(false);return;
    }
    if(d>0&&at>=last || d<0&&at<=0)return;
    const nextFrame=Math.max(0,Math.min(last,at+d));
    manualSound.current=true;setPlay(false);setMenu(false);setReading(false);setLiveIndex(null);
    setFrame(nextFrame);setFinished(nextFrame===last);
  }
  async function copy(){
    if(!a)return;
    try { await navigator.clipboard.writeText(markdown(a,lang));setCopied(t("已复制","Copied")); }
    catch { setCopied(t("请选择文本复制","Select text to copy")); }
  }
  const title=item.n===null?item[lang]:item.n+" · "+item[lang];
  const nextPosition=step+(addComplete?2:1);
  const next=sequence[nextPosition];
  const target=next?(next.n===null?next[lang]:next.n+" · "+(next.move==="practice"?t("轮到你了","Your turn"):next[lang])):"";
  const nextSentenceTitle=nextSentenceNumber?t("下一句 · 第 "+nextSentenceNumber+" 句","Next sentence · "+nextSentenceNumber):t("下一句","Next sentence");
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
  }else if(practice){
    if(onNextSentence){action="next-sentence";label=nextSentenceTitle;activate=onNextSentence;}
    else{action="replay";label=t("重新开始 · 1 切割","Replay · 1 Cut");activate=()=>go(0);}
  }else if(onShowPartial){
    action="show-partial";activate=onShowPartial;gateDisabled=!ready;
    gateState=ready?"ready":play?"playing":"paused";
    label=ready?t("查看骨架与中文","View skeleton and Chinese"):t("完成本步后查看骨架与中文","Finish this step to view the skeleton and Chinese");
  }else if(!canAdvance){
    gateDisabled=true;gateState="pending";label=t("准备中 · ","Preparing · ")+target;
  }else{
    gateState=ready?"ready":play?"playing":"paused";
    label=(ready?t("下一步 · ","Next step · "):t("提前进入 · ","Skip ahead · "))+target;
  }
  return <section ref={scene} className="mba-player" data-testid="lesson" data-pending={!a} aria-label={t("MBA 拆句","MBA lesson")}>
    {staticView&&a ? <div className="mba-static-scroll">
        <All a={a} lang={lang}/></div>:
      <div className="mba-stage" data-testid="lesson-stage" data-step={item.n??"original"} data-position={step}
        data-ready={ready} data-gate={gateState} data-frame={at} data-frame-end={last} data-delay={delay} data-review={review} data-fast={fast && !practice} data-move={item.move}>
          <header key={"heading"+step} className="mba-step-title" aria-live="polite">
            <div className="mba-phase">{item.n===null?t("还原原句","RESTORE"):step>=7 && !practice?t("原句速读","ORIGINAL REPLAY"):practice?t("YOUR TURN","INDEPENDENT PRACTICE"):t("逐步拆解","GUIDED READING")}</div>
            <h2 tabIndex={-1}><span>{item.n===null?"":String(item.n).padStart(2,"0")}</span>{practice?t("轮到你了","Your turn"):item[lang]}</h2>
            <div className="mba-progress" aria-hidden="true"><i style={{width:100*(step+(at+1)/(last+1))/sequence.length+"%"}}/></div>
          </header>
          <div className="mba-stage-body" key={"body"+step}>
            {bridging?<ReadingPass groups={groups} tick={beat} live={shownLive} lang={lang} reduced={reduced}/>:<>
            {item.move==="cut"&&<Cut parts={parts} frame={at} reduced={reduced}/>}
            {(item.move==="swap"||item.move==="restore")&&preview&&<Swaps source={original} swaps={swaps} frame={at} reverse={item.move==="restore"} reduced={reduced}/>}
            {item.move==="minus"&&a&&layout&&<Minus a={a} layout={layout} frame={at} fast={fast} reduced={reduced}/>}
            {item.move==="skeleton"&&a&&layout&&<Skeleton a={a} layout={layout} original={fast} frame={at} reduced={reduced}/>}
            {item.move==="add"&&a&&layout&&<Add a={a} layout={layout} original={fast} frame={at} reduced={reduced}/>}
            {item.move==="translate"&&a&&<Translation en={fast?a.original:a.shrunk} zh={fast?a.originalZh:a.zh} frame={at} reduced={reduced}/>}
            {practice&&<Practice source={original} lang={lang} tool={practiceTool} edits={edits} change={setEdits} reduced={reduced}/>}
            </>}
          </div>
          {!practice&&!bridging&&item.move!=="add"&&<ReadingNote lang={lang} step={step} frame={at} a={a} layout={layout} swaps={swaps}/>}
          {!a&&!bridging&&<span className="mba-pending-inline" role="status">{t("正在分析后续步骤","Analysing the next steps")}</span>}
      </div>}
    <footer className="mba-rail" aria-label={t("播放控制","Lesson controls")}>
      {!staticView&&<>
        {practice&&<div className="mba-practice-tools" aria-label={t("操作原句","Edit the original sentence")}>
          <button type="button" data-testid="practice-cut" aria-pressed={practiceTool==="cut"} onClick={()=>setPracticeTool("cut")}>{t("点词切开","Cut after word")}</button>
          <button type="button" data-testid="practice-subtract" aria-pressed={practiceTool==="subtract"} onClick={()=>setPracticeTool("subtract")}>{t("减去 / 加回","Subtract / add")}</button>
          <button type="button" data-testid="practice-reset" disabled={!edits.cuts.length&&!edits.hidden.length} onClick={()=>{setEdits(blankPractice);playCue("add");}}>{t("复原","Reset")}</button>
        </div>}
        {!practice&&<div className="mba-transport">
          <button type="button" data-testid="lesson-prev" disabled={!step} onClick={()=>go(step-1)}>{t("上一步","Back")}</button>
          <button type="button" className="mba-play" data-testid="lesson-play" aria-pressed={play&&!practice}
            onClick={togglePlay}>{practice?t("重播","Replay"):play?t("暂停","Pause"):ready?t("重播本步","Replay step"):t("播放","Play")}</button>
          {!play&&<button type="button" data-testid="lesson-next-cue" disabled={at>=last&&item.move!=="minus"} onClick={()=>cue(1)}>{t("下一处","Next cue")}</button>}

        </div>}
        <label className="mba-review"><span>{t("复习步骤","Review")}</span>
          <select data-testid="lesson-review" aria-label={t("复习某一步","Review a step")} value={practice?"review":step}
            onChange={e=>go(Number(e.target.value),true)}>{practice&&<option value="review" disabled>{t("复习步骤…","Review step…")}</option>}{sequence.map((s,i)=><option key={i} value={i} disabled={i>maxStep}>
              {s.n===null?s[lang]:s.n+" · "+s[lang]}{i>=7&&i<=11?t("（原句）"," (original)"):""}</option>)}</select>
        </label>
      </>}
      {staticView&&<><button data-testid="lesson-copy" type="button" onClick={copy}>{copied||t("复制文本","Copy text")}</button>
        <button type="button" onClick={()=>window.print()}>{t("打印","Print")}</button>
        </>}
      {!staticView&&<div className="mba-more">
        <button type="button" className="mba-more-button" data-testid="lesson-more" aria-expanded={menu} aria-label={t("更多播放选项","More playback options")} onClick={()=>setMenu(!menu)}>•••</button>
        {menu&&<div className="mba-popover">
          <label>{t("速度","Speed")} <select aria-label={t("播放速度","Playback speed")} value={speed} onChange={e=>setSpeed(Number(e.target.value))}>{[.5,.75,1,1.5,2].map(s=><option key={s} value={s}>{s}×</option>)}</select></label>
          <div className="mba-cues"><button type="button" data-testid="lesson-prev-cue" disabled={practice || at===0} onClick={()=>cue(-1)}>{t("上一处","Previous cue")}</button>
            <button type="button" disabled={practice || (at===last&&item.move!=="minus")} onClick={()=>cue(1)}>{t("下一处","Next cue")}</button></div>
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
