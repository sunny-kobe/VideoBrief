# 视频渲染与验收链路

## 当前唯一生产链

```text
canonical project
-> 分句中文配音
-> 按 scene.sourceId 和时间点裁切来源
-> 静态图片按场景时长循环
-> 每幕按来源字节、时间窗、旁白字节和版式生成内容寻址 MP4
-> 已完成幕直接复用，缺失幕原子生成
-> FFmpeg 无重编码拼接视频，只对整片音频统一归一化与 AAC 编码
-> render-manifest.json
-> 当前项目技术 proof
-> 逐场景语义验收
-> 结构化编辑质量验收
-> 桌面/移动浏览器播放验收
-> 真人完整审片并批准当前视频 SHA-256
-> 版本绑定导出包
```

生产命令：

```bash
npm run video:export:production
```

### 默认正式画幅

自 2026-07-28 起，VideoBrief 新建正式项目的默认且唯一交付画幅为 `16:9`、`1920x1080`、`30fps`。canonical project 默认只配置一个 primary landscape rendition；生产导出不得自动附带 `9:16`、`1:1` 或横竖双版本。

手机竖持观看不改变成片规格：播放器应保持视频原始宽高比，将 16:9 画面完整缩放并居中，允许页面上下留空。不得把播放器留空烧录进 MP4，也不得通过拉伸、强制裁切或模糊填充把横版素材改造成伪竖版。只有用户对当前任务明确指定其他画幅时，才在该项目中增加 rendition，并对新增版本单独执行 render、proof、语义审片和浏览器验收。历史项目保留原规格，不因默认规则变化而回写。

工作台和 CLI 调用同一条渲染与 proof 逻辑，并由同一个 lifecycle preflight 检查命题、研究、素材包、场景选择和来源窗口，同时记录渲染尝试与失败。不存在可以绕过审批或漏记生产指标的页面/CLI 专用入口。`npm run project:workflow -- --project=<project-id>` 只自动执行来源处理、策划、渲染和打包，并在命题、素材包复核、研究、镜头复核、真人成片批准、发布或市场结论节点停止。素材包和镜头允许 Codex 作为生产操作员复核；命题、研究、成片、发布与市场结论仍要求真实人工决定。首次渲染会停在 `awaiting-review`；语义、浏览器、真人交付批准和打包是后续明确阶段，不把技术 proof 伪装成最终验收。

工作台在 `output/render-queue/queue.json` 原子维护全局 FIFO 队列，并在项目 workDir 镜像当前 `render-job.json`。任务状态区分 `queued`、`running`、`cancelling`、`cancelled`、`awaiting_review`、`completed` 和 `failed`，阶段区分 `saving`、`rendering`、`proof`、`review`、`packaging` 和 `completed`。任务记录包含 `jobId`、queue position、worker PID 与渲染子进程 PID；queued 任务可直接取消，running 任务按磁盘 PID 向独立进程组发送终止信号，失败或取消后可以创建关联上一任务的新任务继续渲染，并复用内容寻址缓存。

当前“继续渲染”的计算语义是真实的逐幕恢复：每个场景先完成独立 MP4 并原子进入 `output/render-cache/scene-segments-v1/`，中断不会留下可误用的半成品；再次执行时验证缓存 metadata 和 MP4 SHA-256，已完成幕不再编码，剩余幕完成后再拼接。最终视频流使用 stream copy，只有全片音频重新归一化和编码。HTTP POST 只保存并入队，独立 worker 串行执行；Next.js 服务停止时 worker 继续处理，服务恢复后 GET 从磁盘恢复任务。worker 意外死亡时，无存活渲染子进程的 running job 会重新排队；仍有存活子进程时由新 worker 按 PID 接管观察，避免重复渲染。

全局渲染锁按实际持锁进程是否存活判断，不再用固定 30 分钟超时回收。子进程启动后锁所有权从服务进程转交给渲染进程；释放时校验随机 token，因此长视频不会在运行中被第二个任务抢锁，旧任务也不能误删新锁。

## canonical project

每个项目的共同事实源是：

```text
content/projects/<project-id>/project.json
```

`codex-app-explainer` 仍是默认 CLI 兼容 fixture，不再是页面和 API 的唯一项目。项目列表、工作台、保存、渲染和预览通过同一个 `projectId` 选择项目；CLI 通过 `--brief` 选择项目。

```bash
npm run video:export:production -- --brief=content/projects/<project-id>/project.json
```

