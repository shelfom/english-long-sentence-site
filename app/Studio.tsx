'use client';
import {useEffect,useRef,useState} from 'react';
import type {Analysis} from '../lib/types';
import Lesson from './Lesson';
type Lang='zh'|'en';
type Item={source:string,data:Analysis|null,preview?:Pick<Analysis,'shrink'|'shrunk'>,error?:string};
const repo='https://github.com/shelfom/english-long-sentence-agent';
export default function Studio({examples}:{examples:string[]}){
  const [lang,setLang]=useState<Lang>('zh'),[text,setText]=useState(''),[items,setItems]=useState<Item[]>([]),[index,select]=useState(0),[busy,setBusy]=useState(''),[notice,setNotice]=useState(''),[copied,setCopied]=useState(false);
  const input=useRef<HTMLTextAreaElement>(null),file=useRef<HTMLInputElement>(null),results=useRef<HTMLDivElement>(null),running=useRef(false);
  const en=lang==='en';const t=(zh:string,eng:string)=>en?eng:zh;
  useEffect(()=>{document.documentElement.lang=en?'en':'zh-CN';},[en]);
  async function share(){try{await navigator.clipboard.writeText(location.origin+'/');setCopied(true);setTimeout(()=>setCopied(false),2200);}catch{setNotice(location.origin+'/');}}
  async function start(value:string){
    if(running.current||!value.trim()||value.length>1500)return;running.current=true;setText(value);setBusy('analysis');setNotice('');select(0);setItems([{source:value,data:null}]);
    requestAnimationFrame(()=>results.current?.scrollIntoView({block:'start',behavior:'instant'}));
    try{
      const response=await fetch('/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:value,lang})});
      if(!response.ok)throw Error((await response.json()).error);
      const stream=response.body!.pipeThrough(new TextDecoderStream()).getReader();let buffer='';
      for(;;){const part=await stream.read();if(part.done)break;buffer+=part.value;const lines=buffer.split('\n');buffer=lines.pop()||'';
        for(const line of lines){if(!line)continue;const e=JSON.parse(line);
          if(e.type==='start')setItems(e.sentences.map((source:string)=>({source,data:null})));
          if(['shrink','result','error'].includes(e.type))setItems(old=>old.map((s,i)=>i===e.index?{...s,...(e.type==='result'?{data:e.analysis}:e.type==='shrink'?{preview:e.part}:{error:e.error})}:s));
        }
      }
    }catch(e){setNotice(e instanceof Error?e.message:t('请重试。','Please retry.'));setItems([]);}
    finally{running.current=false;setBusy('');}
  }
  async function photo(img?:File){
    if(!img||running.current)return;if(img.size>8*1024*1024){setNotice(t('照片请小于 8 MB。','Choose a photo under 8 MB.'));return;}
    running.current=true;setBusy('ocr');setNotice('');
    try{
      const res=await fetch('/api/ocr',{method:'POST',headers:{'Content-Type':img.type||'application/octet-stream'},body:img});const json=await res.json();
      if(!res.ok)throw Error(json.error);setText(json.text);setItems([]);setNotice(t('请校对识别出的英文，再开始分析。','Check the extracted English, then start the analysis.'));input.current?.focus();
    }catch(e){setNotice(e instanceof Error?e.message:'OCR failed');}finally{running.current=false;setBusy('');if(file.current)file.current.value='';}
  }
  return <><header className="mast"><div className="mastinner"><a className="brand" href="/" aria-label="MBA home"><b>−</b><b>+</b><strong>MBA</strong></a><span className="publisher">海归湾国际教育</span><div className="nav"><button onClick={()=>setLang(en?'zh':'en')} aria-label="Switch interface language">{en?'中文':'EN'}</button><button onClick={share}>{copied?t('已复制','Copied'):t('复制链接','Copy link')} <span aria-hidden>⧉</span></button></div></div></header>
    <main><section className="intro"><div className="introtext"><p className="method">MBA · Minus Before Add · 先减后加</p><h1>{en?<>English long<br/>sentence analyzer</>:<>英语长难句<br/><em>分析智能体</em></>}</h1><p className="introline">{t('先读主干，再把修饰语一块块加回来。','Find the core sentence. Add each modifier back.')}</p></div>
    <div className="board" aria-label={t('拆句示例','Worked sample')}><div className="boardhead"><span>{t('拆句示例','Worked sample')}</span><span>MBA</span></div><div className="boardlines"><span>The book</span><span className="cut">[ I borrowed</span><span>is here.</span></div><div className="boardfoot"><small>{t('骨架','Skeleton')}</small><mark>The book is here.</mark></div></div></section>
    <section className="editor" aria-label={t('输入英文','English input')}><div className="edithead"><label htmlFor="entry">{t('输入英文','Your English text')}</label><span className={text.length>1500?'over':''}>{text.length.toLocaleString()} / 1,500</span></div>
    <textarea id="entry" ref={input} maxLength={1500} value={text} onChange={e=>setText(e.target.value)} placeholder={t('在这里粘贴一个英文长句，或一段英文…','Paste a long English sentence or paragraph here…')}/>
    <div className="editfoot"><input type="file" hidden ref={file} accept="image/jpeg,image/png,image/heic,image/heif,.heic,.heif" onChange={e=>photo(e.target.files?.[0])}/><button className="photo" disabled={!!busy} onClick={()=>file.current?.click()}><svg aria-hidden viewBox="0 0 24 24"><path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="4"/></svg>{busy==='ocr'?t('识别中…','Reading…'):t('上传照片','Upload photo')}</button><button className="go" disabled={!!busy||!text.trim()||text.length>1500} onClick={()=>start(text)}>{busy==='analysis'?t('分析中…','Analyzing…'):t('开始分析','Analyze text')}</button></div></section>
    <section className="samples"><span>{t('试试例句','Try an example')}</span>{[t('欧洲公共预算','European budgets'),t('冰盖与海岸城市','Ice sheets'),t('祖母的小镇','Grandmother’s town')].map((s,i)=><button key={i} disabled={!!busy} onClick={()=>start(examples[i])}>{s}</button>)}</section>
    {notice&&<p role="status" className="notice">{notice}</p>}<div ref={results} className="results">{items.length>1&&<div className="picker">{items.map((_,i)=><button key={i} aria-pressed={index===i} onClick={()=>select(i)}>{t('句子','Sentence')} {i+1}</button>)}</div>}
    {items[index]&&(items[index].error?<p role="alert" className="notice">{items[index].error}</p>:<Lesson key={index+'-'+items[index].source} data={items[index].data} lang={lang} source={items[index].source} previewShrunk={items[index].preview}/> )}</div></main>
    <footer><strong>海归湾国际教育</strong><span>Method by Turtle Bay International Education, Tianjin, China</span><a href={repo}>GitHub Skill ↗</a></footer></>;
}
