import {z} from 'zod';
const str=z.string().max(4800);
const filled=str.min(1);
const idx=z.number().int().min(-1);
const swap=z.object({big:filled,small:filled,zh:filled,startIndex:idx});
const chunk=z.object({text:filled,originalText:filled,zh:filled,bracket:z.enum(['(','[']).nullable(),depth:z.number().int().min(0).max(12),kind:z.enum(['skeleton','phrase','clause','inner-skeleton']),signal:str,signalWhy:str,describes:str,describesIndex:idx,job:str,role:str,keep:z.boolean(),note:str});
export const schema=z.object({
  original:filled,wordCount:idx,fullStops:idx,shrink:z.array(swap).max(260),shrunk:filled,
  chunks:z.array(chunk).min(1).max(300),
  skeleton:z.object({text:filled,words:idx,original:filled,table:z.array(z.object({q:filled,a:filled,term:str})).max(20)}),
  add:z.array(z.object({chunkIndex:idx,describes:filled,question:filled})).max(300),
  simple:z.array(filled).max(6).default([]),zh:filled,originalZh:filled,context:str,staticNotice:str.optional()
});
export type Analysis=z.infer<typeof schema>;
