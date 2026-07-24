# Handoff：执行 VideoBrief AI 视频生产流水线

## Goal

按照 `docs/video-production-workflow-and-roadmap.zh-CN.md` 实现 VideoBrief 的完整个人视频生产流水线。先完成自助项目闭环，再逐步接入多来源理解、AI 策划、真实候选画面和完整导出；不要把某一种内容题材重新写成产品身份。

当前总目标：

> 用户把 creative brief、自有或已确认可用的混合资料交给 Codex，由 Codex 操作 AI 流水线生成成片；用户在网页查看结果并继续向 Codex 提修改要求，最终导出来源可追溯、权利状态清晰且通过技术 proof 的原创短视频项目。

## Current State

- 仓库：`/Users/rust/Documents/VideoBrief`
- 分支：`main`
- 当前本地提交：`e4f9265 checkpoint: preserve VideoBrief production workbench`
- 当前分支相对 `origin/main` ahead 3；不要擅自 push。
- Phase 1 自助项目闭环已于 2026-07-11 通过 Gate。
- Phase 2 多来源理解已于 2026-07-12 通过 Gate；本地 `whisper.cpp` 完成真实音频转录，`gpt-5.6-luna` 完成视频/图片/文本理解。
- Phase 3 与 Phase 4 已于 2026-07-12 通过 Gate：全新项目 `video-project-1783855221061` 从逐来源事实确认、真实 AI 脚本、明确应用、人工选片、旁白字幕到 proof/ZIP 完整关闭。
- Phase 5 已完成第 2 个完整新流程 dogfood：`gpt-5-6-agentic-work` 使用原创研究笔记、4 个 OpenAI 官方页面/视频来源和 2 张原创信息卡完成 GPT-5.6 热点视频；神经 TTS、来源处理、场景、字幕、FFmpeg、manifest、proof 和 export 均走通用能力，没有增加题材定制代码。
- 默认工作区已改为只读成片查看器：打开项目只看到真实视频播放器、全屏、MP4/导出包下载和折叠状态；不提供生成、修改或制作详情入口。
- 五步工作台仅通过 Codex 可直接访问的 `advanced=1` 深链保留，并提供“返回成片”；素材核验、脚本、画面、字幕和导出是内部数据与排错能力，不是用户功能。
- 新增 `POST /api/projects/<projectId>/produce` 自动编排：只处理未完成来源，生成并应用叙事，自动选择首个候选并生成生产资产；客户端随后复用现有 render + proof。已有完整场景的项目可直接重渲染，不消耗 AI Key。
- 自动模式允许把未人工确认的关键主张作为本地 AI 草稿依据，但保留来源与不确定项，不会把草稿提升为已确认事实，也不会提升 rights、publication 或 market 状态。
- 素材步骤现直接显示图片和视频缩略预览；点击图片打开大图弹窗，点击视频打开原生播放器弹窗，Markdown、文本和音频仍使用各自的内容预览。
- 高级详情保留 5 步：素材与核验、脚本、画面、字幕、导出。原独立 Research/审核入口已并入“素材与核验”；默认只核验 Brief 相关的关键主张和高风险问题，视觉元数据与补充提取折叠保留。核验页和事实引用均显示真实素材名称，返回素材库后保留同一 `source`，旧 `view=research` 深链继续兼容。
- `ResearchFact` 现区分 `claim/visual_metadata`、`required/supporting/reference` 和 Brief 相关度；uncertainty 记录风险级别与核验优先级。新来源理解会结合 Creative Brief 分类，每份来源最多保留 3 条 required 主张和 2 条 required 高风险问题；项目级默认关键队列最多 12 条主张、6 条问题。
- 策划 Gate 和正式 AI 叙事输入已统一使用关键队列：只有 confirmed 关键主张进入脚本，未解决高风险问题会阻断重新生成；完整提取结果仍保留在 `project.json`，用户可以手动把任意结果设为关键或降为参考。
- 首次用户路径的问题、修复和浏览器证据记录在 `docs/video-production-user-journey-acceptance.zh-CN.md`。
- 素材核验页直接展示并切换 canonical source：视频、图片、Markdown、文本和音频都可在同页核验，当前 `source` 写入 URL，刷新和事实引用跳转可恢复到同一来源。AIFF 等浏览器不能直接解码的本地音频会生成只读 WAV 预览缓存，原文件和 `project.json` 引用不变。
- 视频来源按时长自适应抽取 3-12 张代表帧，混合开头/中段/结尾覆盖与 FFmpeg 镜头变化点，并与本地转录一起提交结构化理解；镜头检测失败时降级为时长覆盖，转录失败时仍保留视觉结果并标记 uncertainty，不写伪造 facts/transcript。
- 渲染 API 已改为持久化 FIFO 入队并立即返回 `202`；`output/render-queue/queue.json` 是调度事实源，独立 worker 跨 Next.js 重启继续运行，并支持多项目串行、同项目去重、queued/running 取消、死 worker 重排与存活渲染子进程接管。项目 workDir 的 `render-job.json` 保留为页面镜像。
- 最终验收新增七项结构化编辑质量记录；反向转写对当前旁白中的专名单独提示，异常必须按一倍速确认；桌面与移动浏览器都必须以一倍速、非静音完整播放到 `ended`。旧的仅 `status=passed`、桌面四倍速或移动端只推进开头的 acceptance 不再放行。
- 正式 FFmpeg 渲染已升级到 Render Contract V3：每幕按来源、时间窗、旁白和版式生成内容寻址 MP4，缓存 metadata 与视频 SHA-256 同时验证；中断后只补齐缺失幕，最终视频 stream copy 拼接并对整片音频统一归一化。
- CLI 与网页渲染现在都由 `export-production.mjs` 调用同一个 lifecycle preflight；素材包、选片状态、渲染尝试和失败记录不再因入口不同而分叉。
- RepoPrompt CE 已完成真实 V3 重渲染与 proof。受控在第 3 幕后中断后，恢复运行命中前 3 幕缓存并只生成剩余 3 幕；恢复成片 48.73 秒、-16.0 LUFS、-1.9 dBTP，主文件与 public 副本 SHA-256 一致。
- AI 结果写入前会校验 source、fact/uncertainty 引用、定位范围、候选来源和 scene 覆盖；非法引用会使调用失败而不是污染 canonical project。
- 项目入口：`http://127.0.0.1:3100/`
- canonical 项目目录：`content/projects/<project-id>/project.json`
- 当前兼容 fixture：`content/projects/codex-app-explainer/project.json`
- Phase 1 浏览器 dogfood：`content/projects/phase1-self-serve-demo/project.json`
- 混合来源 dogfood：`content/projects/videobrief-mixed-demo/project.json`
- 图片 + Markdown dogfood：`content/projects/dogfood-static-notes/project.json`
- 首次用户完整路径验收：`content/projects/video-project-1783855221061/project.json`
- GPT-5.6 质量 dogfood：`content/projects/gpt-5-6-agentic-work/project.json`
- 当前工作台：`http://127.0.0.1:3100/workbench`
- 当前生产渲染：FFmpeg + manifest-driven proof
- 三个较早的 rights-cleared 项目已有历史 proof/ZIP；其中待审 narrative 仍需逐项目确认，不能自动计为完整 AI dogfood。`video-project-1783855221061` 与 `gpt-5-6-agentic-work` 已按优化后的 Phase 1-4 路径完整关闭。
- canonical 项目已记录素材导入、人工保存、渲染尝试/失败和复用素材；`dogfood-static-notes` 的 PNG 与 Markdown 均只指向更早的 `videobrief-mixed-demo` 来源。
- 本交接生成时工作树包含本轮全部未提交实现；接手时必须重新运行 `git status --short`，不得清理。

