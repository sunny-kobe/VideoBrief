# 自营解释型内容生产手册

## 1. 文档地位

本文记录自营账号“日常有因”的下一阶段命题调研与 Topic Gate 之后的正式生产流程。仓库内的可复用启动提示词只负责为下一条内容做发布复盘、开放候选、三题核验和唯一推荐；命题批准后的生产必须另开任务。

它是自营账号的编辑与执行模板，不改变 VideoBrief 作为通用视频生产工作台的产品边界。渲染、素材和验收细节仍分别以 `docs/video-render-pipeline.zh-CN.md`、`docs/online-dynamic-material-cut-workflow.zh-CN.md` 和 canonical project 为准。

## 2. 为什么沉淀为仓库规范

本流程不单独创建全局 Skill，原因是它直接依赖本仓库的：

- `content/projects/<project-id>/project.json`；
- Topic、Research、Material、Delivery 和 Publication Gate；
- `materialQualityReview` 指纹；
- FFmpeg render manifest、technical proof 和完整解码；
- `/short-video` 的桌面与移动播放器验收。

这些契约离开 VideoBrief 不成立。把它们复制进全局 Skill 会产生第二份事实源，并可能在其他视频项目中误触发。仓库规范负责执行，页面负责聚合结果；只有未来出现多个仓库共同复用同一流程时，才应提炼为全局 Skill 并同步到 CcSwitch。

## 3. 规范入口

- 下一阶段命题调研提示词：`content/workflows/self-owned-explainer-v1/kickoff-prompt.zh-CN.md`
- 页面与阶段配置：`content/workflows/self-owned-explainer-v1/workflow.json`
- 聚合页面：`http://127.0.0.1:3100/showcase`
- 当前参考项目：
  - `content/projects/eu-tethered-caps-explainer-20260805/project.json`
  - `content/projects/parcel-locker-last-mile-explainer-20260806/project.json`

提示词是命题调研任务的范围合同，不是固定选题生成器，也不包含 canonical production。两条正向参考项目和汽车实体按键负向反馈只用于排重与回归，三条已发布内容都不能反推市场需求或永久垂类已经验证。

## 4. 完整流程

### 4.1 发布复盘与范围确认

先读取已发布内容的同口径数据、评论和可见反馈，再确认本轮排重、禁止题材、禁止动作和 Topic Gate。当前账号工作定位是：

> 用公开影像和一手资料，讲清日常产品与服务变化背后的规则、成本和利益机制。

它位于“讲清全球产品、商业和互联网现象为什么发生、怎样运转、会影响谁”的更宽编辑边界内，不是科技、商业或思维模型单一栏目。选题必须由真实观众问题、证据条件和素材可行性共同决定；发布、内部评分和相对播放高低都不等于市场验证。

### 4.2 当前平台调研

以 B站为主调研近 6-12 个月的成熟解释型内容、搜索结果和评论问题，记录可核验的案例、开头结构、真实案例承载方式、画面组合、系列潜力和中文同质化。其他平台只在能补充当前命题的需求或同质化判断时查看，不默认做全平台矩阵。

平台报告、创作者案例和播放量只能证明内容形态存在。它们不能证明新账号必然获得流量，也不能替代题目级素材核验。

### 4.3 开放候选池

提出 8-12 个差异明显的候选，每题都要同时回答受众钩子、知识收益、核心矛盾、一手来源、动态素材、替代视觉、短版与长版适配、同质化和风险。

只有概念没有案例、只能侵权搬运、依赖本人拍摄挑战、属于医疗法律金融建议，或退回 AI 工具资讯与制作流程的题目直接淘汰。

### 4.4 三题可行性核验

为 3 个方向不同的入围题实际打开并核验一手来源和动态素材。命题调研阶段至少记录：

- 原始 URL、发布者和权利状态；
- 发布日期、可见清晰度和大致可用段落；
- 计划使用的完整窗口是否原生无平台角标、账号角标、下载标记或其他来源水印；
- 能承担的具体观点；
- 画面角色和替代理由；
- 近期相似内容、评论问题和同质化缺口；
- 不超过 15 秒的开头承诺与 3-5 段叙事骨架。

