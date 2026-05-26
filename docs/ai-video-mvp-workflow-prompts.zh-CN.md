# VideoBrief MVP Pro 工作流与 Prompt 手册

> 用途：把 AI 视频研究笔记个人项目从“行动方针”变成可执行工作流。  
> 原则：场景要窄，体验要完整。先做英文 YouTube 视频 -> 中文/繁中研究笔记的 MVP Pro Web/PWA。

## 0. 总工作流

推荐顺序：

```text
1. 选题和样例
  -> 2. 样例研究笔记
  -> 3. 页面信息架构
  -> 4. Stitch / Figma Make 高保真原型
  -> 5. v0 生成页面代码
  -> 6. Codex 搭 MVP Pro 产品壳
  -> 7. 接 AI 生成和问答链路
  -> 8. 接 Supabase / Stripe / Analytics
  -> 9. 用真实视频验收
  -> 10. 更新进度记录
```

每完成一个阶段，都更新：

`docs/ai-video-solo-founder-progress.zh-CN.md`

## 1. 选 3 条样例视频

### 操作

选 3 条英文 YouTube 视频，覆盖第一批目标用户最关心的场景：

1. AI / 科技访谈。
2. 金融 / 商业分析。
3. 课程 / 学习型视频。

### 工具

- YouTube
- Google Search
- X / LinkedIn 热门分享
- 手动判断

### 选择标准

- 英文内容。
- 20-90 分钟。
- 有明确知识价值。
- 目标用户可能“想看但没时间看”。
- 最好有 transcript 或字幕。

### Prompt

可给 ChatGPT / Gemini / Perplexity：

```text
我正在做一个 AI 视频研究笔记产品，目标用户是中文/繁中用户，特别是香港/海外华人金融、科技、AI、商业学习人群。

请帮我挑选 10 条适合做首批样例的英文 YouTube 视频，要求：
1. 主题覆盖 AI/科技、金融/商业、课程/学习。
2. 视频要有明确知识价值，不要纯娱乐。
3. 适合生成中文研究笔记。
4. 用户可能愿意为“节省观看时间、快速理解核心观点”付费。

请输出表格：
- 视频标题
- 频道/作者
- 主题分类
- 适合目标用户
- 为什么适合作为样例
- 可能生成的研究笔记卖点
```

### 产出

`docs/sample-video-candidates.zh-CN.md`

### 验收

- 至少 10 条候选。
- 选出 3 条正式样例。
- 每条都能说清楚目标用户和价值。

## 2. 生成 3 篇高质量研究笔记样例

### 操作

对 3 条视频分别生成研究笔记样例。第一轮可以人工增强，目的是得到能打动用户的展示样例。

### 工具

- ChatGPT / Gemini / Claude
- NotebookLM
- 手动校对

### 输入材料

- 视频标题。
- 视频 URL。
- transcript 或字幕文本。
- 视频目标用户。

### Prompt

```text
你是一个专业研究助理，擅长把英文 YouTube 视频转化为中文研究笔记。

请根据下面的视频 transcript，生成一份面向中文/繁中高价值用户的研究笔记。

目标用户：
- 香港/海外华人金融从业者
- 科技/AI/商业学习人群
- 想快速理解英文视频但没时间完整观看的人

输出要求：
1. 中文表达要自然，像人写的研究笔记，不要像机器翻译。
2. 不要编造 transcript 中没有的信息。
3. 对重要观点尽量保留时间点或 transcript 依据。
4. 涉及金融、投资、法律、医疗内容时，不要给建议，只做信息总结。
5. 如果视频没有支持某个结论，要写“不确定”。

输出结构：

# {{视频标题}} - 中文研究笔记

## 一句话结论

## 3 行核心摘要

## 这条视频适合谁看

## 分章节笔记

| 时间 | 主题 | 重点 |
|---|---|---|

## 关键观点

## 重要概念解释

## 可以直接执行的行动清单

## 值得继续追问的问题

## 原视频局限

## 免责声明

视频信息：
标题：{{title}}
URL：{{url}}
Transcript：
{{transcript}}
```

### 二次润色 Prompt