关键关系：

- `sources[]` 保存一手链接、本地素材、核验和版权状态。
- `scenes[].sourceId` 明确每个场景来自哪个来源。
- `scenes[].showEditorialOverlay` 控制顶部编辑标题是否烧录；页面或截图本身已有清晰标题时可以关闭，但 canonical 标题与字幕仍保留用于编辑和验收。
- `outputs` 保存工作目录、成片和公开预览路径。
- `render` 保存分辨率、帧率和配音参数。
- `render.renderStrategy` 默认为 `segmented-concat`；仅为回归排查显式保留 `monolithic`。
- `production` 保存素材导入、人工保存、渲染尝试/失败和跨项目复用记录。
- `sources[].contentHash/reusedFrom` 只允许后导入素材引用更早的同内容来源，避免反向或循环关系。

旧的顶层 `sourceVideo` 和硬编码 38 秒 timeline 只保留读取兼容，不再写回项目文件。

## 镜头语义同步契约

VideoBrief 同时维护两种不同的同步：

- 技术同步：音频流、视频流、字幕和 scene 边界在同一 timeline 上，成片可以完整解码和播放；
- 语义同步：旁白正在表达的内容，与当前镜头中真正可见的页面、操作、对象或信息一致。

技术同步通过不能代替语义同步。一个持续滚动、没有黑帧且总时长正确的视频，仍可能因为镜头内容与旁白无关而不合格。

每个启用场景必须满足：

1. `selectedCandidateId` 指向真实存在的候选；
2. scene 与选中候选的 `sourceId`、`sourceStart`、`sourceEnd` 完全一致；
3. `narration`、`title`、`subtitle`、`visualRequirement`、source reference 和可见画面表达同一个叙事点；
4. 视频窗口能够覆盖场景旁白，不依赖循环同一小段素材填满时长；
5. 不用同一个通用窗口为多个不同论点充当证据；作为转场或背景复用时，必须在匹配原因中明确其非证据角色。

`sourceStart/sourceEnd` 是用户或 Codex 确认的素材边界。渲染器可以根据旁白生成场景时间线，但不能静默改写已确认的 `sourceEnd`。若旁白比视频窗口长，或 `sourceEnd` 超出真实媒体时长，应在渲染前失败并要求选择更长且有效的语义片段。生产视频输入不使用循环参数掩盖越界。

输出 timeline 必须落在目标帧率的整数帧网格上。视频场景先按不可变的 `sourceStart/sourceEnd` 裁切，再按 `frameCount` 截断到不超过所选窗口的最后一个完整输出帧；manifest 和 render plan 同时记录 `frameCount` 与 `renderSourceEnd`。场景起止时间由累计帧数派生，不能直接累加毫秒级素材窗口，避免多场景 FFmpeg 取整后产生累计音画边界漂移。

素材不足时，按以下顺序处理：

1. 补充更长、移动更慢且内容可读的官方、自有或已确认真实动态素材；
2. 缩短旁白、合并场景或减少无法被素材支持的观点；
3. 使用语义相关的真实素材承担情境、过程背景或影响展示，但不把它当作特定事实的直接记录；
4. 使用静态图或原创程序化信息层承接数据、结构和抽象机制；
5. 在真实画面无法获得或不适合表达时，使用明确属于示意、类比或氛围的 AI 生成画面。

上述顺序不是固定素材比例。最终选择取决于当前镜头承担的是事实证据还是视觉表达，但 `materialQualityReview` 必须记录画面角色、替代理由、权利状态及 AI 生成或合成状态。相关素材和 AI 生成画面不得冒充特定人物、产品、事件或结果的真实记录，也不能替代支撑旁白事实的一手来源。

不得用循环、无关 B-roll、同类项目演示或快速滚动制造“画面很多”的假象。使用同类项目素材时必须明确标记为场景参考，不能表现为目标产品的真实运行结果。AI 生成画面还必须按目标平台的当前规则处理 AIGC 标识，不得删除、隐藏或规避平台要求的标记。

### 渲染前素材质量 Gate

新建正式项目在首次渲染前必须写入版本化的 `materialQualityReview`。逐幕复核至少记录：当前 `sourceId/sourceStart/sourceEnd`、画面实际可见主张、证据角色、旁白匹配度、桌面与移动可读性、窗口完整性、运动必要性、是否重复充当无关观点、`platformWatermark` 状态，以及 start/mid/end 或目标视口证据路径。素材清单应同时显示当前 Gate 状态，避免把“已登记候选”误当成“已通过最终选片”。

