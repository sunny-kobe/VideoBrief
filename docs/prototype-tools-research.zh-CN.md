# AI 视频个人项目原型图生成工具调研

> 目标：为 VideoBrief / AI 视频研究笔记 MVP Pro 选择原型图和页面原型生成工具。  
> 结论日期：2026-05-25。

## 1. 结论先行

如果目标是快速做出 **landing page、dashboard、视频研究笔记结果页、pricing page** 的原型，我建议采用：

**首选路线：Stitch / Figma Make 做视觉原型 -> v0 或 Codex 做可运行 Next.js 页面。**

更具体一点：

1. **Google Stitch**：最适合快速生成高保真 UI 原型和多屏页面方向。
2. **Figma Make**：最适合在 Figma 生态里做可交互原型，适合后续继续精修设计。
3. **v0**：最适合直接生成 React / Tailwind / shadcn 风格的可运行页面。
4. **Gemini Canvas**：可以生成网页、小应用和 React/HTML 原型，但更像通用创作/代码画布，不是专门的 UI 设计工具。
5. **Lovable / Bolt**：适合从提示词生成完整应用，但对我们这种已有清晰技术路线的项目，容易把范围拉大。

最终推荐：

**先用 Stitch 或 Figma Make 产出 3-5 张关键页面高保真原型，再用 v0/Codex 转成 Next.js 实现。**

## 2. Gemini 有没有原型稿生成功能？

答案：**有，但要分清楚是哪一种。**

### 2.1 Gemini Canvas

Gemini Canvas 是 Gemini 里的创作和代码空间。Google 官方介绍里明确写到，Canvas 可以把想法变成 apps、games、infographics、web pages 等，并且可以从 prompt 到 prototype。Google 也说明 Canvas 可以生成和预览 HTML/React code 以及其他 web app prototypes。

适合：

- 做一个可运行的小网页。
- 做互动 demo。
- 把 Deep Research 或文档变成网页、infographic、quiz。
- 快速生成一个 HTML/React 原型。

不太适合：

- 多屏高保真 UI 设计系统。
- 精细的产品视觉稿。
- 需要稳定一致设计语言的复杂界面。

参考：

