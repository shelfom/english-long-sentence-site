"use client";

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { Analysis } from "../lib/types";
import "./lesson.css";

type Lang = "zh" | "en";
type Chunk = Analysis["chunks"][number];
type Preview = Pick<Analysis, "shrink" | "shrunk">;
type Props = { data: Analysis | null; lang: Lang; source: string; previewShrunk?: Preview | null };
const names = [
  ["原句", "Original"], ["大词换小", "Shrink"], ["先减", "Minus"],
  ["骨架", "Skeleton"], ["后加", "Add"], ["说简单", "Say it simple"],
];
const keyFor = (lang: Lang) => lang === "zh" ? 0 : 1;
const textFor = (lang: Lang, zh: string, en: string) => lang === "zh" ? zh : en;
const words = (s: string) => Array.from(s.matchAll(/\S+/gu));
const formatCount = (value: number, lang: Lang, type: "word" | "stop") => lang === "zh"
  ? value + (type === "word" ? " 词" : " 个句号")
  : value + (type === "word" ? " word" : " full stop") + (value === 1 ? "" : "s");
const rangeHit = (span: readonly number[], index: number, end: number) => index < span[1] && end > span[0];

function Words({ text, base = 0, mark, fadedAfter, className = "" }: {
  text: string; base?: number; mark?: readonly number[]; fadedAfter?: number; className?: string;
}) {
  let prev = 0;
  return <>{words(text).map((match, n) => {
    const index = match.index ?? 0;
    const gap = text.slice(prev, index);
    prev = index + match[0].length;
    const marked = mark && rangeHit(mark, base + index, base + prev);
    return <Fragment key={index}>{gap}<span data-word="" data-mark={marked ? "true" : undefined}
      className={["ls-word", className, marked ? "ls-mark" : "", fadedAfter !== undefined && n > fadedAfter ? "ls-pending-word" : ""].join(" ")}>{match[0]}</span></Fragment>;
  })}</>;
}

