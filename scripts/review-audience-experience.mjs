import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAudienceExperienceReview } from './lib/audience-experience-review.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const usage = 'node scripts/review-audience-experience.mjs --brief=content/projects/<id>/project.json [--brief=...] [--output=output/audience-reviews/<new-name>.json]';
if (args.includes('--help')) {
  process.stdout.write(`${usage}\n只读诊断；默认输出 JSON，不调用配音服务，不修改 canonical 或验收。\n`);
} else {
  if (args.some((arg) => !arg.startsWith('--brief=') && !arg.startsWith('--output='))) throw new Error(usage);
  const briefs = args.filter((arg) => arg.startsWith('--brief=')).map((arg) => arg.slice(8));
  const outputs = args.filter((arg) => arg.startsWith('--output=')).map((arg) => arg.slice(9));
  if (!briefs.length || briefs.some((value) => !value) || outputs.length > 1 || outputs.includes('')) throw new Error(usage);
  const inputs = briefs.map((value) => {
    const briefPath = resolve(value);
    const projectText = readFileSync(briefPath, 'utf8');
    const project = JSON.parse(projectText);
    const workDir = project.outputs?.workDir ? resolve(repoRoot, project.outputs.workDir) : null;
    const artifactIssues = [];
    function readArtifact(name) {
      if (!workDir) return null;
      const path = resolve(workDir, name);
      if (!existsSync(path)) return null;
      try { return JSON.parse(readFileSync(path, 'utf8')); }
      catch { artifactIssues.push(`${name} 无法读取为 JSON。`); return null; }
    }
    return { project, projectText, briefPath, artifactIssues,
      manifest: readArtifact('render-manifest.json'), timeline: readArtifact('timeline.json') };
  });
  const result = `${JSON.stringify(buildAudienceExperienceReview(inputs), null, 2)}\n`;
  if (outputs.length) {
    const path = resolve(outputs[0]);
    const allowedRoot = resolve(repoRoot, 'output/audience-reviews');
    const inside = relative(allowedRoot, path);
    if (!inside || isAbsolute(inside) || inside === '..' || inside.startsWith(`..${sep}`) || !path.endsWith('.json')) {
      throw new Error('报告只能写入 output/audience-reviews/ 下的新 JSON 文件。');
    }
    let parent = dirname(path);
    while (parent !== repoRoot && parent !== dirname(parent)) {
      if (existsSync(parent) && lstatSync(parent).isSymbolicLink()) throw new Error('报告路径不能经过符号链接。');
      parent = dirname(parent);
    }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, result, { flag: 'wx' });
  }
  process.stdout.write(result);
}
