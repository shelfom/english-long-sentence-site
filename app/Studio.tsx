'use client';
import {useEffect,useRef,useState} from 'react';
import type {Analysis} from '../lib/types';
import {enableCues} from '../lib/lesson-audio';
import {splitText} from '../lib/sentences';
import type {LiveChunk} from '../lib/compact-analysis';
import Lesson from './Lesson';
type Lang='zh'|'en';
type Item={source:string,liveChunks?:LiveChunk[],data:Analysis|null,plain?:{skeleton:string,simple:string[],zh:string},preview?:Pick<Analysis,'shrink'|'shrunk'>,error?:string};
const repo='https://github.com/shelfom/english-long-sentence-agent';
export default function Studio({examples}:{examples:Analysis[]}){
  const [lang,setLang]=useState<Lang>('zh'),[text,setText]=useState(''),[items,setItems]=useState<Item[]>([]),[index,select]=useState(0),[busy,setBusy]=useState(''),[notice,setNotice]=useState(''),[copied,setCopied]=useState(false);
  const input=useRef<HTMLTextAreaElement>(null),file=useRef<HTMLInputElement>(null),request=useRef<AbortController|null>(null),running=useRef(false);
  const [immersive,setImmersive]=useState(false),[music,setMusic]=useState(true);
  const track=useRef<HTMLAudioElement|null>(null);
  useEffect(()=>{
    try{setMusic(localStorage.getItem('mba-music')!=='off');}catch{}
    return ()=>{track.current?.pause();enableCues(false);request.current?.abort();};
  },[]);
  function startMusic(){
    enableCues(true);
    const audio=track.current??(track.current=new Audio('/audio/mba-breakbeat.mp3'));
    audio.loop=true;audio.volume=.66;
    void audio.play().catch(()=>{});
  }
  function toggleMusic(){
    const next=!music;setMusic(next);
    try{localStorage.setItem('mba-music',next?'on':'off');}catch{}
    if(next&&immersive)startMusic();else {track.current?.pause();enableCues(false);}
  }
  useEffect(()=>{
    const change=()=>{if(document.hidden){track.current?.pause();enableCues(false);}else if(immersive&&music)startMusic();};
    document.addEventListener('visibilitychange',change);return ()=>document.removeEventListener('visibilitychange',change);
  },[immersive,music]);
  function leave(){
    request.current?.abort();request.current=null;running.current=false;
    track.current?.pause();enableCues(false);setImmersive(false);setBusy('');setItems([]);
    requestAnimationFrame(()=>input.current?.focus());
  }
  const en=lang==='en';const t=(zh:string,eng:string)=>en?eng:zh;
  useEffect(()=>{document.documentElement.lang=en?'en':'zh-CN';},[en]);
  async function share(){try{await navigator.clipboard.writeText(location.origin+'/');setCopied(true);setTimeout(()=>setCopied(false),2200);}catch{setNotice(location.origin+'/');}}
  async function start(value:string){
    if(running.current||!value.trim()||value.length>1500)return;running.current=true;setText(value);setBusy('analysis');setNotice('');select(0);setItems(splitText(value).map(source=>({source,data:null})));
    const active=new AbortController();request.current=active;setImmersive(true);if(music)startMusic();
    try{
      const worked=examples.find(x=>x.original===value.trim());
      if(worked){setItems([{source:worked.original,data:worked}]);return;}
      const response=await fetch('/api/analyze',{signal:active.signal,method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:value,lang})});
      if(!response.ok)throw Error((await response.json()).error);
      const stream=response.body!.pipeThrough(new TextDecoderStream()).getReader();let buffer='';
      for(;;){const part=await stream.read();if(part.done||active.signal.aborted)break;buffer+=part.value;const lines=buffer.split('\n');buffer=lines.pop()||'';
        for(const line of lines){if(!line)continue;const e=JSON.parse(line);
          if(e.type==='start')setItems(e.sentences.map((source:string)=>({source,data:null})));
          if(e.type==='chunk')setItems(old=>old.map((s,i)=>i===e.index?{...s,liveChunks:[...(s.liveChunks||[]),e.chunk]}:s));
          if(['shrink','result','error'].includes(e.type))setItems(old=>old.map((s,i)=>i===e.index?{...s,...(e.type==='result'?{data:e.analysis,plain:e.plain}:e.type==='shrink'?{preview:e.part}:{error:e.error})}:s));
        }
      }
      if(!active.signal.aborted)setItems(old=>old.map(item=>item.data||item.plain||item.error?item:{...item,error:t('连接中断，请返回输入并重试。','Connection interrupted. Return to the input and try again.')}));
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
  const musicButton=<button type="button" onClick={toggleMusic} aria-pressed={music} data-testid="music-toggle" aria-label={t('配乐与音效','Music and sound effects')}><span aria-hidden="true">♫ </span>{music?t('声音开','Sound on'):t('声音关','Sound off')}</button>;
  if(immersive)return <main className="teaching-room"><div className="room-bar">
    <button onClick={leave}>{t('返回输入','Back to input')}</button>
    {items.length>1?<label>{t('句子','Sentence')} <select value={index} onChange={e=>select(Number(e.target.value))}>{items.map((_,i)=><option key={i} value={i}>{i+1} / {items.length}</option>)}</select></label>:<strong>MBA · 先减后加</strong>}
    {musicButton}</div><div className="room-stage">{items[index]?.plain?<section className="plain-result"><p className="notice">{t('部分讲解未通过校验。以下是可读取的内容，可重新分析。','Some details could not be checked. You can read the available text or try again.')}</p><blockquote>{items[index].source}</blockquote><h2>{t('骨架','Skeleton')}</h2><p>{items[index].plain?.skeleton}</p><ol>{items[index].plain?.simple.map((s,i)=><li key={i}>{s}</li>)}</ol><p>{items[index].plain?.zh}</p></section>:items[index]&&(items[index].error?<p role="alert" className="notice">{items[index].error}</p>:<Lesson key={index+'-'+items[index].source} data={items[index].data} lang={lang} source={items[index].source} previewShrunk={items[index].preview} liveChunks={items[index].liveChunks}/> )}</div></main>;
  return <><header className="mast"><div className="mastinner"><a className="brand" href="/" aria-label="MBA home"><b>−</b><b>+</b><strong>MBA</strong></a><span className="publisher">海归湾国际教育</span><div className="nav">{musicButton}<button onClick={()=>setLang(en?'zh':'en')} aria-label="Switch interface language">{en?'中文':'EN'}</button><button onClick={share}>{copied?t('已复制','Copied'):t('复制链接','Copy link')} <span aria-hidden>⧉</span></button></div></div></header>
    <main><section className="intro"><div className="introtext"><p className="method">MBA · Minus Before Add · 先减后加</p><h1>{en?'English long sentence analyzer':'英语长难句分析智能体'}</h1><p className="introline">{t('先读主干，再把修饰语一块块加回来。','Find the core sentence. Add each modifier back.')}</p></div>
    </section>
    <section className="editor" aria-label={t('输入英文','English input')}><div className="edithead"><label htmlFor="entry">{t('输入英文','Your English text')}</label><span className={text.length>1500?'over':''}>{text.length.toLocaleString()} / 1,500</span></div>
    <textarea id="entry" ref={input} maxLength={1500} value={text} onChange={e=>setText(e.target.value)} placeholder={t('在这里粘贴一个英文长句，或一段英文…','Paste a long English sentence or paragraph here…')}/>
    <div className="editfoot"><input type="file" hidden ref={file} accept="image/jpeg,image/png,image/heic,image/heif,.heic,.heif" onChange={e=>photo(e.target.files?.[0])}/><button className="photo" disabled={!!busy} onClick={()=>file.current?.click()}><svg aria-hidden viewBox="0 0 24 24"><path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="4"/></svg>{busy==='ocr'?t('识别中…','Reading…'):t('上传照片','Upload photo')}</button><button className="go" disabled={!!busy||!text.trim()||text.length>1500} onClick={()=>start(text)}>{busy==='analysis'?t('分析中…','Analyzing…'):t('开始分析','Analyze text')}</button></div></section>
    <section className="samples"><span>{t('试试例句','Try an example')}</span>{[t('欧洲公共预算','European budgets'),t('冰盖与海岸城市','Ice sheets'),t('祖母的小镇','Grandmother’s town')].map((s,i)=><button key={i} disabled={!!busy} onClick={()=>start(examples[i].original)}>{s}</button>)}</section>
    {notice&&<p role="status" className="notice">{notice}</p>}</main>
    <footer className="contacts"><div><strong>海归湾国际教育</strong><span>Method by Turtle Bay International Education, Tianjin, China</span></div><address><a href="tel:4000616820">400-061-6820</a><a href="tel:18612530608">Stephanie · 186 1253 0608</a><a href="tel:13803039029">Maggie · 138 0303 9029</a></address><a href={repo}>GitHub Skill ↗</a></footer></>;
}
