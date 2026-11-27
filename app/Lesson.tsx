"use client";

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Analysis } from "../lib/types";
import "./lesson.css";

type Lang = "zh" | "en";
type Chunk = Analysis["chunks"][number];
type Preview = Pick<Analysis, "shrink" | "shrunk">;
type Props = { data: Analysis | null; lang: Lang; source: string; previewShrunk?: Preview | null };
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
    return <Fragment key={i}>{gap}<span data-word="" className={["mba-word",cls,hit && "mba-target"].filter(Boolean).join(" ")}>{m[0]}</span></Fragment>;
  })}{text.slice(prev)}</>;
}
type Section = { title:string; paragraphs?:string[]; lines?:string[]; columns?:string[]; rows?:string[][] };
function handout(a:Analysis,lang:Lang):Section[] {
  const t=(zh:string,en:string)=>lang==="zh"?zh:en;
  const title=(i:number)=>sequence[i].n===null?sequence[i][lang]:sequence[i].n+" · "+sequence[i][lang];
  const count=(s:string)=>formatCount(words(s).length,lang,"word");
  const cut=punctuationParts(a.original).map(x=>x.trim());
  const bracket=(original:boolean)=>a.chunks.map(c=>"  ".repeat(c.depth)+(c.bracket||"")+(original?c.originalText:c.text));
  const addRows=(original:boolean)=>chunkLayout(a,original).addIndices.map(i=>original?[a.chunks[i].originalText]:[a.chunks[i].text,a.chunks[i].zh]);
  return [
    {title:title(0),paragraphs:[formatCount(a.wordCount,lang,"word")+" · "+formatCount(a.fullStops,lang,"stop")],lines:cut},
    {title:title(1),paragraphs:[a.shrunk,...(!a.shrink.length?[t("没有需要替换的 C1+ 词语。","No C1+ terms need replacing.")]:[])],columns:[t("原词","Original"),t("换成","Replacement"),t("词义","Meaning")],rows:a.shrink.map(s=>[s.big,s.small,s.zh])},
    {title:title(2),lines:bracket(false),columns:[t("分块","Chunk"),t("信号与理由","Signal and reason"),t("修饰谁","Describes"),t("作用","Role")],rows:a.chunks.map(c=>[c.text,[c.signal,c.signalWhy].filter(Boolean).join(" · "),c.describes,[c.keep&&"✓",c.role,c.job,c.note].filter(Boolean).join(" · ")])},
    {title:title(3),paragraphs:[a.skeleton.text,count(a.skeleton.text)],columns:[t("问题","Question"),t("答案","Answer")],rows:a.skeleton.table.map(r=>[r.q,r.a])},
    {title:title(4),paragraphs:[a.shrunk],columns:[t("加回","Add"),t("中文","Chinese")],rows:addRows(false)},
    {title:title(5),paragraphs:[a.shrunk,a.zh]},
    {title:title(6),columns:[t("小词","Simpler word"),t("原词","Original word")],rows:a.shrink.map(s=>[s.small,s.big]),paragraphs:[a.original]},
    {title:title(7),lines:cut},{title:title(8),lines:bracket(true)},
    {title:title(9),paragraphs:[a.skeleton.original,count(a.skeleton.original)]},
    {title:title(10),columns:[t("加回原文","Restore original chunks")],rows:addRows(true),paragraphs:[a.original]},
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

type SheetProps = { children: ReactNode; cue: string; mode?: "fit" | "smart" | "follow"; big?: number; min?: number; reduced: boolean; className?: string };
function Sheet({children,cue,mode="smart",big=43,min=20,reduced,className=""}: SheetProps) {
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
      let hi = wide ? big : Math.max(24,Math.round(big * .72));
      let lo = mode === "fit" ? 7 : wide ? min : Math.max(17,min - 2);
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
  },[cue,mode,big,min,reduced]);
  return <div ref={pane} className={"mba-pane " + className} data-pane="" tabIndex={0}>
    <div className="mba-align"><div className="mba-sheet" ref={sheet}>{children}</div></div>
  </div>;
}

function Cut({parts,frame,reduced}: {parts:string[]; frame:number; reduced:boolean}) {
  return <Sheet cue={"cut"+frame+parts.join("")} mode="fit" big={46} reduced={reduced} className="mba-cut">
    {parts.map((part,i) => {
      const trimmed=part.trim(), last=words(trimmed).at(-1), split=last?.index ?? 0, cut=i<frame;
      return <Fragment key={i}><span className={i===frame-1?"mba-current-cut":""}>
        {cut?<><Words text={trimmed.slice(0,split)}/><span className="mba-endwrap"><Words text={trimmed.slice(split)}/><span className="mba-return" aria-label="Enter"> ↵</span></span></>:<Words text={trimmed}/>}
      </span>{i<parts.length-1&&(cut?<br/>:" ")}</Fragment>;
    })}
  </Sheet>;
}

