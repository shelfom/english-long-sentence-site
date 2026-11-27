import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {parseLoose,rebuild,Issues,Glossless} from '../lib/repair.ts';
import {simpler,level} from '../lib/easy-words.ts';
import {generate,read,type Follow} from '../lib/generate.ts';
import {expandAnalysis,streamRows,type LiveChunk} from '../lib/compact-analysis.ts';
import {validate} from '../lib/validate.ts';

// Real answers from the live model for hard sentences. Each was rejected, or in one case accepted, before the repair step existed.
// `exact` is `hardReplacement` without its one replacement that is no easier than the original.
const recorded:Record<string,{source:string,answer:string}>=JSON.parse(readFileSync(new URL('./fixtures/model-answers.json',import.meta.url),'utf8'));
const lesson=(name:string)=>read(recorded[name].source,parseLoose(recorded[name].answer));
const outline=(name:string)=>lesson(name).analysis.chunks.map(c=>'  '.repeat(c.depth)+(c.bracket||'·')+' '+c.text);
const strictly=(name:string)=>validate(expandAnalysis(recorded[name].source,JSON.parse(recorded[name].answer)),recorded[name].source);

test('every recorded answer becomes a whole lesson whose rows spell both wordings of the sentence',()=>{
  for(const [name,{source}] of Object.entries(recorded)){
    const {analysis:a,repaired}=lesson(name);
    assert.equal(repaired,name!=='exact',name);
    assert.equal(a.chunks.map(c=>c.originalText).join(' ').replace(/\s+/g,' '),source,name);
    assert.equal(a.chunks.map(c=>c.text).join(' ').replace(/\s+/g,' '),a.shrunk,name);
    assert.ok(a.chunks.every(c=>!/^[(\[]\s|\s[)\]]$/.test(c.text)),name+': no teaching bracket inside a slice');
    assert.ok(a.chunks.every(c=>/\p{Script=Han}/u.test(c.zh)),name);
    for(const c of a.chunks)if(c.bracket&&!c.clauseLevel)assert.equal(a.shrunk.slice(c.describesIndex,c.describesIndex+c.describes.length),c.describes,name);
  }
});

test('an answer that was already exact is used exactly as given, and rebuilding it changes nothing',()=>{
  const {source,answer}=recorded.exact,strict=strictly('exact');
  assert.deepEqual(lesson('exact').analysis,strict);
  assert.throws(()=>strictly('innerAtZero'));
  const rebuilt=validate(rebuild(source,JSON.parse(answer)),source);
  assert.deepEqual(rebuilt.chunks,strict.chunks);
  assert.deepEqual(rebuilt.skeleton,strict.skeleton);
  assert.deepEqual(rebuilt.shrink,strict.shrink);
});

test('an object clause labelled as an inner skeleton on the main line is main skeleton, and the core follows each wording',()=>{
  const {analysis:a}=lesson('innerAtZero');
  assert.deepEqual(outline('innerAtZero'),[
    '· The committee,','  [ which had been set up','    ( after the scandal','    ( by government officials','      ( anxious to calm down an angry public,',
    '· concluded','· that the rules','  ( controlling the industry,','  ( written decades earlier,','· were too loose to stop firms','  [ that put profit before safety.']);
  assert.equal(a.skeleton.text,'The committee concluded that the rules were too loose to stop firms.');
  assert.equal(a.skeleton.original,'The committee concluded that the rules were too lax to deter firms.');
});

test('rows quoted in the original wording, with brackets typed into them, are carried over to the simpler sentence',()=>{
  const {analysis:a}=lesson('originalWording');
  assert.equal(a.chunks[0].text,'Faced with dwindling reserves and a population unwilling to accept limited supply,');
  assert.equal(a.chunks[0].originalText,'Faced with dwindling reserves and a population unwilling to accept rationing,');
  // The answer named the head by a replacement that is not shown; the original words stand there.
  assert.equal(a.chunks[3].describes,'desalination plants');
  assert.equal(a.skeleton.text,'The government turned to desalination plants to supply the water.');
});

