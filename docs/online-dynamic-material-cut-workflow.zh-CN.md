# 在线动态素材紧凑剪辑流程

## 适用范围

当任务要求使用网上已经存在的真实动态素材，制作 60-90 秒 AI 产品或开发工具竖屏短片时，默认参考本流程。

正向参考项目：

- canonical project：`content/projects/github-copilot-agentic-cut-20260724/project.json`
- material inventory：`content/projects/github-copilot-agentic-cut-20260724/material-inventory.json`
- 结果：约 74.4 秒、12 幕、在线动态视频覆盖率 100%，用户评价为“挺不错”

该评价只代表内部制作质量认可，不代表版权清权、公开发布或市场验证。

## 1. 选题与素材门槛

先比较 2-3 个主题，再创建项目。优先选择：

- 官方发布视频、产品演示或作者本人公开视频；
- 至少 90 秒可用真实操作素材；
- 能覆盖开场、操作过程、失败或变化、结果和边界的完整叙事；
- 多个不重复的功能章节，而不是一段通用运动画面。

素材不足时立即换题。不得退回网页滚动、静态截图移动、循环片段或无关 B-roll。

每份下载素材必须保存：原始 URL、发布者、标题、下载时间、本地路径、字节数、SHA-256、实际时长、分辨率、帧率、编解码器、`rightsStatus`、计划窗口和匹配理由。不得绕过登录、Cookie、付费墙、DRM、验证码或私有权限。

## 2. 建立 Canonical Project

为每条成片建立独立的 `content/projects/<project-id>/project.json` 和素材清单，不覆盖旧项目或旧素材。

在线动态素材紧凑剪辑的默认约束：

- 在线动态视频覆盖成片至少 90%；
- 镜头通常为 3-7 秒，原则上不超过 9 秒；
- 同一连续窗口不重复绑定给不同观点；
- 每个窗口必须长于该幕真实旁白时长；
- 不循环、不拉伸、不添加音乐或夸张转场掩盖素材不足；
- narration、title、subtitle、`visualRequirement`、source reference、candidate 和可见画面表达同一观点。

每幕确定后，同步设置 scene、selected candidate 和 source reference 的 `sourceId`、`sourceStart`、`sourceEnd`。不要在渲染阶段静默改窗。

## 3. 旁白与初剪

先按 Creative Brief 生成旁白，再以真实 TTS 时长检查每幕窗口。若窗口短于旁白，只能：

1. 选择更长且语义一致的官方窗口；
2. 缩短旁白；
3. 合并场景；
4. 补充新的官方或自有动态素材。

技术时长对齐不代表语义对齐。画面“在动”也不能证明它支持当前旁白。

## 4. 渲染与技术检查

```bash
npm run video:export:production -- --brief=content/projects/<project-id>/project.json
```

渲染后依次确认：

- canonical project 与 timeline、manifest 的窗口逐幕一致；
- ffprobe 格式、分辨率、帧率、音频采样率和实际时长；
- FFmpeg 完整音视频解码；
- 响度与 True Peak；
- 本地 Whisper 反向转写及专名检查；
- `freezedetect` 静止覆盖率与最长区间；
- `silencedetect` 场景交界静音与片尾留白。

本参考流程的默认体验门槛为：两秒以上静止覆盖率不超过 20%，单次静止不超过 4 秒，场景交界无意义静音不超过 0.8 秒，最后一句结束后的尾留不超过 0.8 秒。检测阈值和结果必须一起报告，不能只报百分比。

## 5. 逐幕语义与字幕审查

先启动与项目指纹、视频哈希绑定的审片会话，再检查每幕 start/mid/end 帧：

```bash
npm run video:review:semantic -- --manifest=output/videos/<project-id>-work/render-manifest.json --start-session
```

逐幕检查：

- 画面是否直接支持当前旁白，而非仅仅相关或有运动；
- 标题、字幕、`visualRequirement` 和 source reference 是否指向同一事实；
- 截图是否被错误描述成现场操作；
- UI 关键状态在 9:16 成片中是否仍可辨；
- 字幕是否越界、遮挡、过长或把英文专名拆成跨 cue 残词；
- 静止区间是否有明确阅读目的。

发现不匹配时修改 canonical project 并重渲染。审片备注不能把错误画面解释成通过。

完成审片时使用具体逐幕记录和结构化 editorial review：

```bash
npm run video:review:semantic -- --manifest=output/videos/<project-id>-work/render-manifest.json --decision=passed --reviewer=codex --note="具体逐幕结论" --scene-notes=output/videos/<project-id>-work/semantic-review-notes.json --quality-review=output/videos/<project-id>-work/editorial-quality-review.json --confirm-freezes --confirm-pronunciations
```

## 6. 浏览器、打包与最终检查

桌面和移动视口都必须以 1 倍速、非静音从头播放到真实 `ended`：

```bash
npm run dev
npm run video:review:browser -- --manifest=output/videos/<project-id>-work/render-manifest.json
# 真人在 advanced 工作台完整审片，并批准绑定当前视频哈希的交付 Gate。
npm run video:package:production -- --brief=content/projects/<project-id>/project.json
```

浏览器脚本通过只证明桌面和移动播放器完整播放，不代表真人认可观看体验。真人应先以 1 倍速完整观看当前成片并明确批准当前视频哈希；Codex 可以完成逐幕语义和编辑质量复核，但不能代签该 Gate。批准后再打包，并校验 ZIP 完整性，以及主 MP4、public 副本、包内 `final.mp4` 的 SHA-256。确认包内 project snapshot、source list 和 render manifest 都属于当前版本。

最后运行：

```bash
npm test
npm run lint
npm run build
npm run docs:check
git diff --check
git status --short
```

## 7. 已验证的失败模式

- PR 页面或截图不能写成“打开真实功能结果”；应明确它是截图证据，或换成真实操作窗口。
- 长时间停在指令文件或审批状态时，应缩短窗口、精简旁白或提前包含真实界面变化，不能循环。
- `Visual Impact` 曾被拆成 `Visual Impa` 和 `ct` 两个 cue；字幕未越界仍可能编辑质量不合格。
- 16:9 桌面录屏以 contain 放入 9:16 时，细小 UI 文字会变弱；选窗时优先选择关键状态醒目且无需阅读大量小字的画面。

## 8. 状态边界

始终分开报告：

- `technical_status`
- `rights_status`
- `publication_status`
- `market_status`

`official` 不等于 `cleared`，`published` 不等于 `validated`。未完成素材清权时，production package 可以作为内部可校验产物，但不能描述成可发布包。
