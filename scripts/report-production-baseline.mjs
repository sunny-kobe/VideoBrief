import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { efficiencySample, summarizeEfficiencySamples } from './lib/production-efficiency.mjs';

const prefix = '--projects=';
const root = resolve(process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? 'content/projects');
const samples = [];
const excluded = [];
// Only canonical primary work manifests: no recursive output/trash/export scan or duplicate runs.
for (const entry of readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
  if (!entry.isDirectory()) continue;
  const briefPath = resolve(root, entry.name, 'project.json');
  if (!existsSync(briefPath)) continue;
  try {
    const project = JSON.parse(readFileSync(briefPath, 'utf8'));
    if (!project.outputs?.workDir) {
      excluded.push({ projectId: entry.name, reason: 'no_work_directory' });
      continue;
    }
    const manifestPath = resolve(project.outputs.workDir, 'render-manifest.json');
    if (!existsSync(manifestPath)) {
      excluded.push({ projectId: entry.name, reason: 'no_manifest' });
      continue;
    }
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (manifest.projectId !== project.id) {
      excluded.push({ projectId: entry.name, reason: 'manifest_project_mismatch' });
      continue;
    }
    samples.push({ ...efficiencySample(project, manifest), manifestPath });
  } catch {
    excluded.push({ projectId: entry.name, reason: 'unreadable_project_or_manifest' });
  }
}
process.stdout.write(`${JSON.stringify({
  schemaVersion: 1,
  scope: 'historical_primary_manifests_one_per_canonical_project',
  limitations: [
    '只读历史快照，未重跑渲染或核验当前交付状态。',
    '按画幅、帧率、渲染策略和缓存状态分组；硬件、片长、素材复杂度仍可能不同。',
    '缺失时间不当作零；阶段可能嵌套，不相加；无外部工具同条件实测。',
    '每个项目只有最近留存的主版本，不能估算历次返工总成本或首次出片耗时。',
  ],
  sampleCount: samples.length,
  excluded,
  groups: summarizeEfficiencySamples(samples),
  samples,
}, null, 2)}\n`);
