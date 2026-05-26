# AI Studio 构建 Result Page 提示词

> 用途：把 Stitch / 设计稿中的 VideoBrief 结果页转成可运行的 AI Studio 页面原型。  
> 当前优先级：先把结果页做得可演示、可截图、可复制，再扩展 Dashboard / New Analysis / Progress。

## 1. 是否需要喂上下文

需要，但只喂必要上下文，不要把整份路线图全文塞进去。

AI Studio 最需要知道 5 件事：

1. 产品是什么：VideoBrief，把英文 YouTube 视频转成中文/繁中研究笔记。
2. 当前只做哪一页：Video Research Note Result Page。
3. 结果页要承载什么内容：摘要、章节、观点、术语、行动清单、AI Ask、复制 Markdown、关键时间点。
4. 技术边界：先做前端 mock，不接真实登录、数据库、AI API、支付。
5. 验收标准：页面像成熟产品、信息密度高但不拥挤、移动端可用、按钮有基本交互。

不要喂：

- 公司级长期路线图全文。
- 复杂推荐、插件、App、多语言市场规划。
- 没有马上要实现的 Supabase / Stripe / OpenAI 后端细节。

## 2. 推荐上下文

可以先把下面这段作为 AI Studio 的上下文：

```text
Product context:

VideoBrief is a Web/PWA product for Chinese and Traditional Chinese users who want to quickly understand valuable English YouTube videos about business, finance, technology, and AI.

The first MVP Pro should be narrow but complete. It does not build a video feed, recommendation engine, browser extension, native app, or multi-site support. The core flow is:

1. User submits a YouTube URL and transcript.
2. The app generates a structured Chinese research note.
3. User reads a polished result page.
4. User can ask follow-up questions grounded in the video transcript.
5. User can copy/export/save the note.

Current task:

Build only the Video Research Note Result Page from the selected design. Use realistic mock data. Do not connect real backend services yet.
```

## 3. 第一轮构建 Prompt

在 AI Studio 中选择设计稿后，建议直接用这一版：

```text
Build a production-quality frontend prototype for the selected VideoBrief "Video Research Note Result Page" design.

Product:
VideoBrief helps Chinese / Traditional Chinese users turn English YouTube business, finance, technology, and AI videos into structured Chinese research notes.

Goal:
Create a polished, runnable result page that feels like a real paid productivity product, not a rough demo. Follow the selected visual design closely, but improve layout details where needed for readability, responsive behavior, and interaction quality.

Scope:
- Build only the result page for now.
- Use realistic mock data.
- Do not implement real auth, database, payments, YouTube API, transcript fetching, or AI API calls.
- Keep backend/API calls mocked or local.

Page structure:
1. App shell:
   - Compact left sidebar with VideoBrief logo and navigation icons.
   - Main content area for the research note.
   - Right utility panel for AI Ask and key moments.

2. Header:
   - Video source URL.
   - Channel/source name.
   - Duration.
   - Language direction: English -> Chinese.
   - Completed status.
   - Actions: Copy Markdown, Export PDF, Share.

3. Main research note:
   - Video title in Chinese.
   - 一句话结论.
   - 3 行核心摘要.
   - 这条视频适合谁看.
   - 原视频局限.
   - 分章节笔记 table with timestamps.
   - 关键观点.
   - 重要概念解释.
   - 可以直接执行的行动清单.
   - 值得继续追问的问题.
   - 免责声明.

4. Right utility panel:
   - AI Ask textarea.
   - Submit button.
   - Mock answer area after submitting.
   - Key Moments list with thumbnail placeholders, timestamps, and short descriptions.

5. Interactions:
   - Copy Markdown button copies a generated Markdown version of the mock note and shows a success toast.
   - Export PDF button shows a "coming soon" or mock success toast.
   - Share button shows a mock share link copied toast.
   - AI Ask accepts a question and returns a short mock answer grounded in the sample note.
   - Feedback buttons for helpful / not helpful.

Content rules:
- All main note content should be Chinese.
- Use English only for brand text, URLs, technical labels, or source metadata.
- The Chinese should read like a research note, not raw translation.
- Include finance/business disclaimer text. Do not make investment advice claims.

Visual requirements:
- Professional SaaS/productivity style.
- White or near-white reading surface, restrained blue/slate accents, clear hierarchy.
- Information dense but not crowded.
- Cards should be subtle and radius should be 8px or less.
- Avoid decorative gradients, orbs, oversized marketing sections, and empty hero layouts.
- The result page should be screenshot-worthy and feel worth paying for.

Responsive requirements:
- Desktop: two-column layout with main note and right utility panel.
- Tablet: right utility panel can stack below or become a narrower section.
- Mobile: single-column layout, sticky top actions allowed, no horizontal overflow.

Implementation preferences:
- Use React with TypeScript if available.
- Use Tailwind CSS or clean CSS modules if available.
- Keep data in a local mock object so it can later be replaced by an API response.
- Create small reusable components for HeaderActions, SummaryCard, ChapterTable, AskPanel, KeyMoments, and Markdown export helper if the environment supports component files.

Acceptance criteria:
- The page runs without external API keys.
- The mock note is complete enough to demo the product value.
- Copy Markdown works.
- AI Ask has a visible mocked response flow.
- The layout remains readable on desktop and mobile.
- No placeholder lorem ipsum.
```