test('a bracket on a row of its own opens the next row; a modifier of a whole clause needs no head word; a replacement takes its article along',()=>{
  const {analysis:a}=lesson('bracketRow');
  assert.deepEqual(outline('bracketRow').slice(0,6),['  [ Although the researchers','    [ who conducted the survey','  · admitted','  · that the group of people surveyed,',
    '    ( drawn largely from urban households with reliable internet access,','  · was hardly typical of the whole population,']);
  assert.equal(a.chunks[0].clauseLevel,true);assert.equal(a.chunks[0].describesIndex,-1);assert.equal(a.chunks[0].describes,'主句');
  assert.ok(a.shrunk.endsWith('to be ignored as an error caused by data processing.'));
  assert.deepEqual(a.shrink.at(-1),{big:'a statistical artefact',small:'an error caused by data processing',zh:'统计假象',startIndex:a.original.indexOf('a statistical artefact')});
});

test('rows the core is built from are kept even where the answer bracketed them',()=>{
  const {analysis:a}=lesson('coreClaimsRows');
  assert.deepEqual(a.chunks.map(c=>c.kind),['skeleton','skeleton','clause','skeleton','clause','skeleton']);
  assert.equal(a.skeleton.original,'It is precisely because benefits are spread thinly, whereas side effects are concentrated, that confidence can collapse.');
  assert.equal(a.skeleton.text,'It is precisely because benefits are spread thinly whereas side effects are concentrated that confidence can collapse.');
});

test('swaps listed out of reading order, a damaged reply and clause words numbered one level too deep are all read',()=>{
  assert.deepEqual(lesson('swapsOutOfOrder').analysis.shrink.map(s=>s.big),['species','doomed']);
  assert.throws(()=>JSON.parse(recorded.damagedJson.answer));
  assert.equal(lesson('damagedJson').analysis.chunks.length,9);
  const deeper=lesson('deeperNumbering').analysis;
  assert.deepEqual(outline('deeperNumbering').slice(0,6),['· Only when','· the last of the large ice blocks','  [ that feed the river','· has moved back','  ( beyond the point','    [ at which meltwater can reach the valley']);
  assert.equal(deeper.chunks[4].describes,'moved back');
});

test('what cannot be settled is named for the model: invented words, a reworded core, and a core that keeps every modifier',()=>{
  const source='The map I drew after lunch is here.';
  const base={swaps:[],lines:[['The map','s',0,'这张地图','主语'],['I drew','c',1,'我画的','map','I','省略了关系代词','哪张地图？'],['after lunch','p',2,'午饭后','drew','after','时间短语','何时画？'],['is here.','s',0,'在这里','谓语']],
    core:'The map is here.',hardCore:'The map is here.',coreZh:'这张地图在这里。',hardCoreZh:'这张地图在这里。',roles:[],zh:'我午饭后画的那张地图在这里。'};
  const told=(raw:unknown)=>{try{rebuild(source,raw);}catch(e){assert.ok(e instanceof Issues);return e.list.join(' ');}return assert.fail('accepted');};
  assert.match(told({...base,lines:[base.lines[0],['which my sister painted for me last year','c',1,'我画的','map','I','省略','哪张？'],...base.lines.slice(2)]}),/lines\[1\].*does not follow the sentence.*"I drew after lunch is here"/);
  assert.match(told({...base,lines:base.lines.slice(0,2)}),/stop before the sentence ends.*"after lunch is here"/);
  assert.match(told({...base,core:'Here is the map.',hardCore:'Here is the map.'}),/"core" "Here is the map\.": the sentence does not have "Here" followed by "is"\. "hardCore".*original order/);
  assert.match(told({...base,core:source,hardCore:source}),/"core".*keeps every modifier.*"hardCore".*keeps every modifier/);
  assert.match(told({...base,lines:base.lines.map((l,i)=>i===2?[l[0],l[1],l[2],'after lunch',...l.slice(4)]:l)}),/lines\[2\].*Chinese translation/);
  // Once the model has had its chance, the reworded core is settled from the kept rows.
  const settled=validate(rebuild(source,{...base,core:'Here is the map.',hardCore:'Here is the map.'},{final:true}),source);
  assert.equal(settled.skeleton.text,'The map is here.');
});

