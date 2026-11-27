import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {validate,splitText} from '../lib/validate.ts';
import {limit,reserve,stats,cached,save} from '../lib/store.ts';
const samples=JSON.parse(readFileSync(new URL('../content/examples.json',import.meta.url),'utf8'));
process.env.DATA_DIR=mkdtempSync(join(tmpdir(),'mba-qa-'));process.env.CACHE_SECRET=randomBytes(32).toString('hex');
test('gold examples and invalid chunk detection',()=>{
 for(const item of samples)validate(item,item.original);
 assert.equal(samples[0].skeleton.text,'Budgets have pushed young people to fight back.');
 const punctuation=structuredClone(samples[0]);punctuation.chunks.at(-1).text=punctuation.chunks.at(-1).text.replace(/\.$/,'');assert.deepEqual(validate(punctuation,punctuation.original).chunks,samples[0].chunks);
 const bad=structuredClone(samples[0]);bad.chunks[1].text='wrong';assert.throws(()=>validate(bad,bad.original));
});
test('vocabulary swaps and both chunk tracks preserve each sentence',()=>{
 for(const example of samples){
  const data=validate(example,example.original);
  assert.equal(data.chunks.map(c=>c.originalText).join(' '),data.original);
  assert.equal(data.chunks.map(c=>c.text).join(' '),data.shrunk);
  assert.ok(data.chunks.every(c=>/\p{Script=Han}/u.test(c.zh)));
 }
 assert.equal(samples[2].shrink.length,0);
 const altered=structuredClone(samples[0]);altered.shrink[0].small+=' unrelated';
 assert.throws(()=>validate(altered,altered.original),/listed swaps/);
});
test('three-sentence paragraph',()=>assert.equal(splitText('Mia reads. She likes books. Her friends read too.').length,3));
test('hourly rate applies by address, separately to photo and analysis',()=>{
 const req=new Request('http://localhost',{headers:{'X-TB-Client':'test-address'}});
 for(const [name,max] of [['analyze',30],['ocr',10]] as const){
  for(let i=0;i<max;i++)limit(req,name);
  assert.throws(()=>limit(req,name),{status:429});}
});
test('concurrent reservations cannot pass daily cap; actual usage is recorded',()=>{
 process.env.DAILY_TOKEN_BUDGET='100';const done=reserve(80);assert.throws(()=>reserve(30),{status:429});done(20,10);
 const end=reserve(70);end(50,20);assert.throws(()=>reserve(1),{status:429});assert.equal(stats()[0].output,30);
});
test('cache hits, language separation and no plaintext in database',()=>{
 const a=samples[0];save(a.original,'zh',a);assert.deepEqual(cached(a.original,'zh'),a);assert.equal(cached(a.original,'en'),null);
 const db=join(process.env.DATA_DIR!,'usage.sqlite');for(const p of [db,db+'-wal'])assert.ok(!readFileSync(p).includes(Buffer.from(a.original)));
});

test('skeleton translations omit removed meanings and protecting the original complement works on both passes',()=>{
 const europe=validate(samples[0],samples[0].original);
 assert.equal(europe.skeleton.zh,'预算压力已促使年轻人起来反抗。');
 assert.equal(europe.skeleton.originalZh,'预算压力已促使年轻人愤而反击。');
 assert.deepEqual(europe.chunks.slice(6).map(c=>c.depth),[1,2,3,2,3,4]);
 assert.equal(europe.chunks[5].originalText,'to lash out');assert.equal(europe.chunks[5].bracket,null);
 const bad=structuredClone(samples[0]);bad.skeleton.originalZh='Translation missing';assert.throws(()=>validate(bad,bad.original));
});
test('old encrypted cores are upgraded only when a complete existing translation matches',()=>{
 const old=structuredClone(samples[0]);delete old.skeleton.zh;delete old.skeleton.originalZh;
 save(old.original,'legacy',old);assert.equal(cached(old.original,'legacy'),null);
 const makeShort=(withModifier:boolean)=>{
  const core='The doors closed.',original=withModifier?'The doors closed after dark.':core;
  const zh=withModifier?'天黑后门关上了。':'门关上了。';
  const kept={...old.chunks[0],text:withModifier?'The doors closed':core,originalText:withModifier?'The doors closed':core,zh:'门关上了'};
  const modifier={...old.chunks[1],text:'after dark.',originalText:'after dark.',zh:'天黑之后',signal:'after',describes:'closed',describesIndex:10,job:'什么时候关？'};
  return {...old,original,shrunk:original,zh,originalZh:zh,shrink:[],chunks:withModifier?[kept,modifier]:[kept],
    add:withModifier?[{chunkIndex:1,describes:'closed',question:'什么时候关？'}]:[],skeleton:{text:core,original:core,words:3,table:[]}};
 };
 for(const withModifier of [false,true]){
  const a=makeShort(withModifier);save(a.original,'legacy',a as typeof old);
  const hit=cached(a.original,'legacy');assert.equal(hit?.skeleton.zh,'门关上了。');assert.equal(hit?.skeleton.originalZh,'门关上了。');
 }
});