type Swap = Analysis["shrink"][number];
function Swaps({source,preview,swaps,frame,reverse,reduced}: {source:string; preview:Preview; swaps:Swap[]; frame:number; reverse:boolean; reduced:boolean}) {
  const idx = Math.floor(frame / 2), after = frame % 2 === 1, done = idx >= swaps.length;
  let end = 0;
  return <Sheet cue={"swap"+reverse+frame+source} mode={done ? "smart" : "follow"} reduced={reduced} big={48} className="mba-swap">
    {done ? <Words text={reverse ? source : preview.shrunk} /> : <>{swaps.map((s,i) => {
      const start = s.startIndex, left = source.slice(end,start), original = source.slice(start,start+s.big.length); end = start+s.big.length;
      const smallNow = reverse ? i>idx || i===idx && !after : i<idx || i===idx && after;
      const active = i===idx;
      return <Fragment key={start}><Words text={left} /><span data-focus={active} data-inplace-swap={active ? after ? "after" : "before" : undefined}
        className={active ? after ? "mba-incoming" : "mba-outgoing" : ""}><Words text={smallNow ? s.small : original} /></span></Fragment>;
    })}<Words text={source.slice(end)} /></>}
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
  const c=a.chunks[frame]; const index=c?.describesIndex;
  const mark: [number,number] | undefined = !fast && c?.describes && index>=0 ? [index,index+c.describes.length] : undefined;
  return <Sheet cue={"minus"+fast+frame+a.original} mode="smart" big={42} min={22} reduced={reduced} className="mba-minus">
    {a.chunks.map((chunk,i)=>{
      const opened=i<=frame;
      const hasOwnLine=opened && i>0;
      return <Fragment key={i}>{hasOwnLine?<br/>:i>0?" ":null}<span
        className={[opened ? tone(chunk) : "mba-upcoming",opened && i===frame ? "mba-active-line":"",opened?"mba-open-line":""].join(" ")}
        style={opened ? {paddingInlineStart:Math.min(chunk.depth,4)*.42+"em"} : undefined} data-focus={i===frame}>
        {opened && chunk.bracket && <b className="mba-bracket">{chunk.bracket}</b>}<Words text={layout.texts[i]} mark={mark} offset={layout.offsets[i]} />
      </span></Fragment>;
    })}
  </Sheet>;
}

function MaskText({text,mask,ghost=false}: {text:string;mask:boolean[];ghost?:boolean}) {
  return <>{words(text).map((m,i)=><Fragment key={i}>{i ? " " : ""}<span data-word="" className={"mba-word "+(mask[i]?"mba-survivor":ghost?"mba-grey":"")}>{m[0]}</span></Fragment>)}</>;
}
function Skeleton({a,layout,original,frame,reduced}: {a:Analysis;layout:Layout;original:boolean;frame:number;reduced:boolean}) {
  const skeleton=original?a.skeleton.original:a.skeleton.text;
  return <div className="mba-spine-panel">
    <Sheet cue={"silhouette"+original+frame+a.original} reduced={reduced} mode="fit" big={frame?30:42} className={frame?"mba-source-ghost":"mba-source-before"}>
      {layout.texts.map((s,i)=><Fragment key={i}>{i?" ":null}<MaskText text={s} mask={layout.masks[i]} ghost /></Fragment>)}
    </Sheet>
    {frame>0 && <div className="mba-center-spine" data-core=""><Sheet cue={"core"+skeleton} reduced={reduced} mode="fit" big={67}>
      <strong className="mba-spine"><Words text={skeleton} /></strong></Sheet></div>}
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
    {frame===0?<strong className="mba-spine"><Words text={skeleton}/></strong>:done?<Words text={original?a.original:a.shrunk}/>:items.map((s,i)=>s&&
      <Fragment key={i}>{i>0 && items.slice(0,i).some(Boolean)?" ":null}<span data-focus={active===i}
        className={!original&&active===i?"mba-added-focus":""}>
        <span className={[expanded.has(i)?tone(a.chunks[i]):"",active===i?"mba-added":""].join(" ")}><Words text={s}/></span>
        {!original&&active===i&&<span className="mba-gloss-under" data-chunk-zh={i} lang="zh-CN">{a.chunks[i].zh}</span>}
      </span></Fragment>) }
  </Sheet>;
}