`platformWatermark` 只允许 `absent` 或 `not-applicable` 通过；视频候选通常必须为 `absent`，原创信息层等无外部素材的场景可以为 `not-applicable`。平台角标、来源账号角标、下载工具标记和其他来源水印只要在计划使用窗口内可见，就必须记为 `present` 并淘汰该候选。不得通过裁切、遮挡、模糊或覆盖水印来绕过 Gate；找不到权利可判断的无水印替代素材时，退回 Topic Gate 淘汰命题。

复核报告通过以下命令写回 canonical project：

```bash
npm run video:review:materials -- --brief=content/projects/<project-id>/project.json --review=<material-quality-report.json> --reviewer=<name> --apply
```

Gate 绑定场景旁白、标题、字幕、`visualRequirement`、已选候选、窗口、构图、播放速度、镜头运动和输出规格。任一项变化都会使旧复核指纹失效。Gate 缺失、状态不是 `passed`、逐幕结论不是 `accept` 或证据不满足要求时，CLI、工作台渲染和 production package 必须在编码前拒绝执行。历史项目未声明此版本化字段时只保留读取兼容；一旦进入本轮正式重制，应补齐当前 Gate。

外部视频理解、OCR、场景检测或关键帧 MCP 只能作为按需辅助，用来提高候选发现和定位效率。它们的摘要、OCR 文本或自动抽帧不能直接构成通过证据：工具可能漏掉窗口末尾的关键状态、把中文识别成乱码，或只返回开头帧。正式 Gate 仍以确定性的窗口边界、start/mid/end 代表帧、源素材与成片对比，以及真实桌面和移动播放器检查为准。

### 画面可读性与镜头运动契约

页面、UI、代码、终端和表格只有在观众实际看得清时才能承担教学或事实证据。素材入选前必须检查原生分辨率、代表帧和计划中的显示区域；成片渲染后还要检查编码和缩放是否损伤细字。`1920x1080` 只描述输出画布，不能证明被放大的低清素材已经变清晰。

可读性按以下标准判定：

1. 在真实 `/short-video?project=<project-id>` 页面以 1 倍速播放，并在目标桌面和移动视口检查；
2. 旁白或 `visualRequirement` 依赖的关键词、数值、代码、操作状态和表格项无需暂停、浏览器缩放或猜测即可辨认；
3. 同时查看源素材代表帧和成片开始、中间、结束帧，区分源素材低清、构图缩小、运动重采样和编码损失；
4. 只看得出“这是某个网页或产品”不能据此通过信息可读性验收；若画面没有独立的受众叙事价值，应直接从时间线省略，而不是为了证明来源强行展示；
5. `proof.passed=true`、输出分辨率、码率、非空抽帧和审片备注都不能替代实际可读性。

素材不可读时按以下顺序处理：重新以目标分辨率录制并放大浏览器字号或 UI 缩放；选择只包含关键区域的清晰录屏；使用高分辨率静态局部截图和标注；最后用原创信息层重建当前叙事所需信息。不得依赖插值放大、锐化或提高成片码率恢复源素材中已经丢失的文字细节。

来源 URL、原始截图、分辨率、权利状态、替代原因和选片理由应保留在 source list、review package、`materialQualityReview` 与审片证据中，不要求烧进视频。内部素材诊断不得改写成面向观众的教学内容；只有当来源身份本身是命题的一部分，且画面清晰、具有独立叙事价值时，才允许在时间线中展示来源。

文字密集的教学画面默认使用 `mediaMotion: none`。镜头运动只有在 Creative Brief 或场景叙事明确需要、运动方向有表达作用且开始/中间/结束帧均保持可读时才能启用。不得默认跨场景交替 `push-in`/`pull-out`，也不得用持续推拉制造静态图“看起来在动”；这种整屏重采样会降低细字稳定性，并让固定标题层与背景产生晃动感。

2026-07-29 的 `ai-agent-book` 教学样片暴露了两类失误：一段已登记为 `800x450` 的低清整页录屏被放大后用于展示公式和三组件表格，正文在真实播放器中不可读；多幕静态信息图又默认交替推近和拉远，形成持续晃动。后续素材回放样片还把“低清页面只负责建立来源”这种内部判断直接讲给观众，既无学习价值又再次暴露模糊画面。此后低清整页素材不得承担细字教学信息，也不得仅为证明来源进入成片；文字密集场景默认稳定展示，用户审片指出这类问题时必须让旧验收失效并重新生产。

