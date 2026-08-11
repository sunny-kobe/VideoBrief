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

事实必须由一手资料或明确归因的来源声明承担。画面按实际能力分为直接证据、操作示意、相关情境、原创信息层和 AI 示意；替代画面不能冒充真实记录。

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