## Key Decisions

1. VideoBrief 是个人 AI 视频生产流水线，不是海外 AI 内容账号、YouTube 摘要器或视频搬运工具。
2. 内容题材是模板。第一参考模板建议使用自有软件录屏、截图、文档和原创图表。
3. 从 creative brief 开始，不从单一原视频或空白专业时间线开始。
4. AI 负责资料抽取、脚本、候选和生产草案；用户保留事实、观点、素材、权利和发布决定。
5. `project.json` 是页面、AI 任务、渲染、预览和 proof 的共同事实源。
6. technical、rights、publication、market status 必须分开。
7. 当前不做 SaaS、登录、计费、团队、自动发布或全网热点抓取。

## Evidence

- 顶层产品与实施路线：`/Users/rust/Documents/VideoBrief/docs/video-production-workflow-and-roadmap.zh-CN.md`
- 当前渲染契约：`/Users/rust/Documents/VideoBrief/docs/video-render-pipeline.zh-CN.md`
- 当前进度事实：`/Users/rust/Documents/VideoBrief/docs/ai-video-solo-founder-progress.zh-CN.md`
- 当前 fixture：`/Users/rust/Documents/VideoBrief/content/projects/codex-app-explainer/project.json`
- 当前研究判断：`/Users/rust/Documents/SignalProof/vault/runs/2026-07-11-videobrief-opportunity-rediscovery/report.md`

