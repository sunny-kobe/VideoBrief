# 2026-10-18 中文旁白实测与试听表

本轮按用户要求，将推荐路线做成可听表格。用户补充“暂时没有，先用公开试听”，因此不注册云账号、不购买计划、不下载大模型、不克隆第三方声音。正式 canonical、已发布成片与配音默认设置均未修改。

入口：`http://127.0.0.1:3100/renders/voice-benchmark-20261018-final/index.html`。

## 2026-10-20 用户结论与备用方案

用户试听后认为四款 Gemini TTS 都可接受。首选 Gemini 3.8 Flash TTS，备用候选为 3.8 Flash-Lite TTS、3.1 Flash TTS Preview、2.5 Flash Preview TTS；不同视频可轮换，同一条保持同模型、同声线，切换前明确记录。此处保存创作偏好，不表示正式 provider 已默认改为3.8或实现自动回退。

2026-10-19 补充试听入口：`http://127.0.0.1:3100/renders/voice-benchmark-20261019-extra/index.html`。

| 编号 | 模型 / 声线 | 音频情况 |
| --- | --- | --- |
| 01 | 3.8 Flash-Lite TTS / Charon | 新生成，16.4秒 |
| 02 | 2.5 Flash Preview TTS / Charon | 新生成，14.4秒 |
| 03 | 3.1 Flash TTS Preview / Charon | 复用10月18日样本，18.8秒 |
| 04 | 3.8 Flash TTS / Charon | 复用10月18日样本，18.0秒 |

同一段下方热泵稿，统一约-18 LUFS；01、02、04为默认表达，03带自然口语风格指令，不能把差异全部归因于模型版本。两条新增音轨均实际生成、完整解码，并在浏览器验证播放进度推进且无媒体错误。用户听感接受不代表长音轨、稳定性或正式生产链已验收。

截至10月19日，控制台为四款分别显示10次/天免费限额，尚未验证额外共享限制，不能承诺每天合计40次。两把Key属于同一项目，共享项目额度。Paid Tier的TTS按付费标价计费，不保留“先免费10次再收费”的使用方式。账号级证据与脱敏探测收据只保留本地output，不提交凭据或结算页面信息。

## 可以听什么

| 编号 | 方案 | 文稿与状态 |
| --- | --- | --- |
| 01 | Gemini 3.8 Flash TTS / Charon | 本轮同稿生成，约 18.0 秒 |
| 02 | Gemini 3.8 Flash TTS / Kore | 本轮同稿生成，约 19.5 秒 |
| 03 | Gemini 3.1 Flash TTS Preview / Charon | 本轮同稿生成，约 18.8 秒 |
| 04 | ElevenLabs 官方在线演示 / Adam Li | 本轮同稿生成，约 17.0 秒；实际模型未公开，不标成 v4 |
| 05–08 | 2026-08-13 Gemini Charon/Kore/Puck 与 Edge Yunxi | 四条历史内部同稿；与本轮热泵稿不同，单独成组 |
| 09–10 | 阿里云 CosyVoice 龙安洋、龙安欢 | 官方 v3 系统声音的不同稿样音；不是 v3.5-plus |
| 11–13 | 豆包少年梓辛、爽快思思、温婉珊珊 | 官方不同稿样音 |

前四条适合直接比较这段中文稿的表达；历史和官方不同稿只用于初筛音色，不能混合排名。页面没有预设主观分数，可匿名试听，勾选“喜欢、像真人、停顿舒服、普通话自然”，评价只存当前浏览器并可下载 JSON。

固定稿：

> 外面这么冷，空调还上哪儿找热？秘密在机器里的制冷剂：它比室外空气更冷，热就能传给它。压缩机再把温度抬高，把热送进屋。冷空气里有热，但搬热也得用电。

## 同稿实测的条件

- 八条本地文件均保留原始字节与 SHA-256，统一到约 -18 LUFS、48 kHz 单声道 AAC，并完整解码；不改变音高、语速或内部停顿。实测归一化阶段输出响度约 -17.62 至 -18.34 LUFS，未声称逐样本完全相同。
- 五条远程官方样音不下载、不重托管，直接从原站播放，音量未统一；页面明确标注。
- Gemini 3.8 的两条是默认表达，未额外发送风格指令；Gemini 3.1 使用自然、克制、有交流感的中文指令。因此比较的是可取得的声音候选整体，不能单独归因于模型版本。
- 本地 Whisper 对四条新稿执行无参考稿提示的转写，主要叙事完整；少量同音字与措辞差异仍待试听判断。转写准确不等于声音自然。
- Gemini 使用已有官方接口，实际账单金额未返回。ElevenLabs 使用官方匿名试听，没有购买计划；网页未公开实际模型。匿名可生成不等于正式发布许可已核验。

## 未能取得音频的路线

| 路线 | 本轮实际结果 |
| --- | --- |
| CosyVoice v3.5-plus | 无预置系统音色；需要账号和已创建声音。更正前轮“可直接选择旧版叙事音色”的说法 |
| 豆包自定义稿 | 官方体验入口实际跳转登录；以不同稿官方样音供初筛 |
| Azure Voice Gallery | 当前浏览器空白，备用官方产品页没有合成控件；没有据此推断服务不支持中文或匿名试听 |
| OpenAI 模型 / 当前兼容路由 | `/audio/speech` 实际返回 404；没有将兼容服务密钥发送到 OpenAI 官方服务，也未验证官方服务音质 |
| Edge 当前稿 | 单次真实请求 30 秒超时；历史基线保留可听 |
| Qwen3-TTS Serena / Uncle_fu | 官方公开队列接受请求，但最终返回空错误，未生成音频；原因未公开，不推断为质量或硬件不足 |
| 开源 CosyVoice3 | 官方仓库指向的样音页本次 404；未将参考人声或阿里云其他模型冒充此模型输出 |

所有路线都有实际尝试或明确前置条件记录；没有把全部方案写成生成成功。模型列表可用只说明可见性：Gemini 3.8 首先使用 Interactions 路径未取得音频，随后使用模型实时列表支持的 `generateContent` 路径实际生成成功。原始失败和成功都保留。

## 来源与收据

- [Gemini 官方 TTS 指南](https://ai.google.dev/gemini-api/docs/speech-generation)、[OpenAI 官方 TTS 指南](https://developers.openai.com/api/docs/guides/text-to-speech)。
- [ElevenLabs 官方中文试听](https://elevenlabs.io/text-to-speech/chinese)。
- [CosyVoice 官方声音列表](https://help.aliyun.com/zh/model-studio/cosyvoice-voice-list)、[CosyVoice 模型说明](https://help.aliyun.com/zh/model-studio/tts-model)。
- [豆包官方样音与概览](https://docs.volcengine.com/docs/DoubaoVoice/ProductOverview-9?lang=zh)。
- [Qwen 官方演示](https://huggingface.co/spaces/Qwen/Qwen3-TTS)、[开源 CosyVoice 官方仓库](https://github.com/FunAudioLLM/CosyVoice)。

内部证据保存在 `output/voice-benchmark-20261018/`：`provider-availability.json`、`available-api/`、`cloud-public/`、`open-source/`、`processed/`、`transcripts/` 与 `manifest-final.json`。网页只复制安全的音频和白名单元数据，不暴露本地凭证、任意路径或完整 provider 响应。

生成器为 `experiments/voice-benchmark-20261018/build-listening-page.mjs`，每次使用新目录；CLI 帮助与输入要求见同目录 README。正式采纳声线前，仍需用户试听选择、当前稿发音校对、实际供应商条款与正式视频全链验收。