test('a row that also spans the rows after it is cut where they begin; a resumed clause follows the word it names; a filler or an inflected word in a core is forgiven',()=>{
  const source='Critics struggled to explain why shoppers offered a discount respond eagerly.';
  const rows=[['Critics','s',0,'批评者','主语'],['struggled to explain','s',0,'难以解释','谓语'],
    ['why shoppers offered a discount respond eagerly.','c',1,'为什么购物者反应热切','explain','why','宾语从句','解释什么？'],
    ['offered a discount','p',2,'得到折扣的','shoppers','offered','过去分词短语','哪些购物者？'],['respond eagerly.','i',2,'反应热切','shoppers']];
  const a=validate(rebuild(source,{swaps:[],lines:rows,core:'Critics struggle to explain something.',hardCore:'Critics struggle to explain something.',coreZh:'批评者难以解释。',hardCoreZh:'批评者难以解释。',roles:[],zh:'批评者难以解释为什么得到折扣的购物者反应热切。'}),source);
  assert.deepEqual(a.chunks.map(c=>'  '.repeat(c.depth)+(c.bracket||'·')+' '+c.text),['· Critics','· struggled to explain','  [ why shoppers','    ( offered a discount','  · respond eagerly.']);
  assert.equal(a.skeleton.text,'Critics struggled to explain.');
  assert.equal(a.chunks[4].role,'从句主干');
});

test('a respelt word or phrase keeps the sentence\'s own words, a dropped linking word rejoins its row, a few skipped words stay with the row before, more are named',()=>{
  const source='The map that I drew after lunch is here, on the kitchen table by the window.';
  const answer=(lines:unknown[])=>({swaps:[],lines,core:'The map is here.',hardCore:'The map is here.',coreZh:'这张地图在这里。',hardCoreZh:'这张地图在这里。',roles:[],zh:'我午饭后画的那张地图在这里，在窗边的餐桌上。'});
  const map=['The map','s',0,'这张地图','主语'],here=['is here,','s',0,'在这里','谓语'],lunch=['after lunch','p',2,'午饭后','drew','after','时间短语','何时画？'];
  const table=['on the kitchen table','p',1,'在餐桌上','is','on','地点短语','在哪里？'],windowRow=['by the window.','p',2,'在窗边','table','by','地点短语','哪张桌子？'];
  const texts=(lines:unknown[])=>validate(rebuild(source,answer(lines)),source).chunks.map(c=>c.text);
  assert.deepEqual(texts([map,['I sketched','c',1,'我画的','map','I','关系从句','哪张地图？'],lunch,here,table,windowRow]),['The map','that I drew','after lunch','is here,','on the kitchen table','by the window.']);
  assert.deepEqual(texts([map,['that I drew','c',1,'我画的','map','that','关系从句','哪张地图？'],lunch,here,['&emsp;(&nbsp;on the dining table','p',1,'在餐桌上','is','on','地点短语','在哪里？'],windowRow]).slice(4),['on the kitchen table','by the window.']);
  assert.deepEqual(texts([map,['that I drew','c',1,'我画的','map','that','关系从句','哪张地图？'],here,table,windowRow]).slice(0,3),['The map','that I drew after lunch','is here,']);
  assert.throws(()=>rebuild(source,answer([map,['that I drew','c',1,'我画的','map','that','关系从句','哪张地图？'],lunch,here,windowRow])),
    /lines\[4\] "by the window\." leaves out the words "on the kitchen table" that come before it/);
});

