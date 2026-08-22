import { existsSync, readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import {
  audienceSampleWorkflow,
  parseAudienceSampleStyleExperiment,
} from '@/src/audienceSampleWorkflow';
import {
  projectPaths,
  readBrief,
  readRenderManifest,
  renderStatus,
} from '@/src/shortVideoProjectServer';

function workflowFile(path: string) {
  const workflowRoot = resolve('content/workflows');
  const absolutePath = resolve(path);
  if (!absolutePath.startsWith(`${workflowRoot}${sep}`)) {
    throw new Error('工作流文件必须位于 content/workflows/。');
  }
  if (!existsSync(absolutePath)) throw new Error(`工作流文件不存在：${path}`);
  return absolutePath;
}

export function readAudienceSampleShowcase() {
  const kickoffPrompt = readFileSync(workflowFile(audienceSampleWorkflow.kickoffPromptPath), 'utf8');
  const styleExperiment = parseAudienceSampleStyleExperiment(JSON.parse(
    readFileSync(workflowFile(audienceSampleWorkflow.styleExperimentPath), 'utf8'),
  ));
  if (styleExperiment.measurement.reviewPath !== audienceSampleWorkflow.performanceReviewPath) {
    throw new Error('风格实验复盘路径与工作流配置不一致。');
  }
  const samples = audienceSampleWorkflow.samples.map((reference) => {
    const project = readBrief(reference.projectId);
    const paths = projectPaths(project);
    const manifest = readRenderManifest(paths.manifestPath);
    const render = renderStatus(manifest, project.id);
    const automatedAcceptancePassed = project.materialQualityReview?.status === 'passed'
      && manifest?.proof?.passed === true
      && manifest.acceptance?.semantic?.status === 'passed'
      && manifest.acceptance.semantic.editorialQuality?.status === 'passed'
      && manifest.acceptance.browser?.status === 'passed'
      && render.state === 'ready';
    const browserDuration = manifest?.acceptance?.browser?.checks?.find((check) => check.name === 'desktop')?.duration;

    return {
      reference,
      project,
      render,
      automatedAcceptancePassed,
      renderHref: automatedAcceptancePassed ? paths.publicRenderHref : '',
      duration: Number(browserDuration ?? manifest?.render?.duration ?? 0),
      videoSha256: manifest?.acceptance?.videoSha256 ?? '',
    };
  });

  return { workflow: audienceSampleWorkflow, kickoffPrompt, styleExperiment, samples };
}
