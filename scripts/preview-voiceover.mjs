import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildVoiceoverAuditionPlan, runVoiceoverAudition } from './lib/voiceover-audition.mjs';

const usage = `隔离的中文表达试读；默认只准备计划，不写文件、不调用配音服务。

node scripts/preview-voiceover.mjs --brief=content/projects/<id>/project.json --candidate=<candidate.json>
  [--work-dir=output/voice-auditions/<new-directory>] [--render]

候选 JSON：{"schemaVersion":1,"variants":[{"id":"a","label":"原版","text":"原句。"},{"id":"b","label":"口语版","text":"候选句。"}]}
所有版本使用 canonical project 当前的同一引擎、声线和配置。
--render 会使用现有缓存，缓存未命中时调用当前配音服务；可能消耗该服务额度。
输出仅为试读音频与收据，听感和正式成片仍需人工审查。`;

try {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    process.stdout.write(`${usage}\n`);
  } else {
    const flags = new Map();
    for (const arg of args) {
      const match = arg.match(/^--(brief|candidate|work-dir)=(.+)$/);
      if (match) {
        if (flags.has(match[1])) throw new Error(`Duplicate argument: --${match[1]}`);
        flags.set(match[1], match[2]);
      } else if (arg !== '--render') throw new Error(`Unknown argument: ${arg}`);
    }
    if (!flags.has('brief') || !flags.has('candidate')) throw new Error(usage);
    const briefPath = resolve(flags.get('brief'));
    const candidatePath = resolve(flags.get('candidate'));
    const project = JSON.parse(readFileSync(briefPath, 'utf8'));
    const candidate = JSON.parse(readFileSync(candidatePath, 'utf8'));
    const plan = buildVoiceoverAuditionPlan(project, candidate, { briefPath, workDir: flags.get('work-dir') });
    const result = await runVoiceoverAudition(plan, { render: args.includes('--render') });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