当前 fixture 的已知状态：

```text
technical_status = passed
rights_status = review_required
publication_status = draft-unpublished
market_status = none
```

它证明部分技术链路可运行，不是市场验证，也不能直接发布。

## Remaining Work

当前不要继续增加网页操作步骤。Phase 1-4 的底层能力继续作为 Codex 可操作的自动生产引擎和内部详情存在；默认产品验收路径固定为“告诉 Codex 要做什么 -> 网页看成片 -> 继续告诉 Codex 怎么改”。

按顺序执行，不要跳过前置 Gate。

当前优先完成 SylphxAI、RepoPrompt CE 和 Google Vids 三个项目的新版 `technical -> semantic/editorial -> browser -> package` 闭环。不得用旧式技术 proof 计入 Phase 5；结构化质量模板见 `docs/editorial-quality-review.example.json`。

### 1. 重新确认现状

- 读取 `README.md` 和主路线图；
- 运行 `git status --short`，保护用户改动；
- 阅读当前 project schema、workbench、API、renderer 和 proof；
- 运行现有 lint/build/proof，区分基线问题和本次回归。

### 2. Phase 1：自助项目闭环（已完成）

- 已建立项目列表和创建入口；
- 已将 Creative Brief、混合来源理解、叙事版本、候选画面和 AI 调用记录纳入 canonical schema v3，并兼容读取 v1/v2 fixture；
- 已支持本地视频、音频、图片和文本资料的流式导入、受控扩展名、显式权利登记、增量 SHA-256、原子落盘、磁盘保留线、真实上传进度和取消；默认单文件上限 20 GiB，导入后至少保留 4 GiB，可通过环境变量调整；
- workbench、save、render、preview、manifest 和 proof 已按 projectId 工作；
- 已从浏览器建立第二个项目并导出通过 proof 的 MP4；
- 已实证项目保存后旧成片/manifest 失效，重新渲染后恢复通过。

### 3. Phase 2：多来源理解（已完成）

- 先支持本地视频/音频、图片、Markdown/文本；
- 生成 transcript/OCR/text extraction；
- 保存 source reference、时间点/位置、状态和失败原因；
- 不在解析失败时静默生成内容。

已完成类型化 intake、媒体探测、音频分段、自适应视频取帧、本地 Whisper 转录、多帧联合理解、本地文本抽取、可见 processing 状态、重试和语义引用校验。自适应取帧按时长扩展到最多 12 帧，优先覆盖全片并吸收 FFmpeg 检出的镜头变化；真实素材已分别验证“无硬切时均匀覆盖”和“检测出 0.5s/9.5s 切换点”两条路径。混合项目音频来源已由 failed 恢复为 completed，写入真实 transcript、时间定位、facts 和 uncertainties；`project.ai.transcriptionModel=whisper.cpp:large-v3-turbo-q5_0`。工作台支持逐段人工校对，专有名词和歧义词不会自动被视为最终事实。

素材核验界面已补齐五类来源的真实预览和来源选择：视频/图片使用本地原始文件，Markdown/文本显示 canonical extraction，音频通过本地 WAV 预览端点提供 Range 响应；选中来源持久化在 `source` query，facts/uncertainties 的来源引用可跳回同一预览。移动端预览不再以 sticky 层遮挡下方审核控件。

### 4. Phase 3：Brief 驱动的 AI 策划（已完成）

- 从 brief + research 生成原创 narrative、script 和 scene draft；
- 展示来源依据、不确定项和待确认项；
- 保护用户已有编辑，不允许重新生成时无提示覆盖。

Responses API、Zod 结构化输出、endpoint-aware 内容哈希缓存、pending draft、版本记录、显式替换确认和 AI 调用记录已实现。全新项目已在浏览器逐来源确认事实、重新生成真实草案并明确应用；策划 API 只接收 confirmed facts，brief/research/source analysis 改动会清除旧 pending draft。Gate 已通过。

### 5. Phase 4：候选画面与生产质量（已完成）

- 为 scene 提供来自自有素材、录屏、截图和原创视觉的真实候选；
- 持久化用户选择；
- 完善配音、字幕、封面、平台文案和完整导出包；
- 把阻塞式渲染演进为可见状态和明确失败原因；
- 保持 rights check 与 technical proof 分离。

