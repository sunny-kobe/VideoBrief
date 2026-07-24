# VideoBrief 智能体指引

## 项目定位

VideoBrief 是一个本地优先、AI 原生的视频生产工作台。规范项目由创作简报、混合来源素材、研究、叙事、已选镜头、旁白、字幕、渲染设置、验收证据和导出状态共同组成。

本产品不是转录优先的摘要工具、内容搬运工具、自动发布工具或通用工作流构建器。内容类别只是可替换的模板。

## 开始前

执行非简单任务前：

1. 运行 `git status --short`，保留所有无关改动。
2. 阅读 `README.md` 和下方参考文档表中与任务相关的文档。
3. 修改项目专属路径前，先检查规范项目文件 `content/projects/<project-id>/project.json`。
4. 以 `package.json` 为准核对命令，不要照搬旧交接文档中的过时命令。

## 常用命令

```bash
npm run dev
npm test
npm run lint
npm run build
npm run docs:check
npm run video:export:production -- --brief=content/projects/<project-id>/project.json
node scripts/proof-video.mjs --manifest=output/videos/<project-id>-work/render-manifest.json
git diff --check
```

## 目录说明

- `app/`：Next.js 页面和项目范围内的 API 路由。
- `src/`：规范项目、规划、研究、生产状态和 UI 逻辑。
- `scripts/`：本地素材处理、配音、FFmpeg/Remotion 渲染、验收和导出脚本。
- `content/projects/`：规范项目文件和测试夹具。
- `public/project-assets/`：本地媒体素材；已被 Git 忽略，不能只依靠项目 JSON 携带。
- `output/`：生成的工作文件、验收帧、渲染结果和导出文件；已被 Git 忽略。
- `docs/`：产品、工作流、渲染和交接契约。
- `experiments/`：非生产级渲染和工具对比实验。

## 硬性规则

### 规范状态

- `content/projects/<project-id>/project.json` 是页面、AI 任务、渲染器、预览和验收的唯一事实源。
- 保存项目会使之前的渲染结果失效。不得把过期的 MP4 或 ZIP 当作当前成片交付。
- 必须分别维护 `technical_status`、`rights_status`、`publication_status` 和 `market_status`。
- `official` 不代表 `cleared`；`published` 不代表 `validated`。

### 语言与说明

- 面向用户的说明、项目规划、产品文档、UI 文案、旁白、字幕、审片记录和最终交付结论默认使用简体中文。除非用户或创作简报明确要求其他语言，不输出成段英文说明。
- 代码标识、文件路径、命令、API/JSON 字段及第三方产品或模型名称保留原文，并用中文解释；不要为了全中文而改写技术契约。

### 场景与素材对齐

- 技术同步和语义同步是两道独立门槛。音视频时长一致不能证明镜头正确表达了旁白。
- 每个启用场景都必须使用已确认候选，并且场景与候选的 `sourceId`、`sourceStart`、`sourceEnd` 完全一致。
- 已确认的视频窗口是不可变输入。不得为了适配旁白而静默改写 `sourceEnd`。
- 视频窗口必须足以覆盖场景旁白。窗口过短时应拒绝使用，不得通过循环播放制造虚假连续性。
- 不得用同一个通用素材窗口解释多个不同观点。只有明确记录为转场或背景，且不把画面当作事实证据时，才允许复用。
- 旁白、标题、字幕、`visualRequirement`、来源引用和实际可见镜头必须表达同一个叙事点。
- 审片备注不能让不匹配的镜头通过验收。画面无法支持旁白时，必须修改规范项目并重新渲染。
- 优先使用相关的真实动态素材。抽象观点如果用静态画面或程序化信息层表达更准确，可以使用；但不得暗示参考项目演示就是当前产品的真实结果。
- 素材不足时，应录制更长的官方或自有操作演示、缩短叙事、合并场景或增加原创信息层。不得用重复运动掩盖素材缺口。
- 最终选片前，必须提供便于浏览的素材清单，包含来源标签、媒体预览、时间窗口、目标场景、匹配理由和权利状态。

### 视频验收

- `proof.passed=true` 是必要条件，但不是充分条件。
- 交付前，每个场景至少使用一张中点帧核对旁白；镜头发生明显变化时，必须检查开始、中间和结束帧。
- 检查字幕是否存在裁切、重叠、长句拥挤或词语跨字幕断开。字幕即使技术上没有越界，也可能无法通过编辑质量验收。
- 确认生成的时间轴完整保留规范项目中的 `sourceId`、`sourceStart` 和 `sourceEnd`。
- 对最终视频执行完整解码，并在浏览器中验证真实页面 `/short-video?project=<project-id>`。
- 完整播放最后一个转场和片尾。预览可能默认循环；需要确认明确的 `ended` 事件时，应临时关闭循环。
- 浏览器运行时证据和自动化验收结果必须分开报告。不得用构建成功、清单文件存在或抽帧非空代替语义审查。

### 安全与范围

- 除非用户明确要求，否则不得发布、上传、提交、推送、发版、删除或批量重写。
- 未经明确决策和同等级验收，不得让实验路线取代 FFmpeg 生产验收标准。
- 不得通过浏览器路由暴露任意本地路径。
- 保留脏工作区，不要清理或回退属于其他任务的文件。

## 参考文档

| 触发场景 | 阅读文档 |
| --- | --- |
| 产品方向或工作流变更 | `docs/video-production-workflow-and-roadmap.zh-CN.md` |
| 渲染、时间轴、场景选择、验收或导出 | `docs/video-render-pipeline.zh-CN.md` |
| 获取网上现成视频并进行紧凑剪辑 | `docs/online-dynamic-material-cut-workflow.zh-CN.md` |
| 继续之前的实现阶段 | `docs/video-production-workflow-execution-handoff.zh-CN.md` |
| 海外 AI 内容重混模板或历史 | `docs/overseas-ai-content-remix-roadmap.zh-CN.md` |

## 验证矩阵

| 改动类型 | 最低验证要求 |
| --- | --- |
| 纯 TypeScript 或领域逻辑 | `npm test`、`npm run lint` |
| Next.js UI 或 API | 定向测试、`npm run lint`、`npm run build`、真实浏览器流程 |
| 场景、时间轴或渲染逻辑 | 时间测试、真实渲染、项目与时间轴一致性、技术验收、完整解码、逐场景视觉审查 |
| 成片查看器 | 桌面和移动端浏览器检查、真实媒体完整播放 |
| 文档或规则 | `npm run docs:check`、`git diff --check` |

## 维护原则

只有当规则能够防止已经出现的错误，或保护稳定的项目边界时，才把它加入本文档。这里保留简洁的错误预防规则；详细流程放在 `docs/`；可以机械验证的行为放进测试或脚本。
