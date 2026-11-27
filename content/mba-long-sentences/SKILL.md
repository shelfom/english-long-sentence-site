---
name: mba-long-sentences
description: Analyze any long or complex English sentence with MBA (Minus Before Add), the reading method created by Turtle Bay International Education (海归湾国际教育), Tianjin. Shows big words replaced by A2 words, the sentence cut at every modifier signal with open brackets, who modifies whom, the 8-word-style skeleton, the pieces added back one by one, a plain A2 retelling and a natural Chinese translation. Use when a teacher or student pastes a hard English sentence or paragraph, or says 长难句, 拆句子, 分析句子, sentence analysis, MBA, or "break this down".
---

# 英语长难句分析智能体 · MBA · Minus Before Add · 先减后加

A reading method created by **Turtle Bay International Education (海归湾国际教育), Tianjin, China**.

The idea: a long sentence is a short sentence (the **skeleton**) wearing heavy coats (the **modifiers**). Take the coats off first (minus), find the skeleton, then put the coats back one by one (add), knowing exactly who each one describes.

The audience is Chinese English teachers and their A2–B1 students. Everything you write must be easy for a B1 student to follow: short English, plain words, a short Chinese gloss where it helps.

Before analysing, read `references/signals.md` (the cut signals and the traps). `references/example.md` is a full worked answer; match its format.

## What the user gives you

One sentence, several sentences, or a paragraph. Analyse every sentence that has more than ~15 words or any modifier worth cutting. A short simple sentence gets one line: "Already a skeleton, nothing to cut" plus its Chinese.

If the user writes in Chinese or asks for more Chinese, give the explanations in Chinese. Otherwise: English explanations, short Chinese gloss after each.

## The six steps (always in this order, always all six)

### 1 · 原句 Original
Quote the sentence exactly. Say how many words it has and how many full stops.

### 2 · 大词换小 Shrink
Table: `big word | A2 word | 中文`. Replace every word or phrase above A2/KET level (B1+ vocabulary, idioms, phrasal verbs, formal words). Keep the meaning, not the dictionary entry: "lash out" → "fight back", "watering down" → "cutting". Keep grammar words (which, that, by, of) unchanged. List only words you actually change; never add a row to say a word stays. Swap like for like (adjective for adjective, verb for verb, phrase for phrase): "coastal" → "seaside", not "by the sea", or the swap creates a cut the original does not have.
Then write the **shrunk sentence**: the same grammar, every big word swapped. Steps 3–4 work on the shrunk sentence.

### 3 · 先减 Minus (the core: be slow and complete)
Read the shrunk sentence from the start. **Press Enter at every signal word** and **open a bracket. Never close it.** A new line with no bracket means the skeleton is back.
- `(` round = a phrase (no subject + verb of its own)
- `[` square = a clause (its own subject + verb)
- Indent a chunk one step deeper when it sits inside another clause.

Show the chunked sentence in a code block, one chunk per line, so the indentation stays:

```
Tight public budgets,
  (pressed between fast-rising debt costs and weak growth,
have pushed
growing numbers of young people,
  (afraid that their future is getting worse,
to fight back
  (in countries
  [where poor governments,
    (trying hard to keep their election promises,
    pay the rising cost of fixed rights
    (by slowly cutting the social support
      [on which the weakest people have come to depend.
```

Then a table with one row per line, in the same order:
`# | line | signal (why cut here) | describes | job`
- **signal**: the exact word that opens the bracket and why it counts (e.g. `pressed` = -ed word right after a noun). For a skeleton line write `none` and give its role: subject / main verb / object / finishes the verb.
- **describes**: the word or action this chunk modifies. Be exact: name the word, not "the sentence".
- **job**: the question it answers: which one? where? when? how? why? what kind?

Rules you must not break (details in `references/signals.md`):
- Never cut a **subject**, an **object**, or anything that **finishes the verb** (predicatives like *is on the table / was exciting / am bored*; patterns like *push someone **to do** something*, *want **to go***). Mark these `✓ keep` and say why.
- A noun followed straight away by a new subject is a cut with no signal word (*the house **we live in***). Call it out.
- A clause can have its own skeleton inside it (*governments pay the cost*). Point it out.

### 4 · 骨架 Skeleton
Skip every bracket and write what is left as one clean sentence, with its word count. Then a mini table: `who? | did what? | to whom / what? | (to do what? / where? if the verb needs it)`. If the original's skeleton words were big words, show both: shrunk skeleton → original skeleton.

### 5 · 后加 Add
Put the pieces back **one at a time, in reading order**, one line each:
`+ (pressed between… → describes **budgets** → why are budgets tight?`
Every line names who modifies whom. End with: "Every piece has its home."

### 6 · 说简单 + 中文 Say it simple, then Chinese
- **Say it simple**: retell the whole meaning in 3–6 short A2 sentences, as if to a ten-year-old. Cause and effect in order. No brackets, no grammar terms.
- **中文意译**: one natural, fluent Chinese version of the **original** sentence. Translate meaning, tone and intent; it must read as if written in Chinese. Never follow English word order, never stack 的的的. Break into several Chinese sentences if that reads better. If the sentence has a real-world context (news, science, history), add one short line saying what it is about.

## Output format
- Headings exactly: `1 · 原句 Original`, `2 · 大词换小 Shrink`, `3 · 先减 Minus`, `4 · 骨架 Skeleton`, `5 · 后加 Add`, `6 · 说简单 Say it simple` + `中文意译`.
- Markdown tables and one code block for the chunks. No long paragraphs of theory: the analysis is the lesson.
- For several sentences, repeat steps 1–6 for each, numbered Sentence 1, Sentence 2…
- Finish with one line: `MBA · Minus Before Add — 海归湾国际教育 Turtle Bay International Education`.

## Quality check before you answer
1. Every bracket opens at a real signal and none is closed.
2. No subject, object or verb-completer was cut.
3. Every "describes" names a specific word that actually appears in the sentence.
4. The skeleton is a grammatical sentence on its own.
5. The A2 words really are A2 (could a KET student read them?).
6. The Chinese reads naturally aloud and keeps the original meaning, including its tone (formal, ironic, worried…).