### 交付前语义验收

在渲染前先整理可扫描的素材表，至少包含：来源标签、图片/视频预览、起止时间、对应场景、匹配理由、权利状态和平台水印复核结论。素材没有完成这一步时，不进入最终选片。

渲染后执行：

1. 对比 canonical project 与生成 timeline，逐场景确认 `sourceId/sourceStart/sourceEnd` 未漂移；
2. 每个场景至少抽取中点帧，镜头内有明显变化时再检查起点和终点；
3. 逐句核对旁白主题、标题、字幕和画面中可读内容；页面、UI、代码或表格承担信息时，同时对比源素材与成片代表帧，并按真实播放器显示尺寸确认关键文字可读；
4. FFmpeg 完整解码音频流和视频流到结尾；
5. 在真实 `/short-video?project=<project-id>` 页面确认媒体元数据、实际播放和尾段；
6. 预览组件开启循环时，临时关闭循环并确认最后一段能够到达 `ended`。

语义通过必须为每个启用场景保存具体复核说明。审片前先以 `--start-session` 创建绑定当前项目指纹和视频 SHA-256 的一次性会话，完成命令从会话起止时间计算审片时长；调用者不能通过参数自报秒数。proof 检测到长静止区间时，reviewer 必须显式确认这些区间是有意保留的可读页面，而不能依赖一条泛化“已检查”记录。

### 编辑质量验收

语义一致只证明画面没有说错，不证明成片适合观看。`passed` 的语义验收还必须读取结构化质量记录，固定检查：

1. `opening`：前五秒的问题、反差或结论是否脱离来源上下文仍可理解；
2. `visualReadability`：目标视口下的关键对象与文字是否真正可读；
3. `pacing`：静止区间是否有阅读目的，是否存在重复或无关填充；
4. `subtitleReadability`：字幕是否裁切、遮挡主体或互相重叠；
5. `pronunciation`：专名、数字和命令是否按一倍速人工确认；
6. `platformFit`：画幅、节奏和信息密度是否符合 Creative Brief 的首发平台；
7. `cta`：结尾行动是否与证据和 brief 一致。

模板见 `docs/editorial-quality-review.example.json`。每项必须为 `passed` 并提供具体说明。proof 会把冻结覆盖比例、旁白相似度和未精确命中的专名写入 `editorialQuality.signals`；这些信号是审片依据，不能仅用 `--confirm-*` 参数机械跳过。

浏览器验收同时覆盖 1440×900 桌面和 390×844 移动视口。两个视口都必须从 0 开始，以 1 倍速、非静音、顺序播放到 `ended`；倍速完整播放、只推进开头或跳到片尾只能作为诊断，不能构成交付验收。

2026-07-20 的 SylphxAI dogfood 暴露了这一规则：两个约 8 秒录屏被重复绑定到 7 个不同观点，且渲染器曾把确认的短窗口改写为旁白时长。流时长和画面运动都可以通过，但旁白与镜头不对应。修复后的基线是为问题定义、产品定位、Agent Document Twin、证据链、OCR/Trust Report、安装和结论分别绑定独立语义窗口，并用逐场景抽帧和浏览器播放验收。

## render manifest

渲染完成后在各项目自己的 `outputs.workDir` 生成：

```text
output/videos/<project-id>-work/render-manifest.json
```

manifest 记录：

- 当前项目文件 SHA-256 指纹。
- `renderContractVersion=3` 的不可变 `render-plan.json`：渲染时项目指纹、来源文件 SHA-256、逐幕 `frameCount/renderSourceEnd`、segment cache key、segment MP4 SHA-256、原始逐幕 FFmpeg graph/命令、concat list 和最终拼接命令。V2 单体 graph 仅保留旧产物验证兼容。
- 实际渲染时间、分辨率、帧率和时长。
- MP4、SRT、ASS、配音和 timeline 路径。
- 每个场景的来源、成片时间和原片时间。
- proof 是否通过、检查时间、完整解码、响度、峰值、黑帧、长静止区间、旁白反向转写和逐场景抽帧。
- 绑定当前视频 SHA-256 的逐幕语义、结构化编辑质量与桌面/移动一倍速浏览器验收证据。
- production 记录、实际使用来源和 rights check。
- `productionMetrics`：从渲染到各验收/打包阶段的耗时、逐幕视频缓存命中/未命中、是否重编码最终视频/音频、系统计时审片会话、AI/TTS 外部请求与缓存命中，以及失败请求数和已知失败等待时间；没有供应商 usage/价格数据时金额必须保持 `null`。

