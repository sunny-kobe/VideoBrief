# VideoBrief

VideoBrief turns English YouTube business, finance, technology, and AI videos into transcript-first Chinese research notes.

This checkout currently contains a local, transcript-first result-page prototype integrated into a Next.js App Router app. The sample notes are based on real public English videos, but the app still does not connect to OpenAI, Supabase, or Stripe.

## Current Route

- Default result page: `/notes/andrew-ng-ai-for-any-business`
- Additional samples:
  - `/notes/greg-brockman-chatgpt-potential`
  - `/notes/ian-bremmer-global-superpower`
- Home route `/` redirects to the default sample note.

## Run Locally

Prerequisite: Node.js 20+.

```bash
npm install
npm run dev
```

Then open:

```text
http://localhost:3000/notes/andrew-ng-ai-for-any-business
```

## Verification

```bash
npm run lint
npm run build
```