此阶段不下载或批量入库素材，不生成 SHA-256、`sourceStart/sourceEnd` 或 start/mid/end 代表帧；这些属于 Topic Gate 批准后的 Material Gate。

来源不可访问是覆盖缺口，不是对事实的反证。品牌画面可以说明操作或情境，但不能单独证明监管、统计或环境结论。

动态素材必须原生无平台或来源账号水印。不得把裁切、遮挡、模糊或覆盖水印当作可行方案；如果核心叙事只能依赖带水印视频，且没有权利可判断的无水印替代素材，该命题在 Topic Gate 直接淘汰。

### 4.5 Topic Gate

向用户提交发布复盘、候选池、3 个入围题、证据与素材方案、风险和唯一推荐。此时不得创建 canonical project。

用户批准的是一句话受众命题。评分只用于候选比较，不进入成片叙事，也不代表市场验证。调研任务到此结束；画幅和生产授权在后续生产任务中确认，默认仍为单横版 `16:9 / 1920x1080 / 30fps`。

### 4.6 Canonical production

另开生产任务并获得明确授权后，创建独立 `project.json`，完成 Research Gate、素材清单、原创中文叙事、不可变候选窗口和 `materialQualityReview`。逐幕 `platformWatermark` 必须明确记录为 `absent`、`present` 或 `not-applicable`；缺失复核或 `present` 均禁止渲染。

生产任务不得继承 Topic 调研中的候选池、网页导航树、下载日志和完整对话历史。只交接已批准的一句话命题、已核验来源、证据边界、素材线索、目标信号和批准指纹。Canonical project 创建后，用阶段投影读取必要上下文：

```bash
npm run project:context -- --brief=content/projects/<project-id>/project.json --stage=research
npm run project:context -- --brief=content/projects/<project-id>/project.json --stage=material
npm run project:context -- --brief=content/projects/<project-id>/project.json --stage=delivery
```

完整 `project.json` 仍是唯一事实源；阶段投影只是只读上下文，不得反向覆盖 canonical。来源处理队列默认以 3 路有界并发运行，在任一来源结束后立即补槽位；可用 `SOURCE_PROCESSING_CONCURRENCY=1..8` 调整，但不得用无上限并发冲击本地 Whisper、CPU 或外部模型额度。同一项目的来源结果必须通过 canonical 文件锁逐次归并，锁内不得执行网络、转录、FFmpeg 或模型调用。来源处理、转录和渲染等长任务必须运行到终态或明确超时，只在状态变化时返回摘要，不得由模型高频轮询。情境素材已经满足动态覆盖预算时，冗余来源失败一次即可淘汰，不得阻塞 Research Gate。

事实必须由一手资料或明确归因的来源声明承担。画面按实际能力分为直接证据、操作示意、相关情境、原创信息层和 AI 示意；替代画面不能冒充真实记录。

#### 动态素材预算与静态例外

当前“日常有因”普通受众解释视频默认把动态素材作为可计算的生产约束，而不是渲染后的主观评价：

- Creative Brief 和素材方案在渲染前记录计划动态秒数、计划总时长与目标比例；用户未另行指定时，实际动态视频至少覆盖成片 70%，优先接近或达到 80%。
- 实际比例按最终 `timeline.json` 计算：累加已启用场景中已选候选 `mediaType=video` 的输出时长，再除以成片总时长。静态图添加推拉或其他程序化运动仍按静态计算。
- 同一窗口循环、慢放、重复用于不同观点、无语义关系的通用 B-roll，以及只为满足数字而延长空镜，均不得用于提高比例。
- 静态场景只保留给公式、阈值、表格、产品对象或其他需要稳定阅读的教学信息。每个静态例外都要记录它比动态替代更适合学习目标的原因，并在真实桌面和移动播放器中复核可读性。
- Topic Gate 已知无法获得足量已清权、无平台水印且语义可用的视频窗口时，应降低素材可行性评分并淘汰、缩短命题或更换题目，不得先生产静态版本再靠无关动态素材补足。
- 验收同时报告计划比例和最终时间线实算比例；只有后者可以作为交付结论。