test('a row that contains the row after it is divided around it once its parts have Chinese; undivided, a bracket stays whole and a kept row is sent back',async()=>{
  const source='The idea that the bronzes taken in the war be returned was dropped.';
  const answer=(lines:unknown[])=>({swaps:[],lines,core:'The idea was dropped.',hardCore:'The idea was dropped.',coreZh:'这个想法被放弃了。',hardCoreZh:'这个想法被放弃了。',roles:[],zh:'归还战争中被夺走的青铜器的想法被放弃了。'});
  const idea=['The idea','s',0,'这个想法','主语'],dropped=['was dropped.','s',0,'被放弃了','谓语'],taken=['taken in the war','p',2,'战争中被夺走的','bronzes','taken','过去分词短语','哪些青铜器？'];
  const nested=answer([idea,['that the bronzes taken in the war be returned','c',1,'归还战争中被夺走的青铜器','idea','that','同位语从句','什么想法？'],taken,dropped]);
  const outline=(a:{chunks:{depth:number,bracket:string|null,text:string,zh:string}[]})=>a.chunks.map(c=>'  '.repeat(c.depth)+(c.bracket||'·')+' '+c.text+' «'+c.zh+'»');
  // The parts the divided row keeps have no Chinese of their own yet.
  assert.throws(()=>rebuild(source,nested),(e:unknown)=>e instanceof Glossless&&e.pieces.join('|')==='that the bronzes|be returned'&&e.sentence===source);
  const gloss=new Map([['that the bronzes','这些青铜器'],['be returned','应当归还']]);
  assert.deepEqual(outline(validate(rebuild(source,nested,{gloss}),source)),
    ['· The idea «这个想法»','  [ that the bronzes «这些青铜器»','    ( taken in the war «战争中被夺走的»','  · be returned «应当归还»','· was dropped. «被放弃了»']);
  // The whole loop: one analysis call, one small request for the two missing glosses.
  const calls:string[]=[];
  const out=await generate(source,'system',async(system,user)=>{
    calls.push(system==='system'?'analysis':'gloss:'+JSON.parse(user).pieces.join('|'));
    return {answer:JSON.stringify(system==='system'?nested:{zh:['这些青铜器','应当归还']}),usage:{input:10,output:5}};
  });
  assert.deepEqual(calls,['analysis','gloss:that the bronzes|be returned']);assert.equal(out.tries,1);assert.deepEqual(out.usage,{input:20,output:10});
  assert.equal(out.analysis!.chunks[3].kind,'inner-skeleton');assert.equal(out.analysis!.chunks[2].describes,'bronzes');
  // If the glosses do not come, the bracketed row stays whole rather than costing the lesson.
  const whole=await generate(source,'system',async system=>({answer:system==='system'?JSON.stringify(nested):'{"zh":[]}'}));
  assert.deepEqual(whole.analysis!.chunks.map(c=>c.text),['The idea','that the bronzes taken in the war be returned','was dropped.']);
  // A kept row is divided the same way; undivided it is sent back, and the last resort fits it whole.
  const kept=answer([['The idea that the bronzes taken in the war be returned','s',0,'归还青铜器的想法','主语'],taken,dropped]);
  assert.deepEqual(outline(validate(rebuild(source,kept,{gloss:new Map([['The idea that the bronzes','关于这些青铜器的想法'],['be returned','应当归还']])}),source)).slice(0,3),
    ['· The idea that the bronzes «关于这些青铜器的想法»','  ( taken in the war «战争中被夺走的»','· be returned «应当归还»']);
  assert.throws(()=>rebuild(source,kept,{divide:false}),/lines\[1\] "taken in the war" repeats words that are already inside lines\[0\]/);
  assert.deepEqual(validate(rebuild(source,kept,{final:true}),source).chunks.map(c=>c.text),['The idea that the bronzes taken in the war be returned','was dropped.']);
  assert.throws(()=>rebuild(source,answer([['Something else entirely','s',0,'别的','主语']]),{final:true}),/does not follow the sentence/);
});

test('a row that leaves out a modifier listed right after it is cut there, and the modifier takes its place',()=>{
  const source='The idea that the bronzes taken in the war be returned was dropped.';
  const lines=[['The idea','s',0,'这个想法','主语'],['that the bronzes be returned','c',1,'归还青铜器','idea','that','同位语从句','什么想法？'],
    ['taken in the war','p',2,'战争中被夺走的','bronzes','taken','过去分词短语','哪些青铜器？'],['was dropped.','s',0,'被放弃了','谓语']];
  const answer={swaps:[],lines,core:'The idea was dropped.',hardCore:'The idea was dropped.',coreZh:'这个想法被放弃了。',hardCoreZh:'这个想法被放弃了。',roles:[],zh:'归还战争中被夺走的青铜器的想法被放弃了。'};
  assert.throws(()=>rebuild(source,answer),(e:unknown)=>e instanceof Glossless&&e.pieces.join('|')==='that the bronzes|be returned');
  const a=validate(rebuild(source,answer,{gloss:new Map([['that the bronzes','这些青铜器'],['be returned','应当归还']])}),source);
  assert.deepEqual(a.chunks.map(c=>'  '.repeat(c.depth)+(c.bracket||'·')+' '+c.text+' «'+c.zh+'»'),
    ['· The idea «这个想法»','  [ that the bronzes «这些青铜器»','    ( taken in the war «战争中被夺走的»','  · be returned «应当归还»','· was dropped. «被放弃了»']);
  // Undivided (the last resort), the lesson still stands: the row keeps its words and the misplaced modifier is dropped.
  assert.equal(validate(rebuild(source,answer,{final:true}),source).chunks.map(c=>c.text).join(' '),source);
});

