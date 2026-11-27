// Run against a production build with: npm run qa:browser
// Set CHROME_PATH to a Chromium executable if Playwright's browser is not installed.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
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

const fixture=JSON.parse(await (await import('node:fs/promises')).readFile('content/examples.json','utf8'))[0];
const clean=s=>s.replace(/\s+/g,'').toLowerCase();
const settle=()=>realDelay(560);
function monitor(page,errors){
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
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
    window.cueHits=[];
    const original=OscillatorNode.prototype.start;
    OscillatorNode.prototype.start=function(...args){
      window.cueHits.push(this.frequency.value);return original.apply(this,args);
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
  await page.clock.fastForward(370);
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
  await page.clock.fastForward(630);
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
  await until(async()=>await stage.getAttribute('data-position')==='1');
  assert.equal(await page.getByTestId('lesson').getAttribute('data-pending'),'true');
  assert.ok(await stage.locator('[data-inplace-swap]').count()>0,'Substitutions play before the completed answer');
  await page.evaluate(x=>window.sendLessonEvent({type:'chunk',index:0,chunk:{
    text:x.text,zh:x.zh,bracket:x.bracket,describes:x.describes,reason:x.signalWhy}}),alternative.chunks[1]);
  await until(async()=>await pass.count()>0 && await pass.getAttribute('data-live')==='true');
  assert.ok((await pass.innerText()).includes(alternative.chunks[1].zh));
  await page.evaluate(x=>{window.sendLessonEvent({type:'result',index:0,analysis:x});window.endLessonStream();},alternative);
  await until(async()=>await stage.getAttribute('data-position')==='2');
  await page.locator('[data-testid=lesson][data-pending=false]').waitFor();
  await page.getByTestId('lesson-play').click();
  const manualStart=await page.evaluate(()=>window.cueHits.length);
  await page.getByTestId('lesson-more').click();await page.getByRole('button',{name:'下一处'}).click();
  assert.ok((await page.evaluate(()=>window.cueHits.length))>manualStart,'A manually advanced bracket must sound while paused');
  assert.deepEqual(errors,[]);await context.close();
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
    const start=new Date('2025-01-01T00:00:00Z');await page.clock.install({time:start});
    await page.goto(baseURL);await hydration(page);
    await page.screenshot({caret:'initial',path:path.join(output,width+'-home.png')});
    await launchExample(page);
    await page.clock.pauseAt(new Date(start.getTime()+60000));
    // Starting at a known cue makes frame coverage deterministic.
    await page.getByTestId('lesson-more').evaluate(el=>el.click());await page.getByTestId('lesson-replay').evaluate(el=>el.click());
    const stage=page.getByTestId('lesson-stage');
    const checked=new Set(),captures=new Set(),lengths=new Map(),translatedChunks=new Set();
    const durations={slow:0,fast:0};let practice=false;
    for(let guard=0;guard<520&&!practice;guard++){
      const {pos,frame,end,delay,move}=await stage.evaluate(el=>({
        pos:+el.dataset.position,frame:+el.dataset.frame,end:+el.dataset.frameEnd,delay:+el.dataset.delay,move:el.dataset.move,
      }));
      const key=pos+'/'+frame;lengths.set(pos,end+1);
      if(!checked.has(key)){
        checked.add(key);await inspectWords(page);
        if(pos<6)durations.slow+=delay;
        else if(pos>=7&&pos<=11)durations.fast+=delay;
        if(move==='cut'){
          const dimensions=await stage.locator('[data-pane]').evaluate(e=>[e.scrollHeight,e.clientHeight]);
          assert.ok(dimensions[0]<=dimensions[1]+1,'Punctuation-cut sentence must fit one page: '+dimensions);
          assert.equal(clean(await stage.locator('.mba-sheet').innerText()).replaceAll('↵',''),clean(fixture.original));
        }
        if(move==='skeleton'&&frame===end){
          const spine=stage.locator('[data-core]');assert.equal(await spine.innerText(),pos===3?fixture.skeleton.text:fixture.skeleton.original);
          const rect=await spine.boundingBox();assert.ok(Math.abs(rect.y+rect.height/2-height/2)<height*.12,'Skeleton should emerge at screen center');
        }
        if(move==='add'&&pos===4){
          const c=await stage.locator('[data-chunk-zh]').getAttribute('data-chunk-zh',{timeout:80}).catch(()=>null);
          if(c!==null){translatedChunks.add(+c);assert.equal(await stage.locator('[data-chunk-zh]').innerText(),fixture.chunks[+c].zh);}
        }
        if(move==='translate'&&frame===end)assert.equal(await page.locator('.mba-translation-zh p').innerText(),pos===5?fixture.zh:fixture.originalZh);
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
      if(!practice)await page.clock.fastForward(delay+5);
    }
    assert.equal(captures.size,13);assert.ok(practice,'Autoplay reaches practice');
    const missing=[...lengths].flatMap(([s,n])=>Array.from({length:n},(_,i)=>s+'/'+i).filter(k=>!checked.has(k)));
    assert.deepEqual(missing,[],'Every animation cue must pass the layout checks');
    assert.ok(translatedChunks.size>=fixture.add.length,'Every added modifier has a Chinese translation');
    assert.ok(durations.slow<100000,'Guided Europe pass at 1× must take less than 100 seconds');
    assert.ok(durations.fast<durations.slow*.4,'Original replay must be much faster than guided reading');
    await page.clock.resume();
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
    assert.deepEqual(errors,[]);
    reports.push({width,height,autoplayFramesChecked:checked.size,stageScreenshots:captures.size,guidedSeconds:durations.slow/1000,originalReplaySeconds:durations.fast/1000,translatedChunks:translatedChunks.size,consoleErrors:errors});
    await context.close();
  }
  const reduced=await browser.newContext({reducedMotion:'reduce',viewport:{width:390,height:844}});
  const page=await reduced.newPage();await page.goto(baseURL);await launchExample(page);
  assert.equal(await page.getByTestId('lesson-play').getAttribute('aria-pressed'),'false');
  await choose(page,3);assert.ok(await page.locator('[data-core]').isVisible());
  assert.ok(await page.locator('.mba-player').evaluate(el=>[el,...el.querySelectorAll('*')].every(n=>getComputedStyle(n).animationName==='none')));
  await reduced.close();
  await copyFile(path.join(output,'1440-home.png'),'public/screenshot.png');
  await writeFile(path.join(output,'browser.json'),JSON.stringify({reports,reducedMotion:true,delayedStream:true,practiceWordEditing:true},null,2));
  console.log(JSON.stringify({reports,reducedMotion:true,delayedStream:true,practiceWordEditing:true}));
}finally{await browser.close();}
