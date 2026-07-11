# Cut/Storm 工作台基准实测

日期：2026-07-09

## 结论

Cut/Storm 适合作为短视频生产工作台的 UX 和功能参考，但不适合直接替代 VideoBrief 当前的多片段成片管线。

适合借鉴：

- 素材导入：文件上传、URL 导入、保存项目列表。
- 字幕工作台：时间戳编辑、字幕样式、预览与导出一致。
- 音频工作台：额外音轨上传、源音量和额外音量控制。
- 导出链路：浏览器预览 + Chromium 渲染字幕 + FFmpeg 合成。
- 进度反馈：长任务通过 WebSocket 推送导入、转录、导出进度。

不适合替代：

- 它是单条源视频剪辑台，不是多素材、多片段编排器。
- 不能原生表达“从官方原片不同时间点自动挑 6 段精彩片段，然后按中文脚本拼接”的时间轴。
- 首次 Docker 构建很重，本机实测主要耗时来自 `whisperx`、`torch`、`playwright chromium`。
- `.aiff` 音频不能直接上传，需要先转成 `wav/mp3/m4a/ogg/flac/aac`。

## 本地运行状态

实验目录：

```bash
/Users/rust/Documents/VideoBrief/experiments/cutstorm
```

启动命令：

```bash
cd /Users/rust/Documents/VideoBrief/experiments/cutstorm
docker compose up -d
```

工作台地址：

```text
http://127.0.0.1:8000/
```

健康检查：

```bash
curl http://127.0.0.1:8000/health
```

## 实测产物

Cut/Storm 基准片：

```text
/Users/rust/Documents/VideoBrief/public/renders/cutstorm-baseline.mp4
```

静态服务预览：

```bash
python3 -m http.server 3101 --directory public
```

```text
http://127.0.0.1:3101/renders/cutstorm-baseline.mp4
```

导出参数和证据：

```text
/Users/rust/Documents/VideoBrief/output/cutstorm-export-payload.json
/Users/rust/Documents/VideoBrief/output/cutstorm-export-response.json
/Users/rust/Documents/VideoBrief/output/cutstorm-benchmark/cutstorm-baseline.ffprobe.json
/Users/rust/Documents/VideoBrief/output/cutstorm-benchmark/frame-04s.jpg
/Users/rust/Documents/VideoBrief/output/cutstorm-benchmark/frame-12s.jpg
/Users/rust/Documents/VideoBrief/output/cutstorm-benchmark/frame-24s.jpg
```

ffprobe 结果摘要：

- 视频：1080x1920，30fps，H.264。
- 音频：AAC，48kHz，stereo。
- 时长：29.066667 秒。
- 文件大小：约 9.7 MB。

## 关键实测发现

Cut/Storm 能顺利跑通：

1. 上传竖屏官方源视频。
2. 上传中文配音音轨。
3. 使用外部 `timeline.json` 作为字幕时间轴。
4. 设置 9:16 画布、中文字幕样式、源声音量为 0、额外音轨为 1。
5. 导出带烧录字幕和中文配音的 MP4。

但这次基准片只使用源视频 0-29 秒，因此中后段画面和我们当前成片的多段选材逻辑不一致。这正好证明：最终生产级管线仍应由 VideoBrief 自己维护“素材片段选择与拼接”，Cut/Storm 只作为人工干预工作台参考或可选编辑器。

## 推荐落地方式

当前主线：

```text
素材片段选择/拼接：VideoBrief FFmpeg pipeline
字幕和配音同步：VideoBrief sentence-level TTS timeline
人工干预工作台：借鉴 Cut/Storm 的编辑 UX
最终导出：VideoBrief FFmpeg，必要时借鉴 Cut/Storm 的 Chromium 字幕渲染
```

下一步不要直接 fork Cut/Storm 作为主应用。更合适的是重建本项目 `/workbench`：

- 左侧：项目和素材库。
- 中间：真实成片播放器 + 时间轴。
- 右侧：当前片段的源起止点、字幕、配音文本、音量、样式。
- 底部：多片段 timeline，每段能人工改 source start/end、字幕、配音、是否启用。
- 操作：保存到 `brief.json`，重新渲染，打开成片，导出 SRT/ASS/MP4。

后续高级能力：

- 自动精彩片段候选：语义匹配、镜头变化、画面文本/代码/UI 检测、转录时间戳。
- 真人感配音：替换当前系统 TTS，评估 CosyVoice、IndexTTS、F5-TTS、GPT-SoVITS 或商业 TTS。
- 预览一致性：考虑借鉴 Cut/Storm 的“浏览器字幕渲染 + FFmpeg 合成”方案。
