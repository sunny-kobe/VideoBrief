# 从技术通过到观众愿意看：观感优化与对照流程

日期：2026-10-17。范围：最近的机翼、热泵两片，以及可复用的表达试读和审片工具。当前结论依据 canonical 投影、实际 timeline/manifest、源机制代码、关键帧与本机实验；没有把转写或静帧检查写成完整主观试听。

## 最没把握的事情

“换成更强的语音模型就能解决机械感”尚无对照证据。两片当前使用 Edge Yunxi，逐幕独立合成；是否主要受音色、文稿、意群重启或齐整尾停影响，需要同条件试听。最便宜的验证是保持声线和引擎不变，先比较两段连续口播的措辞，再单独比较分段方式。当前 Edge 服务合成超时，握手探针返回 403，因此新版口语稿尚未得到可听音频，不能声称更自然。

## 最大的遗漏

已有流程写了“先试听”，但验收证据没有真正回答“像不像在对人说话、画面有没有帮观众理解”。两片的发音检查以 Whisper 准确性为依据；五项编辑备注跨片完全相同，热泵片的节奏备注甚至仍在说机翼风洞。通过标签不能代替本片观察。最小修正是让模板从 `pending` 开始，写本片时间点、原句和可见变化后再判断，同时把试读和对照做成可直接执行的工具。

## 两片的具体问题

| 已确认事实 | 对观感的影响或待验证判断 | 最小修改 |
| --- | --- | --- |
| 两片都是 `edge-tts / zh-CN-YunxiNeural / rate=180 / per-scene`，`voiceStyle` 为空 | `natural-tech-zh-v1` 是配置标签，当前 Edge adapter 没有执行自然语言表演提示 | 先试同声线口语稿；不把标签当作能力 |
| 机翼六幕平均尾留 0.449 秒，热泵 0.459 秒，范围约 0.417–0.482 秒 | 逐幕重启加齐整停顿可能形成“逐条朗读”，仍需听辨 | 按意思写连续稿；在试听中检查跨镜头语调，不随机变速 |
| 热泵前 4.824 秒说明设备关系，观众疑问之后才出现 | 开场先承担来源/对象说明，问题进入较慢 | 先问“外面这么冷，空调还上哪儿找热”，随后自然带出设备 |
| 机翼 17.427 秒“这时，”字幕显示 1.209 秒；热泵 11.383 秒“关键是，”显示 1.307 秒 | 只是待复核的短连接词字幕，不能据此认定音频有同长静音 | 回听原句与前后转折，再决定合并断句或改稿 |
| 机制图从首帧铺完整结论、多个标签，下方同时有字幕 | 观众要在多个文字层和对象之间分配注意 | 让当前一个变化成为主体，短标签按语义出现，弱化已讲部分 |
| 旧机制 A/B 主要移动坐标，未比较不同表达逻辑 | 有两个文件或 composition 不代表做了有价值的创作对照 | 为一个明确问题做一个真实变量的比较 |
| 五项编辑备注跨片相同，热泵 pacing 错写机翼 | 模板可能掩盖没有实际观察的判断 | 诊断跨片重复，但不把所有相同备注自动判失败 |

原证据：`output/audience-reviews/baseline-20261017.json`；热泵 `render-manifest.json` 的 `acceptance.semantic.editorialQuality`；两片 `timeline.json`；`output/production-research-20261013/mechanism/index.tsx`。已发布版本保留为历史记录，不回写假验收。

## 下一条实际怎么做

