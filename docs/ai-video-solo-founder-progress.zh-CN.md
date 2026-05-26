# AI 视频个人项目进度记录

> 用途：记录 VideoBrief / AI 视频研究笔记个人项目的关键进展。保持短、准、可执行。

## 当前状态

- 当前阶段：AI Studio 结果页已整合进 Next.js App Router，进入高质量样例 + MVP Pro 页面流补齐阶段。
- 当前目标：先做一个窄而完整的 Web/PWA MVP，把英文 YouTube 商业、金融、科技、AI 视频转成中文/繁中研究笔记。
- 当前重点：打磨结果页体验、准备 3 篇高质量样例，并补齐 landing / dashboard / new analysis / progress 等页面流。
- 最近更新时间：2026-05-26

## 已确认决策

- GitHub 仓库：`sunny-kobe/VideoBrief`。
- 本地工作目录：`/Users/rust/Documents/VideoBrief`。
- 本地 Git 身份：`sunny-kobe <92256132+sunny-kobe@users.noreply.github.com>`。
- `main` 分支用于稳定版本，后续变更通过 PR 合并。
- 不做粗糙表单型 MVP，改为 MVP Pro：登录、提交、生成、追问、历史、复制、额度、付费入口都要有。
- 第一阶段只做英文 YouTube 视频到中文/繁中研究笔记，不做 feed、推荐、插件、原生 App、多视频网站和复杂知识库。
- 人工只用于前期样例润色、质检和用户反馈，不作为产品主形态。
- 默认技术路线为 Next.js + Vercel + Supabase + OpenAI/LLM API + Stripe + Markdown 导出。
- 原型工具推荐路线：Stitch 或 Figma Make 先做高保真原型，AI Studio / v0 / Codex 再落到 Next.js 页面。
- 当前实现先使用 mock data，不接真实 OpenAI、Supabase、Stripe；结果页保持 transcript-first，AI Ask 只做可替换的 mock response 边界。

## 已完成

- 本地仓库已连接到 GitHub 远端。
- GitHub CLI 已切换到 `sunny-kobe` 账号。
- 本地仓库 Git 提交身份已改为 `sunny-kobe`。
- 已整理公司级 AI 视频消费工具路线图：`docs/ai-video-consumption-tool-roadmap.zh-CN.md`。
- 已整理个人项目 / 一人公司 MVP Pro 路线图：`docs/ai-video-solo-mvp-roadmap.zh-CN.md`。
- 已抽离项目 skill：`/Users/rust/.codex/skills/ai-video-solo-founder/SKILL.md`。
- 已完成原型图生成工具调研：`docs/prototype-tools-research.zh-CN.md`。
- 已整理 MVP Pro 工作流与 Prompt 手册：`docs/ai-video-mvp-workflow-prompts.zh-CN.md`。
- 已同步旧工作区文档到当前正式仓库。
- 已整理 AI Studio 结果页构建提示词：`docs/ai-studio-result-page-build-prompt.zh-CN.md`。
- 已将 AI Studio 生成的结果页迁入 Next.js App Router，并放到 `/notes/[id]`。
- 已用 mock research note 跑通结果页、Copy Markdown、AI Ask mock response、时间戳联动和 Key Moments。

## 下一步 3 个动作

1. 选 3 条英文商业/金融/AI 视频，产出 3 篇高质量中文研究笔记样例，并填入当前结果页验证观感。
2. 基于当前 `/notes/[id]` 结果页，补 landing、dashboard、new analysis、generation progress 等 MVP Pro 页面流。
3. 设计真实数据边界：`NoteRepository` / `AskService` / `MarkdownExport`，再接 OpenAI Responses API、Supabase 和 Stripe。

## 指标

| 指标 | 当前值 | 目标 |
|---|---:|---:|
| 高质量样例 | 0 | 3 |
| 可自助页面 | 1 | 7 |
| 真实视频测试 | 0 | 10 |
| 注册用户 | 0 | 100 |
| 完成视频分析用户 | 0 | 50 |
| 付费用户 | 0 | 10 |

## 风险 / 阻塞

- YouTube 字幕、音视频处理和缓存存在平台政策风险，第一版保持 transcript-first 和用户主动输入。
- 如果结果页不够惊艳，用户很难感知付费价值。
- 如果范围扩到 App、插件、推荐、多语言，会拖慢个人项目验证。
- 当前结果页仍是 mock 数据，需要尽快用真实英文视频底稿做 3 篇样例，否则无法验证内容质量。

## 更新记录

### 2026-05-26

- 将 AI Studio 生成的 Vite React 结果页迁入 Next.js App Router，删除 Vite 入口，新增 `/notes/[id]` 动态路由。
- 保留结果页视觉和信息结构：左侧研究笔记、右侧 Grounded AI Ask、Key Moments、反馈和额度展示。
- 用 mock data 跑通页面，不接真实 OpenAI / Supabase / Stripe；AI Ask 保留后续接真实 API 的组件边界。
- 修复 Copy Markdown 为可用交互，并保留 transcript-first 的章节、时间戳、免责声明等 Markdown 输出。
- 完成基础验证：`npm run lint`、`npm run build`、浏览器点击 Copy Markdown / AI Ask / 问题填入。
- 将旧工作区的路线图、工作流手册、原型工具调研和公司版路线图同步到当前正式仓库。
- 修正当前阶段优先级：先结果页原型和高质量样例，再搭完整产品壳。
- 明确 AI Studio 可用于承接现有设计稿，先构建结果页可运行版本。
- 新增 AI Studio 结果页构建提示词，说明需要喂的上下文、第一轮构建 prompt、后续优化 prompt 和 Codex 接手说明。

### 2026-05-25

- 确认采用“窄而完整”的 MVP Pro 路线，不再采用简陋人工表单 MVP。
- 创建项目进度记录文件，后续继续更新。
- 创建 `ai-video-solo-founder` skill，用于后续持续对齐路线图并记录项目进度。
- 完成原型工具调研，结论为 Stitch/Figma Make 定视觉，v0/Codex 落代码。
- 完成工作流与 prompt 手册，覆盖样例、原型、v0、Codex、AI API、问答、付费、验收和进度更新。
