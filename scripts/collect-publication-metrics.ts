import { collectPublicationMetrics, writePublicationLedger } from '../src/publicationLedger';

function flag(name: string, fallback = '') {
  const exact = `--${name}`;
  const prefix = `${exact}=`;
  const argument = process.argv.slice(2).find((item) => item === exact || item.startsWith(prefix));
  return argument === exact ? 'true' : argument?.slice(prefix.length) ?? fallback;
}

const projectIds = flag('projects').split(',').map((item) => item.trim()).filter(Boolean);
if (projectIds.length === 0) {
  throw new Error('用法：npm run project:publication-ledger -- --projects=<project-id-1>,<project-id-2> [--account=daily-cause] [--skip-collect]');
}

const accountName = flag('account', 'daily-cause');
const collected = flag('skip-collect') === 'true'
  ? null
  : await collectPublicationMetrics(projectIds, { accountName });
const output = writePublicationLedger(projectIds, { generatedAt: collected?.observedAt });

console.log(JSON.stringify({
  observedAt: collected?.observedAt ?? null,
  collectedTargets: collected?.results.length ?? 0,
  failures: collected?.failures ?? [],
  jsonPath: output.jsonPath,
  markdownPath: output.markdownPath,
  entries: output.ledger.entries.map((entry) => ({
    projectId: entry.projectId,
    platform: entry.platform,
    status: entry.status,
    externalId: entry.externalId,
    metrics: entry.latestMetrics,
  })),
}, null, 2));