1. 写一句普通观众的问题和一个可见结果。先把结果或异常动作给观众看，再补解释；避免为了悬念故意把很简单的答案拖满时长。
2. 写连续口播。像向一个好奇的人解释，使用具体动作与指代；保留必要限定，不把内部来源身份、审计或免责铺成旁白。先删报告腔和重复总结，再考虑声音引擎。
3. 做开场与解释转折试读。相同声线、引擎、响度，一次只改一个因素；不加随机“嗯啊”、假笑、假失误或编造亲测。只听能否复述因果、是否有交流感，再结合画面看。
4. 每幕写“观众能看到的变化”和结果出现时刻。真实画面承担对象与现实动作，原创示意承担不可见机制；不把任意 MP4 算成真实实拍，不用无关 B-roll 或循环凑占比。
5. 先做最难的 5–12 秒。静音看目光是否有落点，再合听看重音、动作与结果。少字、稳定构图和留出观察时间均可形成节奏；不用固定每三秒切镜或持续推拉制造忙碌感。
6. 按同一正式链预检、渲染和验收。每项编辑备注使用本片时间点与原句，专门回看跨幕衔接、开头和片尾。复制备注只作排查线索，自动统计不批准声音自然度。
7. 真人比较并反馈具体秒点：哪里机械、哪里走神、看完能否解释原因。先用反馈修稿，再决定是否做新引擎的有界评测。留存、发布和编辑满意度分别记录。

已有播放、版权、动态素材预算、版本绑定与 Delivery/Publication Gate 保持原要求。局部试读和镜头实验不新增用户逐项审批，但不能直接替代正式验收。

## 可以直接运行的工具

跨片只读诊断，默认输出 JSON，不调用语音或修改项目；指定 `--output` 才保存一份新报告，拒绝覆盖：

```bash
node scripts/review-audience-experience.mjs \
  --brief=content/projects/wing-flex-flutter-explainer-20261013/project.json \
  --brief=content/projects/cold-air-heat-pump-explainer-20261013/project.json \
  --output=output/audience-reviews/<新报告名>.json
```

报告验证 canonical 与 manifest/timeline 指纹和窗口。过期或缺少证据时返回 `stale/unavailable`，未知时长保留 `null`；只生成 `diagnostic-only / needs-viewing` 线索，不给主观分数、通过结论或市场验证。

同声线试读计划，默认零调用、零输出写入：

```bash
node scripts/preview-voiceover.mjs \
  --brief=content/projects/cold-air-heat-pump-explainer-20261013/project.json \
  --candidate=experiments/audience-experience/heat-pump-audition.json \
  --work-dir=output/voice-auditions/<新目录>
```

确认计划后，显式加 `--render` 才使用 canonical 当前引擎；缓存未命中会调用该服务，付费引擎须遵守当前预算授权。工具不换声线，候选不能覆盖引擎/声音设置；只读验证旧缓存，产物写隔离目录，记录文本、字节哈希、有效配置、完整解码时长和 `awaiting-human-listening`。失败保留收据，不自动换服务。

`voiceStyle` 对当前 Edge 路径不生效。Gemini 已有自然语言风格提示，但当前 adapter 没有把数字 `rate` 传入请求，因此试读收据将其有效数字语速标为 `null`；不能仅修改数字就宣称完成语速对照。

原创镜头沿用 `video:creative-shot`。本次机翼候选源码是 `experiments/audience-experience/wing-mechanism.tsx`，版本包在 `output/creative-shots/audience-experience-20261017/wing/take-01/`。先生成七张关键帧，再生成 279 帧、9.3 秒静音 H.264。机制为定性示意，不是数值仿真或真实飞行记录。

`experiments/audience-experience/build-comparison.mjs` 用同一段原成片音频和同一份字幕制作视觉对照，并将固定文件复制到本地预览目录；不开放任意本地路径。每个 take 只运行一次，迭代使用 `--take=<新名称>` 保留旧版。可显式传 `--audition=output/voice-auditions/<take>/receipt.json` 加入恢复后的试读；只有项目、原稿、声线、设置和字节均匹配的音频才会按候选 ID 展示，不按数组位置拼接。

```bash
node experiments/audience-experience/build-comparison.mjs
# http://127.0.0.1:3100/renders/audience-review-20261017/index.html
```

## 网上实践与开源取舍

以下是采用依据与边界，不是“这些工具已在本机效果更好”的结论。资料核验截至 2026-10-17；Firecrawl 本轮连接/余额失败，已用备用网络工具读取一手来源，未充值。

