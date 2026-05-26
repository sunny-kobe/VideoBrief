# VideoBrief

VideoBrief turns English YouTube business, finance, technology, and AI videos into transcript-first Chinese research notes.

This checkout currently contains the mock result-page prototype integrated into a Next.js App Router app. It does not connect to OpenAI, Supabase, or Stripe yet.

## Current Route

- Result page: `/notes/vc-impact-ai-2026`
- Home route `/` redirects to that mock note.

## Run Locally

Prerequisite: Node.js 20+.

```bash
npm install
npm run dev
```

Then open:

```text
http://localhost:3000/notes/vc-impact-ai-2026
```

## Verification

```bash
npm run lint
npm run build
```
