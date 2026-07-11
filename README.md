# VideoBrief

VideoBrief is a local production workbench for turning one verified overseas AI signal into a Chinese short-video explainer.

## Current V1

The active production template is:

```text
one official AI tool or project
-> verified claim and Chinese editorial judgment
-> source-linked scenes
-> Chinese narration and subtitles
-> FFmpeg render
-> manifest-driven technical proof
```

The old transcript-first research-note product and the static weekly-roundup dashboard are legacy references. They are not active product surfaces.

## Source of Truth

The canonical project file is:

```text
content/projects/codex-app-explainer/project.json
```

It owns the project status, audience, editorial grounding, source verification and rights state, scene-to-source mapping, render settings, and output paths. The workbench, renderer, fullscreen preview, and proof command all read this project.

## Run

```bash
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:3100/workbench
```

The root route redirects to the workbench. The old research-note page remains available only for legacy component reference:

```text
http://127.0.0.1:3100/notes/andrew-ng-ai-for-any-business
```

## Production Export

```bash
npm run video:export:production
```

This command performs both steps:

1. Render the current canonical project with FFmpeg.
2. Verify the project fingerprint, artifacts, duration, dimensions, frame rate, audio level, and five proof frames.

Current outputs:

```text
output/videos/codex-app-explainer.mp4
output/videos/codex-app-explainer-work/render-manifest.json
public/renders/codex-app-explainer.mp4
```

Remotion and HyperFrames scripts remain as legacy or experimental render tracks. They are not production acceptance targets.

## Active Prototypes

Candidate selection layout comparison:

```text
http://127.0.0.1:3100/workbench?prototype=clip-candidates&candidateLayout=ranked
http://127.0.0.1:3100/workbench?prototype=clip-candidates&candidateLayout=compare
```

The scores are illustrative heuristics, not model output, and candidate choices are not persisted. The scene inspector also contains a local macOS TTS preview experiment with content-hash caching.

## Verification

```bash
npm run lint
npm run build
npm run video:proof
```