### 4.7 正式渲染与验收

按以下顺序执行：

1. `materialQualityReview` 当前且 8/8 或全部启用场景通过，包括每幕无平台/账号水印复核；
2. 正式 FFmpeg 渲染；
3. technical proof；
4. 视频流和音频流完整解码；
5. canonical、timeline 与 manifest 的窗口逐幕一致；
6. start/mid/end 语义审查；
7. opening、visualReadability、pacing、subtitleReadability、pronunciation、platformFit、cta 七项编辑质量审查；
8. 桌面 1440×900 与移动 390×844，非静音、1 倍速从 0 播放到真实 `ended`。

自动化通过后停在 Delivery Gate。没有真人批准当前视频哈希时，不打包、不上传、不发布。

Delivery Gate 前即可生成本轮耗时、请求、缓存、失败成本和可选 Codex 会话 token 报告，不需要等待打包：

```bash
npm run project:production-report -- \
  --brief=content/projects/<project-id>/project.json \
  --session=/absolute/path/to/codex-rollout.jsonl \
  --until=<delivery-gate-iso-time>
```

提供方未返回或仓库未记录的 token 与费用必须保持 `null` 或明确标记不可用；不得从请求数估算为事实。

场景时长必须跟随真实 TTS 旁白，而不是直接沿用候选素材窗口。每幕旁白结束后只保留短尾气；technical proof 按 `docs/video-render-pipeline.zh-CN.md` 的门槛拒绝多秒无字幕、无音频的等待。完整审片还要在用户指出的具体时间点前后复核切幕，不能用音轨存在、总时长一致或逐幕中点非空代替节奏检查。

当前自营解释型视频的编辑文字默认从简：底部逐句字幕承担连续阅读，左上角 Eyebrow、Title、Deck 不得在每幕重复复述旁白。只有学习目标确实需要、真实画面无法直接表达且不会遮挡主体时，才增加简短原创信息层，并在桌面和移动视口复核。

正式封面也属于发布素材。封面使用的外部图片或视频帧必须单列来源、许可和必要署名；封面来源未进入成片时，仍要进入发布文案的权利说明。重剪后不得沿用与当前素材清单或署名链不一致的旧封面。

已审封面要保存在生成导出目录之外，并由 canonical project 的 `platformCopy.coverAssetPath` 明确引用。production package 只能原样复制该资产，并在 manifest 与 package receipt 中记录封面 SHA-256；打包、重新打包和 Publication Gate 都不得静默回退到自动首帧封面。

封面验收必须看最终 PNG 像素，不能只看生成命令成功；重点检查换行转义、中文字体、裁切和平台缩略图安全区。发布包的 AIGC 状态要同时检查生成画面、合成语音和其他生成内容，并优先映射到平台专用声明字段。平台没有专用字段且规则明确要求正文披露时，才在简介追加最短必要声明。

平台标题和简介按正常创作者口吻写。正文只保留观众问题、内容价值、必要事实边界和 CTA，不展示 TTS 型号、VideoBrief 工作流、资料核验、剪辑、字幕、封面制作、素材质量审计或“未使用 AI 画面”等内部过程。事实来源、完整素材清单和权利证据进入内部台账；只有许可证强制要求的署名才在末尾压缩成一段“素材鸣谢”。如果题目必须依赖大量强制署名素材且显著破坏内容体验，应在选片阶段换用免署名素材，而不是发布时删掉法定署名。

### 4.5 多平台发布与排期

每个平台建立独立发布目标，分别保存批准、投稿时间、定时时间、平台稿件号、投稿记录 URL、真实公开 URL、实际发布时间、投稿文案快照和历次数据快照。排期不能当成发布，审核通过也不能当成公开可见；到点后仍需核验公开页，再把目标更新为 `published`。项目级 `publication_status=published` 只表示至少一个平台已有可核验的真实发布事实，其他目标继续保持各自状态。复盘前通过 `project:publication-ledger` 用保存的账号状态统一采集；`0` 表示平台明确返回零，`null` 表示本轮未取得，二者不得混用。跨平台 Markdown/JSON 台账只从 canonical projects 生成，不手工重复维护。

