import assert from 'node:assert/strict';
import test from 'node:test';
import {expandAnalysis,streamRows,type LiveChunk} from '../lib/compact-analysis.ts';
import {validate} from '../lib/validate.ts';

const source='The map I devised is here.';
const raw={
  swaps:[['devised','made','制作']],
  lines:[
    ['The map','s',0,'这张地图','主语'],
    ['I made','c',1,'我做的','map','I','关系代词被省略','哪张地图？'],
    ['is here.','s',0,'在这里','谓语'],
  ],
  core:'The map is here.',hardCore:'The map is here.',roles:[['什么？','The map','主语']],zh:'我做的那张地图在这里。',
};

test('compact grammar restores source slices and feeds the existing validator',()=>{
  const lesson=validate(expandAnalysis(source,raw),source);
  assert.equal(lesson.chunks[1].originalText,'I devised');
  assert.equal(lesson.shrink[0].startIndex,10);
  assert.deepEqual(lesson.add,[{chunkIndex:1,describes:'map',question:'哪张地图？'}]);
});

test('a stream split between any two characters delivers each completed real chunk early and exactly once',()=>{
  const chunks:LiveChunk[]=[], previews:string[]=[];
  const read=streamRows(source,p=>previews.push(p.shrunk),c=>chunks.push(c));
  const encoded=JSON.stringify(raw,null,2);
  for(let end=1;end<=encoded.length;end++){
    read(encoded.slice(0,end));
    if(end===encoded.indexOf('"core"'))assert.equal(chunks.length,3);
  }
  assert.deepEqual(previews,['The map I made is here.']);
  assert.deepEqual(chunks.map(c=>c.text),['The map','I made','is here.']);
});

test('misaligned rows are withheld from the classroom',()=>{
  const chunks:LiveChunk[]=[];
  const read=streamRows(source,()=>{},c=>chunks.push(c));
  read(JSON.stringify({...raw,lines:[raw.lines[0],['new words','s',0,'新词','主语']]}));
  assert.deepEqual(chunks.map(c=>c.text),['The map']);
});
