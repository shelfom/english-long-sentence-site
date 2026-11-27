'use client';
import {useEffect,useRef,useState} from 'react';
import type {Analysis} from '../lib/types';
import {enableCues,playCue} from '../lib/lesson-audio';
import {splitText} from '../lib/sentences';
import type {LiveChunk} from '../lib/compact-analysis';
import Lesson from './Lesson';
type Lang='zh'|'en';
type Item={source:string,liveChunks?:LiveChunk[],data:Analysis|null,plain?:{skeleton:string,simple:string[],zh:string},preview?:Pick<Analysis,'shrink'|'shrunk'>,error?:string};
const repo='https://github.com/shelfom/english-long-sentence-agent';
export default function Studio({examples}:{examples:Analysis[]}){
  const [lang,setLang]=useState<Lang>('zh'),[text,setText]=useState(''),[items,setItems]=useState<Item[]>([]),[index,select]=useState(0),[busy,setBusy]=useState(''),[notice,setNotice]=useState(''),[copied,setCopied]=useState(false);
  const input=useRef<HTMLTextAreaElement>(null),file=useRef<HTMLInputElement>(null),request=useRef<AbortController|null>(null),running=useRef(false);
  const [immersive,setImmersive]=useState(false),[showPlain,setShowPlain]=useState(false);
  const completed=useRef(new Map<string,Analysis>());
  const composing=useRef(false),compositionEnded=useRef(-Infinity),shiftEnter=useRef(false);
  useEffect(()=>()=>{enableCues(false);request.current?.abort();},[]);
  useEffect(()=>{
    const change=()=>enableCues(immersive&&!document.hidden);
    document.addEventListener('visibilitychange',change);
    return ()=>document.removeEventListener('visibilitychange',change);
  },[immersive]);
  function confirmingComposition(event:{isComposing?:boolean,keyCode?:number}){
    return composing.current||event.isComposing||event.keyCode===229||performance.now()-compositionEnded.current<60;
  }
  function chooseSentence(n:number){setShowPlain(false);select(n);}
  function leave(){
    request.current?.abort();request.current=null;running.current=false;
    enableCues(false);setImmersive(false);setBusy('');setItems([]);
    requestAnimationFrame(()=>input.current?.focus());
  }
  const en=lang==='en';const t=(zh:string,eng:string)=>en?eng:zh;
  useEffect(()=>{document.documentElement.lang=en?'en':'zh-CN';},[en]);
  async function share(){try{await navigator.clipboard.writeText(location.origin+'/');setCopied(true);setTimeout(()=>setCopied(false),2200);}catch{setNotice(location.origin+'/');}}
  async function start(value:string){
    if(running.current||!value.trim()||value.length>1500)return;running.current=true;setText(value);setBusy('analysis');setNotice('');chooseSentence(0);
    const sentences=splitText(value);
    const known=sentences.map(source=>({source,data:completed.current.get(lang+'\0'+source)??examples.find(x=>x.original===source)??null}));
    const allKnown=known.length>0&&known.every(s=>s.data);
    setItems(allKnown?known:sentences.map(source=>({source,data:null})));
    const active=new AbortController();request.current=active;setImmersive(true);enableCues(!document.hidden);
    try{
      if(allKnown)return;
      const response=await fetch('/api/analyze',{signal:active.signal,method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:value,lang})});
      if(!response.ok)throw Error((await response.json()).error);
      const stream=response.body!.pipeThrough(new TextDecoderStream()).getReader();let buffer='';
      for(;;){const part=await stream.read();if(part.done||active.signal.aborted)break;buffer+=part.value;const lines=buffer.split('\n');buffer=lines.pop()||'';
        for(const line of lines){if(!line)continue;const e=JSON.parse(line);
          if(e.type==='start')setItems(e.sentences.map((source:string)=>({source,data:null})));
          if(e.type==='chunk')setItems(old=>old.map((s,i)=>i===e.index?{...s,liveChunks:[...(s.liveChunks||[]),e.chunk]}:s));
          if(e.type==='result'&&e.analysis&&!e.plain&&e.analysis.original===sentences[e.index]){
            const key=lang+'\0'+sentences[e.index],cache=completed.current;
            cache.delete(key);cache.set(key,e.analysis);
            if(cache.size>12)cache.delete(cache.keys().next().value!);
          }
          if(['shrink','result','error'].includes(e.type))setItems(old=>old.map((s,i)=>i===e.index?{...s,...(e.type==='result'?{data:e.analysis,plain:e.plain}:e.type==='shrink'?{preview:e.part}:{error:e.error})}:s));
        }
      }
      if(!active.signal.aborted)setItems(old=>old.map(item=>item.data||item.plain||item.error?item:{...item,error:t('连接中断，请重试。','The connection was interrupted. Please try again.')}));
    }catch(e){
      if(!active.signal.aborted)setItems(old=>old.map(item=>item.data||item.plain||item.error?item:{...item,error:e instanceof Error?e.message:t('请重试。','Please retry.')}));
    }
    finally{if(request.current===active){running.current=false;setBusy('');}}
  }
  async function photo(img?:File){
    if(!img||running.current)return;if(img.size>8*1024*1024){setNotice(t('照片请小于 8 MB。','Choose a photo under 8 MB.'));return;}
    running.current=true;setBusy('ocr');setNotice('');
    try{
      const res=await fetch('/api/ocr',{method:'POST',headers:{'Content-Type':img.type||'application/octet-stream'},body:img});const json=await res.json();
      if(!res.ok)throw Error(json.error);setText(json.text);setItems([]);setNotice(t('请校对识别出的英文，再开始分析。','Check the extracted English, then start the analysis.'));input.current?.focus();
    }catch(e){setNotice(e instanceof Error?e.message:'OCR failed');}finally{running.current=false;setBusy('');if(file.current)file.current.value='';}
  }
  const current=items[index];
  const hasNext=index+1<items.length;
  function newInput(){setText('');leave();}
  function nextSentence(){chooseSentence(index+1);}
  function nextFromResult(){
    if(hasNext){nextSentence();return;}
    newInput();
  }
  const nextAction=<button type="button" className="result-action" data-testid="result-next" onClick={nextFromResult}>
    {hasNext?t('下一句','Next sentence'):t('分析新句子','Analyze a new sentence')}
  </button>;
  if(immersive)return <main className="teaching-room"><div className="room-bar">
    <button onClick={leave}>{t('返回输入','Back to input')}</button>
    {items.length>1?<label>{t('句子','Sentence')} <select value={index} onChange={e=>chooseSentence(Number(e.target.value))}>{items.map((_,i)=><option key={i} value={i}>{i+1} / {items.length}</option>)}</select></label>:<strong>MBA · 先减后加</strong>}
  </div><div className="room-stage">{current&&(current.plain&&showPlain?<section className="plain-result" aria-labelledby="plain-title">
    <div className="result-scroll"><h1 id="plain-title">{t('骨架与中文','Skeleton and translation')}</h1>
    <h2>{t('原句','Original')}</h2><blockquote className="plain-source" lang="en">{current.source}</blockquote>
    <h2>{t('骨架','Skeleton')}</h2><p className="plain-core" lang="en">{current.plain.skeleton}</p>
    {!!current.plain.simple.length&&<><h2>{t('说简单','Say it simply')}</h2><ol lang="en">{current.plain.simple.map((s,i)=><li key={i}>{s}</li>)}</ol></>}
    <h2>{t('中文意译','Chinese translation')}</h2><p className="plain-zh" lang="zh-CN">{current.plain.zh}</p></div>
    <div className="result-actions">{nextAction}</div>
  </section>:current.error?<section className="result-error">
    <div className="result-scroll"><p role="alert">{current.error}</p></div>
    <div className="result-actions">{!hasNext&&<button type="button" className="retry-action" disabled={!!busy} onClick={()=>start(current.source)}>{t('重试此句','Retry this sentence')}</button>}{nextAction}</div>
  </section>:<Lesson key={index+'-'+current.source} data={current.data} lang={lang} source={current.source} previewShrunk={current.preview} liveChunks={current.liveChunks} onShowPartial={current.plain?()=>setShowPlain(true):undefined} onBackToInput={newInput} onNextSentence={hasNext?nextSentence:undefined} nextSentenceNumber={hasNext?index+2:undefined}/>)}</div></main>;
  return <><header className="mast"><div className="mastinner"><a className="brand" href="/" aria-label="MBA home"><b>−</b><b>+</b><strong>MBA</strong></a><span className="publisher">海归湾国际教育</span><div className="nav"><button onClick={()=>setLang(en?'zh':'en')} aria-label="Switch interface language">{en?'中文':'EN'}</button><button onClick={share}>{copied?t('已复制','Copied'):t('复制链接','Copy link')} <span aria-hidden>⧉</span></button></div></div></header>
    <main><section className="intro"><div className="introtext"><p className="method">MBA · Minus Before Add · 先减后加</p><h1>{en?'English long sentence analyzer':'英语长难句分析智能体'}</h1><p className="introline">{t('先读主干，再把修饰语一块块加回来。','Find the core sentence. Add each modifier back.')}</p></div>
    </section>
    <section className="editor" aria-label={t('输入英文','English input')}><div className="edithead"><label htmlFor="entry">{t('输入英文','Your English text')}</label><span className={text.length>1500?'over':''}>{text.length.toLocaleString()} / 1,500</span></div>
    <textarea id="entry" ref={input} maxLength={1500} value={text} enterKeyHint="go"
      onCompositionStart={()=>{composing.current=true;}}
      onCompositionEnd={()=>{composing.current=false;compositionEnded.current=performance.now();}}
      onKeyDown={e=>{
        if(e.key!=='Enter')return;
        shiftEnter.current=e.shiftKey;
        if(e.shiftKey||confirmingComposition(e.nativeEvent))return;
        e.preventDefault();
        if(!e.repeat)void start(e.currentTarget.value);
      }}
      onKeyUp={e=>{if(e.key==='Enter')shiftEnter.current=false;}}
      onChange={e=>{
        const event=e.nativeEvent as InputEvent;
        const newline=event.inputType==='insertLineBreak'||event.inputType==='insertParagraph';
        // Some phone keyboards deliver only an input event for the Go key.
        if(newline&&!shiftEnter.current&&!confirmingComposition(event)){void start(text);return;}
        setText(e.target.value);shiftEnter.current=false;
        if(event.inputType&&!confirmingComposition(event)&&!document.hidden){
          enableCues(true);playCue(newline?'enter':'key');
        }
      }} placeholder={t('在这里粘贴一个英文长句，或一段英文…','Paste a long English sentence or paragraph here…')}/>
    <div className="editfoot"><input type="file" hidden ref={file} accept="image/jpeg,image/png,image/heic,image/heif,.heic,.heif" onChange={e=>photo(e.target.files?.[0])}/><button className="photo" disabled={!!busy} onClick={()=>file.current?.click()}><svg aria-hidden viewBox="0 0 24 24"><path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="4"/></svg>{busy==='ocr'?t('识别中…','Reading…'):t('上传照片','Upload photo')}</button><button className="go" disabled={!!busy||!text.trim()||text.length>1500} onClick={()=>start(text)}>{busy==='analysis'?t('分析中…','Analyzing…'):t('开始分析','Analyze text')} <kbd aria-hidden="true">Enter ↵</kbd></button></div></section>
    <p className="entry-hint">{t('Enter 开始分析，Shift + Enter 换行。','Press Enter to analyze. Shift + Enter adds a new line.')}</p>
    <section className="samples"><span>{t('试试例句','Try an example')}</span>{[t('欧洲公共预算','European budgets'),t('冰盖与海岸城市','Ice sheets'),t('祖母的小镇','Grandmother’s town')].map((s,i)=><button key={i} disabled={!!busy} onClick={()=>start(examples[i].original)}>{s}</button>)}</section>
    {notice&&<p role="status" className="notice">{notice}</p>}</main>
    <footer className="contacts"><div><strong>海归湾国际教育</strong><span>Method by Turtle Bay International Education, Tianjin, China</span></div><address><a href="tel:4000616820">400-061-6820</a><a href="tel:18612530608">Stephanie · 186 1253 0608</a><a href="tel:13803039029">Maggie · 138 0303 9029</a></address><a href={repo}>GitHub Skill ↗</a></footer></>;
}
