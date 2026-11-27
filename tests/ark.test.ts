import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
process.env.DATA_DIR=mkdtempSync(join(tmpdir(),'mba-ark-'));process.env.ARK_API_KEY='test-key';
const {ark}=await import('../lib/ark.ts');
const {stats}=await import('../lib/store.ts');

// Serves the given text pieces as a streamed chat completion and counts how many were read.
function serve(pieces:string[],usage?:{prompt_tokens:number,completion_tokens:number}){
  let sent=0,body:unknown;
  const frames=[...pieces.map(content=>({choices:[{delta:{content}}]})),...(usage?[{usage}]:[])];
  globalThis.fetch=(async(_url:unknown,init:{body:string})=>{
    body=JSON.parse(init.body);
    return new Response(new ReadableStream({pull(controller){
      if(sent<frames.length)controller.enqueue(new TextEncoder().encode('data: '+JSON.stringify(frames[sent++])+'\n\n'));
      else{controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));controller.close();}
    }},{highWaterMark:0}));
  }) as unknown as typeof fetch;
  return {read:()=>sent,body:()=>body as {messages:{role:string,content:string}[]}};
}

test('a correction travels as a follow-up turn after the model\'s own answer',async()=>{
  const served=serve(['{"ok":','true}'],{prompt_tokens:12,completion_tokens:3});
  const seen:string[]=[];
  const reply=await ark('system','first request',500,text=>seen.push(text),{assistant:'my earlier answer',user:'please correct this'});
  assert.equal(reply.answer,'{"ok":true}');assert.deepEqual(reply.usage,{input:12,output:3});assert.deepEqual(seen,['{"ok":','{"ok":true}']);
  assert.deepEqual(served.body().messages.map(m=>[m.role,m.content]),[['system','system'],['user','first request'],['assistant','my earlier answer'],['user','please correct this']]);
});

test('a reply that dissolves into blank space is cut off instead of running to the token limit',async()=>{
  const start='{"swaps":[],"lines":[["The map","s",0,"这张地图","主语"]],'+'"x":"'+'y'.repeat(400)+'",';
  const served=serve([start,...Array<string>(500).fill(' \n\t \n'.repeat(20))]);
  const reply=await ark('system','request',9000);
  assert.equal(reply.answer,start);
  assert.ok(served.read()<10,'stopped reading after '+served.read()+' pieces');
  const today=stats()[0] as {output:number};
  assert.ok(today.output<9000,'charged for what was written, not the whole limit');
});