候选持久化、人工视频/图片选择、场景增删/排序/启停、旁白字幕、平台文案、render job 状态、完整 ZIP、stale 下载阻断已真实验证。画面步骤现在要求显式“确认使用当前画面”，修改素材或时间段会撤销旧确认，所有启用场景未确认时阻断导出。全新项目已完成最终选片、浏览器渲染和完整导出，Gate 已通过。

### 6. Phase 5：真实 Dogfood

- 连续完成 3-5 个不同视频项目；
- 不为具体题材写定制代码；
- 记录生产耗时、修改次数、失败和复用资产；
- 外部发布仍需用户最终确认；
- 没有外部行为时不得提升 market status。

本地技术层已有三个不同项目的历史导出，`video-project-1783855221061` 与 `gpt-5-6-agentic-work` 完成了优化后的端到端 AI 路径。较早项目的 pending narrative 尚未逐一由用户应用，因此 Phase 5 只计两个完整新流程 dogfood，Gate 未通过；下一步需要再完成 1-3 个不同题材项目，而不是继续扩展功能。

只读成片查看器已经完成代码实现和桌面/移动真实浏览器验收；console、lint、媒体解码、manifest 指纹和 ZIP 已重跑通过。Phase 5 仍只计两个完整新流程 dogfood，下一步是由 Codex 完成第三个不同题材项目，而不是继续增加界面步骤。

canonical production record 已新增 `researchReviewedAt`、`firstRenderCompletedAt` 和 `lastRenderCompletedAt`；与 `trackingStartedAt`、人工保存、渲染尝试/失败、复用素材一起进入 render/export manifest，用于 Phase 5 制作耗时复盘。

## Verification

Phase 1 已完成的真实验收（2026-07-11）：

- Playwright 桌面 1440x900 与移动 390x844 工作台检查通过，无内容遮挡；
- 浏览器从空项目填写 Creative Brief、选择本地文件、确认权利、导入、编辑、保存和渲染成功；
- 全屏播放器 `readyState=4`，视频 `1080x1920`，时长 `6.666667s`；
- `phase1-self-serve-demo` 的 MP4、SRT、ASS、配音、timeline、manifest 和 5 张 proof frame 均真实存在；
- manifest `proof.passed=true`、`issues=[]`；
- 修改项目后旧 proof 以 `Project file changed after render; the MP4 is stale.` 失败，重新渲染后恢复通过；
- 浏览器控制台没有应用错误；仅 Google Fonts 外部请求在一次新浏览器会话中因网络关闭失败，系统字体降级不影响流程。

2026-07-11 本轮新增验收：

- `videobrief-mixed-demo` 从真实浏览器新增图片场景、编辑标题/字幕/旁白、保存、触发 stale、阻断旧 ZIP、重新渲染并恢复 ready；
- `dogfood-static-notes` 从真实浏览器空项目创建，导入自有 PNG 和原创 Markdown，资料处理真实显示缺 Key 失败，随后静态图片渲染、proof 和完整 ZIP 成功；
- 两个新项目成片均为 1080x1920、30fps、H.264 + AAC 48kHz，视频非空，SRT/ASS、封面、来源清单、manifest 和 snapshot 存在；
- `videobrief-mixed-demo` 浏览器视频 `readyState=4`、时长 11.43 秒；桌面 1440x900 和移动 390x844 无横向溢出；
- proof 90%/50% 抽帧确认静态图片画面非空，长中文标题和字幕在显式换行后不再左右裁切；
- `phase1-self-serve-demo`、`videobrief-mixed-demo`、`dogfood-static-notes` 三个 ZIP 均存在并包含完整生产资产；
- stale 项目调用导出 API 返回 409，重新渲染后恢复 200。
- 三个项目的当前 project SHA-256 与 render/export manifest fingerprint 逐一相同，ZIP 均通过 `unzip -t`，下载 API 均返回 200；proof 和 rights issues 均为空。
- `npm run lint`、`npm run build`、`npm run video:proof` 均通过；移除 Next 服务端对 `ffmpeg-static` 动态入口的 import 后，Turbopack whole-project tracing warning 已消除。
- 资料处理路径现在只允许 `public/project-assets/` 和兼容 fixture 的 `public/source-clips/`；Markdown 运行时回归保留 328 字符本地正文并只因缺 Key 返回 422。

2026-07-12 本轮新增验收：

