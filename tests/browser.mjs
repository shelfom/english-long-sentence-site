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
      let transparent=false;
      for(let p=element;p&&p!==container;p=p.parentElement)if(Number(getComputedStyle(p).opacity)===0){transparent=true;break;}
      if(transparent)continue;
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
// Words slide and fade into place. Geometry is checked on the settled layout.
const atRest=page=>page.evaluate(()=>document.getAnimations().forEach(a=>{try{a.finish();}catch{}}));
// The fixture contains commas and its final full stop. Build expected blocks directly
// from the source and the replacements applied at this instant of the animation.
function expectedBudgetBlocks(move,frame){
  let text=fixture.original;
  const used=move==='swap'?Math.floor((frame+1)/2):move==='restore'?Math.floor((frame+1)/2):0;
  const changes=move==='swap'?fixture.shrink.slice(0,used):move==='restore'?fixture.shrink.slice(used):[];
  for(const change of [...changes].reverse()){
    assert.equal(text.slice(change.startIndex,change.startIndex+change.big.length),change.big);
    text=text.slice(0,change.startIndex)+change.small+text.slice(change.startIndex+change.big.length);
  }
  return text.split(/(?<=,)\s+/);
}
async function checkBlocks(stage,expected){
  const blocks=await stage.locator('[data-punctuation-block]').evaluateAll(els=>els.map(el=>({
    text:[...el.querySelectorAll('[data-word]')].map(word=>word.textContent).join(' '),
    size:parseFloat(getComputedStyle(el.querySelector('[data-word]')||el).fontSize),
    top:el.getBoundingClientRect().top,
  })));
  assert.deepEqual(blocks.map(b=>clean(b.text)),expected.map(clean),'Each swap must preserve its punctuation block');
  return blocks;
}
async function pressInLesson(page){
  await page.getByTestId('lesson-stage').locator('h2').focus();
  await page.keyboard.press('Enter');
}
async function ignoredEnters(page,stage){
  const start=await stage.getAttribute('data-position');
  await stage.locator('h2').focus();
  await stage.locator('h2').evaluate(el=>{
    for(const init of [{repeat:true},{isComposing:true},{keyCode:229},{shiftKey:true},{ctrlKey:true},{metaKey:true},{altKey:true}]){
      el.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,cancelable:true,key:'Enter',code:'Enter',...init}));
    }
  });
  assert.equal(await stage.getAttribute('data-position'),start,'Held, composing and modified Enter do not navigate');
}
async function visibleWithinStage(stage,locator){
  const [outer,rect]=await Promise.all([stage.boundingBox(),locator.boundingBox()]);
  assert.ok(rect&&outer&&rect.y>=outer.y-1&&rect.y+rect.height<=outer.y+outer.height+1,'The full teaching text must fit within the stage: '+JSON.stringify({outer,rect}));
}
async function shot(page,width,name){
  await page.screenshot({caret:'initial',path:path.join(output,width+'-'+name+'.png')});
}
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
  assert.equal(await page.locator('#entry').getAttribute('placeholder'),'在这里粘贴一个长难句，然后目睹奇迹发生......');
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
  const pass=page.getByTestId('reading-pass'),gate=page.locator('.mba-stage-gate'),nextButton=page.getByTestId('lesson-next');
  const chip=page.locator('[data-analysing]');
  assert.equal(await chip.count(),1,'A live signal shows that the analysis is running');
  assert.equal(await chip.locator('.mba-working').evaluate(el=>getComputedStyle(el).animationName),'mba-shuttle');
  await until(async()=>await pass.count()>0);
  // Nothing has come back yet: the whole sentence is on screen and a mark keeps reading through it.
  assert.equal(clean(await pass.locator('[data-scan-rest]').innerText()),clean(alternative.original));
  assert.equal(await pass.getAttribute('data-scan-phase'),'words');
  assert.match(await pass.locator('.mba-read-label').innerText(),/正在读句子/);
  assert.equal(await gate.getAttribute('data-gate-state'),'pending');assert.ok(await nextButton.isDisabled());
  assert.match(await nextButton.innerText(),/分析中/);
  assert.equal(await nextButton.evaluate(el=>getComputedStyle(el).animationName),'mba-sheen','The waiting button shows it is working');
  const headA=await pass.getAttribute('data-scan-head');
  await page.clock.fastForward(400);
  assert.notEqual(await pass.getAttribute('data-scan-head'),headA,'The reading mark keeps moving while the analysis runs');
  assert.equal(await pass.locator('.mba-scan-at').count(),1);
  await atRest(page);await inspectWords(page);
  await page.getByTestId('lesson-play').click();
  const hits=await page.evaluate(()=>window.cueHits.length);
  assert.ok(hits>0,'Cut/read cues should schedule real Web Audio nodes on a user-started lesson');
  const held=await pass.getAttribute('data-scan-head');
  await page.clock.fastForward(7000);
  assert.equal(await pass.getAttribute('data-scan-head'),held,'A paused lesson holds the mark still');
  assert.equal(await page.evaluate(()=>window.cueHits.length),hits,'Paused reader emits no sound');
  await page.getByTestId('lesson-play').click();
  await page.evaluate(x=>{window.openLessonStream();window.sendLessonEvent({type:'start',sentences:[x.original]});
    window.sendLessonEvent({type:'shrink',index:0,part:{shrink:x.shrink,shrunk:x.shrunk}});},alternative);
  await waitForGate(page);
  assert.equal(await pass.count(),0,'The scan gives way as soon as the next step can be shown');
  assert.equal(await stage.getAttribute('data-position'),'0','An arriving vocabulary preview must not change steps');
  assert.equal(await gate.getAttribute('data-gate-state'),'ready');
  assert.equal(await nextButton.evaluate(el=>getComputedStyle(el).animationName),'mba-beckon','A finished step makes the Next button flash');
  assert.deepEqual(await nextButton.evaluate(el=>{const c=getComputedStyle(el);return [c.animationDuration,c.animationTimingFunction,c.animationIterationCount];}),['0.5s','steps(1)','infinite'],'The flash is a hard blink, twice a second');
  await (await checkNext(page)).click();
  assert.equal(await stage.getAttribute('data-position'),'1');
  assert.equal(await page.getByTestId('lesson').getAttribute('data-pending'),'true');
  assert.ok(await stage.locator('[data-inplace-swap]').count()>0,'Substitutions play before the completed answer');
  const live=x=>({text:x.text,zh:x.zh,bracket:x.bracket,describes:x.describes,reason:x.signalWhy});
  await page.evaluate(chunks=>chunks.forEach(chunk=>window.sendLessonEvent({type:'chunk',index:0,chunk})),alternative.chunks.slice(0,2).map(live));
  await chip.and(page.locator('[data-analysing="2"]')).waitFor();
  await until(async()=>await pass.count()>0 && await pass.getAttribute('data-live')==='true');
  // Chunks already analysed stand apart with their Chinese; the mark reads on through what is left.
  assert.equal(await pass.getAttribute('data-scan-rows'),'2');assert.equal(await pass.getAttribute('data-scan-phase'),'chunks');
  assert.deepEqual(await pass.locator('[data-scan-row] .mba-minus-gloss').allInnerTexts(),alternative.chunks.slice(0,2).map(c=>c.zh));
  assert.ok((await pass.locator('[data-scan-row]').nth(1).innerText()).trimStart().startsWith(alternative.chunks[1].bracket));
  assert.equal(clean(await pass.locator('[data-scan-rest]').innerText()),clean(alternative.chunks.slice(2).map(c=>c.text).join(' ')));
  const headC=await pass.getAttribute('data-scan-head');
  await page.clock.fastForward(400);
  assert.notEqual(await pass.getAttribute('data-scan-head'),headC);
  await atRest(page);await inspectWords(page);
  await page.evaluate(chunks=>chunks.forEach(chunk=>window.sendLessonEvent({type:'chunk',index:0,chunk})),alternative.chunks.slice(2).map(live));
  await page.locator('[data-testid=reading-pass][data-scan-phase=check]').waitFor();
  assert.match(await pass.locator('.mba-read-label').innerText(),/正在核对/);
  await page.evaluate(x=>{window.sendLessonEvent({type:'result',index:0,analysis:x});window.endLessonStream();},alternative);
  await page.locator('[data-testid=lesson][data-pending=false]').waitFor();
  await waitForGate(page);
  assert.equal(await pass.count(),0);assert.equal(await chip.count(),0,'The signal goes once the analysis is in');
  assert.equal(await stage.getAttribute('data-position'),'1','A completed analysis must wait for an explicit step change');
  await (await checkNext(page)).click();
  assert.equal(await stage.getAttribute('data-position'),'2');
  await page.locator('[data-testid=lesson][data-pending=false]').waitFor();
  const play=page.getByTestId('lesson-play');
  await play.focus();await page.keyboard.press('Enter');
  assert.equal(await stage.getAttribute('data-position'),'2','Native Play/Pause uses Enter without moving the lesson');
  assert.equal(await play.getAttribute('aria-pressed'),'false');
  const review=page.getByTestId('lesson-review');
  await review.focus();await page.keyboard.press('Enter');await page.keyboard.press('Escape');
  assert.equal(await stage.getAttribute('data-position'),'2','A focused native select keeps its keyboard controls');
  const manualStart=await page.evaluate(()=>window.cueHits.length);
  const manualNext=page.getByTestId('lesson-next-cue');
  assert.equal(await manualNext.innerText(),'下一处');
  await manualNext.click();
  assert.ok((await page.evaluate(()=>window.cueHits.length))-manualStart>=3,'A manually opened bracket must produce several mechanical strikes');
  while(await stage.getAttribute('data-frame')!==await stage.getAttribute('data-frame-end'))await manualNext.click();
  assert.equal(await stage.getAttribute('data-position'),'2');
  assert.ok(await manualNext.isEnabled(),'Manual subtraction can reveal its own skeleton');
  await manualNext.click();
  assert.equal(await stage.getAttribute('data-position'),'3');
  await waitForGate(page);
  await page.clock.fastForward(60000);assert.equal(await stage.getAttribute('data-position'),'3');
  await pressInLesson(page);assert.equal(await stage.getAttribute('data-position'),'4');
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
    if(index===0)await pressInLesson(page);else await show.click();await result.waitFor();
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
    if(index===0){
      await result.click({position:{x:12,y:12}});
      await page.keyboard.press('Enter');
    }else await next.tap();
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
    const checked=new Set(),captures=new Set(),lengths=new Map();
    const translatedChunks={guided:new Set(),original:new Set()};
    const dividedChunks={guided:new Set(),original:new Set()};
    let cutFont=null,autoCores=0;
    const durations={slow:0,fast:0,restore:0};let finished=false,gates=0,autoSteps=0;const translationPixels=[];
    let previousHits=null,minimumStrikes=Infinity;
    for(let guard=0;guard<520&&!finished;guard++){
      const {pos,frame,end,delay,move}=await stage.evaluate(el=>({
        pos:+el.dataset.position,frame:+el.dataset.frame,end:+el.dataset.frameEnd,delay:+el.dataset.delay,move:el.dataset.move,
      }));
      const key=pos+'/'+frame;lengths.set(pos,end+1);
      if(!checked.has(key)){
        checked.add(key);await atRest(page);await inspectWords(page);
        if(frame===0)await checkNext(page);
        const hits=await page.evaluate(()=>window.cueHits);
        if(previousHits!==null){
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
        if((move==='cut'&&frame===end)||move==='swap'||move==='restore'){
          const blocks=await checkBlocks(stage,expectedBudgetBlocks(move,frame));
          if(move==='cut')cutFont=blocks[0].size;
          else assert.ok(blocks[0].size>=cutFont*.92,'Swap/restore should preserve the size of the punctuation blocks');
          for(let i=1;i<blocks.length;i++)assert.ok(blocks[i].top>blocks[i-1].top,'Each punctuation block needs its own line');
        }
        const pass=pos>=7?'original':'guided';
        if(move==='minus'){
          const chunk=fixture.chunks[frame];
          const active=stage.locator('[data-minus-active]'),gloss=stage.locator('.mba-stack-live .mba-active-line [data-minus-zh]');
          const en=await active.locator('[data-word]').allTextContents();
          assert.equal(clean(en.join(' ')),clean(pass==='original'?chunk.originalText:chunk.text));
          assert.equal(await gloss.innerText(),chunk.zh,'The Chinese belongs to the same active chunk');
          // Every chunk already cut keeps its own Chinese beside it.
          assert.deepEqual(await stage.locator('.mba-stack-live [data-minus-zh]').allInnerTexts(),fixture.chunks.slice(0,frame+1).map(c=>c.zh),'Earlier translations stay beside their chunks');
          // Brackets come in pairs: by the last cut every opener has its closer.
          if(frame===fixture.chunks.length-1)assert.equal(await stage.locator('.mba-stack-live [data-bracket-close]').count(),fixture.chunks.filter(c=>c.bracket).length,'Every bracket closes');
          if(chunk.bracket)assert.ok((await active.innerText()).trimStart().startsWith(chunk.bracket),'Keep the modifier bracket in view');
          dividedChunks[pass].add(frame);
          assert.ok(delay>=(pass==='original'?1800:3000),'Allow time to read the bilingual chunk');
          const pair=await active.evaluate(el=>{
            const chunk=el.closest('[data-chunk]'),gloss=chunk.querySelector('[data-minus-zh]');
            const en=el.getBoundingClientRect(),zh=gloss.getBoundingClientRect();
            return {gap:zh.x-en.right,zhFont:parseFloat(getComputedStyle(gloss).fontSize),depthPadding:parseFloat(getComputedStyle(el).paddingInlineStart)};
          });
          assert.ok(pair.gap>=3 && pair.zhFont>=14,'The bilingual chunk needs a readable, separated gloss: '+JSON.stringify(pair));
          if(chunk.depth>0)assert.ok(pair.depthPadding>=3,'Nested modifier needs a visible indent');
          if(pass==='guided')await checkBlocks(stage,fixture.shrunk.split(/(?<=,)\s+/));
          else await checkBlocks(stage,expectedBudgetBlocks('cut',0));
        }
        if(move==='skeleton'&&frame===end){
          const spine=stage.locator('[data-core]'),gloss=stage.locator('[data-core-zh]');
          assert.equal(clean((await spine.locator('[data-word]').allTextContents()).join(' ')),clean(pos===3?fixture.skeleton.text:fixture.skeleton.original));
          assert.equal(await gloss.innerText(),pos===3?fixture.skeleton.zh:fixture.skeleton.originalZh);
          await visibleWithinStage(stage,spine);await visibleWithinStage(stage,gloss);
          assert.ok(await stage.locator('[data-pane]').evaluateAll(panes=>panes.every(p=>p.scrollHeight<=p.clientHeight+1)),'The bilingual core must fit without scrolling');
        }
        if(move==='skeleton'&&frame===0){
          // Every modifier bursts and is gone before the skeleton gathers: the bracketed rows, their
          // Chinese, and the single words a kept line gives up. Only the skeleton's own words stay.
          const bare=text=>clean(text).toLowerCase().replace(/[^\p{L}\p{N}\s'’-]/gu,'').replace(/\s+/g,' ').trim();
          const going=await stage.locator('.mba-settle :is(.mba-fades,.mba-bracket,.mba-minus-gloss)').evaluateAll(list=>list.map(el=>{
            // On a narrow screen the Chinese beside each row is simply not drawn during this step.
            const style=getComputedStyle(el),drawn=el.getClientRects().length>0;
            return {text:el.textContent,drawn,name:style.animationName,opacity:+style.opacity,delay:el.style.getPropertyValue('--burst-delay')};
          }));
          const late=going.filter(g=>g.drawn&&(g.name!=='mba-burst'||g.opacity!==0||!/^\d+ms$/.test(g.delay)));
          assert.ok(going.length>0&&!late.length,'Every modifier bursts and is gone before the skeleton emerges: '+JSON.stringify(late.slice(0,3)));
          assert.ok(going.some(g=>g.drawn),'Something bursts on screen');
          const delays=going.map(g=>parseInt(g.delay));
          assert.ok(delays.every((d,i)=>!i||d>=delays[i-1]),'Modifiers burst in reading order');
          assert.equal(bare((await stage.locator('.mba-settle .mba-stays').allTextContents()).join(' ')),bare(pos===3?fixture.skeleton.text:fixture.skeleton.original),'Only the words of the skeleton stay');
          const singles=await stage.locator('.mba-settle .mba-fades').allTextContents();
          assert.ok(singles.length>0,'A kept line gives up its single modifiers');
          const named=await page.locator('[data-small-modifiers] b').allTextContents();
          assert.ok(named.length>0&&named.every(w=>singles.some(x=>bare(x)===bare(w))),'The note names single words the kept lines give up: '+named.join(', '));
        }
        if(move==='add'){
          assert.equal((await stage.locator('[data-reading-note]').allInnerTexts()).join('').trim(),'','No grammar explanations during add-back');
          const gloss=stage.locator('[data-chunk-zh]');
          if(frame>0&&frame<end){
            const i=Number(await gloss.getAttribute('data-chunk-zh'));translatedChunks[pass].add(i);
            assert.equal(await gloss.innerText(),fixture.chunks[i].zh);
            // A chunk's closing comma returns with the words that follow it.
            const bare=s=>clean(s).replace(/[,;:]+$/u,'');
            assert.equal(bare((await stage.locator('[data-focus=true] [data-word]').allTextContents()).join(' ')),bare(pass==='original'?fixture.chunks[i].originalText:fixture.chunks[i].text));
          }
          if(frame===end){
            assert.equal(await stage.locator('[data-add-complete-zh]').innerText(),pass==='original'?fixture.originalZh:fixture.zh);
            assert.equal(clean((await stage.locator('.mba-add-sentence [data-word]').allTextContents()).join(' ')),clean(pass==='original'?fixture.original:fixture.shrunk));
          }
        }
        if((move==='restore'||move==='swap')&&frame===end){
          const restored=(await stage.locator('.mba-sheet [data-word]').allTextContents()).join(' ');
          assert.equal(clean(restored),clean(move==='restore'?fixture.original:fixture.shrunk));
        }
        const target=move==='cut'?end:move==='swap'||move==='restore'?Math.min(7,end):move==='minus'?Math.min(7,end):move==='add'?Math.min(5,end):end;
        if(frame===target&&!captures.has(pos)){
          // Let the browser finish its native scroll and visual reveal, inside this cue's hold.
          await page.clock.fastForward(Math.min(300,delay/3));await settle();
          await page.screenshot({caret:'initial',path:path.join(output,width+'-step-'+(pos===6?'original':pos<6?pos+1:pos)+'.png')});
          const artifact={2:'subtract-simplified',3:'core-simplified',4:'add-simplified',6:'restoring-original',8:'subtract-original',9:'core-original',10:'add-original'}[pos];
          if(artifact)await shot(page,width,artifact);
          captures.add(pos);
        }
      }
      await page.clock.fastForward(delay+5);
      if(frame===end&&move==='minus'){
        assert.equal(+await stage.getAttribute('data-position'),pos+1,'The core must emerge from the last division without a click');
        autoCores++;
      }else if(frame===end&&pos>=7&&pos<10){
        // From step 7 the replay of the original runs on by itself.
        assert.equal(await stage.getAttribute('data-auto'),'true');
        assert.equal(+await stage.getAttribute('data-position'),pos+1,'The replay of the original moves on without a press');
        autoSteps++;
      }else if(frame===end){
        await waitForGate(page);
        const before=await page.evaluate(()=>window.cueHits.length);
        await page.clock.fastForward(60000);
        assert.equal(+await stage.getAttribute('data-position'),pos,'A completed step must wait for the learner');
        assert.equal(+await stage.getAttribute('data-frame'),end);
        assert.equal(await page.evaluate(()=>window.cueHits.length),before,'A completed step is silent while waiting');
        const next=await checkNext(page);
        assert.equal(await page.locator('.mba-stage-gate').getAttribute('data-gate-state'),'ready');
        assert.equal(await next.evaluate(el=>getComputedStyle(el).animationName),'mba-beckon','A finished step makes the Next button flash');
        if(pos===10){
          // The sentence is over: the button says so, and there is no practice page.
          assert.equal(await next.getAttribute('data-action'),'input');
          assert.match(await next.innerText(),/讲完了 · 换一个句子/);
          assert.equal(await stage.getAttribute('data-done'),'true');
          assert.match(await stage.locator('.mba-phase').innerText(),/讲完了 · 可以回看，或换一个句子/);
          assert.equal(await page.getByTestId('lesson-restart').innerText(),'从头再看');
          assert.equal(await page.locator('[data-practice],[data-your-turn]').count(),0);
          await shot(page,width,'add-complete-original');await shot(page,width,'finished');
          finished=true;break;
        }
        assert.equal(await next.getAttribute('data-action'),'next-stage');
        if(pos===0)await shot(page,width,'ready-1');
        if(pos===3)await shot(page,width,'core-simplified');
        if(pos===4)await shot(page,width,'add-complete-simplified');
        await ignoredEnters(page,stage);
        if(gates%4===0){
          await next.focus();
          await page.keyboard.down('Enter');await page.keyboard.down('Enter');await page.keyboard.up('Enter');
        }else if(gates%2===0)await pressInLesson(page);else await next.click();
        assert.equal(+await stage.getAttribute('data-position'),move==='add'?pos+2:pos+1,'Completed Add proceeds beyond its just-shown translation');
        gates++;
      }
    }
    assert.equal(captures.size,10);assert.equal(gates,5);assert.equal(autoCores,2);assert.equal(autoSteps,2);assert.ok(finished,'The lesson runs through to its finish');
    const mainFlowFrames=checked.size;
    // Translation is included in each completed reconstruction. Its dedicated
    // review page is still available by selecting it, or by advancing Add early.
    for(const pos of [5,11]){
      if(pos===5){
        await choose(page,4);await pressInLesson(page);
        assert.equal(+await stage.getAttribute('data-position'),5,'Early advance on Add opens the standalone translation');
      }else await choose(page,11);
      const target=pos===5?fixture.zh:fixture.originalZh;
      const end=Number(await stage.getAttribute('data-frame-end'));lengths.set(pos,end+1);
      for(let frame=0;frame<=end;frame++){
        assert.equal(+await stage.getAttribute('data-frame'),frame);
        checked.add(pos+'/'+frame);await inspectWords(page);
        if(frame<end)await page.clock.fastForward(Number(await stage.getAttribute('data-delay'))+5);
      }
      const translation=stage.locator('.mba-translation-zh p');
      assert.equal(await translation.innerText(),target);
      const type=await translation.evaluate(p=>({zh:parseFloat(getComputedStyle(p).fontSize),weight:parseInt(getComputedStyle(p).fontWeight,10),en:parseFloat(getComputedStyle(p.closest('.mba-translation').querySelector('[data-word]')).fontSize)}));
      translationPixels.push(type);
      assert.ok(type.zh>=16 && type.zh<=(width===390?17.1:22.1) && type.weight<=500,'The Chinese translation stays readable and compact');
      await waitForGate(page);
      await shot(page,width,'step-'+(pos===5?6:11));captures.add(pos);
    }
    assert.equal(captures.size,12);
    const missing=[...lengths].flatMap(([s,n])=>Array.from({length:n},(_,i)=>s+'/'+i).filter(k=>!checked.has(k)));
    assert.deepEqual(missing,[],'Every animation cue must pass the layout checks');
    for(const pass of ['guided','original']){
      assert.equal(dividedChunks[pass].size,fixture.chunks.length);
      assert.ok(translatedChunks[pass].size>=fixture.add.length,'Every added modifier needs a Chinese translation in '+pass);
    }
    assert.deepEqual([...translatedChunks.guided],[...translatedChunks.original],'Both passes restore the same modifiers');
    await page.clock.resume();
    // The translation page of the original is the last page; its end is the finish too.
    const finish=await checkNext(page);
    assert.equal(await finish.getAttribute('data-action'),'input');assert.match(await finish.innerText(),/讲完了/);
    assert.equal(await page.getByTestId('lesson-review').locator('option').count(),12,'Eleven numbered steps and the restoration, no practice');
    await page.getByTestId('lesson-restart').click();
    assert.equal(await stage.getAttribute('data-position'),'0','Watch again starts from the first step');
    await choose(page,3);assert.equal(await stage.getAttribute('data-review'),'true');
    await page.getByTestId('lesson-more').focus();await page.keyboard.press('Enter');
    assert.equal(await page.getByTestId('lesson-more').getAttribute('aria-expanded'),'true');
    assert.equal(await stage.getAttribute('data-position'),'3','Opening the player menu must keep the learner on the step');
    await page.getByTestId('lesson-copy').click();
    const exported=await page.evaluate(()=>navigator.clipboard.readText());
    assert.match(exported,/## 3 · 减法/);assert.match(exported,/## 原句/);assert.match(exported,/## 11 · 翻译/);assert.doesNotMatch(exported,/练习|轮到你/);
    await page.getByTestId('lesson-all').click();assert.equal(await page.locator('[data-static] > section').count(),12);
    await page.emulateMedia({media:'print'});assert.ok(await page.locator('[data-static]').isVisible());assert.ok(await page.locator('.mba-rail').isHidden());
    await page.emulateMedia({media:'screen'});await page.getByTestId('lesson-all').click();
    await choose(page,1);await page.getByTestId('lesson-play').click();const paused=await stage.getAttribute('data-frame');
    await page.clock.fastForward(5000);assert.equal(await stage.getAttribute('data-frame'),paused);
    await noMusic(page);assert.deepEqual(errors,[]);
    reports.push({width,height,gates,translationPixels,mainFlowFrames,reviewFrames:checked.size-mainFlowFrames,framesChecked:checked.size,stageScreenshots:captures.size,guidedSeconds:durations.slow/1000,originalReplaySeconds:durations.fast/1000,restorationSeconds:durations.restore/1000,minimumMechanicalStrikesPerCue:minimumStrikes,translatedChunks:{guided:translatedChunks.guided.size,original:translatedChunks.original.size},autoCores,consoleErrors:errors});
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
  await choose(page,10);
  const finish=await checkNext(page);
  assert.equal(await finish.getAttribute('data-action'),'next-sentence');assert.match(await finish.innerText(),/这句讲完了 · 下一句/);
  assert.equal(await finish.evaluate(el=>getComputedStyle(el).animationName),'none','Reduced motion: the finished button does not flash');
  await finish.click();
  assert.equal(await page.getByTestId('lesson-stage').getAttribute('data-position'),'0');
  await choose(page,10);assert.equal(clean((await page.locator('.mba-add-sentence [data-word]').allTextContents()).join(' ')),clean(fixtures[2].original));
  assert.equal(await finish.getAttribute('data-action'),'input');assert.match(await finish.innerText(),/讲完了 · 换一个句子/);await finish.click();
  await page.locator('#entry').waitFor();assert.equal(await page.locator('#entry').inputValue(),'');
  await reduced.close();
  await verifyKeyboardAndFallback();
  await writeFile(path.join(output,'browser.json'),JSON.stringify({reports,reducedMotion:true,delayedStream:true,keyboardAndFallback:true,noBackgroundMusic:true,automaticReplay:true,finishState:true},null,2));
  console.log(JSON.stringify({reports,reducedMotion:true,delayedStream:true,keyboardAndFallback:true,noBackgroundMusic:true,automaticReplay:true,finishState:true}));
}finally{await browser.close();}
