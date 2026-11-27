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

async function sample(page) {
  await page.locator('.samples button').first().click();
  await page.locator('[data-stage="6"]:enabled').waitFor();
  await page.evaluate(() => document.fonts.ready);
}
function monitor(page, errors) {
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
}

try {
  for (const [width, height] of [[390,844], [1440,900]]) {
    const context = await browser.newContext({ viewport: {width,height}, permissions: ['clipboard-read','clipboard-write'] });
    const page = await context.newPage();
    const errors = []; monitor(page, errors);
    const clockStart = new Date('2025-01-01T00:00:00Z');
    await page.clock.install({time:clockStart});
    await page.goto(baseURL);
    // Exercise a hydrated control before screenshots touch the input's native caret.
    await page.getByRole('button',{name:'Switch interface language'}).click();
    await page.locator('html[lang=en]').waitFor();
    await page.getByRole('button',{name:'Switch interface language'}).click();
    await page.locator('html[lang=zh-CN]').waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({caret:'initial',path: path.join(output, width + '-home.png')});
    await sample(page);
    // The clock advances the real player timers one beat at a time. React still commits
    // the normal autoplay sequence, and the test checks every rendered animation beat.
    await page.clock.pauseAt(new Date(clockStart.getTime() + 60000));
    await page.getByTestId('lesson-replay').evaluate(button => button.click());
    const stage = page.getByTestId('lesson-stage');
    await page.waitForFunction(() => document.querySelector('[data-testid=lesson-stage]')?.dataset.step === '1');
    const checked = new Set(), screens = new Set(), lengths = new Map();
    let sawHyphenated = false, done = false;
    for (let guard = 0; guard < 350 && !done; guard++) {
      const { step, frame, end } = await stage.evaluate(el => ({
        step: Number(el.dataset.step), frame: Number(el.dataset.frame), end: Number(el.dataset.frameEnd),
      }));
      lengths.set(step,end + 1);
      const key = step + '/' + frame;
      if (!checked.has(key)) {
        checked.add(key);
        await inspectWords(page);
        if (step === 1) sawHyphenated ||= await page.locator('[data-word]').allTextContents().then(t => t.includes('cash-strapped'));
        const wanted = [end, Math.min(8,end), Math.min(7,end), end, Math.min(4,end), end][step-1];
        if (frame >= wanted && !screens.has(step)) {
          screens.add(step);
          await page.getByTestId('lesson').evaluate(el => el.scrollIntoView({block:'start',behavior:'instant'}));
          // Capture the settled cue. A translation can start below a phone's fold.
          await page.clock.fastForward(420);
          await realDelay(400);
          if (step === 6) await page.locator('.ls-translation').scrollIntoViewIfNeeded();
          await page.screenshot({caret:'initial',path:path.join(output,width + '-step-' + step + '.png')});
        }
      }
      done = step === 6 && frame === end;
      if (!done) await page.clock.fastForward(step === 1 && frame < end ? 65 : 2400);
    }
    assert.ok(done, 'Autoplay should reach the final translation');
    assert.equal(screens.size,6,'All steps must appear');
    const missing = [...lengths].flatMap(([s,n]) => Array.from({length:n},(_,i) => s + '/' + i).filter(k => !checked.has(k)));
    assert.deepEqual(missing,[],'Every cue must undergo the overlap check');
    await page.clock.resume();
    assert.ok(sawHyphenated, 'Hyphenated source word must stay whole');
    await page.getByTestId('lesson-prev').click();
    assert.equal(await stage.getAttribute('data-step'),'5');
    await page.getByTestId('lesson-next').click();
    await page.locator('[data-stage="4"]').click();
    assert.match(await stage.innerText(),/Budgets have pushed young people to fight back\./);
    assert.match(await stage.innerText(),/Budgets have prompted young people to lash out\./);
    await page.getByTestId('lesson-copy').click();
    const exported = await page.evaluate(() => navigator.clipboard.readText());
    assert.match(exported,/3 · 先减 Minus/);
    assert.match(exported,/Every piece has its home\./);
    assert.match(exported,/中文意译/);
    await page.getByTestId('lesson-all').click();
    assert.equal(await page.locator('.ls-all > section').count(),6);
    await inspectWords(page,'.ls-all');
    await page.emulateMedia({media:'print'});
    assert.equal(await page.locator('.ls-all').isVisible(),true);
    assert.equal(await page.locator('.ls-tools').isVisible(),false);
    await page.emulateMedia({media:'screen'});
    await page.getByTestId('lesson-all').click();
    await page.locator('.ls-controls select').selectOption('1.5');
    await page.getByTestId('lesson-replay').click();
    await page.getByTestId('lesson-play').click();
    const pausedAt = await stage.getAttribute('data-frame');
    await page.clock.fastForward(5000);
    assert.equal(await stage.getAttribute('data-frame'),pausedAt);
    assert.equal(await page.getByTestId('lesson-play').getAttribute('aria-pressed'),'false');
    await page.getByRole('button',{name:'Switch interface language'}).click();
    assert.equal(await page.locator('html').getAttribute('lang'),'en');
    assert.match(await page.locator('.ls-steps').innerText(),/Skeleton/);
    assert.deepEqual(errors,[]);
    reports.push({width,height,autoplayFramesChecked:checked.size,stageScreenshots:screens.size,consoleErrors:errors});
    await context.close();
  }
  const reduced = await browser.newContext({reducedMotion:'reduce',viewport:{width:390,height:844}});
  const page = await reduced.newPage();
  await page.goto(baseURL); await sample(page);
  assert.equal(await page.getByTestId('lesson-play').getAttribute('aria-pressed'),'false');
  await page.getByTestId('lesson-next').click();
  assert.equal(await page.getByTestId('lesson-stage').getAttribute('data-step'),'2');
  assert.ok(await page.locator('.ls-player').evaluate(el => [el,...el.querySelectorAll('*')].every(n => getComputedStyle(n).animationName === 'none')));
  await reduced.close();
  await copyFile(path.join(output,'1440-home.png'),'public/screenshot.png');
  await writeFile(path.join(output,'browser.json'),JSON.stringify({reports,reducedMotion:true},null,2));
  console.log(JSON.stringify({reports,reducedMotion:true}));
} finally { await browser.close(); }