- `videobrief-mixed-demo/source-01` 实际生成三张 1080x1920 代表帧；缺 Key 重试返回 422，保留“无音轨”和“代表帧未覆盖完整动态过程”两条 uncertainty，facts/transcript 均为 0；
- `npm run transcription:setup` 校验本机 `whisper-cli` 与 574 MB `large-v3-turbo-q5_0` 模型可用；模型 SHA-256 为 `394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2`；
- `videobrief-mixed-demo/source-05` 通过最终 API/子进程路径再次处理为 `completed`；一次绕过缓存的真实 WAV 推理约 1.14 秒，返回 `whisper.cpp:large-v3-turbo-q5_0`、完整中文文本和时间段，原始音频未上传；
- Research 工作台显示 5/5 来源完成、0 失败、29 条 facts、11 条 uncertainties 和可编辑 transcript；临时校对文本未写入 canonical `project.json`，项目保持 stale，等待用户确认策划草案后再渲染；
- 事实审核 API smoke 证明 statement、review status 和 uncertainty resolution 会同时写入 source analysis 与 project research；研究输入变化会清除旧 pending draft，未变化时保持，smoke 项目与导入副本已在验证后清理；
- 未审核的 `phase1-self-serve-demo` 调用叙事 API 返回 422“还有 4 条事实待确认”，调用前后 `project.json` SHA-256 完全一致；策划页 SSR 显示事实 Gate、完整待审场景和可用的草案丢弃入口；
- narrative discard API smoke 将 pending draft 清空并把 narrative 状态恢复为 idle，已在验证后清理；
- 候选和生产文案 API 在事实未审核时均返回 422，调用前后项目 SHA-256 不变；AI 输入过滤只保留 confirmed facts；
- stale 项目的工作台全屏预览、产物列表 MP4 链接和 `/short-video` 视频元素均被阻断，导出 API 继续返回 409；
- production metrics smoke 写入非空 `researchReviewedAt`；隔离的 proof smoke 写入首次/最近技术通过时间并保持 project/manifest fingerprint 相同，临时项目均已清理；
- `codex-app-explainer` 导出包重建成功，封面 PNG 实际烧录 `coverTitle`；视觉复查后将标题带移至中下部，人物面部不再被遮挡。该 fixture 的 rights check 仍正确为 failed（官方来源 `review_required`），不与 technical proof 混同；
- proof 现在也会为旧 schema fixture 补写四个分离状态和生产完成时间；`codex-app-explainer` 的 canonical project、render manifest 与 export manifest 当前一致为 `passed/review_required/draft-unpublished/none`，project fingerprint 相同；
- 三个项目均通过工作台 render API 重新渲染，render job 为 `completed`，technical/rights 为 `passed/cleared`，publication/market 保持 `draft-unpublished/none`；
- `dogfood-static-notes` 的两项重复素材分别引用 `videobrief-mixed-demo/source-02` 和 `source-03`，较早项目保持 `reusedFrom=null`；
- 三个项目的 render/export manifest 均包含 production 记录，完整导出目录和 ZIP 实际存在；
- `npm run lint`、`npm run build`、`npm run video:proof`、`git diff --check` 均通过；三个项目的 proof、fingerprint、ZIP、下载 API、H.264/AAC 媒体流和桌面/移动浏览器验收均已重跑通过，最终 `git status --short` 保留全部未提交工作树。
- `videobrief-mixed-demo` Research 深链实际核验五类来源：视频 8 秒、1080x1920、`readyState=4`；图片 1440x900 且加载完成；Markdown/文本显示非空本地正文；AIFF 预览转为 16 kHz mono WAV 后时长 8.007688 秒、`readyState=4`、无媒体错误，HTTP 200 与 Range 206 均通过。
- 来源切换会更新 `source=source-xx`，以该 URL 重新打开可恢复选中来源；事实引用 `source-03 · L3-3` 已真实点击并切换到 Markdown 预览。桌面 1440x900 与移动 390x844 均无横向溢出；移动端 `elementFromPoint` 复测确认引用按钮不再被预览层遮挡。

2026-07-12 首次用户路径复验：