```text
请把下面这份 AI 生成的视频研究笔记润色成可以直接展示给早期用户的样例。

要求：
1. 保持内容准确，不要增加 transcript 没有的信息。
2. 提升中文可读性，减少机器感。
3. 让标题、小节、关键观点更适合截图传播。
4. 保留专业感，不要营销腔。
5. 对目标用户强调“省时间、抓重点、可复用”。

原文：
{{note_markdown}}
```

### 产出

- `docs/samples/sample-01.zh-CN.md`
- `docs/samples/sample-02.zh-CN.md`
- `docs/samples/sample-03.zh-CN.md`

### 验收

- 每篇样例可以作为 landing page 展示片段。
- 每篇能让用户 30 秒内理解产品价值。
- 不出现明显幻觉或投资建议。

## 3. 梳理页面信息架构

### 操作

先定 5 个关键页面的信息结构，再进入原型工具。

### 页面

第一轮只做 5 张关键页面：

1. Landing Page
2. Dashboard
3. New Analysis
4. Generation Progress
5. Video Research Note Result Page

### Prompt

```text
请为一个名为 VideoBrief 的 AI 视频研究笔记 Web/PWA 设计 MVP Pro 的页面信息架构。

产品定位：
把英文 YouTube 商业、金融、科技、AI 视频转成中文/繁中研究笔记。

目标用户：
香港/海外华人金融、科技、AI、商业学习人群。

MVP 范围：
- 登录
- YouTube URL + transcript 输入
- AI 生成中文研究笔记
- 生成进度
- 视频研究笔记结果页
- 视频内容追问
- 历史记录
- Markdown 复制
- 免费额度和付费入口

请输出 5 个页面的信息架构：
1. Landing Page
2. Dashboard
3. New Analysis
4. Generation Progress
5. Video Research Note Result Page

每个页面请包含：
- 页面目标
- 用户主要动作
- 模块结构
- 关键文案
- 空状态
- 错误状态
- 移动端注意事项
```

### 产出

`docs/mvp-page-ia.zh-CN.md`

### 验收

- 5 个页面目标清楚。
- Result Page 信息密度足够，但不拥挤。
- 能直接交给 Stitch / Figma Make / v0 使用。

## 4. 用 Stitch 生成高保真原型

### 操作

