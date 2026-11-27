# 英语长难句分析智能体 · English Long Sentence Analyzer

**[打开网站 · Open the analyzer](https://sentence.turtlebayedu.com)**　|　[GitHub 技能主页 · Installable skill](https://github.com/shelfom/english-long-sentence-agent)　|　[下载技能包 · Download ZIP](https://github.com/shelfom/english-long-sentence-agent/releases/latest/download/mba-long-sentences.zip)

把英文句子或段落粘贴进输入框，也可以上传英文照片，校对识别结果后开始分析。无需注册。点击例句即可播放，课堂上可逐步讲解、打印全文或复制讲义。

Paste up to 1,500 characters of English or upload a JPG, PNG or HEIC photo up to 8 MB. Correct the extracted text before analyzing. Use the sentence picker for paragraphs. The three worked examples are available instantly and use no model tokens.

![英语长难句分析智能体首页 · Analyzer homepage](public/screenshot.png)

## 教学方法 · Method

MBA means **Minus Before Add（先减后加）**. Read the original, simplify difficult words, mark modifiers, read the skeleton, add the modifiers back, then retell the meaning in simple English and Chinese. On the teaching screen, a round bracket opens a phrase and a square bracket opens a clause. Click a modifier to see what it describes.

教学规则、信号词表和标准例句来自[技能仓库](https://github.com/shelfom/english-long-sentence-agent/tree/5a19c025c79c3c2f10ad7766ba21c70cf6b9d9d8/skills/mba-long-sentences)。构建程序逐字读取本仓库中对应的三个文件，另加结构化数据格式要求。更新技能时请同步这三个源文件。

## 本地运行 · Run locally

Install Node.js 24 and run the following commands.

```sh
npm ci
npm run build
npm start
```

The homepage and worked examples run without credentials. For custom text or OCR, set `ARK_API_KEY` in the server environment. Set `CACHE_SECRET` to a random secret to enable encrypted caching and `STATS_TOKEN` to a different random secret for aggregate statistics. Keep secrets on the server. `DATA_DIR` selects the SQLite directory. `DAILY_TOKEN_BUDGET` defaults to 1,250,000 combined input and output tokens. Reservations protect against concurrent requests spending the same budget.

生产环境使用 Next.js、TypeScript、Tailwind、SQLite 和火山方舟 Doubao Seed 2.0 Pro。Caddy 负责 HTTPS，并覆盖客户端地址头。应用绑定本机回环地址，systemd 以 tbapps 身份运行。服务和站点配置见 [deploy](deploy/)。

Photos are processed in memory. The app stores aggregate daily token counts and encrypted, sentence-keyed cache entries with seven-day validity. Rate limits use an in-memory keyed hash of the address. A sentence costs no model tokens when an eligible cached answer is returned. The app sends submitted text and images to Volcengine Ark for inference.

## 测试 · Tests

```sh
npm test
npm start -- -H 127.0.0.1 -p 5196
# In another terminal, with Chromium installed
npm run qa:browser
```

Set `CHROME_PATH` to a Chromium executable and `TEST_BASE_URL` to test another instance. The browser test checks autoplay frames, word boundaries and overlaps, screenshots for all six steps at phone and desktop sizes, reduced motion, copying and printing.

Method by Turtle Bay International Education, Tianjin, China · 海归湾国际教育
