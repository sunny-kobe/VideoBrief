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

Phases 1-4 passed their capability gates by 2026-07-12: self-serve project creation, mixed-source understanding, confirmed-fact narrative planning, candidate selection, rendering and technical proof were exercised through real browser projects. Final delivery now has additional version-bound semantic, browser-playback and package gates. The 2026-07-19 daily-signal run created RepoPrompt CE, PDF Reader MCP and Google Vids projects, but those historical technical samples do not count as completed dogfood until they pass the current gates.

The app now supports:

- a project list and empty-project creation flow;
- a daily signal page that scans free public sources, scores candidate topics, persists approvals and creates a canonical project only after explicit approval;
- source-native enrichment that collects first-party text, README content, topical media and browser screenshots while preserving `review_required` rights states;
- a canonical v3 project schema with Creative Brief, mixed-source analysis, narrative versions, scene candidates, AI call records and separated technical, rights, publication, and market states;
- explicit-rights local video, audio, image, Markdown and text import using streamed atomic writes, incremental SHA-256, disk-reserve checks, visible byte progress and cancellation;
- project-scoped workbench editing, render paths, fullscreen preview, manifest, and proof;
- a read-only final-video workspace where the available actions are watch, fullscreen and download;
- an internal advanced production view that preserves source review, script, shot, subtitle and export controls for Codex-led debugging;
- an automatic production endpoint that Codex can use to process unfinished sources, generate and apply a narrative, select visual candidates and generate production assets before render and proof;
- server-only OpenAI source understanding and planning routes with structured output validation, content-hash caching and explicit failure states;
- video understanding input that combines a transcript with up to 12 adaptive representative frames, preserving beginning/middle/end coverage, detected scene changes and explicit fallback uncertainty;
- semantic validation that rejects unknown sources, invalid locators and incomplete candidate rankings before AI output can enter the canonical project;
- editable key-claim confirmation/rejection, high-risk uncertainty resolutions and source-locator review, synchronized between each source analysis and project research;
- a planning gate that sends only confirmed key claims to AI, blocks unresolved high-risk questions, invalidates pending drafts when brief/research inputs change, and supports explicit draft apply or discard;
- user-confirmed candidate selection, scene editing, neural voice preview with an explicit offline fallback, subtitle generation and editable platform copy;
- visual source browsing with inline image/video thumbnails and click-to-open image or native video previews;
- a persistent local FIFO render queue with queued/running cancellation, independent worker execution, dead-worker recovery and multi-project processing across Next.js restarts;
- visible, cancellable and retryable render jobs, video/image FFmpeg rendering and a complete ZIP export package;
- content-addressed scene MP4 rendering with real interruption recovery, video stream-copy concatenation and whole-program audio normalization;
- version-bound technical proof, per-scene semantic review, desktop/mobile browser playback acceptance and package receipts;
- production metrics for acceptance latency, measured manual review time, external request/cache counts and known failure cost;
- an optional canonical Remotion candidate that reuses the FFmpeg voiceover and timeline, writes its own manifest/proof, and remains a review alternative rather than silently replacing the production MP4;
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

The three daily-signal dogfood projects are:

```text
content/projects/2026-07-19-repoprompt-repoprompt-ce/project.json
content/projects/2026-07-19-sylphxai-pdf-reader-mcp/project.json
content/projects/2026-07-19-create-edit-and-star-in-videos-with-two-google-v/project.json
```

Their historical FFmpeg technical samples are 54.07 seconds at 1080x1920, 53.70 seconds at 1920x1080 and 45.26 seconds at 1080x1920. They have not all passed the current semantic/browser/package acceptance gates. All three remain `rights_status=review_required` and `publication_status=draft-unpublished`.

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

Local source uploads default to a 20 GiB per-file ceiling and keep at least 4 GiB free after an import. Override these local safety limits with `VIDEOBRIEF_MAX_SOURCE_BYTES` and `VIDEOBRIEF_DISK_RESERVE_BYTES` when the workstation has a different storage budget. Uploads stream directly to an atomic temporary file; the server does not buffer the full source in memory.

The default `large-v3-turbo-q5_0` model produces an editable transcription draft. Proper nouns and ambiguous speech still require user review before facts or publication are approved.

