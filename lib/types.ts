import {z} from 'zod';
const str=z.string().max(4800);
const filled=str.min(1);
const chinese=filled.regex(/\p{Script=Han}/u,'Translate the English skeleton into Chinese.');
const idx=z.number().int().min(-1);
// Offsets, counts and original chunk slices are recomputed from the sentence.
const extraText=z.preprocess(value=>value??'',str);
const derivedIndex=z.preprocess(value=>typeof value==='number'&&Number.isInteger(value)&&value>=-1?value:-1,idx);
const swap=z.object({big:filled,small:filled,zh:filled,startIndex:derivedIndex});
const chunk=z.object({text:filled,originalText:extraText,zh:filled,bracket:z.enum(['(','[']).nullable(),depth:z.number().int().min(0).max(12),kind:z.enum(['skeleton','phrase','clause','inner-skeleton']),signal:extraText,signalWhy:extraText,describes:extraText,describesIndex:derivedIndex,job:extraText,role:extraText,keep:z.boolean(),note:extraText});
export const schema=z.object({
  original:filled,wordCount:derivedIndex,fullStops:derivedIndex,shrink:z.array(swap).max(260),shrunk:filled,
  chunks:z.array(chunk).min(1).max(300),
  skeleton:z.object({text:filled,zh:chinese,originalZh:chinese,words:derivedIndex,original:filled,table:z.array(z.object({q:filled,a:filled,term:extraText})).max(20)}),
  add:z.array(z.object({chunkIndex:idx,describes:filled,question:filled})).max(300),
  simple:z.array(filled).max(6).default([]),zh:filled,originalZh:extraText,context:extraText,staticNotice:str.optional()
});
export type Analysis=z.infer<typeof schema>;
