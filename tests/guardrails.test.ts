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