当前阶段只选择 1-2 个主平台做真实反馈实验。B站、视频号、小红书、抖音和 YouTube 可以进入同一目标清单，但标题、封面、说明、标签、AIGC 声明和 CTA 必须按平台分别复核；不得把同一套文案和素材不加判断地批量铺到所有平台。没有当日官方规则证据、账号授权或稳定上传适配器的平台，先纳入人工发布流程，不伪装成已自动接入。

## 5. 证据分工

| 证据或画面 | 可以承担 | 不能单独承担 |
| --- | --- | --- |
| 一手资料 | 法规、定义、统计、企业原始声明 | 画面体验与观看节奏 |
| 真实动态素材 | 操作、人物行为、产品形态、事件现场 | 素材没有直接展示的统计或因果结论 |
| 语义相关素材 | 情境、机制、类比、氛围 | 特定人物、产品、事件或结果的真实记录 |
| 原创信息层 | 路径、对比、条件、抽象机制 | 没有来源支撑的新事实 |
| AI 生成或合成画面 | 明确标注的示意、机制、类比和氛围 | 事实发生、人物行为或产品结果的证明 |

## 6. 两条回归基准

| 项目 | Topic Gate 评分 | 当前结果 | 关键经验 |
| --- | ---: | --- | --- |
| 欧盟连体瓶盖 | 38/40 | 87.497 秒，自动验收通过，Delivery Gate pending | 法规事实与产品动作分工，CAD 和生产线镜头分别承担结构与制造影响 |
| 包裹为什么进入快递柜 | 37/40 | 88.063 秒，自动验收通过，Delivery Gate pending | 企业视频只作操作背景，独立研究承担正反结果；烧录英文字幕与中文字幕必须分层 |

这两条 canonical projects 当前仍记录为 `rights_status=review_required`、`publication_status=draft-unpublished`、`market_status=none`；它们没有回写之后发生的外部 B站发布。下一轮命题调研必须以 B站公开页和可访问的创作数据核验实际发布与反馈，同时保留 canonical 状态作为仓库事实。内部质量认可和外部发布都不等于清权或市场验证。

## 7. 常用命令

```bash
git status --short
npm run project:context -- --brief=content/projects/<project-id>/project.json --stage=research
npm run project:production-report -- --brief=content/projects/<project-id>/project.json
npm run video:review:materials -- --brief=content/projects/<project-id>/project.json --review=<review.json> --reviewer=<name> --apply
npm run video:export:production -- --brief=content/projects/<project-id>/project.json
npm run video:review:prepare -- --manifest=output/videos/<project-id>-work/render-manifest.json
npm run video:review:semantic -- --manifest=output/videos/<project-id>-work/render-manifest.json --start-session
npm run video:review:semantic -- --manifest=output/videos/<project-id>-work/render-manifest.json --decision=passed --reviewer=codex --note="具体逐幕结论" --scene-notes=<scene-notes.json> --quality-review=<quality-review.json>
npm run video:review:browser -- --manifest=output/videos/<project-id>-work/render-manifest.json
npm test
npm run lint
npm run build
npm run docs:check
git diff --check
```

不得把 `npm run video:package:production` 加入自动执行段。只有真人完成 Delivery Gate 后才允许进入打包。

## 8. 维护规则

- 新样片加入 `workflow.json` 前，必须有独立 canonical project 和当前 manifest。
- 页面状态必须从项目和 manifest 派生，不得手工写“已通过”。
- 新的跨题材失败案例先修当前成片，再沉淀到本手册或机械检查。
- 评分、用户评价和播放数据分开记录；内部评分不进入 `market_status`。
- 只有流程在多个仓库中重复出现且仓库契约可以参数化时，才升级为全局 Skill。