function markdown(a: Analysis) {
  const cell = (s: unknown) => String(s ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
  const table = (head: string[], rows: unknown[][]) => [
    "| " + head.join(" | ") + " |", "| " + head.map(() => "---").join(" | ") + " |",
    ...rows.map(row => "| " + row.map(cell).join(" | ") + " |"),
  ].join("\n");
  const line = (c: Chunk) => "  ".repeat(Math.max(0, Math.min(c.depth, 12))) + (c.bracket ?? "") + c.text;
  return [
    "## 1 · 原句 Original", "> " + a.original, a.wordCount + " words · " + formatCount(a.fullStops, "en", "stop"),
    "## 2 · 大词换小 Shrink", table(["big word", "A2 word", "中文"], a.shrink.map(x => [x.big, x.small, x.zh])),
    "**Shrunk:** " + a.shrunk, "## 3 · 先减 Minus", "```\n" + a.chunks.map(line).join("\n") + "\n```",
    table(["#", "line", "signal (why cut here)", "describes", "job"], a.chunks.map((x, i) => [
      i + 1, (x.bracket ?? "") + x.text, [x.signal, x.signalWhy].filter(Boolean).join(" · ") || "none",
      x.describes || "—", [x.job, x.role, x.keep && "✓ keep", x.note].filter(Boolean).join(" · "),
    ])),
    "## 4 · 骨架 Skeleton", "**" + a.skeleton.text + "** (" + formatCount(a.skeleton.words, "en", "word") + ")",
    "Original: **" + a.skeleton.original + "**",
    table(a.skeleton.table.map(x => x.q), [a.skeleton.table.map(x => [x.a, x.term].filter(Boolean).join(" · "))]),
    "## 5 · 后加 Add", a.add.map(x => {
      const c = a.chunks[x.chunkIndex];
      return "+ " + (c?.bracket ?? "") + (c?.text ?? "") + " → describes **" + x.describes + "** → " + x.question;
    }).join("\n"), "Every piece has its home.", "## 6 · 说简单 Say it simple",
    a.simple.map((s, i) => (i + 1) + ". " + s).join("\n"), "**中文意译**", a.zh, a.context,
    "MBA · Minus Before Add — 海归湾国际教育 Turtle Bay International Education",
  ].filter(Boolean).join("\n\n");
}

function Original({ source, data, frame, lang }: { source: string; data: Analysis | null; frame: number; lang: Lang }) {
  const tokens = useMemo(() => words(source), [source]);
  const finished = frame >= tokens.length - 1;
  const shown = tokens.slice(0, frame + 1).map(m => m[0]).join(" ");
  return <>
    <div className="ls-meta">{formatCount(finished && data ? data.wordCount : Math.min(frame + 1, tokens.length), lang, "word")}
      <i> / </i>{formatCount(finished && data ? data.fullStops : (shown.match(/\./g) ?? []).length, lang, "stop")}</div>
    <p className="ls-text ls-original" aria-label={source}><Words text={source} fadedAfter={frame} /></p>
  </>;
}

function Shrink({ model, source, frame, lang, staticView = false }: { model: Preview; source: string; frame: number; lang: Lang; staticView?: boolean }) {
  const swaps = useMemo(() => [...model.shrink].sort((a, b) => a.startIndex - b.startIndex), [model.shrink]);
  const active = swaps[frame];
  const complete = !active || staticView;
  let pos = 0;
  let rendered = "";
  const ranges: number[][] = [];
  for (const [i, swap] of swaps.entries()) {
    rendered += source.slice(pos, swap.startIndex);
    const start = rendered.length;
    const word = i < frame || complete ? swap.small : source.slice(swap.startIndex, swap.startIndex + swap.big.length);
    rendered += word;
    if (complete || i === frame) ranges.push([start, rendered.length]);
    pos = swap.startIndex + swap.big.length;
  }
  rendered += source.slice(pos);
  // Use the validated sentence for display; only colour replacements located in that exact output.
  if (complete && rendered !== model.shrunk) {
    ranges.length = 0;
    let after = 0;
    for (const swap of swaps) {
      const i = model.shrunk.toLowerCase().indexOf(swap.small.toLowerCase(), after);
      if (i >= 0) { ranges.push([i, i + swap.small.length]); after = i + swap.small.length; }
    }
    rendered = model.shrunk;
  }
  const showRows = staticView || complete;
  let last = 0;
  return <>
    {!complete && <div className="ls-swap-focus" key={frame}>
      <span className="ls-swap-small"><Words text={active.small} /></span>
      <s className="ls-swap-big"><Words text={active.big} /></s>
      <span className="ls-gloss">{active.zh}</span>
    </div>}
    <p className="ls-text">{words(rendered).map(m => {
      const i = m.index ?? 0, end = i + m[0].length, gap = rendered.slice(last, i);
      last = end;
      const hit = ranges.some(r => rangeHit(r, i, end));
      return <Fragment key={i}>{gap}<span data-word="" className={"ls-word " + (hit ? complete ? "ls-blue" : "ls-strike" : "")}>{m[0]}</span></Fragment>;
    })}</p>
    {showRows && (swaps.length > 0 ? <ul className="ls-dictionary">{swaps.map(x => <li key={x.startIndex}>
      <s><Words text={x.big} /></s><b><Words text={x.small} /></b><span>{x.zh}</span></li>)}</ul>
      : <p>{textFor(lang, "这些词已经够简单。", "The words are already simple.")}</p>)}
  </>;
}

function ChunkInfo({ c, lang }: { c: Chunk; lang: Lang }) {
  const t = (zh: string, en: string) => textFor(lang, zh, en);
  const rows = c.bracket ? [
    [t("信号", "Signal"), c.signal || t("省略关系词", "Zero relative")],
    [t("为什么在这里切", "Why cut here"), c.signalWhy],
    [t("括号", "Bracket"), c.bracket === "(" ? t("( 短语", "( phrase") : t("[ 从句", "[ clause")],
    [t("修饰谁", "Describes"), c.describes], [t("回答什么问题", "Job"), c.job],
  ] : [[t("保留", "Keep"), "✓ " + (c.role || t("从句主干", "Inner skeleton"))], [t("原因", "Reason"), c.signalWhy || c.job]];
  return <div className={"ls-info ls-" + c.kind}><dl>{rows.filter(r => r[1]).map(([k, v]) =>
    <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>{c.note && <p>{c.note}</p>}</div>;
}

function chunkOffsets(a: Analysis) {
  let from = 0;
  return a.chunks.map(c => {
    const found = a.shrunk.indexOf(c.text, from);
    const start = found < 0 ? from : found;
    from = start + c.text.length;
    return start;
  });
}

function ChunkBoard({ a, frame, mode, lang, onSelect, reduced }: {
  a: Analysis; frame: number; mode: "minus" | "add"; lang: Lang; onSelect: (index: number) => void; reduced: boolean;
}) {
  const adding = mode === "add";
  const entry = adding ? a.add[Math.min(frame, a.add.length - 1)] : null;
  const current = adding ? (entry?.chunkIndex ?? -1) : Math.min(frame, a.chunks.length - 1);
  const c = a.chunks[current];
  const revealed = new Set(a.add.slice(0, frame + 1).map(x => x.chunkIndex));
  const visible = (index: number) => !adding ? index <= current : !a.chunks[index].bracket || revealed.has(index) || frame >= a.add.length;
  const root = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [path, setPath] = useState("");
  const offsets = useMemo(() => chunkOffsets(a), [a]);
  const describes = entry?.describes || c?.describes;
  const index = describes && c?.describes === describes ? c.describesIndex : describes ? a.shrunk.indexOf(describes) : -1;
  const mark = index != null && index >= 0 && describes ? [index, index + describes.length] : undefined;
  useLayoutEffect(() => {
    const board = root.current, viewport = scroller.current;
    if (!board || !viewport) return;
    const line = board.querySelector<HTMLElement>("[data-active=true]");
    if (line) {
      const delta = line.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
      if (delta < 0 || delta + Math.min(line.offsetHeight, 100) > viewport.clientHeight * .80) {
        viewport.scrollTo({ top: Math.max(0, viewport.scrollTop + delta - viewport.clientHeight * .34), behavior: reduced ? "instant" : "smooth" });
      }
    }
    const update = () => {
      const bracket = line?.querySelector(".ls-bracket") ?? line;
      const target = board.querySelector<HTMLElement>("[data-mark=true]");
      if (!target || !bracket || !line) { setPath(""); return; }
      const box = board.getBoundingClientRect(), from = bracket.getBoundingClientRect(), to = target.getBoundingClientRect();
      const gutter = 4;
      const x1 = from.left - box.left, y1 = from.top - box.top + Math.min(from.height * .58, 26);
      const x2 = to.left - box.left + 2, y2 = to.bottom - box.top + 2;
      // Route into the left margin, ending under the marked word.
      setPath("M " + x1 + " " + y1 + " H " + gutter + " V " + y2 + " H " + x2);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(board);
    if (line) observer.observe(line);
    let mounted = true;
    document.fonts.ready.then(() => { if (mounted) update(); });
    return () => { mounted = false; observer.disconnect(); };
  }, [a, current, frame, reduced]);
  return <div className="ls-cut-grid">
    <div className="ls-scroll" ref={scroller} role="region" tabIndex={0} aria-label={textFor(lang, "句子分块", "Sentence chunks")}>
      <div className="ls-chunk-board" ref={root}>
        <svg className={"ls-wire ls-" + (c?.kind || "skeleton")} aria-hidden="true"><path d={path} /></svg>
        {a.chunks.map((ch, i) => visible(i) && <button type="button" key={i} className={"ls-chunk-line ls-" + ch.kind}
          data-active={current === i} data-chunk={i} aria-pressed={current === i}
          disabled={adding && !a.add.some(x => x.chunkIndex === i)}
          style={{"--ls-depth": Math.min(Math.max(ch.depth, 0), 4)} as CSSProperties}
          onClick={() => { const p = adding ? a.add.findIndex(x => x.chunkIndex === i) : i; if (p >= 0) onSelect(p); }}>
          {ch.bracket && <span className="ls-bracket" aria-hidden="true">{ch.bracket}</span>}<Words text={ch.text} base={offsets[i]} mark={mark} />
        </button>)}
        {!adding && current >= 0 && current + 1 < a.chunks.length && <div className="ls-remainder">
          <Words text={a.shrunk.slice(offsets[current + 1])} base={offsets[current + 1]} mark={mark} /></div>}
      </div>
    </div>
    {c && <aside className="ls-aside" key={mode + current}>
      <div className="ls-aside-head">{adding ? <span>＋</span> : <kbd>Enter ↵</kbd>}
        <span>{adding ? Math.min(frame + 1, a.add.length) : current + 1} / {adding ? a.add.length : a.chunks.length}</span></div>
      {adding && entry ? <div className={"ls-info ls-" + c.kind}><dl>
        <div><dt>{textFor(lang, "加回", "Add back")}</dt><dd>{c.text}</dd></div>
        <div><dt>{textFor(lang, "修饰谁", "Describes")}</dt><dd>{entry.describes}</dd></div>
        <div><dt>{textFor(lang, "回答什么问题", "Question")}</dt><dd>{entry.question}</dd></div>
      </dl></div> : <ChunkInfo c={c} lang={lang} />}
    </aside>}
    {adding && frame >= a.add.length && <p className="ls-endnote">Every piece has its home.</p>}
  </div>;
}

function Skeleton({ a, frame, lang }: { a: Analysis; frame: number; lang: Lang }) {
  return <>
    {frame === 0 && <p className="ls-silhouette ls-text">{a.chunks.map((c, i) =>
      <Fragment key={i}>{i ? " " : ""}<Words text={c.text} className={c.kind === "skeleton" ? "" : "ls-faded"} /></Fragment>)}</p>}
    {frame >= 1 && <><div className="ls-meta">{formatCount(a.skeleton.words, lang, "word")}</div>
      <p className="ls-text ls-spine"><Words text={a.skeleton.text} /></p>
      {a.skeleton.original !== a.skeleton.text && <p className="ls-comparison"><small>{textFor(lang, "原句骨架", "Original skeleton")}</small><Words text={a.skeleton.original} /></p>}</>}
    {frame >= 2 && <dl className="ls-roles">{a.skeleton.table.map((r, i) => <div key={i}>
      <dt>{r.q}</dt><dd><Words text={r.a} /></dd>{r.term && <small>{r.term}</small>}</div>)}</dl>}
  </>;
}

function Simple({ a, frame, lang }: { a: Analysis; frame: number; lang: Lang }) {
  return <><ol className="ls-simple">{a.simple.slice(0, frame + 1).map((line, i) => <li key={i}>
    <span className="ls-order">{String(i + 1).padStart(2, "0")}</span><p className="ls-text"><Words text={line} /></p></li>)}</ol>
    {frame >= a.simple.length && <div className="ls-translation"><h4>{textFor(lang, "中文意译", "Chinese translation")}</h4><p lang="zh-CN">{a.zh}</p></div>}
    {a.context && frame > a.simple.length && <p className="ls-context">{a.context}</p>}
  </>;
}

function All({ a, lang }: { a: Analysis; lang: Lang }) {
  const content = [
    <Original source={a.original} data={a} frame={Infinity} lang={lang} key="original" />,
    <Shrink model={a} source={a.original} frame={Infinity} lang={lang} staticView key="shrink" />,
    <div className="ls-static-cuts" key="minus">{a.chunks.map((c, i) => <article key={i} className={"ls-" + c.kind}>
      <p className="ls-text">{c.bracket}<Words text={c.text} /></p><ChunkInfo c={c} lang={lang} /></article>)}</div>,
    <Skeleton a={a} frame={2} lang={lang} key="skeleton" />,
    <div className="ls-static-add" key="add">{a.add.map((e, i) => <div key={i}>
      <p className="ls-text"><Words text={a.chunks[e.chunkIndex]?.text || ""} /></p>
      <span>→ <b>{e.describes}</b> → {e.question}</span></div>)}<p>Every piece has its home.</p></div>,
    <Simple a={a} frame={Infinity} lang={lang} key="simple" />,
  ];
  return <div className="ls-all">{content.map((section, i) => <section key={i}><h3>{i + 1} · {names[i][0]} <span>{names[i][1]}</span></h3>{section}</section>)}</div>;
}

function Player({ data: a, lang, source, previewShrunk }: Props) {
  const t = (zh: string, en: string) => textFor(lang, zh, en);
  const [step, setStep] = useState(0), [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(true), [reduced, setReduced] = useState(false);
  const [speed, setSpeed] = useState(1), [all, setAll] = useState(false), [sound, setSound] = useState(false);
  const [copyState, setCopyState] = useState<"ready" | "copied" | "failed">("ready");
  const audio = useRef<AudioContext | null>(null);
  const original = a?.original || source;
  const preview = a || previewShrunk;
  const staticOnly = Boolean(a?.staticNotice);
  const short = a && a.wordCount < 12 && a.chunks.every(c => !c.bracket);
  const available = a ? 5 : preview ? 1 : 0;
  const ends = [
    Math.max(0, words(original).length - 1), preview?.shrink.length || 0,
    Math.max(0, (a?.chunks.length || 1) - 1), 2, a?.add.length || 0, (a?.simple.length || 0) + (a?.context ? 1 : 0),
  ];
  const last = ends[step], at = Math.min(frame, last), isAll = all || staticOnly;
  const complete = step === 5 && at >= last;
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => { setReduced(query.matches); if (query.matches) { setPlaying(false); setFrame(Infinity); } };
    sync(); query.addEventListener("change", sync);
    return () => { query.removeEventListener("change", sync); void audio.current?.close(); };
  }, []);
  useEffect(() => {
    if (copyState === "ready") return;
    const id = window.setTimeout(() => setCopyState("ready"), 2400);
    return () => clearTimeout(id);
  }, [copyState]);
  useEffect(() => {
    if (!playing || isAll || short) return;
    if (at >= last && step === available && !complete) return;
    const base = at >= last ? 1800 : [65, 1250, 2250, 920, 1700, 1000][step];
    const id = window.setTimeout(() => {
      if (at < last) { setFrame(at + 1); return; }
      if (complete) { setPlaying(false); return; }
      setStep(step + 1); setFrame(reduced ? Infinity : 0);
    }, base / speed);
    return () => clearTimeout(id);
  }, [playing, isAll, short, at, step, last, available, complete, speed, reduced]);
  useEffect(() => {
    const ctx = audio.current;
    if (!sound || !playing || reduced || isAll || !ctx || ctx.state !== "running" || step < 1 || step > 4) return;
    const tone = ctx.createOscillator(), gain = ctx.createGain();
    tone.type = "sine"; tone.frequency.value = step === 2 ? 320 : 540;
    gain.gain.setValueAtTime(.022, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + .045);
    tone.connect(gain); gain.connect(ctx.destination); tone.start(); tone.stop(ctx.currentTime + .05);
  }, [step, at, playing, sound, reduced, isAll]);
  function go(i: number) {
    setPlaying(false); setAll(false); setStep(i); setFrame(Infinity);
  }
  function replay() {
    setAll(false); setStep(0); setFrame(reduced ? Infinity : 0); setPlaying(!reduced);
  }
  async function copy() {
    if (!a) return;
    try { await navigator.clipboard.writeText(markdown(a)); setCopyState("copied"); }
    catch { setCopyState("failed"); }
  }
  async function toggleSound() {
    if (!sound) {
      try { audio.current ??= new AudioContext(); await audio.current.resume(); }
      catch { return; }
    }
    setSound(!sound);
  }
  if (short && !staticOnly) return <section className="ls-player ls-short" data-testid="lesson">
    <div className="ls-meta">{t("已是主干，无需拆分", "Already a skeleton, nothing to cut")}</div>
    <p className="ls-text"><Words text={original} /></p><p className="ls-short-zh" lang="zh-CN">{a.zh}</p>
    <button type="button" onClick={copy} data-testid="lesson-copy">{copyState === "copied" ? t("已复制", "Copied") : copyState === "failed" ? t("复制失败，请手动选择文本", "Copy failed. Select the text manually.") : t("复制为文本", "Copy as text")}</button>
  </section>;
  return <section className="ls-player" data-testid="lesson" aria-label={t("六步拆句", "Six-step lesson")}>
    {!staticOnly && <nav className="ls-steps" aria-label={t("教学步骤", "Lesson steps")}>{names.map((pair, i) =>
      <button type="button" key={i} disabled={i > available} aria-current={!isAll && step === i ? "step" : undefined}
        data-stage={i + 1} onClick={() => go(i)}><span>{String(i + 1).padStart(2, "0")}</span>{pair[keyFor(lang)]}</button>)}</nav>}
    <div className="ls-tools">
      {!isAll && <div className="ls-controls">
        <button type="button" data-testid="lesson-prev" disabled={step === 0} onClick={() => go(step - 1)}>{t("上一步", "Back")}</button>
        <button type="button" data-testid="lesson-play" className="ls-play" aria-pressed={playing} onClick={() => {
          if (complete) replay(); else setPlaying(!playing);
        }}>{playing ? t("暂停", "Pause") : complete ? t("重播", "Replay") : t("播放", "Play")}</button>
        <button type="button" data-testid="lesson-next" disabled={step >= available} onClick={() => go(step + 1)}>{t("下一步", "Next")}</button>
        <select aria-label={t("播放速度", "Playback speed")} value={speed} onChange={e => setSpeed(Number(e.target.value))}>
          {[.75, 1, 1.5].map(s => <option key={s} value={s}>{s}×</option>)}</select>
      </div>}
      <div className="ls-actions">
        {!staticOnly && <button type="button" disabled={!a} data-testid="lesson-all" aria-pressed={isAll}
          onClick={() => { setAll(!isAll); setPlaying(false); }}>{isAll ? t("返回分步", "Step view") : t("展开全文", "Show all")}</button>}
        <button type="button" disabled={!a} data-testid="lesson-copy" onClick={copy}>{copyState === "copied" ? t("已复制", "Copied") : copyState === "failed" ? t("请手动选择文本", "Select text to copy") : t("复制为文本", "Copy as text")}</button>
        {isAll ? <button type="button" onClick={() => window.print()}>{t("打印", "Print")}</button>
          : <><button type="button" data-testid="lesson-replay" onClick={replay}>{t("重播", "Replay")}</button>
            <button type="button" aria-pressed={sound} onClick={toggleSound}>{sound ? t("音效开", "Sound on") : t("音效关", "Sound off")}</button></>}
      </div>
    </div>
    {isAll && a ? <>{staticOnly && <p className="ls-notice" role="status">{t("部分结构还需核对，以下保留为静态参考。", "Some structure needs a second look. Read this as a static reference.")}</p>}
      <All a={a} lang={lang} /></> :
      <div className="ls-stage" data-testid="lesson-stage" data-step={step + 1} data-frame={at} data-frame-end={last}>
        <header className="ls-stage-heading"><span>{String(step + 1).padStart(2, "0")} / 06</span>
          <h3>{names[step][keyFor(lang)]}</h3><small>{names[step][1 - keyFor(lang)]}</small></header>
        {step === 0 && <Original source={original} data={a} frame={at} lang={lang} />}
        {step === 1 && preview && <Shrink source={original} model={preview} frame={at} lang={lang} />}
        {a && (step === 2 || step === 4) && <ChunkBoard a={a} frame={at} mode={step === 2 ? "minus" : "add"} lang={lang}
          reduced={reduced} onSelect={i => { setPlaying(false); setFrame(i); }} />}
        {a && step === 3 && <Skeleton a={a} frame={at} lang={lang} />}
        {a && step === 5 && <Simple a={a} frame={at} lang={lang} />}
        {!a && step === available && at >= last && <p className="ls-wait" role="status">{t("正在解析句子…", "Analysing the sentence…")}</p>}
      </div>}
  </section>;
}

export default function Lesson(props: Props) {
  return <Player key={props.source} {...props} />;
}
