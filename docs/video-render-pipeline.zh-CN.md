# 视频渲染与验收链路

## 当前唯一生产链

```text
canonical project
-> 分句中文配音
-> 按 scene.sourceId 和时间点裁切来源
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

## canonical project

唯一项目文件是：

```text
content/projects/codex-app-explainer/project.json
```

关键关系：

- `sources[]` 保存一手链接、本地素材、核验和版权状态。
- `scenes[].sourceId` 明确每个场景来自哪个来源。
- `outputs` 保存工作目录、成片和公开预览路径。
- `render` 保存分辨率、帧率和配音参数。

旧的顶层 `sourceVideo` 和硬编码 38 秒 timeline 只保留读取兼容，不再写回项目文件。

## render manifest

渲染完成后生成：

```text
output/videos/codex-app-explainer-work/render-manifest.json
```

manifest 记录：

- 当前项目文件 SHA-256 指纹。
- 实际渲染时间、分辨率、帧率和时长。
- MP4、SRT、ASS、配音和 timeline 路径。
- 每个场景的来源、成片时间和原片时间。
- proof 是否通过、检查时间、问题和抽帧路径。

项目文件保存后指纹发生变化，工作台必须显示“成片已过期”，不能继续把旧 MP4 标记为已验收。

## proof 规则

`npm run video:proof` 不再假设固定 38 秒。它从 manifest 读取本次渲染的真实契约，并检查：

1. 项目指纹与当前项目文件一致。
2. 所有声明产物存在且不为空。
3. MP4 分辨率、帧率和时长与 manifest 一致。
4. 存在可听音轨，平均音量不低于静音阈值。
5. 在成片 10%、30%、50%、70%、90% 位置均能抽出有效画面。

proof 结果会原子写回 manifest。只有指纹一致且 `proof.passed=true` 时，工作台显示“成片已验收”。

## 输出格式

- H.264 High profile
- 1080×1920
- 30fps
- yuv420p
- AAC 192kbps / 48kHz
- faststart

## 其他渲染轨道

- Remotion：旧 38 秒 React composition，保留为 legacy 实验，不参与当前 production proof。
- HyperFrames / html-video：继续用于信息卡、封面和动效模板实验，不参与当前 production proof。
