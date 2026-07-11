# HTML Video Experiment

This folder is an isolated HyperFrames / HTML-video experiment.

It is not the primary export path. The main production path remains:

```text
Remotion -> ffmpeg-static postprocess -> MP4
```

## Purpose

Use this experiment to test whether agent-authored HTML/CSS templates can produce reusable information-card videos faster than React/Remotion templates.

Good fit:

- Xiaohongshu card motion.
- Short-video cover variants.
- Source-list or signal-list animated cards.
- Fast template experiments created by an agent.

Not the current fit:

- Replacing the stable Remotion export path.
- Complex source-video editing.
- Final platform post-processing.

## Commands

```bash
npm run experiment:html-video:doctor
npm run experiment:html-video:lint
npm run experiment:html-video:validate
npm run experiment:html-video:inspect
npm run experiment:html-video:check
npm run experiment:html-video:snapshot
npm run experiment:html-video:render
```

The render command temporarily exposes local wrapper binaries on `PATH`; the wrappers use `ffmpeg-static` for encoding and the Remotion-bundled `ffprobe` for probing. It does not require Homebrew ffmpeg.

Output:

```text
output/experiments/html-video/weekly-ai-card.mp4
output/experiments/html-video/snapshots/
```

Current verified output:

```text
1080x1920
12s
H.264 / yuv420p / 30fps
```

## Decision Gate

Keep this lane only if it proves at least one of these:

- A new card/video template can be authored faster than the Remotion equivalent.
- The generated HTML is easier for agents to modify safely.
- Snapshot/inspect checks catch layout problems before publishing.

If it cannot beat Remotion on speed or maintainability, keep it as a reference experiment only.
