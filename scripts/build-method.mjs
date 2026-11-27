import {readFileSync,writeFileSync} from 'node:fs';
const base=new URL('../content/mba-long-sentences/',import.meta.url);
const method=['SKILL.md','references/signals.md','references/example.md'].map(f=>readFileSync(new URL(f,base),'utf8')).join('\n\n');
writeFileSync(new URL('../lib/method.json',import.meta.url),JSON.stringify(method));