function Translation({en,zh,frame,reduced}: {en:string;zh:string;frame:number;reduced:boolean}){
  return <div className={"mba-translation "+(frame>0?"mba-translated":"")}>
    <Sheet cue={"translation"+frame+en} mode="fit" big={frame?33:45} reduced={reduced}><Words text={en}/></Sheet>
    {frame>0&&<div className="mba-translation-zh" lang="zh-CN"><span>中文意译</span><Sheet cue={"zh"+zh} mode="smart" big={39} min={24} reduced={reduced}><p>{zh}</p></Sheet></div>}
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
      if(fast)note=c.bracket ? <><b>{c.bracket}</b><span>{t("修饰语","Modifier")}</span></> : <><b>✓</b><span>{t("保留主干","Keep the core")}</span></>;
      else note=c.bracket ? <><b>{c.signal || t("省略关系词","Zero relative")}</b><span>{lang==="zh"?chinese(c.signalWhy):c.signalWhy}</span><span className="mba-note-target">{t("修饰","Describes")} <b>{c.describes}</b></span></> :
        <><b>✓ {t("保留","Keep")}</b><span>{lang==="zh"?chinese(c.role || c.job):c.role || c.job}</span>{c.note&&<span>{lang==="zh"?chinese(c.note):c.note}</span>}</>;
    }
  }
  return <div className="mba-note" data-reading-note="">{note}</div>;
}