test('a conjunction said to modify its own clause\'s verb hangs on the main clause; a kept row that only adds a linking word to the rows after it gives them the word',()=>{
  const source='Although the researchers who ran the survey admitted that the sample was small, they still argued that the trend it showed was real.';
  const lines=[['Although','c',1,'尽管','admitted','Although','让步状语从句','在什么情况下？'],['the researchers','i',1,'研究人员','从句主语'],
    ['who ran the survey','c',2,'开展调查的','researchers','who','定语从句','哪些研究人员？'],['admitted','i',1,'承认','从句谓语'],['that the sample was small,','i',1,'样本很小','宾语从句'],
    ['they','s',0,'他们','主语'],['still argued','s',0,'仍然认为','谓语'],
    ['that the trend it showed was real.','s',0,'它显示的趋势是真实的','宾语从句'],['the trend','s',0,'这一趋势','宾语从句主语'],
    ['it showed','c',1,'它显示的','trend','it','省略关系代词','什么趋势？'],['was real.','s',0,'是真实的','宾语从句谓语']];
  const a=validate(rebuild(source,{swaps:[],lines,core:'They still argued that the trend was real.',hardCore:'They still argued that the trend was real.',coreZh:'他们仍然认为这一趋势是真实的。',hardCoreZh:'他们仍然认为这一趋势是真实的。',roles:[],zh:'尽管开展调查的研究人员承认样本很小，他们仍然认为它显示的趋势是真实的。'}),source);
  assert.deepEqual(a.chunks.map(c=>'  '.repeat(c.depth)+(c.bracket||'·')+' '+c.text),['  [ Although','  · the researchers','    [ who ran the survey','  · admitted','  · that the sample was small,',
    '· they','· still argued','· that the trend','  [ it showed','· was real.']);
  assert.deepEqual([a.chunks[0].clauseLevel,a.chunks[0].describes],[true,'主句']);
  assert.deepEqual([a.chunks[2].clauseLevel,a.chunks[2].describes,a.chunks[8].describes],[undefined,'researchers','trend']);
  assert.equal(a.chunks[7].zh,'这一趋势');
});

test('a correction is requested with the model\'s own answer and the exact points, and a first exact answer costs one call',async()=>{
  const {source,answer}=recorded.exact;
  const invented=JSON.stringify({...JSON.parse(answer),lines:[['Some other words','s',0,'别的词','主语']]});
  const calls:{follow?:Follow}[]=[];
  const fixed=await generate(source,'system',async(_s,user,_l,_t,follow)=>{
    assert.deepEqual(JSON.parse(user),{sentence:source});calls.push({follow});
    return {answer:calls.length===1?invented:answer,usage:{input:10,output:5}};
  });
  assert.equal(fixed.tries,2);assert.equal(fixed.repaired,false);assert.deepEqual(fixed.usage,{input:20,output:10});
  assert.equal(calls[0].follow,undefined);assert.equal(calls[1].follow?.assistant,invented);
  assert.match(calls[1].follow!.user,/lines\[0\] "Some other words" does not follow the sentence/);
  assert.deepEqual(fixed.analysis,strictly('exact'));
  let count=0;
  const once=await generate(source,'system',async()=>{count++;return {answer};});
  assert.equal(count,1);assert.equal(once.tries,1);
});

test('after unusable answers the learner still gets the skeleton and translation, and a reply with nothing usable is an error',async()=>{
  const {source,answer}=recorded.exact;
  const invented=JSON.stringify({...JSON.parse(answer),lines:[['Some other words','s',0,'别的词','主语']]});
  let count=0;
  const varied=()=>JSON.stringify({...JSON.parse(answer),lines:[['Some other words '+'again '.repeat(count),'s',0,'别的词','主语']]});
  const out=await generate(source,'system',async()=>{count++;return {answer:varied()};});
  assert.equal(count,3);assert.equal(out.origin,'static');assert.equal(out.analysis,undefined);
  // The same objection twice shows the model will not fix it, so the third call is not made.
  let stuck=0;
  const same=await generate(source,'system',async()=>{stuck++;return {answer:invented};});
  assert.equal(stuck,2);assert.equal(same.origin,'static');
  assert.equal(out.plain?.skeleton,JSON.parse(answer).core);
  await assert.rejects(generate(source,'system',async()=>({answer:'sorry'})),/No usable model result/);
});