- 三个隔离 Playwright 会话分别用于问题发现、完整新项目流程和最终状态复验；没有复用熟悉窗口冒充首次用户验收。
- 新项目导入 Markdown 与 PNG，2/2 来源处理完成，12 条事实由浏览器逐来源确认；真实 narrative 生成后由用户动作明确应用。
- 画面确认前“下一步：字幕”禁用；确认后选片写入 `project.json`，修改素材或时间段会撤销确认，未确认画面会阻断渲染。
- 浏览器 render job 在一次尝试内完成，0 次失败；45 秒 MP4 为 1080x1920、30fps、H.264 + AAC 48kHz，FFmpeg 完整解码到结尾。
- render/export manifest 的 proof 与 rights issues 均为空，项目 fingerprint 一致；4.2 MB ZIP 包含 MP4、SRT、ASS、封面、来源清单、project snapshot 和两个 manifest。
- 第三个全新窗口无 `view` 参数打开后自动进入导出；桌面与 390x844 移动工作台、全屏成片均非空且无控件遮挡，控制台无应用错误。

2026-07-12 GPT-5.6 质量 dogfood：

- 通过项目 API 从空项目导入 1 份原创研究 Markdown 与 6 张原创 1080x1920 编辑卡片；7 个来源均为 `verified/cleared`，没有使用 OpenAI logo、官网截图或第三方连续原片；
- `gpt-5.6-luna` 完成来源理解与原创叙事；10 条来源事实全部人工确认为 `confirmed`，4 条 uncertainty 保留并写入解决边界，AI 草案应用后由人工压缩为 6 个已编辑场景并明确选中对应候选；
- 当前质量版显式使用 `edge-tts-universal` 的 `zh-CN-YunjianNeural`（rate 194），`Tingting` 等 macOS 音色保留为显式离线降级；试听 API 返回真实 MP3，render manifest 记录 `voiceAdapter=edge-tts`、voice 和 rate；
- 逐镜短句保留 0.28 秒尾部停顿，最终旁白执行 48 kHz 重采样、高低通、压缩和 -16 LUFS 响度归一化；本地 Whisper 对最终音轨反向转写覆盖完整中文口播；
- 画面改为 3 张 OpenAI 官方 432x768 手机视口截图、1 段 ChatGPT Work 官方动画和 2 张原创信息卡；发布首屏、程序化工具调用原文、设计能力与 Saltwind 演示都按 9:16 手机布局进入成片，不再缩小桌面整页；
- 页面型场景保留完整标题数据，同时通过通用 `showEditorialOverlay=false` 隐藏顶部编辑叠层，避免遮挡网页自身标题；工作台可直接切换此设置；
- 最终成片 61 秒、1080x1920、30 fps、H.264 + 48 kHz AAC；SRT/ASS、配音、timeline、封面、平台文案、来源清单、project snapshot、render/export manifest、MP4 和 ZIP 均实际存在；
- technical proof 通过；4 个官方来源保持 `review_required`，因此状态为 `passed/review_required/draft-unpublished/none`，不把本地可用写成可发布。
- 本地 Whisper 对 Yunjian 最终音轨反向转写覆盖 6 段旁白；平均音量 -19.8 dB、峰值 -1.5 dB，片尾超出媒体时长的 Whisper 幻觉段不计入音轨内容。
- 真实浏览器中，素材列表显示 12 张图片缩略图和 1 个视频首帧；图片弹窗、大图关闭、视频弹窗播放到 15 秒结尾均通过，390x844 移动布局为单列且无可见横向溢出。

2026-07-14 素材与关键核验验收：

- 工作台导航由 6 个独立入口收敛为 5 步，“素材”和“审核”合并为“素材与核验”，旧 `view=research` 仅保留为内部兼容状态；
- `gpt-5-6-agentic-work` 从 102 条事实和 24 条疑问收敛为 10 条关键主张与 4 条高风险问题；原创视觉、官方截图和视频默认显示“无需逐条核验”，完整提取仍可展开追溯；
- “发布主视觉”进入核验后显示 0 条关键主张、0 条高风险问题和 7 条其他提取，不再默认渲染 7 个编辑表单；人工将任意视觉结果“设为关键主张”后项目计数会从 10 变为 11，还原草稿后恢复；
- 研究笔记的 10 条关键主张改为短行扫描，确认/驳回直接可用，表述编辑与来源定位按需展开；4 条高风险问题提供“保留为限制”和“与脚本无关”快捷处理；
- 脚本页真实显示“还有 4 条高风险问题待处理”并禁用重新生成，证明 Gate 与 UI 使用同一摘要逻辑；
- 桌面与 390x844 移动端均真实跑通“素材卡 -> 对应素材核验 -> 完整提取人工提升 -> 还原草稿”，URL、素材预览和关键计数一致；
- 浏览器控制台为 0 error；`npm run lint`、`npm run build` 和 `git diff --check` 在本轮交付前重跑。