| 一手来源 | 本项目采用的部分 | 不作出的推断 |
| --- | --- | --- |
| [Mayer 的多媒体学习研究回顾](https://link.springer.com/article/10.1007/s10648-023-09842-1) | 对话式措辞、减少无关信息、按认知单元组织 | 学习效果研究不能直接证明点击率、完播或收入提高；不据此删除全部字幕 |
| [YouTube 官方留存说明](https://support.google.com/youtube/answer/9314415?hl=en) | 兑现标题封面预期，回看下降点，精彩内容前置 | 峰值也可能源于没讲清而重看；没有固定切镜秒数；当前两片没有新留存证据 |
| [edge-tts-universal API](https://github.com/travisvn/edge-tts-universal/blob/main/API.md)、[原始 edge-tts](https://github.com/rany2/edge-tts) | 使用真实支持的声线/语速能力，不伪造情绪 SSML | [Azure 风格能力](https://learn.microsoft.com/zh-cn/azure/ai-services/speech-service/speech-synthesis-markup-voice)不等于当前 Edge 路径支持；本机安装包许可声明 AGPL-3.0，托管/分发另行核对 |
| [Remotion 官方帧动画文档](https://www.remotion.dev/docs/troubleshooting/css-animations) | 使用现有依赖、确定性帧动画与局部预览 | 不取代 FFmpeg 正式验收，不引入新动画框架 |
| [Kokoro v1.1-zh 模型卡](https://huggingface.co/hexgrad/Kokoro-82M-v1.1-zh) | 82M、权重 Apache-2.0，可作未来本地中文对照候选 | 未下载或部署，不能保证所有声音比旧版或现用声线好 |
| [Fun-CosyVoice3 模型卡](https://huggingface.co/FunAudioLLM/Fun-CosyVoice3-0.5B-2512) | 0.5B、权重 Apache-2.0，指令/读音控制值得隔离评测 | 本机耗时、内存和中文听感未验证；参考语音另需授权 |
| [F5-TTS 官方项目](https://github.com/SWivid/F5-TTS) | 参考实现与评测方法 | 代码 MIT，但官方预训练权重 CC-BY-NC，不作为商业自营默认方案 |

本轮不安装新的全局 skill、不下载模型、不新增依赖、不改变根配置。流程依赖本仓库契约，继续放在项目文档与工具中，避免第二份生产事实源。

## 本轮结果与剩余验证

- 已完成两片当前证据诊断、跨片重复审片定位、同声线试读工具，以及七张机翼关键帧和 9.3 秒真实渲染。
- 视觉 A/B 保持旁白波形、字幕和时长一致，改变视觉表达与信息出现顺序；它比较整体视觉候选，不能分离配色与标签时机各自的收益。
- 热泵 A/B 均计划连续合成，保持引擎、声线和设置，只改措辞。它与已发布逐幕音频相比同时改变了分段方式，不能声称那是纯措辞实验。
- Edge 实际合成三次 30 秒超时，无成功候选音频。随后 HTTPS/TLS 可达，安装库同路径握手返回 403；具体原因未知，停止重试。原成片旁白仍可用于视觉对照。
- 最终本地对照为 `/renders/audience-review-20261017-verified/index.html`；桌面两段与手机 390×844 下的候选段均有非静音、1 倍速播到结尾的运行时证据。浏览器播放状态不能证明已经主观听懂或偏好新版。验证收据：`output/audience-reviews/validation-20261017.json`，完整测试最终 346/346 通过；一轮队列并发测试偶发失败，未改代码重跑通过，详情保留在收据中。类型检查仍被未修改的 `output/production-research-20261013/final-framing.ts:5` 可空 `schemaVersion` 错误阻塞，未宣称全量类型检查通过。
- 自然度偏好、整体成片提升和市场收益均未验证；不改正式项目、发布状态或历史验收。正式替换前必须回到当前 canonical、真实配音预检和完整审片链。

下一步：先在本地对照页比较机翼 A/B 的目光落点与理解负担；语音服务恢复后生成同声线候选，再用真人试听决定措辞与分段方式，才替换正式成片。
