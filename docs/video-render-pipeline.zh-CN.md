# 视频渲染与验收链路

## 当前唯一生产链

```text
canonical project
-> 分句中文配音
-> 按 scene.sourceId 和时间点裁切来源
-> 静态图片按场景时长循环
-> FFmpeg 合成字幕、音轨和竖屏画面
-> render-manifest.json
-> 当前项目 proof
-> 平台兼容 MP4
```

生产命令：

```bash
npm run video:export:production
```

工作台的“渲染并验收”调用同一条命令，不存在另一套页面专用导出逻辑。

工作台在项目 workDir 原子维护 `render-job.json`，状态依次为 `saving`、`rendering`、`proof`、`packaging`、`completed`，失败时保留明确错误。它是瞬时运行记录，不写入 canonical project，避免运行进度改变项目 fingerprint。

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
- `production` 保存素材导入、人工保存、渲染尝试/失败和跨项目复用记录。
- `sources[].contentHash/reusedFrom` 只允许后导入素材引用更早的同内容来源，避免反向或循环关系。

旧的顶层 `sourceVideo` 和硬编码 38 秒 timeline 只保留读取兼容，不再写回项目文件。

## render manifest

渲染完成后在各项目自己的 `outputs.workDir` 生成：

```text
output/videos/<project-id>-work/render-manifest.json
```

manifest 记录：

- 当前项目文件 SHA-256 指纹。
- 实际渲染时间、分辨率、帧率和时长。
- MP4、SRT、ASS、配音和 timeline 路径。
- 每个场景的来源、成片时间和原片时间。
- proof 是否通过、检查时间、问题和抽帧路径。
- production 记录、实际使用来源和 rights check。

项目文件保存后指纹发生变化，工作台必须显示“成片已过期”，不能继续把旧 MP4 标记为已验收。

下载 API 同样重新核对当前 fingerprint 与 proof。旧 MP4 和 ZIP 即使仍在磁盘，也不会在 stale 状态下提供下载；重新渲染、proof 和打包后才恢复。

## proof 规则

`npm run video:proof` 不再假设固定 38 秒。它从 manifest 读取本次渲染的真实契约，并检查：

1. 项目指纹与当前项目文件一致。
2. 所有声明产物存在且不为空。
3. MP4 分辨率、帧率和时长与 manifest 一致。
4. 存在可听音轨，平均音量不低于静音阈值。
5. 在成片 10%、30%、50%、70%、90% 位置均能抽出有效画面。

渲染器会对长中文 eyebrow、标题和字幕插入 ASS 显式换行，避免 libass 对无空格中文不换行造成左右裁切。proof 抽帧仍需用于视觉检查，不能只依赖文件存在。

proof 结果会原子写回 manifest。只有指纹一致且 `proof.passed=true` 时，工作台显示“成片已验收”。

schema v2/v3 项目还会把 `technical_status` 写为 `passed` 或 `failed`，并同步更新 manifest 指纹。普通项目保存会把它改为 `stale`；proof 遇到指纹不一致时不会替旧成片“追认”新项目。

## 输出格式

- H.264 High profile
- 1080×1920
- 30fps
- yuv420p
- AAC 192kbps / 48kHz
- faststart

完整生产导出包还包含：`final.mp4`、`subtitles.srt`、`subtitles.ass`、`cover.png`、`platform-copy.json`、`source-list.json`、`render-manifest.json`、`project.snapshot.json`、`export-manifest.json` 和 ZIP。render/export manifest 都保存同一次生产记录；瞬时 render job 仍独立于 canonical project fingerprint。

## 其他渲染轨道

- Remotion：旧 38 秒 React composition，保留为 legacy 实验，不参与当前 production proof。
- HyperFrames / html-video：继续用于信息卡、封面和动效模板实验，不参与当前 production proof。
