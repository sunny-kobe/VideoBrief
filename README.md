# VideoBrief

VideoBrief is a local, AI-native video production workbench.

Its operating loop is:

```text
user gives Codex a creative brief, source materials or revision request
-> Codex operates the AI production pipeline
-> VideoBrief shows the current verified output
-> user reviews the video and continues the conversation with Codex
```

Source understanding, traceability, original narrative, shot selection, voiceover, subtitles, manifests and proof remain part of the internal production pipeline. They are not separate tasks that the user must complete, and the web app is not an AI prompt surface or video editor. An internal `advanced=1` view remains available for Codex-led debugging only.

VideoBrief is not defined by one content category. Product explainers, software tutorials, knowledge videos, project demos and AI/technology briefs are replaceable production templates built on the same workflow.

It is also not a transcript-first summarizer, a video reposting tool or an autonomous publishing system. Codex prepares and assembles the production draft through the canonical project; the user retains final control through conversation with Codex and explicit publication decisions.

## Product Documents

- Canonical product workflow and roadmap: [`docs/video-production-workflow-and-roadmap.zh-CN.md`](docs/video-production-workflow-and-roadmap.zh-CN.md)
- Next-session execution handoff: [`docs/video-production-workflow-execution-handoff.zh-CN.md`](docs/video-production-workflow-execution-handoff.zh-CN.md)
- Current FFmpeg render and proof contract: [`docs/video-render-pipeline.zh-CN.md`](docs/video-render-pipeline.zh-CN.md)
- First content-template history: [`docs/overseas-ai-content-remix-roadmap.zh-CN.md`](docs/overseas-ai-content-remix-roadmap.zh-CN.md)

## Current State

Phases 1-4 passed their acceptance gates by 2026-07-12: self-serve project creation, mixed-source understanding, confirmed-fact narrative planning, candidate selection, rendering, proof and complete export were all closed through real browser projects. Phase 5 currently has two complete end-to-end dogfood projects and still needs at least one more different topic before its gate can pass.

The app now supports:

- a project list and empty-project creation flow;
- a canonical v3 project schema with Creative Brief, mixed-source analysis, narrative versions, scene candidates, AI call records and separated technical, rights, publication, and market states;
- explicit-rights local video, audio, image, Markdown and text import;
- project-scoped workbench editing, render paths, fullscreen preview, manifest, and proof;
- a read-only final-video workspace where the available actions are watch, fullscreen and download;
- an internal advanced production view that preserves source review, script, shot, subtitle and export controls for Codex-led debugging;
- an automatic production endpoint that Codex can use to process unfinished sources, generate and apply a narrative, select visual candidates and generate production assets before render and proof;
- server-only OpenAI source understanding and planning routes with structured output validation, content-hash caching and explicit failure states;
- video understanding input that combines a transcript with 20%, 50% and 80% representative frames, while preserving explicit sampling uncertainty;
- semantic validation that rejects unknown sources, invalid locators and incomplete candidate rankings before AI output can enter the canonical project;
- editable key-claim confirmation/rejection, high-risk uncertainty resolutions and source-locator review, synchronized between each source analysis and project research;
- a planning gate that sends only confirmed key claims to AI, blocks unresolved high-risk questions, invalidates pending drafts when brief/research inputs change, and supports explicit draft apply or discard;
- user-confirmed candidate selection, scene editing, neural voice preview with an explicit offline fallback, subtitle generation and editable platform copy;
- visual source browsing with inline image/video thumbnails and click-to-open image or native video previews;
- visible render-job stages, video/image FFmpeg rendering and a complete ZIP export package;
- production records for imports, research review, first technical pass, manual saves, render attempts/failures and cross-project source reuse, included in render and export manifests;
- cover generation that burns the editable cover title into a real PNG instead of exporting an unlabelled frame grab;
- stale-output detection that blocks workbench MP4 links, fullscreen preview and ZIP download whenever a project changes after rendering.

The original compatibility fixture remains:

```text
content/projects/codex-app-explainer/project.json
```

The Phase 1 browser-created dogfood project is:

```text
content/projects/phase1-self-serve-demo/project.json
```

The current mixed-source and static-image dogfood projects are:

```text
content/projects/videobrief-mixed-demo/project.json
content/projects/dogfood-static-notes/project.json
```

The current GPT-5.6 quality dogfood project is:

```text
content/projects/gpt-5-6-agentic-work/project.json
```

The GPT-5.6 project currently has a passed 115.52-second 1080x1920 export using `zh-CN-YunjianNeural` at rate 194. Its six scenes combine official mobile webpage captures, an official video clip and original information cards. Official assets keep `rights_status=review_required`; publication and market states remain unpublished and unvalidated. Older dogfood projects can still contain pending narrative drafts or stale renders and must be reviewed project by project.

The 29.06-second fixture has passed technical proof. Its source footage is not cleared for publication, so it remains an unpublished technical fixture and provides no market validation.

## Run

```bash
npm install
npm run dev
```

Real AI actions require a server-only key. Keep it outside Git, for example in `.env.local`:

```text
OPENAI_API_KEY=...
OPENAI_BASE_URL=https://your-openai-compatible-endpoint.example/v1
OPENAI_MODEL=gpt-5.6
WHISPER_CLI_PATH=/opt/homebrew/bin/whisper-cli
WHISPER_MODEL_NAME=large-v3-turbo-q5_0
WHISPER_LANGUAGE=zh
```

Local transcription uses `whisper.cpp`; audio never needs the OpenAI-compatible endpoint. On macOS:

```bash
brew install whisper-cpp
npm run transcription:setup
```

The default `large-v3-turbo-q5_0` model produces an editable transcription draft. Proper nouns and ambiguous speech still require user review before facts or publication are approved.

Voiceover uses the server-side `edge-tts-universal` neural adapter. The renderer fallback default remains `zh-CN-YunxiNeural`, while the current GPT-5.6 quality project explicitly selects `zh-CN-YunjianNeural`. Edge TTS requires network access but no additional API key. A project can explicitly select a macOS `/usr/bin/say` voice such as `Tingting` when an offline fallback is required; the renderer records the actual adapter, voice and rate in its manifest.

Open the project list:

```text
http://127.0.0.1:3100
```

Give Codex the Creative Brief and local material, then open the project to watch the generated result. When the result needs another version, describe the change to Codex; the web app does not expose generation or editing controls. The internal five-step production view is addressable only through `advanced=1` for debugging.

The old research-note page remains available only as legacy component reference:

```text
http://127.0.0.1:3100/notes/andrew-ng-ai-for-any-business
```

## Production Export

```bash
npm run video:export:production
```

The default renders the compatibility fixture. To export another project:

```bash
npm run video:export:production -- --brief=content/projects/<project-id>/project.json
```

The command renders with FFmpeg, verifies the selected project's fingerprint, artifacts, duration, dimensions, frame rate, audio level and proof frames, then creates `final.mp4`, SRT/ASS subtitles, cover, platform copy, source list, render manifest, project snapshot, export manifest and ZIP. A stale project cannot download the previous ZIP.

## Verification

```bash
npm run lint
npm run build
npm run video:proof
```

Remotion, HyperFrames and external-tool benchmarks remain legacy or experimental tracks. They are not the production acceptance target.