## 4. 推荐 Mock 数据主题

第一版可以先用金融/AI 交叉主题，贴近首批目标用户：

```text
视频标题：AI 对风险投资行业的深远影响：从尽职调查到投后管理
频道：Tech Insights Daily
时长：42:15
语言：英语 -> 中文
主题：AI、风险投资、金融科技、知识工作自动化
```

核心内容可以围绕：

- AI 不会取代风险投资家，但会重塑研究、尽调、投后管理流程。
- AI 工具能显著压缩文档阅读、财务报告分析、竞品研究时间。
- 替代数据和自动化分析会让早期机会发现更快。
- 仍然需要人类判断关系、创始人韧性、市场时机和伦理边界。

## 5. 第二轮优化 Prompt

如果第一版页面已经生成，但感觉普通，可以继续发：

```text
Improve the result page so it feels more like a premium research productivity tool.

Specific changes:
1. Make the main note easier to scan: stronger section hierarchy, better spacing, and clearer timestamp table.
2. Make the right AI Ask panel more useful: show example questions, grounded answer state, and source references.
3. Improve the top metadata bar so users immediately know the video source, duration, language direction, and completion state.
4. Make Copy Markdown, Export PDF, and Share actions feel reliable with clear success states.
5. Reduce decorative styling and keep a calm, professional SaaS reading experience.
6. Ensure mobile layout has no overflow and all buttons remain tappable.

Do not add unrelated features. Do not build login, dashboard, pricing, or backend integration yet.
```

## 6. 第三轮转代码 Prompt

如果 AI Studio 允许继续整理代码结构，可以发：

```text
Refactor the generated result page into clean frontend structure.

Requirements:
- Keep one mock data object that represents the full analysis result.
- Split UI into small components:
  - ResultPageHeader
  - HeaderActions
  - InsightSummary
  - AudienceAndLimits
  - ChapterNotesTable
  - KeyPoints
  - Glossary
  - ActionChecklist
  - AskPanel
  - KeyMoments
  - FeedbackBar
- Keep styling consistent with the current design.
- Make the Markdown copy helper generate Markdown from the mock data object.
- Do not introduce real API calls yet.
```

## 7. 给 Codex 接手时的说明

AI Studio 生成页面后，把导出的代码交给 Codex 时，附上这段：

```text
使用 ai-video-solo-founder skill。

这是 AI Studio 从 VideoBrief 结果页设计稿生成的前端页面代码。请先检查项目结构和依赖，再把结果页整合进当前 Next.js App Router 项目。

要求：
1. 保留当前结果页视觉和信息结构。
2. 用 mock data 先跑通页面，不接真实 OpenAI / Supabase / Stripe。
3. 把结果页路由放到合适位置，例如 /notes/[id] 或 /analysis/[id]。
4. Copy Markdown 必须可用。
5. AI Ask 可以先做 mock response，但组件边界要方便以后接真实 API。
6. 保持 transcript-first 的产品边界。
7. 完成后更新 docs/ai-video-solo-founder-progress.zh-CN.md。
```