项目保存后，影响真实视频字节的 brief、来源文件、场景、窗口、旁白、画面文字或渲染配置变化会改变 `productionContentFingerprint`，工作台必须显示“成片已过期”。来源权利、核验和操作员复核元数据不改变视频内容指纹，因此不会强迫重渲染；这些字段进入独立 `packageContentFingerprint`，变化后旧 ZIP 必须失效并重新打包。

项目 `lifecycle` 是独立的管理元数据，不进入 `productionContentFingerprint` 或 `packageContentFingerprint`。归档与恢复只改变首页可见性，不改变当前成片或导出包的新鲜度；读取仍使用旧 raw project fingerprint 的 legacy manifest 时，生命周期操作会先为当前 manifest 补写等价的生产内容指纹，再写入归档状态。

渲染时项目指纹与 proof 写回状态后的当前项目指纹分开保存。render plan 永远绑定渲染时输入；当前项目指纹继续用于 stale 检查，因此 proof 更新 `technical_status` 不会反向改写已经执行过的 plan。新契约的 plan 缺失、来源媒体字节变化、segment/list 字节变化、逐幕 graph/命令哈希漂移或最终拼接命令漂移时，technical proof 必须失败。

下载 API 同样重新核对当前 fingerprint 与 proof。旧 MP4 和 ZIP 即使仍在磁盘，也不会在 stale 状态下提供下载；重新渲染、proof 和打包后才恢复。

## proof 规则

`npm run video:proof` 不再假设固定 38 秒。它从 manifest 读取本次渲染的真实契约，并检查：

1. 项目指纹与当前项目文件一致。
2. 新渲染必须存在 render plan，且计划中的来源字节、场景窗口、逐幕缓存字节、graph、concat list 和实际 FFmpeg 参数与 manifest 一致。
3. 所有声明产物存在且不为空。
4. MP4 分辨率、帧率和时长与 manifest 一致。
5. 存在可听音轨，平均音量不低于静音阈值。
6. 每个场景中点均能抽出有效画面。
7. 响度接近 -16 LUFS、True Peak 不高于 -1.5 dBTP，且没有超过门槛的黑帧。
8. 本地 Whisper 反向转写没有明显漏读、重复或额外内容，并单列当前旁白中的专名未精确命中项供一倍速人工确认。

渲染器会对长中文 eyebrow、标题和字幕插入 ASS 显式换行，避免 libass 对无空格中文不换行造成左右裁切。proof 抽帧仍需用于视觉检查，不能只依赖文件存在。

proof 结果会原子写回 manifest。指纹一致且 `proof.passed=true` 时，工作台只显示“技术检查通过，等待内容验收”；语义、编辑质量和浏览器验收均绑定当前视频哈希后，只能显示“自动验收完成，等待真人一倍速审片”。只有真人批准当前视频哈希后，才显示当前成片已获交付批准。

schema v2/v3 项目还会把 `technical_status` 写为 `passed` 或 `failed`，并同步更新 manifest 指纹。普通项目保存会把它改为 `stale`；proof 遇到指纹不一致时不会替旧成片“追认”新项目。

## 输出格式

- H.264 High profile
- 默认正式交付：16:9，1920×1080
- 兼容但不默认生成：9:16，1080×1920；1:1，1080×1080；仅限用户对当前任务明确指定
- 30fps
- yuv420p
- AAC 192kbps / 48kHz
- faststart

完整生产导出包还包含：`final.mp4`、`subtitles.srt`、`subtitles.ass`、`cover.png`、`platform-copy.json`、`source-list.json`、`render-manifest.json`、`project.snapshot.json`、`export-manifest.json` 和 ZIP。只有语义验收、桌面/移动浏览器一倍速播放和绑定当前视频哈希的真人交付批准都有效时才允许打包。receipt 同时绑定视频、render manifest、ZIP、生产内容指纹、打包元数据指纹和真人批准记录；瞬时 render job 仍独立于 canonical project fingerprint。

## 其他渲染轨道

- Remotion：旧 38 秒 React composition，保留为 legacy 实验，不参与当前 production proof。
- HyperFrames / html-video：继续用于信息卡、封面和动效模板实验，不参与当前 production proof。