test('the live preview follows rows written in the original wording or with brackets typed in',()=>{
  const {source,answer}=recorded.originalWording,chunks:LiveChunk[]=[];
  streamRows(source,()=>{},c=>chunks.push(c))(answer);
  assert.equal(chunks.length,6);
  assert.equal(chunks[0].text,'Faced with dwindling reserves and a population unwilling to accept limited supply,');
  assert.deepEqual(chunks.map(c=>c.bracket),['(',null,null,'(',null,'[']);
});

test('a replacement is shown only when its words are everyday ones and easier than the words they replace',()=>{
  for(const [big,small] of [['resisted','fought'],['acquired','got'],['levy','tax'],['in the wake of','after'],['an indignant','a very angry'],['extreme poverty','very poor conditions'],
    ['desalination plants','sea water factories'],['the better part of a decade','most of ten years'],['aid programmes','help programmes'],['incrementally','step by step']])assert.ok(simpler(big,small),big+' → '+small);
  // About as hard as the original, a mere respelling, an easy word swapped for an easy word, a rewrite, an addition.
  for(const [big,small] of [['resisted','opposed'],['rivals','competitors'],['scandal','public misconduct incident'],['criticised','criticized'],['fell','dropped'],['enormous','huge'],
    ['raw data','original data'],['drug-resistant bacteria','bacteria that cannot be killed by common drugs'],['resistance','drug resistance'],['faced with','confronted by']])assert.ok(!simpler(big,small),big+' → '+small);
  assert.deepEqual(['babies','Stopped','easily','wives','bigger','farmland','unhappy','long-standing','1990s'].map(level),[1,1,1,1,1,2,2,1,1]);
  assert.deepEqual(['namely','deserted','withdraw','retreat','competitors','policy-makers'].map(level),[3,3,3,3,3,3]);
});

test('where a replacement is no easier, the original word stands in the rows, the core, the head and the table, and the rest of the answer is kept',()=>{
  // A real answer, exact in every other respect.
  const {analysis:a,repaired}=lesson('hardReplacement');
  assert.equal(repaired,true);assert.throws(()=>strictly('hardReplacement'),/no easier/);
  assert.deepEqual(a.shrink.map(s=>s.big),['distinguishes','curb','congestion','displaced','deploy']);
  assert.equal(a.chunks[4].text,'is not the sophistication of the technology');
  assert.match(a.skeleton.text,/is not the sophistication of the technology/);
  assert.deepEqual(a.chunks,lesson('exact').analysis.chunks);
  const source='Farmers who owned land resisted the levy.';
  const answer={swaps:[['resisted','opposed','抵制'],['levy','tax','税']],lines:[['Farmers','s',0,'农民','主语'],['who owned land','c',1,'拥有土地的','Farmers','who','关系从句','哪些农民？'],['opposed the tax.','s',0,'抵制这项税','谓语']],
    core:'Farmers opposed the tax.',hardCore:'Farmers resisted the levy.',coreZh:'农民抵制这项税。',hardCoreZh:'农民抵制这项税。',roles:[['谁？','Farmers','主语'],['做了什么？','opposed the tax','谓语']],zh:'拥有土地的农民抵制这项税。'};
  const b=read(source,answer).analysis;
  assert.deepEqual(b.shrink.map(s=>[s.big,s.small]),[['levy','tax']]);
  assert.equal(b.shrunk,'Farmers who owned land resisted the tax.');
  assert.equal(b.skeleton.text,'Farmers resisted the tax.');assert.equal(b.skeleton.original,'Farmers resisted the levy.');
  assert.equal(b.skeleton.table[1].a,'resisted the tax');
  // The live preview shows the same wording before the analysis is complete.
  const previews:{shrunk:string}[]=[],live:LiveChunk[]=[];
  streamRows(source,p=>previews.push(p),c=>live.push(c))(JSON.stringify(answer));
  assert.equal(previews[0].shrunk,b.shrunk);assert.deepEqual(live.map(c=>c.text),b.chunks.map(c=>c.text));
});
