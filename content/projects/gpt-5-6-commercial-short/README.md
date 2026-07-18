# GPT-5.6 commercial short

Reproducible local project for the 43.8-second GPT-5.6 vertical short.

## Rights boundary

The six source clips are derived from OpenAI official demo videos and remain local-only because their project status is `review_required`. They are intentionally excluded from Git. Review footage, trademark, presenter, and TTS commercial-use terms before public or paid distribution.

Expected local files:

```text
public/project-assets/gpt-5-6-agentic-work/
  01-launch-presenter.mp4
  02-game-build.mp4
  03-programmatic-tools.mp4
  04-subagents.mp4
  05-computer-browser-use.mp4
  06-pr-workflow.mp4
```

The origin URLs, descriptions, verification state, and local clip timing are recorded in `project.json`.

## Render

Generate the segmented narration and base timeline. This sends only the public narration text to Edge TTS; it does not upload video files.

```bash
node scripts/render-local-short-video-synced.mjs \
  --brief content/projects/gpt-5-6-commercial-short/project.json
```

Create the final hard-cut edit with the tracked ASS package, local sound bed, transition effects, and loudness normalization.

```bash
scripts/render-gpt56-commercial-final.sh
```

Output:

```text
output/videos/gpt-5-6-commercial-short-final.mp4
```

## Acceptance

The accepted local render is 1080x1920, 30fps, H.264/yuv420p with stereo AAC at 48kHz. The measured duration is 43.8 seconds and integrated loudness is approximately -14.4 LUFS.

Before delivery, verify full decode, key frames, black/frozen frames, cover dimensions, audio loudness, and equality of the output and public-render hashes.
