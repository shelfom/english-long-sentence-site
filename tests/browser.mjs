// Run against a production build with: npm run qa:browser
// Set CHROME_PATH to a Chromium executable if Playwright's browser is not installed.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as realDelay } from 'node:timers/promises';
import { chromium } from 'playwright-core';

const baseURL = process.env.TEST_BASE_URL || 'http://127.0.0.1:5196';
const output = path.resolve('test-results');
await mkdir(output, { recursive: true });
const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const executablePath = process.env.CHROME_PATH || (existsSync(macChrome) ? macChrome : undefined);
const browser = await chromium.launch({ executablePath, headless: true });
const reports = [];

// A token's text range detects actual wrapped glyphs. Intersections are checked after
// clipping to the visible area of each scroll panel, even for panels below the viewport.
async function inspectWords(page, scope = '[data-testid=lesson-stage]') {
  const issues = await page.locator(scope).evaluate(container => {
    const boxes = [];
    const errors = [];
    const escaped = document.documentElement.scrollWidth > innerWidth + 1;
    if (escaped) errors.push('Page exceeds the viewport width');
    for (const element of container.querySelectorAll('[data-word]')) {
      if (getComputedStyle(element).visibility === 'hidden') continue;
      const word = element.textContent;
      const range = document.createRange();
      range.selectNodeContents(element);
      const lines = [...range.getClientRects()];
      if (lines.length > 1 && lines.some(line => Math.abs(line.top - lines[0].top) > 1)) errors.push('Wrapped: ' + word);
      if (element.scrollWidth > element.clientWidth + 1) errors.push('Cropped: ' + word + ' in ' + element.parentElement?.parentElement?.className + ' (' + element.scrollWidth + 'px into ' + element.clientWidth + 'px)');
      const box = element.getBoundingClientRect();
      let top = box.top, right = box.right, bottom = box.bottom, left = box.left;
      for (let p = element.parentElement; p && p !== container; p = p.parentElement) {
        const style = getComputedStyle(p);
        const outer = p.getBoundingClientRect();
        if (/(hidden|auto|scroll|clip)/.test(style.overflowY)) {
          top = Math.max(top, outer.top); bottom = Math.min(bottom, outer.bottom);
        }
        if (/(hidden|auto|scroll|clip)/.test(style.overflowX)) {
          left = Math.max(left, outer.left); right = Math.min(right, outer.right);
        }
      }
      if (right <= left || bottom <= top) continue;
      for (const old of boxes) {
        if (Math.min(right, old.right) - Math.max(left, old.left) > .6 &&
            Math.min(bottom, old.bottom) - Math.max(top, old.top) > .6) errors.push('Overlap: ' + old.word + ' / ' + word);
      }
      boxes.push({ word, top, right, bottom, left });
    }
    return errors.slice(0, 10);
  });
  assert.deepEqual(issues, [], scope);
}

