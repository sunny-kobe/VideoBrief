import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildProductionMetrics } from './lib/production-metrics.mjs';

function flag(name, fallback = '') {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

function timestampMs(value) {
  const parsed = Date.parse(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function durationMs(start, end) {
  const left = timestampMs(start);
  const right = timestampMs(end);
  return left == null || right == null || right < left ? null : right - left;
}

function subtractUsage(current, previous = {}) {
  const fields = [
    'input_tokens',
    'cached_input_tokens',
    'cache_write_input_tokens',
    'output_tokens',
    'reasoning_output_tokens',
    'total_tokens',
  ];
  return Object.fromEntries(fields.map((field) => [
    field,
    Math.max(0, Number(current?.[field] ?? 0) - Number(previous?.[field] ?? 0)),
  ]));
}

function addUsage(target, delta) {
  for (const [key, value] of Object.entries(delta)) target[key] = Number(target[key] ?? 0) + Number(value ?? 0);
}

function codexSessionReport(sessionPath, until) {
  const events = readFileSync(sessionPath, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  const untilMs = timestampMs(until) ?? Number.POSITIVE_INFINITY;
  let usage = null;
  let previousUsage = null;
  let pendingWriteStdin = false;
  let toolCalls = 0;
  let writeStdinCalls = 0;
  let tokenUpdates = 0;
  let compactions = 0;
  const writeStdinUsage = subtractUsage({}, {});
  const taskCompletions = [];
  for (const event of events) {
    if ((timestampMs(event.timestamp) ?? Number.POSITIVE_INFINITY) > untilMs) break;
    const payload = event.payload ?? {};
    if (event.type === 'response_item' && ['custom_tool_call', 'function_call'].includes(payload.type)) {
      toolCalls += 1;
      const input = String(payload.input ?? payload.arguments ?? '');
      pendingWriteStdin = payload.name === 'write_stdin' || /tools\.write_stdin\s*\(/.test(input);
      if (pendingWriteStdin) writeStdinCalls += 1;
    }
    if (event.type === 'event_msg' && payload.type === 'token_count' && payload.info?.total_token_usage) {
      const nextUsage = payload.info.total_token_usage;
      const delta = subtractUsage(nextUsage, previousUsage ?? {});
      if (pendingWriteStdin) addUsage(writeStdinUsage, delta);
      usage = nextUsage;
      previousUsage = nextUsage;
      pendingWriteStdin = false;
      tokenUpdates += 1;
    }
    if (event.type === 'event_msg' && payload.type === 'context_compacted') compactions += 1;
    if (event.type === 'event_msg' && payload.type === 'task_complete') {
      taskCompletions.push({
        timestamp: event.timestamp,
        durationMs: Number(payload.duration_ms ?? 0),
        timeToFirstTokenMs: Number(payload.time_to_first_token_ms ?? 0),
      });
    }
  }
  const inputTokens = Number(usage?.input_tokens ?? 0);
  const cachedInputTokens = Number(usage?.cached_input_tokens ?? 0);
  return {
    sessionPath,
    until: Number.isFinite(untilMs) ? new Date(untilMs).toISOString() : null,
    usage: usage ? {
      ...usage,
      uncached_input_tokens: Math.max(0, inputTokens - cachedInputTokens),
      cached_input_ratio: inputTokens > 0 ? cachedInputTokens / inputTokens : null,
    } : null,
    orchestration: {
      toolCalls,
      writeStdinCalls,
      tokenUpdates,
      compactions,
      writeStdinAttributedUsage: writeStdinUsage,
    },
    taskCompletions,
  };
}

const briefArgument = flag('brief');
if (!briefArgument) throw new Error('Usage: --brief=content/projects/<project-id>/project.json [--manifest=...] [--session=...] [--until=ISO] [--output=...]');
const briefPath = resolve(briefArgument);
if (!existsSync(briefPath)) throw new Error(`Canonical project not found: ${briefPath}`);
const project = JSON.parse(readFileSync(briefPath, 'utf8'));
const inferredManifest = project?.outputs?.workDir ? resolve(project.outputs.workDir, 'render-manifest.json') : '';
const manifestArgument = flag('manifest', inferredManifest);
const manifestPath = manifestArgument ? resolve(manifestArgument) : '';
const manifest = manifestPath && existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, 'utf8'))
  : {};
const finalizedAt = flag(
  'until',
  manifest?.acceptance?.browser?.checkedAt
    || manifest?.acceptance?.semantic?.checkedAt
    || manifest?.proof?.checkedAt
    || project?.production?.updatedAt
    || new Date().toISOString(),
);
const sourceRuns = (project?.sources ?? []).map((source) => ({
  sourceId: source.id,
  label: source.label,
  status: source?.processing?.status ?? 'idle',
  attempts: Number(source?.processing?.attempts ?? 0),
  cacheHit: source?.processing?.cacheHit === true,
  durationMs: durationMs(source?.processing?.startedAt, source?.processing?.completedAt),
  error: source?.processing?.error ?? '',
}));
const sessionArgument = flag('session');
const report = {
  schemaVersion: 1,
  projectId: project.id,
  finalizedAt,
  production: buildProductionMetrics({ project, manifest, finalizedAt }),
  sources: {
    count: sourceRuns.length,
    completed: sourceRuns.filter((item) => item.status === 'completed').length,
    failed: sourceRuns.filter((item) => item.status === 'failed').length,
    summedDurationMs: sourceRuns.reduce((total, item) => total + Number(item.durationMs ?? 0), 0),
    runs: sourceRuns,
  },
  codex: sessionArgument
    ? codexSessionReport(resolve(sessionArgument), finalizedAt)
    : {
        status: 'not_recorded',
        note: 'Pass --session=<Codex rollout JSONL> to include orchestration token usage.',
      },
};
const serialized = `${JSON.stringify(report, null, 2)}\n`;
const outputArgument = flag('output');
if (outputArgument) writeFileSync(resolve(outputArgument), serialized);
process.stdout.write(serialized);