Voiceover is selected per project through the shared provider used by preview and production rendering. It supports `edge-tts-universal`, Gemini TTS and an explicit macOS `/usr/bin/say` fallback. Provider, model, voice, profile, pronunciation rules, segment hashes and cache hits are recorded in the render manifest; credentials are never recorded. Network or quota failure does not silently change engines.

Open the project list:

```text
http://127.0.0.1:3100
```

Give Codex the Creative Brief and local material, then open the project to watch the generated result. When the result needs another version, describe the change to Codex; the web app does not expose generation or editing controls. The internal five-step production view is addressable only through `advanced=1` for debugging.

The old research-note page remains available only as legacy component reference:

```text
http://127.0.0.1:3100/notes/andrew-ng-ai-for-any-business
```

## Daily Signal Workflow

Open the candidate list at `http://127.0.0.1:3100/signals`, or run the same local flow from the terminal:

```bash
npm run signals:scan -- --replace
npm run signals:approve -- <run-id> <candidate-id> --decided-by=<人工批准者> --note=<至少12字的批准说明>
npm run signals:enrich -- <run-id> <candidate-id>
npm run project:workflow -- --project=<project-id> --instruction="<creative instruction>"
npm run video:render:remotion-project -- --brief=content/projects/<project-id>/project.json
```

Scanning and rendering add no paid video service. AI source understanding and planning still use the server-only OpenAI-compatible endpoint already configured for VideoBrief. Approval, rights review and publication remain manual gates; neither command path publishes automatically.

## Production Export

```bash
npm run video:export:production
```

The default renders the compatibility fixture. To export another project:

```bash
npm run video:export:production -- --brief=content/projects/<project-id>/project.json
```

The first command renders with FFmpeg and runs technical proof, then stops at `awaiting-review`. Start a video-hash-bound review session before inspecting the cut; the completion command derives elapsed review time from that session and rejects caller-reported durations. Record a concrete per-scene semantic review and run desktop/mobile browser acceptance. A real person must then approve the current video hash in the advanced workbench workflow panel before packaging; Codex and system identities are rejected:

Both CLI and browser renders run the same material/scene preflight and lifecycle accounting. The default V3 renderer caches each completed scene by source bytes, selected window, voice bytes and presentation settings, so an interrupted or partially changed project only re-encodes missing or changed scenes; final video concatenation uses stream copy and only the full audio program is re-encoded for loudness normalization.

```bash
npm run video:review:prepare -- --manifest=output/videos/<project-id>-work/render-manifest.json
npm run video:review:semantic -- --manifest=output/videos/<project-id>-work/render-manifest.json --start-session
# Open http://127.0.0.1:3000/api/projects/<project-id>/review-package and inspect the full video plus every scene's start/mid/end frames.
npm run video:review:semantic -- --manifest=output/videos/<project-id>-work/render-manifest.json --decision=passed --reviewer=codex --note="具体逐场景说明" --scene-notes=output/videos/<project-id>-work/semantic-review-notes.json --quality-review=output/videos/<project-id>-work/editorial-quality-review.json --confirm-freezes --confirm-pronunciations
npm run video:review:browser -- --manifest=output/videos/<project-id>-work/render-manifest.json
# In /workbench?project=<project-id>&advanced=1, a real person approves the current delivery Gate.
npm run video:package:production -- --brief=content/projects/<project-id>/project.json
```

The editorial review must use all seven checks in `docs/editorial-quality-review.example.json`. Browser acceptance completes sequential non-muted playback at 1x speed in both desktop and mobile viewports. Packaging creates `final.mp4`, SRT/ASS subtitles, cover, platform copy, source list, render manifest, project snapshot, export manifest, ZIP and a version receipt. Render-content and package-metadata fingerprints are separate: rights/source metadata changes do not force a video re-render, but do invalidate the old ZIP. A stale project, changed video, incomplete acceptance, missing human delivery approval or stale ZIP cannot be downloaded as current.

## Verification

```bash
npm run lint
npm test
npm run build
npm run video:proof
```

FFmpeg remains the production acceptance target. Canonical Remotion is a separately proved review candidate; HyperFrames and external-tool benchmarks remain experimental tracks.