打开 [Stitch](https://stitch.withgoogle.com/)，分别生成 5 张页面，或一次生成一个多屏产品原型。

### 总 Prompt

```text
Design a high-fidelity web app prototype for "VideoBrief", an AI video research notes tool.

Product:
VideoBrief turns English YouTube business, finance, tech, and AI videos into structured Chinese / Traditional Chinese research notes.

Target users:
Chinese-speaking professionals, especially Hong Kong / overseas Chinese users in finance, tech, AI, business learning, and Web3.

Design direction:
- Professional productivity tool, not an entertainment app.
- High trust, calm, premium, fast.
- Information-dense but readable.
- Suitable for desktop first, responsive for mobile.
- Avoid short-video / social media aesthetics.
- Avoid heavy marketing style.
- Make the result page feel valuable enough to screenshot and share.

Core pages:
1. Landing Page
2. Dashboard
3. New Analysis Page
4. Generation Progress Page
5. Video Research Note Result Page

Brand style:
- Clean SaaS interface.
- Neutral background.
- Strong typography.
- Subtle accent color.
- Compact cards, not oversized marketing sections.
- Use icons for actions.

Important result page structure:
Left main column:
- One-sentence conclusion
- 3-line summary
- Chaptered notes with timestamps
- Key insights
- Glossary
- Action list
- Video limitations

Right side panel:
- AI Ask input
- Key moments
- Copy Markdown
- Export
- Feedback buttons

Please generate polished high-fidelity screens with realistic content.
```

### Result Page 单独 Prompt

```text
Create a high-fidelity desktop web app screen for the VideoBrief "Video Research Note Result Page".

This is the most important screen.

Context:
The user submitted an English YouTube video. The app generated a Chinese research note.

Design goals:
- The user should immediately feel: "I don't need to watch the full video; I already understand the value."
- Professional, high-trust, productivity-focused.
- Suitable for finance, tech, AI, and business users.
- Clear enough to screenshot and share.
- Not entertainment, not social feed, not marketing page.

Layout:
Top:
- Video title
- Source URL / channel
- Duration
- Language
- Status

Main left column:
- 一句话结论
- 3 行核心摘要
- 这条视频适合谁看
- 分章节笔记 table with timestamps
- 关键观点
- 重要概念解释
- 可以直接执行的行动清单
- 原视频局限

Right side panel:
- AI Ask box: "Ask anything about this video..."
- Key moments with timestamps
- Buttons: Copy Markdown, Export, Share
- Feedback: Useful / Not useful / Missing key point
- Credits remaining

Visual style:
- Clean SaaS UI
- Calm premium colors
- Dense but readable
- Strong section hierarchy
- Compact cards
- Desktop 1440px wide
```

### 产出

- Stitch 原型链接或截图。
- 导出的页面图。
- 选定的视觉方向说明。

### 验收

- Result Page 看起来像一个值得付费的产品。
- 页面不是营销风，而是工作台风格。
- 5 张页面风格一致。

## 5. 用 Figma Make 生成可交互原型

### 操作

如果希望保留设计资产，使用 Figma Make。可以把页面 IA 和样例笔记内容放进去。

### Prompt

```text
Build an interactive prototype for a web app called VideoBrief.

VideoBrief is an AI video research notes tool. It turns English YouTube videos into Chinese / Traditional Chinese research notes for finance, tech, AI, business, and learning users.

Please create these screens:
1. Landing page
2. Dashboard
3. New analysis page
4. Generation progress page
5. Video research note result page
6. Pricing modal or pricing page

Interaction flow:
Landing -> Sign in -> Dashboard -> New analysis -> Generation progress -> Result page -> Ask follow-up question -> Copy Markdown -> Pricing if credits are used.

Use realistic content from this sample:
{{paste_sample_note_excerpt}}

Design style:
- Professional SaaS
- High trust
- Information dense but readable
- Not entertainment
- Not social feed
- Desktop first with mobile responsive consideration

Make the result page the strongest screen.
```

### 产出

- Figma 原型链接。
- 可交互流程。
- 设计源文件。

### 验收

- 能点通主流程。
- Result Page 能承载真实样例内容。
- 能作为 v0/Codex 实现参考。

## 6. 用 v0 生成页面代码

### 操作

用 v0 生成 React/Tailwind/shadcn 风格页面。建议一次一个页面，先结果页，再 Dashboard，再 New Analysis。

### Result Page Prompt

```text
Create a production-quality React + Tailwind + shadcn/ui page for VideoBrief's video research note result page.

Context:
VideoBrief turns English YouTube videos into Chinese research notes.

Requirements:
- Desktop-first responsive layout.
- Top video metadata bar.
- Main two-column layout.
- Left column: Chinese research note sections.
- Right sidebar: AI Ask, key moments, copy/export/share actions, feedback buttons, credits.
- Professional SaaS style.
- High trust, clean, information-dense but readable.
- No marketing hero.
- No entertainment/video-feed style.

Use realistic Chinese content in the page:
- 一句话结论
- 3 行核心摘要
- 分章节笔记 with timestamp table
- 关键观点
- 重要概念解释
- 行动清单
- 原视频局限

Components:
- Cards with 8px radius or less.
- Icon buttons with tooltips.
- Tabs or segmented controls if useful.
- Copy Markdown button.
- Feedback buttons.
- AI Ask input with example questions.

Return clean React code suitable for a Next.js App Router project.
```

### Landing Page Prompt

```text
Create a polished landing page for VideoBrief using React + Tailwind + shadcn/ui.

Product:
VideoBrief turns 60-minute English YouTube business, finance, tech, and AI videos into 5-minute Chinese research notes.

Audience:
Chinese-speaking finance, tech, AI, Web3, and business learning users.

Page goal:
Get users to try one free video analysis.

Sections:
- Hero with clear product name and value proposition.
- Embedded sample result preview, not a vague illustration.
- How it works: paste URL/transcript -> generate note -> ask questions -> copy/export.
- Use cases: finance research, AI trend learning, business interviews, courses.
- Pricing preview: free trial, credits, Pro.
- CTA: Try 1 video for free.

Style:
- Professional SaaS.
- High trust.
- Not overly decorative.
- Avoid generic AI gradients.
- Desktop and mobile responsive.

Return code for a Next.js page.
```

### Dashboard Prompt

```text
Create a VideoBrief dashboard page in React + Tailwind + shadcn/ui.

Purpose:
Show the user's recent video analyses, remaining credits, and entry point to analyze a new video.

Layout:
- Header with product name, credits, account menu.
- Primary action: New Analysis.
- Recent analyses table/cards with title, source, duration, status, created time, output language.
- Empty state for new users.
- Small metrics: videos processed, hours saved, credits remaining.

Style:
- Work-focused SaaS dashboard.
- Compact, clean, not card-heavy marketing layout.
- Responsive.
```

### New Analysis Prompt

```text
Create a New Analysis page for VideoBrief in React + Tailwind + shadcn/ui.

The user submits an English YouTube video and optional transcript to generate a Chinese research note.

Fields:
- YouTube URL
- Transcript textarea
- Output language: Simplified Chinese / Traditional Chinese
- Template type: General, Finance, AI/Tech, Business Interview, Course/Learning
- Advanced: target audience, note depth

UX requirements:
- Make transcript fallback clear and user-friendly.
- Explain that the app does not download or store video/audio.
- Show estimated credit cost before submit.
- Submit button: Generate Research Note.
- Error states for invalid URL, missing transcript, too long transcript, insufficient credits.

Style:
- Professional SaaS tool.
- Calm, trustworthy, efficient.
```

### 产出

- v0 页面代码。
- 可复制到 Next.js 项目的组件。

### 验收

- 页面代码结构清晰。
- 能复用到 Next.js App Router。
- 移动端不崩。
- Result Page 足够好看。

## 7. 用 Codex 搭 MVP Pro 产品壳

### 操作

把 v0 页面整合成 Next.js 项目，接 Supabase 和基础 API。此阶段正式进入代码实现。

### Codex 总 Prompt

```text
使用 ai-video-solo-founder skill 继续推进 VideoBrief MVP Pro。

目标：
搭建一个 Next.js App Router + Tailwind + shadcn/ui 的 Web/PWA 产品壳。

产品定位：
VideoBrief 把英文 YouTube 商业、金融、科技、AI 视频转成中文/繁中研究笔记。

第一版页面：
1. Landing Page
2. Login Page
3. Dashboard
4. New Analysis Page
5. Generation Progress Page
6. Video Research Note Result Page
7. Pricing Page

功能范围：
- Supabase Auth
- videos/transcripts/notes/questions/credits 数据结构
- 用户只能看到自己的内容
- transcript-first 输入
- 生成研究笔记 API 的 mock 版本
- 视频问答 API 的 mock 版本
- Markdown copy
- credits 展示

请先检查当前仓库结构，然后给出实现计划；确认后开始实现。每完成一段，更新 docs/ai-video-solo-founder-progress.zh-CN.md。
```

### 如果要直接执行的 Codex Prompt

```text
使用 ai-video-solo-founder skill，直接开始实现 VideoBrief MVP Pro 的产品壳。

请完成：
1. 初始化/识别 Next.js App Router 项目。
2. 设置 Tailwind 和 shadcn/ui。
3. 创建 7 个页面路由：
   - /
   - /login
   - /dashboard
   - /analysis/new
   - /analysis/[id]/progress
   - /analysis/[id]
   - /pricing
4. 用 mock 数据实现 Dashboard、New Analysis、Result Page。
5. Result Page 必须包含中文研究笔记、AI Ask、关键时间点、复制 Markdown、反馈按钮。
6. 保证桌面和移动端可用。
7. 启动 dev server 并用浏览器验证关键页面。
8. 更新 docs/ai-video-solo-founder-progress.zh-CN.md。
```

### 产出

- 可运行本地 Web/PWA。
- 7 个页面。
- Mock 数据路径打通。
- 进度记录更新。

### 验收

- 能本地打开。
- 5 张关键页面视觉一致。
- Result Page 可演示。
- 用户主流程清楚。

## 8. 接入 AI 生成链路

### 操作

先做 transcript-first，不碰复杂抓取。用户提交 transcript，系统生成 note。

### API 设计 Prompt

```text
为 VideoBrief 设计并实现 AI 研究笔记生成 API。

技术栈：
Next.js App Router route handlers。
OpenAI Responses API 或等价 LLM API。
Supabase 存储 videos、transcripts、notes。

接口：
POST /api/analysis

输入：
- sourceUrl
- transcript
- outputLanguage: zh-CN / zh-TW
- templateType: general / finance / ai-tech / business / learning

输出：
- analysisId
- status
- noteMarkdown
- sections JSON
- estimatedCost

要求：
1. transcript-first，不下载音视频。
2. 生成稳定 Markdown 结构。
3. 不编造 transcript 没有的信息。
4. 金融内容不做投资建议。
5. 保存生成成本、耗时、错误信息。
6. 用户必须登录。
7. 扣除 credits。
8. 失败时返回可读错误。

请先给数据流和错误处理方案，再实现。
```

### Note Generation System Prompt

```text
你是 VideoBrief 的 AI 研究助理，负责把英文视频 transcript 转成中文/繁中研究笔记。

规则：
1. 只基于 transcript 输出，不要编造。
2. 重要观点尽量保留时间点或可追溯片段。
3. 中文表达要自然，像专业研究笔记。
4. 不要机器翻译腔。
5. 金融、投资、法律、医疗内容只做信息总结，不给建议。
6. 如果 transcript 信息不足，明确写“不确定”。
7. 输出必须是 Markdown。

输出结构：
# {{视频标题}} - 中文研究笔记
## 一句话结论
## 3 行核心摘要
## 这条视频适合谁看
## 分章节笔记
| 时间 | 主题 | 重点 |
|---|---|---|
## 关键观点
## 重要概念解释
## 可以直接执行的行动清单
## 值得继续追问的问题
## 原视频局限
## 免责声明
```

### 产出

- `/api/analysis`
- 生成 note 的 prompt。
- notes 数据入库。
- 错误记录。

### 验收

- 10 条真实 transcript 至少 8 条成功。
- 首次看到结果 3 分钟内。
- 输出结构稳定。

## 9. 接入视频问答

### 操作

基于 transcript 和 note 做问答，不要泛泛回答。

### Prompt

```text
为 VideoBrief 实现视频内容追问功能。

接口：
POST /api/analysis/[id]/ask

输入：
- question

上下文：
- 当前视频 transcript
- 已生成 note
- 用户问题

输出：
- answer
- citedSegments
- confidence

要求：
1. 只回答 transcript 支持的内容。
2. 如果 transcript 不支持，回答“这条视频中没有足够信息确认”。
3. 回答要引用时间点或片段。
4. 不要给金融投资建议。
5. 保存问题和回答到 questions 表。
6. 返回前端可展示的 JSON。

请实现 API 和前端 AI Ask 面板。
```

### Q&A System Prompt

```text
你是 VideoBrief 的视频内容问答助手。

你只能基于给定 transcript 和已生成笔记回答用户问题。

规则：
1. 不要使用外部知识补充答案，除非明确标注为常识背景。
2. 如果 transcript 不支持答案，说“这条视频中没有足够信息确认”。
3. 每个关键回答尽量附时间点或 transcript 片段。
4. 回答要简洁、清楚、适合中文用户。
5. 金融/投资相关问题只总结视频观点，不给投资建议。

用户问题：
{{question}}

Transcript:
{{transcript}}

已有笔记：
{{note}}
```

## 10. 接入付费和额度

### 操作

第一版不做复杂订阅后台。可以先用 Stripe Payment Link 或 Checkout。

### Prompt

```text
为 VideoBrief MVP Pro 实现最小 credits 和付费入口。

要求：
1. 新用户默认获得 3 条免费分析额度。
2. 每生成一条研究笔记扣 1 credit。
3. credits 不足时跳转 pricing 页面。
4. pricing 页面提供：
   - Free: 3 条试用
   - Starter: 20 条/月
   - Pro: 100 条/月 + 长视频 + 高级模板
5. 第一版可以用 Stripe Payment Link 或 Checkout。
6. 支付成功后的 webhook 如果暂时未实现，先写清楚后续实现任务和手动补 credits 流程，但前端不要假装已自动完成。
7. 所有扣费/加额度都写入 credits ledger。

请实现数据结构、前端展示、扣减逻辑和支付入口。
```

### 验收

- 免费额度清楚。
- 额度不足能阻止生成。
- 用户知道为什么要付费。
- 不虚假展示支付成功。

## 11. 真实视频验收

### 操作

每次功能完成后，用真实视频测试，不只看 mock。

### 测试 Prompt

```text
请为 VideoBrief MVP Pro 设计一组真实视频验收测试。

场景：
英文 YouTube 视频 -> transcript -> 中文研究笔记 -> 追问 -> 复制 Markdown。

请输出：
1. 10 条测试视频类型。
2. 每类视频要验证什么。
3. 成功标准。
4. 常见失败情况。
5. 需要记录的指标。

重点关注：
- 生成是否成功。
- 摘要是否准确。
- 中文是否自然。
- 是否有幻觉。
- 问答是否引用 transcript。
- 结果页是否可读。
- 移动端是否可用。
```

### 指标记录表

```markdown
| 视频 | 类型 | 时长 | transcript 来源 | 是否成功 | 生成耗时 | 成本 | 质量评分 | 问答评分 | 问题 |
|---|---|---:|---|---|---:|---:|---:|---:|---|
```

### 验收

- 10 条真实视频。
- 成功率 80%+。
- 至少 3 条样例足够公开展示。

## 12. 更新项目进度记录

### 操作

每次完成阶段后更新：

`docs/ai-video-solo-founder-progress.zh-CN.md`

### Prompt

```text
使用 ai-video-solo-founder skill，更新 VideoBrief 项目进度记录。

本次完成：
{{completed_items}}

本次决策：
{{decisions}}

当前指标：
{{metrics}}

风险/阻塞：
{{risks}}

请更新 docs/ai-video-solo-founder-progress.zh-CN.md：
1. 当前状态
2. 已确认决策
3. 已完成
4. 下一步 3 个动作
5. 指标
6. 风险 / 阻塞
7. 更新记录

保持简洁、可执行，不要写成长篇日记。
```

## 13. 给用户访谈 / 种子用户的 Prompt

### 私聊邀约

```text
我在做一个小工具，想帮中文用户快速理解英文 YouTube 商业/金融/AI 视频。

你给它一个英文视频链接或 transcript，它会生成：
- 中文研究笔记
- 时间戳章节
- 关键观点
- 术语解释
- 可以继续追问的视频问答

我现在在找 10-20 个早期用户看样例和试用原型。
你最近有没有一条“想看但没时间看”的英文视频？可以发我，我帮你跑一版。
```

### 试用后追问

```text
你刚刚看的这份视频研究笔记，我想请你帮忙回答 5 个问题：

1. 它有没有帮你省时间？
2. 哪一部分最有用？
3. 哪一部分没用或不可信？
4. 如果你自己提交视频生成，你会不会用第二次？
5. 如果每月 20 条视频，价格在 9-19 美元，你是否会考虑？
```

## 14. 每日执行 Prompt

每天开工时可以直接给 Codex：

```text
使用 ai-video-solo-founder skill。

今天继续推进 VideoBrief MVP Pro。

请先读取：
1. docs/ai-video-solo-founder-progress.zh-CN.md
2. docs/ai-video-solo-mvp-roadmap.zh-CN.md
3. docs/ai-video-mvp-workflow-prompts.zh-CN.md

然后根据当前进度，给出今天最应该完成的 1-3 个任务。

要求：
- 只做能推动 MVP Pro 上线的事情。
- 不扩大范围到 App、插件、推荐、多语言。
- 每个任务要有明确产出和验收标准。
- 如果需要写代码，先检查当前仓库结构再动手。
- 完成后更新进度记录。
```

## 15. 推荐优先级

如果时间有限，严格按这个优先级：

1. 结果页原型。
2. 3 篇高质量样例。
3. Landing page。
4. New Analysis 页面。
5. Dashboard。
6. AI 生成 API。
7. AI Ask。
8. Credits / Pricing。
9. 封闭 Beta。

最重要的判断：

**结果页如果不惊艳，这个产品就很难吸引用户。**