2026-07-14 只读成片查看器改造：

- 默认项目页不再显示五步导航、修改输入框、生成按钮或制作详情入口；用户只看到成片、全屏、下载和折叠状态。
- 旧素材/审核深链默认落到只读成片；`advanced=1` 生产详情只能通过内部深链进入，返回按钮清理 `advanced/view/source/scene` 参数。
- 自动制作复用 canonical project、来源处理、AI narrative、候选、生产资产、现有 FFmpeg render、manifest 和 proof，没有建立第二套视频状态。
- `gpt-5-6-agentic-work` 的 canonical project 在本轮查看时已包含新叙事版本并处于 stale；没有回退该已有变化，而是在不调用 AI 的情况下重新渲染到 ready。当前播放器 `readyState=4`、时长 115.52 秒、1080x1920，桌面 1440x900 与移动 390x844 均已看到非空视频。
- 先前存在的自然语言修改和设置入口已按最新产品边界移除；生成与修改统一由 Codex 调用 canonical project、production API、render 和 proof。
- 普通 URL 实测为 0 个 textarea、0 个操作 button、0 个步骤 nav，只保留全屏、MP4 和导出包三个链接；移动视口 `innerWidth=390`、页面 `scrollWidth=390`，无横向溢出，浏览器 console 0 error。
- 最新截图位于 `output/playwright/read-only-viewer-desktop.png` 和 `output/playwright/read-only-viewer-mobile.png`。`advanced=1&view=export` 内部深链仍可加载五步详情，“返回成片”后只保留 `project` 参数。
- 当前项目 SHA-256 与 render/export manifest 指纹同为 `921519398788dae9047960bdea0492bc71b31841ec9a15e70ac138f35b6b2098`；technical proof `passed=true` 且 issues 为空。
- 静态 FFmpeg 将 115.52 秒 MP4 的 3077 帧完整解码到结尾：H.264 High、1080x1920、30 fps，AAC LC、48 kHz stereo；当前 ZIP 通过 `unzip -t`，MP4、SRT、ASS、封面、来源清单、project snapshot 和两个 manifest 均存在。
- `npm run lint`、`npm run build`、`npm run video:proof` 和 `git diff --check` 全部通过。本地服务继续运行在 `http://127.0.0.1:3100`。

每个里程碑至少运行与改动相关的定向测试，并在交付前运行：

```bash
cd /Users/rust/Documents/VideoBrief
npm run lint
npm run build
npm run video:proof
git diff --check
git status --short
```

涉及页面和视频输出时，还必须实际启动本地服务并验证：

- 空项目到工作台的主流程；
- 桌面和移动视口无明显布局溢出或遮挡；
- 预览视频非空且可播放；
- 项目修改后旧 manifest 正确失效；
- 新项目导出的 MP4、字幕、manifest 和来源清单真实存在。

不要用 build 通过代替浏览器和视频产物验收。

## Risks