function All({a,lang}: {a:Analysis;lang:Lang}) {
  return <div className="mba-static" data-static="">{handout(a,lang).map(section=><section key={section.title}>
    <h3>{section.title}</h3>
    {section.lines&&<pre>{section.lines.join("\n")}</pre>}
    {section.rows?.length&&section.columns?<div className="mba-table-scroll"><table><thead><tr>{section.columns.map(c=><th key={c}>{c}</th>)}</tr></thead><tbody>
      {section.rows.map((row,i)=><tr key={i}>{row.map((cell,j)=><td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>:null}
    {section.paragraphs?.map((p,i)=><p key={i}>{p}</p>)}
  </section>)}</div>;
}
function holdTime(move:Move,frame:number,last:number,fast:boolean,a:Analysis|null,layout:Layout|null) {
  if(fast){
    if(move==="translate")return frame ? 4600:1100;
    if(move==="skeleton")return frame ? 2100:950;
    return frame===last ? 1550 : 780;
  }
  if(move==="swap")return frame===last ? 2600 : frame%2 ? 1650:1050;
  if(move==="restore")return frame===last ? 2100 : frame%2 ? 1000:680;
  if(move==="cut")return frame===0 ? 2200 : frame===last ? 3000:1650;
  if(move==="minus"&&a){
    const c=a.chunks[frame];
    return c ? Math.min(11000,Math.max(3500,2300+(c.text.length+c.signalWhy.length+c.describes.length)*62)) : 3500;
  }
  if(move==="skeleton")return frame ? 5400:2400;
  if(move==="add"){
    const i=layout?.addIndices[frame-1];
    if(a&&i!==undefined)return Math.min(10500,Math.max(3700,2300+a.chunks[i].text.length*56+a.chunks[i].zh.length*125));
    return 3100;
  }
  if(move==="translate")return frame ? Math.min(32000,Math.max(8500,(a?.zh.length || 40)*210)) : 3600;
  return 3200;
}

function Player({data:a,lang,source,previewShrunk}:Props) {
  const t=(zh:string,en:string)=>lang==="zh"?zh:en;
  const [step,setStep]=useState(0),[frame,setFrame]=useState(0),[play,setPlay]=useState(true);
  const [reduced,setReduced]=useState(false),[speed,setSpeed]=useState(1),[review,setReview]=useState(false);
  const [all,setAll]=useState(false),[menu,setMenu]=useState(false),[copied,setCopied]=useState(""),[draft,setDraft]=useState("");
  const original=a?.original || source, preview=a || previewShrunk, item=sequence[step], fast=step>=7, practice=item.move==="practice";
  const parts=useMemo(()=>punctuationParts(original),[original]);
  const swaps=useMemo(()=>[...(preview?.shrink || [])].sort((l,r)=>l.startIndex-r.startIndex),[preview?.shrink]);
  const layout=useMemo(()=>a?chunkLayout(a,fast):null,[a,fast]);
  function lastAt(position:number) {
    switch(sequence[position].move){
      case "cut": return parts.length;
      case "swap": case "restore": return swaps.length*2;
      case "minus": return Math.max(0,(a?.chunks.length || 1)-1);
      case "skeleton": case "translate": return 1;
      case "add": return a ? chunkLayout(a,position>=7).addIndices.length+1 : 1;
      default: return 0;
    }
  }
  const last=lastAt(step),at=Math.min(frame,last),maxStep=a?12:preview?1:0;
  const waiting=!a && (!preview || step>=maxStep && at===last);
  const staticView=!!a?.staticNotice || all;
  const delay=Math.round((holdTime(item.move,at,last,fast,a,layout)+(at===0?950:0))/speed);
  useEffect(()=>{
    const mq=matchMedia("(prefers-reduced-motion: reduce)");
    const sync=()=>{setReduced(mq.matches);if(mq.matches){setPlay(false);setFrame(Infinity);}};
    sync();mq.addEventListener("change",sync);return()=>mq.removeEventListener("change",sync);
  },[]);
  useEffect(()=>{
    if(!play || waiting || practice || staticView || menu)return;
    const id=setTimeout(()=>{
      if(at<last){setFrame(at+1);return;}
      if(review || step>=maxStep){setPlay(false);return;}
      const dest=step+1;setStep(dest);setFrame(reduced?Infinity:0);if(sequence[dest].move==="practice")setPlay(false);
    },delay);
    return()=>clearTimeout(id);
  },[at,last,step,maxStep,play,waiting,practice,staticView,delay,reduced,review,menu]);
  useEffect(()=>{
    if(!copied)return;
    const id=setTimeout(()=>setCopied(""),2500);return()=>clearTimeout(id);
  },[copied]);
  function go(index:number,one=false){
    if(index<0 || index>maxStep)return;
    setStep(index);setFrame(reduced?Infinity:0);setPlay(!reduced && sequence[index].move!=="practice");
    setReview(one);setMenu(false);setAll(false);
  }
  function togglePlay(){
    if(practice){go(0);return;}
    if(!play && at===last && review){setFrame(0);setPlay(true);return;}
    setPlay(!play);
  }
  function cue(d:number){setFrame(Math.max(0,Math.min(last,at+d)));setPlay(false);setMenu(false);}
  async function copy(){
    if(!a)return;
    try { await navigator.clipboard.writeText(markdown(a,lang));setCopied(t("已复制","Copied")); }
    catch { setCopied(t("请选择文本复制","Select text to copy")); }
  }
  const title=item.n===null?item[lang]:item.n+" · "+item[lang];
  return <section className="mba-player" data-testid="lesson" data-pending={!a} aria-label={t("MBA 拆句","MBA lesson")}>
    {staticView&&a ? <div className="mba-static-scroll">
        {a.staticNotice&&<p role="status">{a.staticNotice}</p>}<All a={a} lang={lang}/></div>:
      <div className="mba-stage" data-testid="lesson-stage" data-step={item.n??"original"} data-position={step}
        data-frame={at} data-frame-end={last} data-delay={delay} data-review={review} data-fast={fast && !practice} data-move={item.move}>
        {waiting?<div className="mba-wait" role="status" aria-live="polite" data-testid="lesson-wait">
          <i aria-hidden="true"/><h2>{t("正在分析句子","Analysing the sentence")}</h2>
          <p>{preview?t("正在核对骨架和修饰关系…","Checking the core and its modifiers…"):t("正在识别词汇与句子结构…","Reading the vocabulary and sentence structure…")}</p>
        </div>:<>
          <header key={"heading"+step} className="mba-step-title" aria-live="polite">
            <div className="mba-phase">{item.n===null?t("还原原句","RESTORE"):step>=7 && !practice?t("原句速读","ORIGINAL REPLAY"):practice?t("独立练习","YOUR TURN"):t("逐步拆解","GUIDED READING")}</div>
            <h2><span>{item.n===null?"":String(item.n).padStart(2,"0")}</span>{item[lang]}</h2>
            <div className="mba-progress" aria-hidden="true"><i style={{width:100*(step+(at+1)/(last+1))/sequence.length+"%"}}/></div>
          </header>
          <div className="mba-stage-body" key={"body"+step}>
            {item.move==="cut"&&<Cut parts={parts} frame={at} reduced={reduced}/>}
            {(item.move==="swap"||item.move==="restore")&&preview&&<Swaps source={original} preview={preview} swaps={swaps} frame={at} reverse={item.move==="restore"} reduced={reduced}/>}
            {item.move==="minus"&&a&&layout&&<Minus a={a} layout={layout} frame={at} fast={fast} reduced={reduced}/>}
            {item.move==="skeleton"&&a&&layout&&<Skeleton a={a} layout={layout} original={fast} frame={at} reduced={reduced}/>}
            {item.move==="add"&&a&&layout&&<Add a={a} layout={layout} original={fast} frame={at} reduced={reduced}/>}
            {item.move==="translate"&&a&&<Translation en={fast?a.original:a.shrunk} zh={fast?a.originalZh:a.zh} frame={at} reduced={reduced}/>}
            {practice&&<div className="mba-practice"><Sheet cue={"practice"+original} mode="smart" big={39} reduced={reduced}><Words text={original}/></Sheet>
              <label htmlFor="mba-practice">{t("轮到你了。试着用 MBA 自己拆一遍。","Your turn. Try taking the sentence apart with MBA.")}</label>
              <textarea id="mba-practice" value={draft} onChange={e=>setDraft(e.target.value)} placeholder={t("在这里写下你的切割、骨架和译文…","Write your cuts, skeleton and translation here…")}/></div>}
          </div>
          {!practice&&<ReadingNote lang={lang} step={step} frame={at} a={a} layout={layout} swaps={swaps}/>}
          {!a&&<span className="mba-pending-inline" role="status">{t("其余步骤正在分析…","Analysing the remaining steps…")}</span>}
        </>}
      </div>}
    <footer className="mba-rail" aria-label={t("播放控制","Lesson controls")}>
      {!staticView&&<>
        <div className="mba-transport">
          <button type="button" data-testid="lesson-prev" disabled={!step || waiting} onClick={()=>go(step-1)}>{t("上一步","Back")}</button>
          <button type="button" className="mba-play" data-testid="lesson-play" aria-pressed={play&&!practice} disabled={waiting}
            onClick={togglePlay}>{practice?t("重播","Replay"):play?t("暂停","Pause"):t("播放","Play")}</button>
          <button type="button" data-testid="lesson-next" disabled={step>=maxStep || waiting} onClick={()=>go(step+1)}>{t("下一步","Next")}</button>
        </div>
        <label className="mba-review"><span>{t("复习步骤","Review")}</span>
          <select data-testid="lesson-review" aria-label={t("复习某一步","Review a step")} value={step} disabled={waiting}
            onChange={e=>go(Number(e.target.value),true)}>{sequence.map((s,i)=><option key={i} value={i} disabled={i>maxStep}>
              {s.n===null?s[lang]:s.n+" · "+s[lang]}{i>=7&&i<=11?t("（原句）"," (original)"):""}</option>)}</select>
        </label>
      </>}
      {staticView&&<><button data-testid="lesson-copy" type="button" onClick={copy}>{copied||t("复制文本","Copy text")}</button>
        <button type="button" onClick={()=>window.print()}>{t("打印","Print")}</button>
        {!a?.staticNotice&&<button type="button" data-testid="lesson-all" onClick={()=>setAll(false)}>{t("返回分步","Step view")}</button>}</>}
      {!staticView&&<div className="mba-more">
        <button type="button" className="mba-more-button" data-testid="lesson-more" aria-expanded={menu} aria-label={t("更多播放选项","More playback options")} onClick={()=>setMenu(!menu)}>•••</button>
        {menu&&<div className="mba-popover">
          <label>{t("速度","Speed")} <select aria-label={t("播放速度","Playback speed")} value={speed} onChange={e=>setSpeed(Number(e.target.value))}>{[.75,1,1.5].map(s=><option key={s} value={s}>{s}×</option>)}</select></label>
          <div className="mba-cues"><button type="button" disabled={practice || at===0 || waiting} onClick={()=>cue(-1)}>{t("上一处","Previous cue")}</button>
            <button type="button" disabled={practice || at===last || waiting} onClick={()=>cue(1)}>{t("下一处","Next cue")}</button></div>
          <button type="button" data-testid="lesson-replay" onClick={()=>go(0)}>{t("从头播放","Replay lesson")}</button>
          <button type="button" data-testid="lesson-all" disabled={!a} onClick={()=>{setAll(true);setPlay(false);setMenu(false);}}>{t("展开全文","Show all")}</button>
          <button type="button" data-testid="lesson-copy" disabled={!a} onClick={copy}>{copied||t("复制文本","Copy text")}</button>
        </div>}
      </div>}
    </footer>
    <span className="mba-sr" aria-live="polite">{title}</span>
  </section>;
}
export default function Lesson(props:Props){return <Player key={props.source} {...props}/>;}
