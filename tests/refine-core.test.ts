import assert from 'node:assert/strict';
import test from 'node:test';
import {parseLoose,coreFlaws,Issues} from '../lib/repair.ts';
import {read} from '../lib/generate.ts';
import {withCore,reviewCore,lostNegatives,suit,vowelSound,type CoreReview} from '../lib/refine-core.ts';

type Line=[string,string,number,string,...string[]];
const none={input:0,output:0};
// A lesson from a compact answer, the way the site reads one. `settle` accepts it as the last attempt would.
function lesson(source:string,lines:Line[],core:string,hardCore=core,swaps:string[][]=[],roles:string[][]=[['谁？',core.split(' ').slice(0,2).join(' '),'主语']],settle=false){
  const raw=parseLoose(JSON.stringify({swaps,lines,core,hardCore,coreZh:'骨架的中文。',hardCoreZh:'骨架的中文。',roles,zh:'整句的中文。'}));
  return read(source,raw,settle?{final:true}:undefined).analysis;
}
const check=(text:string,original=text,zh='检查后的中文。'):CoreReview=>({text:{skeleton:text,zh},original:{skeleton:original,zh},usage:none});

const us='The US is cracking down on chip exports and smuggling, moves that put America in the driver’s seat.';
const usLines:Line[]=[
  ['The US is taking strict action against chip exports and illegal trade,','s',0,'美国正在严厉打击芯片出口和走私','主语、谓语和宾语'],
  ['moves','p',1,'这些举措','action','moves','同位语，概括前面的做法','什么举措？'],
  ['that put America in the driver’s seat.','c',2,'让美国掌握主动权','moves','that','定语从句修饰 moves','什么样的举措？'],
];
const usSwaps=[['cracking down on','taking strict action against','严厉打击'],['smuggling','illegal trade','走私']];
const usRoles=[['谁？','The US','主语'],['做什么？','is taking strict action against','谓语'],['针对什么？','chip exports and illegal trade','宾语'],['什么举措？','moves that put America in the driver’s seat','同位语']];

test('a core that subsets a replacement of several words is kept as written, in both wordings',()=>{
  const a=lesson(us,usLines,'The US is taking action against exports and trade.','The US is cracking down on exports and smuggling.',usSwaps,usRoles);
  assert.equal(a.skeleton.text,'The US is taking action against exports and trade.');
  assert.equal(a.skeleton.original,'The US is cracking down on exports and smuggling.');
});

test('a core written in the harder words keeps each replacement whole instead of picking stray words out of it',()=>{
  const a=lesson(us,usLines,'The US is cracking down on exports and smuggling.','The US is cracking down on exports and smuggling.',usSwaps,usRoles);
  assert.equal(a.skeleton.text,'The US is taking strict action against exports and illegal trade.');
  assert.equal(a.skeleton.original,'The US is cracking down on exports and smuggling.');
});

test('the second look takes the modifiers out of the skeleton: strict, chip, illegal',()=>{
  const full=lesson(us,usLines,'The US is taking strict action against chip exports and illegal trade.','The US is cracking down on chip exports and smuggling.',usSwaps,usRoles);
  const a=withCore(full,check('The US is taking action against exports and trade.','The US is cracking down on exports and smuggling.','美国正在对出口和贸易采取行动。'));
  assert.equal(a.skeleton.text,'The US is taking action against exports and trade.');
  assert.equal(a.skeleton.original,'The US is cracking down on exports and smuggling.');
  assert.equal(a.skeleton.words,9);
  // The Chinese under a skeleton that changed is the one written for it.
  assert.equal(a.skeleton.zh,'美国正在对出口和贸易采取行动。');
  // The questions under it quote only what it still has, in the simpler wording; one about a removed row goes.
  assert.deepEqual(a.skeleton.table.map(r=>r.a),['The US','is taking action against','exports and trade']);
  // Nothing else of the lesson moved.
  assert.deepEqual(a.chunks,full.chunks);
  assert.equal(a.zh,full.zh);
});

test('the second look may only take plain modifier words out',()=>{
  const source='The old museum gave full control of the collection to many villages.';
  const whole=lesson(source,[[source,'s',0,'那家老博物馆把藏品的全部控制权交给了许多村庄','整句']],source);
  const core=(answer:string)=>withCore(whole,check(answer)).skeleton.text;
  // Adjectives before a word that stays go; a phrase with its preposition and a quantity word stay.
  assert.equal(core('The museum gave control to villages.'),'The museum gave control of the collection to many villages.');
  // A head noun is no modifier, even where "many" could stand alone.
  assert.equal(core('The old museum gave full control of the collection to many.'),source);
  // An added, reworded or moved word voids the answer.
  assert.equal(core('The museum kindly gave control of the collection to many villages.'),source);
  assert.equal(core('The museum handed control of the collection to many villages.'),source);
  assert.equal(core('Many villages gave the museum control.'),source);
  // The Chinese is the second look's only where the lesson took its skeleton whole.
  assert.equal(withCore(whole,check('The museum gave control to villages.')).skeleton.zh,whole.skeleton.zh);
  assert.equal(withCore(whole,check('The museum gave control of the collection to many villages.')).skeleton.zh,'检查后的中文。');
  // Structure words and degree words hold the sentence together.
  const loose='The rules were too loose to stop the largest firms.';
  const rules=lesson(loose,[[loose,'s',0,'这些规则太宽松，拦不住最大的企业','整句']],loose);
  assert.equal(withCore(rules,check('The rules were loose to stop firms.')).skeleton.text,loose);
  assert.equal(withCore(rules,check('The rules were too loose to stop the firms.')).skeleton.text,'The rules were too loose to stop the firms.');
  // An adverb goes wherever it stands.
  const risen='Prices have risen sharply.';
  assert.equal(withCore(lesson(risen,[[risen,'s',0,'价格大幅上涨','整句']],risen),check('Prices have risen.')).skeleton.text,'Prices have risen.');
});

