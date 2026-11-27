export function splitText(text: string) {
  return Array.from(new Intl.Segmenter('en', {granularity: 'sentence'}).segment(text), part => part.segment.trim()).filter(Boolean);
}