- [Gemini Canvas overview](https://gemini.google/mp/overview/canvas/)
- [Google Blog: New ways to collaborate and get creative with Gemini](https://blog.google/products-and-platforms/products/gemini/gemini-collaboration-features/)

### 2.2 Google Stitch

Stitch 是 Google Labs 面向 UI 设计的工具。Google 官方介绍说，Stitch 正在变成 AI-native software design canvas，可以从自然语言创建、迭代和协作生成 high-fidelity UI。它支持从业务目标、感觉、参考灵感开始，而不只是从线框图开始；还能把静态设计快速变成 interactive prototypes，并且支持导出到开发工具。

适合：

- 生成高保真 UI。
- 做多屏产品原型。
- 快速探索多个视觉方向。
- 做 landing page、dashboard、结果页、pricing page。
- 把设计方向交给开发工具继续实现。

不确定点：

- Stitch 仍是 Google Labs 工具，稳定性和可控性可能不如成熟 Figma 工作流。
- 复杂多屏一致性仍要人工校正。

参考：

- [Google Blog: Introducing vibe design with Stitch](https://blog.google/innovation-and-ai/models-and-research/google-labs/stitch-ai-ui-design/)
- [Stitch](https://stitch.withgoogle.com/)

## 3. Figma Make 也值得考虑

Figma Make 是 Figma 的 prompt-to-app / prompt-to-prototype 能力。Figma 官方介绍它可以快速生成 high-fidelity prototypes，也可以从设计开始，通过自然语言把静态设计变成可交互体验。

一个关键点：Figma Make 的模型选择里已经能看到 Gemini 模型选项。Figma 帮助文档显示，Figma Make 支持选择 Gemini 3 Flash、Gemini 3.1 Pro、Claude Sonnet、Claude Opus 等模型。因此，如果你问“Gemini 能不能做原型稿”，另一个答案是：**可以通过 Figma Make 里的 Gemini 模型参与原型生成。**

适合：

- 你想保留 Figma 作为设计资产中心。
- 后面可能找设计师或外包继续精修。
- 需要可交互原型，而不是单张图。
- 需要设计稿和协作、评审、交付结合。

参考：

- [Figma Make introduction](https://www.figma.com/blog/introducing-figma-make/)
- [Figma Make general availability](https://www.figma.com/blog/figma-make-general-availability/)
- [Figma Make model selector](https://help.figma.com/hc/en-us/articles/36400680326551-Use-experimental-models-in-Figma-Make)

## 4. v0 更适合直接落到代码

v0 的定位不是传统设计稿，而是 AI agent 帮你创建真实代码、全栈应用和 live prototype。官方文档里写得很直接：v0 可以从 prompt 创建 high-fidelity UI、连接 backend、生成 live prototypes，并支持 Next.js、Tailwind、shadcn/ui 等现代栈。

适合：

- 直接生成 VideoBrief 的 Next.js 页面。
- 快速做 landing page、dashboard、结果页组件。
- 从截图/线框转成高保真 UI。
- 与 Vercel 部署链路配合。

不适合：

- 当作最终设计源文件。
- 做大量视觉探索和设计系统管理。

参考：

- [v0 docs](https://v0.app/docs)

## 5. Lovable / Bolt 的位置

Lovable 和 Bolt 更像“从自然语言生成完整应用”的工具。

Lovable 官方文档称它是 full-stack AI development platform，可以用自然语言构建、迭代、部署 web apps，并包括前端、后端、数据库、认证和集成。Bolt 官方介绍也类似，强调在浏览器里从 prompt 生成网站、web app、移动 app，并能快速部署。

它们适合：

- 不想自己搭技术栈。
- 想快速出一个完整 demo。
- 非技术用户快速试方向。

对 VideoBrief 当前阶段的风险：

- 容易生成一套和我们计划栈不一致的架构。
- 容易把范围扩大成“全栈大应用”。
- 后续迁移到自己代码库可能有成本。

所以我建议把它们作为参考，不作为主路线。

参考：

- [Lovable docs](https://docs.lovable.dev/)
- [Bolt docs](https://support.bolt.new/docs/getting-started)

## 6. 推荐工作流

### 6.1 最推荐

```text
产品文档 / 样例输出
  -> Stitch 或 Figma Make 生成高保真原型
  -> 人工挑选和修正页面结构
  -> v0 生成 React/Tailwind 页面
  -> Codex 接入 Next.js、Supabase、OpenAI、Stripe
  -> Playwright / Browser 验证可用性和移动端
```

### 6.2 如果想最快上线

```text
产品文档 / 页面结构
  -> v0 直接生成 landing/dashboard/result/pricing 页面
  -> Codex 整合进 Next.js
  -> 后续再用 Figma/Stitch 补视觉方向
```

适合你现在“token 管够、先做出好用版本”的状态。

### 6.3 如果想偏设计品质

```text
Stitch / Figma Make
  -> 做 3 套结果页视觉方向
  -> 选 1 套定稿
  -> v0 / Codex 代码实现
```

适合先拿给用户看图和样例，验证“愿不愿意用/付费”。

## 7. 对 VideoBrief 的具体建议

第一轮只生成 5 张原型：

1. Landing page。
2. Dashboard。
3. New analysis page。
4. Generation progress page。
5. Video research note result page。

其中最重要的是第 5 张结果页。

结果页原型提示词应该强调：

- 专业工具，不是娱乐 App。
- 面向金融、科技、AI、商业学习人群。
- 左侧是结构化研究笔记。
- 右侧是 AI Ask、关键时间点、复制 Markdown、反馈。
- 风格要清爽、高信任、信息密度适中。
- 不要营销感太重，不要像短视频产品。

## 8. 推荐结论

我的建议排序：

1. **Stitch**：先试，最贴近“原型图生成”。
2. **Figma Make**：如果你重视设计资产和后续精修，用它。
3. **v0**：最终落代码时非常适合。
4. **Gemini Canvas**：可以试，但更适合生成网页/小应用原型，不是 UI 设计主工具。
5. **Lovable / Bolt**：适合完整 app demo，但当前不是主线。

一句话：

**Gemini 有原型能力，但做 UI 原型图优先看 Google Stitch；做可运行网页原型可以用 Gemini Canvas；真正落到 VideoBrief MVP Pro，建议 Stitch/Figma Make 定视觉，v0/Codex 负责实现。**