const fixtures=JSON.parse(await (await import('node:fs/promises')).readFile('content/examples.json','utf8'));
const fixture=fixtures[0];
const clean=s=>s.replace(/\s+/g,'').toLowerCase();
const settle=()=>realDelay(560);
function monitor(page,errors){
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
}
function recordMechanicalHits(){
  window.cueHits=[];
  window.musicStarts=0;
  const oscillatorStart=OscillatorNode.prototype.start;
  OscillatorNode.prototype.start=function(...args){
    window.musicStarts++;
    return oscillatorStart.apply(this,args);
  };
  const mediaPlay=HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play=function(...args){
    window.musicStarts++;
    return mediaPlay.apply(this,args);
  };
  const start=AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start=function(...args){
    window.cueHits.push({when:args[0]??this.context.currentTime,length:this.buffer?.duration||0});
    if(this.loop || (this.buffer?.duration||0)>.2)window.musicStarts++;
    return start.apply(this,args);
  };
}
async function noAudioControl(page){
  assert.equal(await page.getByTestId('effects-toggle').count(),0);
  assert.equal(await page.getByRole('button',{name:/音效|音乐|sound|music/i}).count(),0);
}
async function noMusic(page){
  assert.equal(await page.locator('audio,video').count(),0);
  assert.equal(await page.evaluate(()=>window.musicStarts),0,'Only short, unpitched sound effects may play');
}
async function checkNext(page){
  const button=page.getByTestId('lesson-next');
  assert.ok(await button.isVisible());
  const b=await button.boundingBox(),viewport=page.viewportSize();
  assert.ok(b && b.height>=44 && b.width>=110,'Next step must be a prominent tap target: '+JSON.stringify(b));
  assert.ok(b.y>=0 && b.y+b.height<=viewport.height+1,'Next step should be visible without scrolling');
  return button;
}
async function waitForGate(page){
  const stage=page.getByTestId('lesson-stage');
  const position=await stage.getAttribute('data-position');
  for(let i=0;i<90;i++){
    if(await stage.getAttribute('data-ready')==='true')return;
    assert.equal(await stage.getAttribute('data-position'),position,'Autoplay crossed a step boundary');
    await page.clock.fastForward(Number(await stage.getAttribute('data-delay'))+5);
  }
  throw new Error('Step '+position+' did not stop at its boundary');
}
async function launchExample(page){
  await page.locator('.samples button').first().click();
  await page.locator('[data-testid=lesson][data-pending=false]').waitFor();
  await page.evaluate(()=>document.fonts.ready);
}
// Inject a slow, controlled response for a typed nonfixture only. The page itself
// still performs its normal fetch, NDJSON parsing and rendering from start to finish.
async function verifyDelayedStream() {
  const context=await browser.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage(),errors=[];monitor(page,errors);
  await page.addInitScript(recordMechanicalHits);
  await page.addInitScript(()=>{
    const realFetch=window.fetch.bind(window);
    window.fetch=(url,init)=>{
      if(!String(url).endsWith('/api/analyze'))return realFetch(url,init);
      return new Promise(resolve=>{
        let writer;
        const body=new ReadableStream({start(c){writer=c;}});
        window.openLessonStream=()=>resolve(new Response(body,{headers:{'Content-Type':'application/x-ndjson'}}));
        window.sendLessonEvent=e=>writer.enqueue(new TextEncoder().encode(JSON.stringify(e)+'\n'));
        window.endLessonStream=()=>writer.close();
      });
    };
  });
  const start=new Date('2025-01-01T00:00:00Z');await page.clock.install({time:start});
  await page.goto(baseURL);await hydration(page);
  const alternative=JSON.parse(JSON.stringify(fixture).replaceAll('public','school'));
  await page.locator('#entry').fill(alternative.original);
  await page.clock.pauseAt(new Date(start.getTime()+60000));
  await page.locator('.go').click();
  const stage=page.getByTestId('lesson-stage');
  await stage.waitFor();assert.equal(await page.getByTestId('lesson').getAttribute('data-pending'),'true');
  assert.equal(await stage.locator('.mba-cut .mba-return').count(),1,'First cut is visible before any response');
  assert.ok(await stage.locator('.mba-cut').isVisible());assert.equal(await page.getByTestId('lesson-wait').count(),0);
  const firstCut=await stage.locator('.mba-current-cut').innerText();
  await page.clock.fastForward(Number(await stage.getAttribute('data-delay'))+5);
  assert.notEqual(await stage.locator('.mba-current-cut').innerText(),firstCut);
  async function until(check,max=85){
    for(let i=0;i<max;i++){
      if(await check())return;
      await page.clock.fastForward(Number(await stage.getAttribute('data-delay'))+5);
    }
    throw Error('Timed out advancing lesson at position '+await stage.getAttribute('data-position'));
  }
  const pass=page.getByTestId('reading-pass');
  await until(async()=>await pass.count()>0);
  const a=await pass.locator('.mba-reader-group>b').innerText();
  assert.equal(a,alternative.original.split(',')[0]+',','Reading starts at the first source phrase');
  await page.clock.fastForward(Number(await stage.getAttribute('data-delay'))+5);
  const b=await pass.locator('.mba-reader-group>b').innerText();
  assert.notEqual(a,b);assert.ok(alternative.original.includes(a)&&alternative.original.includes(b));
  await page.getByTestId('lesson-play').click();
  const hits=await page.evaluate(()=>window.cueHits.length);
  assert.ok(hits>0,'Cut/read cues should schedule real Web Audio nodes on a user-started lesson');
  await page.clock.fastForward(7000);
  assert.equal(await pass.locator('.mba-reader-group>b').innerText(),b);
  assert.equal(await page.evaluate(()=>window.cueHits.length),hits,'Paused reader emits no sound');
  await page.getByTestId('lesson-play').click();
  await page.evaluate(x=>{window.openLessonStream();window.sendLessonEvent({type:'start',sentences:[x.original]});
    window.sendLessonEvent({type:'shrink',index:0,part:{shrink:x.shrink,shrunk:x.shrunk}});},alternative);
  await waitForGate(page);
  assert.equal(await stage.getAttribute('data-position'),'0','An arriving vocabulary preview must not change steps');
  await (await checkNext(page)).click();
  assert.equal(await stage.getAttribute('data-position'),'1');
  assert.equal(await page.getByTestId('lesson').getAttribute('data-pending'),'true');
  assert.ok(await stage.locator('[data-inplace-swap]').count()>0,'Substitutions play before the completed answer');
  await page.evaluate(x=>window.sendLessonEvent({type:'chunk',index:0,chunk:{
    text:x.text,zh:x.zh,bracket:x.bracket,describes:x.describes,reason:x.signalWhy}}),alternative.chunks[1]);
  await until(async()=>await pass.count()>0 && await pass.getAttribute('data-live')==='true');
  assert.ok((await pass.innerText()).includes(alternative.chunks[1].zh));
  const liveHold=Number(await stage.getAttribute('data-delay'));
  assert.ok(liveHold>=3300,'A live explanation deserves the usual reading time');
  await page.evaluate(x=>{window.sendLessonEvent({type:'result',index:0,analysis:x});window.endLessonStream();},alternative);
  await page.locator('[data-testid=lesson][data-pending=false]').waitFor();
  await page.clock.fastForward(Math.floor(liveHold*.85));
  assert.equal(await pass.getAttribute('data-live'),'true','A result must not replace a just-shown explanation');
  assert.ok((await pass.innerText()).includes(alternative.chunks[1].zh));
  await waitForGate(page);
  assert.equal(await stage.getAttribute('data-position'),'1','A completed analysis must wait for an explicit step change');
  await (await checkNext(page)).click();
  assert.equal(await stage.getAttribute('data-position'),'2');
  await page.locator('[data-testid=lesson][data-pending=false]').waitFor();
  await page.getByTestId('lesson-play').click();
  const manualStart=await page.evaluate(()=>window.cueHits.length);
  const manualNext=page.getByTestId('lesson-next-cue');
  assert.equal(await manualNext.innerText(),'下一处');
  await manualNext.click();
  assert.ok((await page.evaluate(()=>window.cueHits.length))-manualStart>=3,'A manually opened bracket must produce several mechanical strikes');
  while(await stage.getAttribute('data-frame')!==await stage.getAttribute('data-frame-end'))await manualNext.click();
  assert.equal(await stage.getAttribute('data-position'),'2');
  assert.ok(await manualNext.isDisabled() || await manualNext.isHidden(),'Manual cue stepping cannot enter another stage');
  await (await checkNext(page)).click();
  assert.equal(await stage.getAttribute('data-position'),'3');assert.equal(await stage.getAttribute('data-frame'),'0');
  await noMusic(page);
  assert.deepEqual(errors,[]);await context.close();
}
async function verifyKeyboardAndFallback(){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage(),errors=[],posts=[];
  monitor(page,errors);
  await page.addInitScript(recordMechanicalHits);
  const sources=['After lunch, heavy rain closed the road.','The bus stopped near our school.'];
  const cores=['Rain closed the road.','The bus stopped.'];
  const translations=['午饭过后，一场大雨使道路封闭。','公交车在学校附近停了下来。'];
  await page.route('**/api/analyze',async route=>{
    posts.push(route.request().postDataJSON());
    const events=[{type:'start',sentences:sources},...sources.map((source,index)=>({
      type:'result',index,plain:{skeleton:cores[index],simple:[cores[index]],zh:translations[index]},
    }))];
    await route.fulfill({contentType:'application/x-ndjson',body:events.map(e=>JSON.stringify(e)).join('\n')+'\n'});
  });
  await page.goto(baseURL);await hydration(page);await noAudioControl(page);
  const start=new Date('2025-01-01T00:00:00Z');
  await page.clock.install({time:start});
  const entry=page.locator('#entry');await entry.fill(sources[0]);
  await entry.press('Shift+Enter');
  assert.equal(await entry.inputValue(),sources[0]+'\n');
  await page.keyboard.insertText(sources[1]);
  const typed=sources.join('\n');
  await entry.evaluate(el=>{
    el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
    el.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key:'Enter',code:'Enter',isComposing:true}));
    el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));
    el.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key:'Enter',keyCode:229}));
    el.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key:'Enter',repeat:true}));
  });
  await realDelay(80);assert.deepEqual(posts,[],'IME confirmation, Shift+Enter and a held key cannot submit');
  assert.equal(await entry.inputValue(),typed);
  await page.clock.pauseAt(new Date(start.getTime()+60000));
  await entry.press('Enter');
  const result=page.locator('.plain-result'),next=page.getByTestId('result-next'),stage=page.getByTestId('lesson-stage');
  for(const [index,source] of sources.entries()){
    await stage.waitFor();
    assert.equal(await result.count(),0,'Partial results must keep the current teaching step visible');
    assert.equal(await stage.getAttribute('data-position'),'0');
    await waitForGate(page);
    await page.clock.fastForward(60000);
    assert.equal(await result.count(),0,'The fallback requires an explicit action');
    const show=await checkNext(page);assert.equal(await show.getAttribute('data-action'),'show-partial');
    await show.click();await result.waitFor();
    assert.equal(posts.length,1);assert.equal(posts[0].text,typed);
    assert.equal(await result.locator('.plain-source').innerText(),source);
    assert.equal(await result.locator('.plain-core').innerText(),cores[index]);
    assert.equal(await result.locator('.plain-zh').innerText(),translations[index]);
    const fallbackType=await result.evaluate(el=>['.plain-source','.plain-core','.plain-zh'].map(selector=>parseFloat(getComputedStyle(el.querySelector(selector)).fontSize)));
    assert.ok(fallbackType[2]>=16 && fallbackType[2]<Math.min(...fallbackType.slice(0,2)),'Chinese should be smaller than both English teaching lines');
    assert.doesNotMatch(await result.innerText(),/未通过校验|could not be checked/i);
    assert.ok(await next.isEnabled());const box=await next.boundingBox();
    if(index===0)await page.screenshot({path:path.join(output,'390-partial-result.png')});
    assert.ok(box&&box.width>=110&&box.height>=44&&box.y>=0&&box.y+box.height<=844,'Readable fallback needs a visible continuation: '+JSON.stringify(box));
    await next.tap();
  }
  await entry.waitFor();assert.equal(await entry.inputValue(),'');
  await entry.fill(sources[0]);
  await entry.evaluate(el=>{
    // Some software keyboards send inputType=insertParagraph with no keydown.
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,el.value+'\n');
    el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertParagraph'}));
  });
  await stage.waitFor();
  assert.equal(posts.length,2,'The phone Go action submits once');
  assert.equal(posts[1].text,sources[0]);
  assert.deepEqual(errors,[]);await noMusic(page);await context.close();
}
async function hydration(page){
  await page.getByRole('button',{name:'Switch interface language'}).click();
  await page.locator('html[lang=en]').waitFor();
  await page.getByRole('button',{name:'Switch interface language'}).click();
  await page.locator('html[lang=zh-CN]').waitFor();
  await page.evaluate(()=>document.fonts.ready);
}
async function choose(page,position){
  await page.getByTestId('lesson-review').selectOption(String(position));
  await page.locator('[data-testid=lesson-stage][data-position="'+position+'"]').waitFor();
}
async function moreAction(page,name){
  await page.getByTestId('lesson-more').click();
  await page.getByTestId(name).click();
}
try{
  await verifyDelayedStream();
  for(const [width,height] of [[390,844],[1440,900]]){
    const context=await browser.newContext({viewport:{width,height},permissions:['clipboard-read','clipboard-write']});
    const page=await context.newPage(),errors=[];monitor(page,errors);
    await page.addInitScript(recordMechanicalHits);
    const start=new Date('2025-01-01T00:00:00Z');await page.clock.install({time:start});
    await page.goto(baseURL);await hydration(page);await noAudioControl(page);
    await page.screenshot({caret:'initial',path:path.join(output,width+'-home.png')});
    await launchExample(page);await noAudioControl(page);
    await page.clock.pauseAt(new Date(start.getTime()+60000));
    // Starting at a known cue makes frame coverage deterministic.
    await page.getByTestId('lesson-more').evaluate(el=>el.click());await page.getByTestId('lesson-replay').evaluate(el=>el.click());
    const stage=page.getByTestId('lesson-stage');
    const checked=new Set(),captures=new Set(),lengths=new Map(),translatedChunks=new Set();
    const durations={slow:0,fast:0,restore:0};let practice=false,gates=0;const translationPixels=[];
    let previousHits=null,minimumStrikes=Infinity;
    for(let guard=0;guard<520&&!practice;guard++){
      const {pos,frame,end,delay,move}=await stage.evaluate(el=>({
        pos:+el.dataset.position,frame:+el.dataset.frame,end:+el.dataset.frameEnd,delay:+el.dataset.delay,move:el.dataset.move,
      }));
      const key=pos+'/'+frame;lengths.set(pos,end+1);
      if(!checked.has(key)){
        checked.add(key);await inspectWords(page);
        if(frame===0)await checkNext(page);
        const hits=await page.evaluate(()=>window.cueHits);
        if(previousHits!==null && pos!==12){
          const strikes=new Set(hits.slice(previousHits).filter(h=>h.length>0).map(h=>h.when)).size;
          assert.ok(strikes>=3,'Cue '+pos+'/'+frame+' must produce at least three distinct mechanical strikes; received '+strikes);
          minimumStrikes=Math.min(minimumStrikes,strikes);
        }
        previousHits=hits.length;
        if(pos<6)durations.slow+=delay;
        else if(pos>=7&&pos<=11)durations.fast+=delay;else if(pos===6)durations.restore+=delay;
        if(move==='cut'){
          const dimensions=await stage.locator('[data-pane]').evaluate(e=>[e.scrollHeight,e.clientHeight]);
          assert.ok(dimensions[0]<=dimensions[1]+1,'Punctuation-cut sentence must fit one page: '+dimensions);
          assert.equal(clean(await stage.locator('.mba-sheet').innerText()).replaceAll('↵',''),clean(fixture.original));
        }
        if(move==='skeleton'&&frame===end){
          const spine=stage.locator('[data-core]');assert.equal(await spine.innerText(),pos===3?fixture.skeleton.text:fixture.skeleton.original);
          const rect=await spine.boundingBox();assert.ok(Math.abs(rect.y+rect.height/2-height/2)<height*.12,'Skeleton should emerge at screen center');
        }
        if(pos===2)assert.ok(delay>=3300,'Allow time to read the grammar explanation');
        if(move==='add'&&pos===4){
          const c=await stage.locator('[data-chunk-zh]').getAttribute('data-chunk-zh',{timeout:80}).catch(()=>null);
          if(c!==null){translatedChunks.add(+c);assert.equal(await stage.locator('[data-chunk-zh]').innerText(),fixture.chunks[+c].zh);}
        }
        if(move==='translate'&&frame===end){
          const translation=stage.locator('.mba-translation-zh p');
          assert.equal(await translation.innerText(),pos===5?fixture.zh:fixture.originalZh);
          const type=await translation.evaluate(p=>({zh:parseFloat(getComputedStyle(p).fontSize),weight:parseInt(getComputedStyle(p).fontWeight,10),en:parseFloat(getComputedStyle(p.closest('.mba-translation').querySelector('[data-word]')).fontSize)}));
          translationPixels.push(type);
          assert.ok(type.zh>=16 && type.zh<=(width===390?17.1:22.1) && type.weight<=500,'Chinese translation should stay compact and readable: '+JSON.stringify(type));
        }
        if(pos>=7&&pos<=10)assert.equal(await stage.locator('[data-chunk-zh],.mba-translation-zh').count(),0);
        if(move==='restore'&&frame===end)assert.equal(clean(await stage.locator('.mba-sheet').innerText()),clean(fixture.original));
        if(move==='swap'&&frame===end)assert.equal(clean(await stage.locator('.mba-sheet').innerText()),clean(fixture.shrunk));
        const target=move==='cut'?end:move==='swap'||move==='restore'?Math.min(7,end):move==='minus'?Math.min(7,end):move==='add'?Math.min(5,end):end;
        if(frame===target&&!captures.has(pos)){
          // Let the browser finish its native scroll and visual reveal, inside this cue's hold.
          await page.clock.fastForward(Math.min(300,delay/3));await settle();
          await page.screenshot({caret:'initial',path:path.join(output,width+'-step-'+(pos===6?'original':pos<6?pos+1:pos)+'.png')});
          captures.add(pos);
        }
      }
      practice=pos===12;
      if(practice)break;
      await page.clock.fastForward(delay+5);
      if(frame===end){
        await waitForGate(page);
        const before=await page.evaluate(()=>window.cueHits.length);
        await page.clock.fastForward(60000);
        assert.equal(+await stage.getAttribute('data-position'),pos,'A completed step must wait for the learner');
        assert.equal(+await stage.getAttribute('data-frame'),end);
        assert.equal(await page.evaluate(()=>window.cueHits.length),before,'A completed step is silent while waiting');
        const next=await checkNext(page);
        assert.equal(await next.getAttribute('data-action'),'next-stage');
        if(pos===0 || pos===5)await page.screenshot({path:path.join(output,width+'-ready-'+(pos+1)+'.png')});
        await next.click();
        assert.equal(+await stage.getAttribute('data-position'),pos+1);
        gates++;
      }
    }
    assert.equal(captures.size,13);assert.equal(gates,12);assert.ok(practice,'Explicit next-step taps reach practice');
    const missing=[...lengths].flatMap(([s,n])=>Array.from({length:n},(_,i)=>s+'/'+i).filter(k=>!checked.has(k)));
    assert.deepEqual(missing,[],'Every animation cue must pass the layout checks');
    assert.ok(translatedChunks.size>=fixture.add.length,'Every added modifier has a Chinese translation');
    // Measured at default speed on 10d35db, the requested teaching-pace reference.
    for(const [section,baseline] of [['slow',234160],['fast',40770],['restore',28250]]){
      const ratio=durations[section]/baseline;
      assert.ok(ratio>=.90 && ratio<=.96,section+' should retain 90–96% of the reference reading time; got '+durations[section]+'ms');
    }
    assert.ok(durations.fast<durations.slow*.4,'Original replay must be much faster than guided reading');
    await page.clock.resume();
    const practiceNext=await checkNext(page);
    assert.equal(await practiceNext.getAttribute('data-action'),'replay');
    const exercise=page.locator('[data-practice]');
    assert.equal(await exercise.locator('textarea,input,form').count(),0);
    assert.equal(clean(await exercise.innerText()),clean(fixture.original));
    await exercise.locator('[data-edit-word="2"]').click();assert.equal(await exercise.locator('[data-break=true]').count(),1);
    await page.getByTestId('practice-subtract').click();await exercise.locator('[data-edit-word="1"]').click();
    assert.equal(await exercise.locator('[data-hidden-piece=true]').count(),1);
    assert.equal(await exercise.locator('[data-word]').allTextContents().then(ws=>ws.includes('Stretched')),false);
    await choose(page,3);assert.equal(await stage.getAttribute('data-review'),'true');await choose(page,12);
    await exercise.locator('[data-hidden-piece=true]').focus();await page.keyboard.press('Enter');
    assert.equal(await exercise.locator('[data-hidden-piece=true]').count(),0);
    await page.getByTestId('practice-reset').click();assert.equal(clean(await exercise.innerText()),clean(fixture.original));
    await moreAction(page,'lesson-copy');
    const exported=await page.evaluate(()=>navigator.clipboard.readText());
    assert.match(exported,/## 3 · 减法/);assert.match(exported,/## 原句/);assert.match(exported,/## 12 · 练习/);
    await page.getByTestId('lesson-all').click();assert.equal(await page.locator('[data-static] > section').count(),13);
    await page.emulateMedia({media:'print'});assert.ok(await page.locator('[data-static]').isVisible());assert.ok(await page.locator('.mba-rail').isHidden());
    await page.emulateMedia({media:'screen'});await page.getByTestId('lesson-all').click();
    await choose(page,1);await page.getByTestId('lesson-play').click();const paused=await stage.getAttribute('data-frame');
    await page.clock.fastForward(5000);assert.equal(await stage.getAttribute('data-frame'),paused);
    await noMusic(page);assert.deepEqual(errors,[]);
    reports.push({width,height,gates,translationPixels,autoplayFramesChecked:checked.size,stageScreenshots:captures.size,guidedSeconds:durations.slow/1000,originalReplaySeconds:durations.fast/1000,restorationSeconds:durations.restore/1000,minimumMechanicalStrikesPerCue:minimumStrikes,translatedChunks:translatedChunks.size,consoleErrors:errors});
    await context.close();
  }
  const reduced=await browser.newContext({reducedMotion:'reduce',viewport:{width:390,height:844}});
  const page=await reduced.newPage();await page.goto(baseURL);await launchExample(page);
  assert.equal(await page.getByTestId('lesson-play').getAttribute('aria-pressed'),'false');
  await choose(page,3);assert.ok(await page.locator('[data-core]').isVisible());
  assert.ok(await page.locator('.mba-player').evaluate(el=>[el,...el.querySelectorAll('*')].every(n=>getComputedStyle(n).animationName==='none')));
  await page.getByRole('button',{name:'返回输入'}).click();
  await page.locator('#entry').fill(fixtures.slice(1).map(x=>x.original).join(' '));
  await page.locator('.go').click();
  await choose(page,12);
  const finish=await checkNext(page);
  assert.equal(await finish.getAttribute('data-action'),'next-sentence');
  await finish.click();
  assert.equal(await page.getByTestId('lesson-stage').getAttribute('data-position'),'0');
  await choose(page,12);assert.equal(clean(await page.locator('[data-practice]').innerText()),clean(fixtures[2].original));
  assert.equal(await finish.getAttribute('data-action'),'replay');await finish.click();
  assert.equal(await page.getByTestId('lesson-stage').getAttribute('data-position'),'0');
  await reduced.close();
  await verifyKeyboardAndFallback();
  await writeFile(path.join(output,'browser.json'),JSON.stringify({reports,reducedMotion:true,delayedStream:true,keyboardAndFallback:true,noBackgroundMusic:true,practiceWordEditing:true},null,2));
  console.log(JSON.stringify({reports,reducedMotion:true,delayedStream:true,keyboardAndFallback:true,noBackgroundMusic:true,practiceWordEditing:true}));
}finally{await browser.close();}