- 三个项目已验证 schema v3 的多项目读写；旧 fixture 缺少 `importedAt`/`contentHash` 时只能保持“复用未知”，不能可靠回推历史素材关系。
- 浏览器不能安全读取任意本地路径；素材导入要遵守本地工具的安全边界，不开放任意路径覆盖。
- 本地转录依赖 `whisper-cli` 和约 574 MB 的 `large-v3-turbo-q5_0` 模型；原始音频不上传，但专有名词和歧义词仍需人工校对。
- 不得把 `review_required`、`local-review` 或 `official` 自动视为可发布。
- 当前仓库包含 legacy/experimental 渲染轨道；不要让它们重新成为 production acceptance target。
- 来源上传已经改为原始请求体流式落盘，不再通过 Next.js `formData()` / `arrayBuffer()` 缓冲整文件；真实浏览器已验证成功导入、进度显示与中断清理。当前剩余容量风险在于长素材解析仍缺少章节级调度与逐章缓存，而不是上传入口本身。
- `public/project-assets/` 是本机素材目录并被 gitignore；project.json 可以跨会话保留引用，但跨机器迁移必须单独复制素材并校验缺失状态。
- 当前生产配音默认依赖在线 Edge 神经 TTS；无需额外 Key，但需要网络且服务可用性不受本项目控制。macOS `/usr/bin/say` 作为显式离线降级保留，不能在神经语音失败时静默冒充同等质量。
- 浏览器音频预览首次访问会调用本地 FFmpeg 生成 `output/source-previews/` WAV 缓存；原始音频不修改、不上传。超长音频的首次转码仍可能有明显等待，后续若成为高频问题再增加显式预生成状态和清理策略。
- 用户提供的兼容端点已安全配置到 gitignored `.env.local`，主模型 `gpt-5.6-luna` 的 Responses API 已成功；音频转录由本地 Whisper 完成，不使用 Key。三份 pending narrative 还需要用户明确确认或拒绝。
- 当前 render job 可查询 queue position 和阶段、取消 queued 或真实 running 渲染进程组，并在失败或取消后创建关联任务继续渲染；全局锁按渲染进程存活与 token 所有权管理，不会在固定 30 分钟后误回收长任务。调度队列和 worker 已持久化，但长素材导入与章节化理解仍未完成。
- 最终 manifest 记录门禁耗时、绑定视频哈希的系统计时审片会话、AI/TTS 外部请求和缓存命中、失败请求数与已知失败等待；供应商 usage/价格缺失时不推算金额，旧式 `--active-seconds` 自报时长不再接受。
- 当前 proof 能检查画面非空，无法自动证明字幕未裁切；仍需保留关键抽帧的视觉检查。
- `video-project-1783855221061` 使用单张自有工作台截图持续 45 秒，只证明端到端流程和技术契约，不代表成片节奏、视觉丰富度或市场质量已验证。
- `gpt-5-6-agentic-work` 显著改善了画面丰富度与信息节奏，但仍是未发布 dogfood；技术通过、内部视觉判断和音轨可识别都不能提升 `market_status`。
- 旧项目没有事实类型和优先级时会用通用来源类型与语义信号兼容归类；它能避免全量审核，但不等于重新执行 Brief-aware AI 分类。需要更精确优先级时应由用户主动重新解析来源，不能静默消耗 Key 或覆盖人工审核状态。
- 自动模式的目标是生成可看的本地草稿，不等于事实、权利或发布审批；自然语言重做会更新 canonical project 并使旧成片/manifest 失效，必须完成新 render + proof 后才重新显示为 ready。

## Useful Skills

- `user-working-profile`：保持范围、证据和验收纪律；
- `zoom-out-code-map`：改 canonical schema 和多项目路径前梳理调用关系；
- `prototype-decision-lab`：对项目创建、素材导入和候选选片交互先做可丢弃原型；
- `diagnose-with-real-evidence`：处理渲染、转录、浏览器或状态错误；
- `playwright`：验证真实页面主流程和响应式布局；
- `ai-content-commerce`：仅在设计具体内容模板、分发和商业验证时使用，不反向定义产品。

## 给新窗口的执行指令

将下面内容作为新任务发送：

```text
在 /Users/rust/Documents/VideoBrief 继续执行 VideoBrief AI 视频生产流水线。

开始前完整读取：
1. README.md
2. docs/video-production-workflow-and-roadmap.zh-CN.md
3. docs/video-production-workflow-execution-handoff.zh-CN.md
4. docs/video-render-pipeline.zh-CN.md
5. content/projects/codex-app-explainer/project.json

先运行 git status --short，保护所有现有改动。不要回退或覆盖其他窗口的工作。

产品定义：VideoBrief 是由 creative brief + mixed source materials 驱动的个人 AI 视频生产流水线。内容题材只是模板；不要恢复 transcript-first、YouTube 摘要、海外 AI 单信号产品或 SaaS-first 定位。

直接开始实施，不要停在重新写计划。严格按主路线图的 Phase/Gate 推进：先完成 Phase 1 自助项目闭环，并以“不修改代码即可创建第二个项目并导出通过技术 proof 的 MP4”为第一验收目标。完成一个 Gate 后再进入下一阶段；如果全部阶段无法在一次任务中可靠完成，必须把当前 Gate 做到可运行、可验收，并更新交接文档中的事实状态和下一步。

复用现有 project/workbench/FFmpeg/manifest/proof 能力；保留来源追溯、权利状态、人工编辑和最终发布确认。冻结登录、计费、团队、云同步、自动发布、全网抓取、专业 NLE 时间线和 SaaS 扩张。

每次实现都要运行定向验证。交付前至少运行 npm run lint、npm run build、npm run video:proof、git diff --check 和 git status --short；涉及 UI 和视频时必须验证真实浏览器流程和真实输出文件。technical、rights、publication、market status 分开报告。不得发布、推送、付费或使用未授权第三方连续原片。
```
