import assert from 'node:assert/strict';
import test from 'node:test';
import {reviewNested} from '../lib/refine-nesting.ts';
import {expandAnalysis} from '../lib/compact-analysis.ts';
import {validate} from '../lib/validate.ts';

function initial(front:string,subject:string,relative:string,object:string,complement:string){
  const source=`${front} ${subject} ${relative} asked ${object} ${complement}`;
  const core=`${subject} asked ${object} ${complement}`;
  return validate(expandAnalysis(source,{swaps:[],lines:[
    [front,front.startsWith('Although')?'c':'p',1,'背景','asked',front.split(' ')[0],'交代动作背景','在什么情况下？'],
    [subject,'s',0,'主语','主语'],[relative,'c',1,'修饰人物',subject,'who','关系从句补充说明前面的名词','哪一位？'],
    ['asked','s',0,'请','谓语'],[object,'s',0,'对方','宾语'],[complement,'s',0,'去做这件事','必要补语'],
  ],core,hardCore:core,coreZh:'他请对方做这件事。',hardCoreZh:'他请对方做这件事。',roles:[],zh:'他请对方做这件事。'}),source);
}
const violin=initial('After the rehearsal,','the violinist','who practised in the chapel before sunrise','the conductor','to postpone the concert.');
const bridge=initial('Although the river was receding,','the engineer','who had inspected the bridge near the village','the driver','to wait.');
const musicParts=[['who practised','练琴的'],['in the chapel','在礼拜堂里','p','practised','说明练琴的地点','在哪儿练琴？'],['before sunrise','日出前','p','practised','说明练琴的时间','何时练琴？']];
const bridgeParts=[['who had inspected the bridge','之前检查过那座桥的'],['near the village','在村庄附近','p','bridge','说明桥的位置','哪座桥？']];

test('one targeted request splits both live failure patterns into exact, anchored nested modifiers',async()=>{
  for(const [before,parts] of [[violin,musicParts],[bridge,bridgeParts]] as const){
    let calls=0;
    const review=await reviewNested(before,async(_system,payload)=>{
      calls++;const {rows}=JSON.parse(payload);assert.deepEqual(rows.map((r:{id:number})=>r.id),[2]);
      return {answer:JSON.stringify({edits:[{id:2,parts}]}),usage:{input:73,output:42}};
    });
    assert.equal(calls,1);assert.deepEqual(review.usage,{input:73,output:42});
    const a=review.analysis,sub=a.chunks.slice(2,2+parts.length);
    assert.deepEqual(sub.map(c=>c.text),parts.map(p=>p[0]));
    assert.deepEqual(sub.map(c=>c.depth),parts.map((_,i)=>i?2:1));
    for(const c of sub.slice(1)){assert.equal(c.bracket,'(');assert.equal(a.shrunk.slice(c.describesIndex,c.describesIndex+c.describes.length),c.describes);}
    assert.deepEqual(a.skeleton,before.skeleton);assert.deepEqual(a.chunks.at(-1),before.chunks.at(-1));
    assert.equal(a.chunks.map(c=>c.originalText).join(' '),before.original);
    await reviewNested(a,async()=>{calls++;throw Error('unexpected repeat review');});assert.equal(calls,1);
  }
});
test('required preposition, provider failure, nonexistent target and invented words preserve old analysis',async()=>{
  const bound=initial('After school,','the child','who relied on the map','the teacher','to help.');let calls=0;
  const kept=await reviewNested(bound,async()=>{calls++;return {answer:'{"edits":[]}'}});
  assert.equal(calls,0);assert.deepEqual(kept.analysis.chunks,bound.chunks);
  const invalid=[{id:2,parts:[musicParts[0],['in the tower','在塔里',...musicParts[1].slice(2)],musicParts[2]]},
    {id:2,parts:[musicParts[0],[...musicParts[1].slice(0,3),'conductor',...musicParts[1].slice(4)],musicParts[2]]}];
  for(const edit of invalid){const r=await reviewNested(violin,async()=>({answer:JSON.stringify({edits:[edit]})}));assert.deepEqual(r.analysis.chunks,violin.chunks);}
  const fail=await reviewNested(violin,async()=>{throw Error('temporarily unavailable');});assert.deepEqual(fail.analysis.chunks,violin.chunks);
});