test('a skeleton never loses its negative',()=>{
  const source='The new idea still finds little support.';
  const lines:Line[]=[[source,'s',0,'这个新想法仍然少有人支持','整句']];
  // The model is asked once to put it back …
  assert.throws(()=>lesson(source,lines,'The idea finds support.'),(e:unknown)=>e instanceof Issues&&/"little" out of "little support"/.test(e.list.join()));
  // … and where it does not, the word returns to its place.
  const settled=lesson(source,lines,'The idea finds support.',undefined,[],undefined,true);
  assert.equal(settled.skeleton.text,'The idea finds support.');
  assert.equal(lostNegatives(settled).length,1);
  assert.equal(withCore(settled).skeleton.text,'The idea finds little support.');
  // The second look cannot take it out either, while "new" and "still" may go.
  const kept=lesson(source,lines,source);
  assert.equal(withCore(kept,check('The idea finds support.')).skeleton.text,'The idea finds little support.');
  // "A few" and "a little" are not negatives.
  const few='The team found a few clear answers.';
  assert.deepEqual(lostNegatives(lesson(few,[[few,'s',0,'团队找到了几个清楚的答案','整句']],'The team found answers.')),[]);
});

test('a or an suits the word that now follows it',()=>{
  for(const [word,an] of [['hour',true],['honest',true],['open',true],['MRI',true],['18-year-old',true],['8',true],['umbrella',true],['urgent',true],
    ['university',false],['European',false],['one-off',false],['user',false],['UN',false],['question',false],['100',false],['NATO',false],['unintended',true]] as const)
    assert.equal(vowelSound(word),an,word);
  const source='Whether the drug works remains an open question.';
  const a=lesson(source,[[source,'s',0,'这种药是否有效仍是一个悬而未决的问题','整句']],'Whether the drug works remains an question.');
  assert.equal(withCore(a).skeleton.text,'Whether the drug works remains a question.');
  // Where the sentence's own next word still follows, the sentence decides.
  assert.equal(suit('It took an hour.',[{word:'it',from:0,to:2},{word:'took',from:3,to:7},{word:'an',from:8,to:10},{word:'hour',from:11,to:15}]),'It took an hour.');
  const long='She waited a long hour.';
  assert.equal(withCore(lesson(long,[[long,'s',0,'她等了漫长的一小时','整句']],'She waited a hour.')).skeleton.text,'She waited an hour.');
});

test('a core that is no sentence goes back to the model once',()=>{
  // An inverted verb without the words that caused the inversion.
  assert.match(coreFlaws('Not until the archives were opened did it become clear how officials had lied.','did it become clear')[0],/inverted verb "did"/);
  assert.deepEqual(coreFlaws('Had the engineers taken the warnings seriously, the town might have been spared.','Had the engineers taken the warnings, the town might have been spared.'),[]);
  assert.deepEqual(coreFlaws('Why do voters return them?','Do voters return them?'),[]);
  // A verb that lost the head it agrees with.
  assert.match(coreFlaws('Only when the last of the glaciers that feed the river has retreated will the farmers grasp it.','Only when the glaciers has retreated will the farmers grasp it.')[0],/"the last of the glaciers"/);
  assert.deepEqual(coreFlaws('The United States has agreed to the deal.','The United States has agreed.'),[]);
  assert.deepEqual(coreFlaws('The number of students who apply has risen.','The number has risen.'),[]);
});

test('each wording is checked by its own small request, and one request serves a sentence with no replacement',async()=>{
  const full=lesson(us,usLines,'The US is taking strict action against chip exports and illegal trade.','The US is cracking down on chip exports and smuggling.',usSwaps,usRoles);
  const asked:string[]=[];
  const review=await reviewCore(full,async(_system,user)=>{
    asked.push(user);
    const {skeleton}=JSON.parse(user) as {skeleton:string};
    return {answer:JSON.stringify({skeleton:skeleton.replace(/ (strict|chip|illegal)\b/g,''),zh:'美国正在打击出口和走私。'}),usage:{input:300,output:40}};
  });
  assert.equal(asked.length,2);
  assert.deepEqual(asked.map(u=>(JSON.parse(u) as {kept:string}).kept).sort(),['The US is cracking down on chip exports and smuggling,','The US is taking strict action against chip exports and illegal trade,']);
  assert.deepEqual(review.usage,{input:600,output:80});
  assert.equal(withCore(full,review).skeleton.text,'The US is taking action against exports and trade.');
  assert.equal(withCore(full,review).skeleton.original,'The US is cracking down on exports and smuggling.');
  const plain='The old map is still here.';
  let calls=0;
  const one=await reviewCore(lesson(plain,[[plain,'s',0,'这张旧地图还在这里','整句']],plain),async()=>{calls++;return {answer:'{"skeleton":"The map is here.","zh":"地图在这里。"}'};});
  assert.equal(calls,1);
  assert.deepEqual(one.original,one.text);
  // A request that fails leaves the lesson as it was.
  const failed=await reviewCore(full,async()=>{throw Error('down');});
  assert.deepEqual(withCore(full,failed).skeleton.text,withCore(full).skeleton.text);
});
