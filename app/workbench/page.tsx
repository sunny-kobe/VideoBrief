import { existsSync } from 'node:fs';
import { basename, dirname, extname, resolve } from 'node:path';
import { notFound } from 'next/navigation';
import ProductionWorkbenchClient, { WorkbenchAsset } from '@/src/components/ProductionWorkbenchClient';
import {
  briefPathFor,
  fileSize,
  projectPaths,
  readBrief,
  readRenderJob,
  readRenderManifest,
  readText,
  readTimeline,
  renderStatus,
} from '@/src/shortVideoProjectServer';
import { suggestedWorkbenchView, WorkbenchView, workbenchSteps } from '@/src/workbench';
import { readAiConfig } from '@/src/aiConfig';

export const dynamic = 'force-dynamic';

function asset(path: string, label: string, kind: WorkbenchAsset['kind'], href?: string): WorkbenchAsset {
  return {
    label,
    kind,
    path,
    href,
    size: fileSize(path),
    exists: existsSync(path),
  };
}

interface WorkbenchPageProps {
  searchParams: Promise<{
    prototype?: string;
    candidateLayout?: string;
    view?: string;
    project?: string;
    source?: string;
    advanced?: string;
  }>;
}

export default async function WorkbenchPage({ searchParams }: WorkbenchPageProps) {
  const params = await searchParams;
  let brief;
  try {
    brief = readBrief(params.project);
  } catch {
    notFound();
  }
  const paths = projectPaths(brief);
  const outputStem = basename(brief.outputs.outputVideo, extname(brief.outputs.outputVideo));
  const remotionPublicPath = resolve(dirname(brief.outputs.publicRender), `${outputStem}-remotion-final.mp4`);
  const remotionHref = `/renders/${encodeURIComponent(`${outputStem}-remotion-final.mp4`)}`;
  const timeline = readTimeline(paths.timelinePath);
  const manifest = readRenderManifest(paths.manifestPath);
  const currentRenderStatus = renderStatus(manifest, brief.id);
  const initialView: WorkbenchView = params.view === 'research' || workbenchSteps.some((step) => step.view === params.view)
    ? params.view as WorkbenchView
    : suggestedWorkbenchView(brief);
  const initialSourceId = brief.sources.some((source) => source.id === params.source)
    ? params.source!
    : brief.sources[0]?.id ?? '';
  const assets: WorkbenchAsset[] = [
    ...paths.sources.map((source) => asset(source.path, source.label, '素材', source.href)),
    asset(briefPathFor(brief.id), '项目配置 project.json', '时间轴'),
    asset(paths.voiceoverPath, '分句拼接中文配音', '音频'),
    asset(paths.srtPath, '可编辑 SRT 字幕', '字幕'),
    asset(paths.assPath, '烧录 ASS 字幕', '字幕'),
    asset(paths.timelinePath, '同步时间轴 JSON', '时间轴'),
    asset(
      paths.publicRenderPath,
      '当前生产 MP4',
      '成片',
      currentRenderStatus.state === 'ready' ? paths.publicRenderHref : undefined,
    ),
    asset(paths.coverImagePath, '封面 PNG', '封面'),
    asset(paths.platformCopyPath, '平台文案 JSON', '文案'),
    asset(paths.sourceListPath, '来源清单 JSON', '清单'),
    asset(paths.projectSnapshotPath, '项目快照 JSON', '项目'),
    asset(paths.exportManifestPath, '导出 manifest', '时间轴'),
    asset(
      paths.exportZipPath,
      '完整导出包 ZIP',
      '导出包',
      currentRenderStatus.state === 'ready' && currentRenderStatus.packageReady
        ? `/api/projects/${encodeURIComponent(brief.id)}/export`
        : undefined,
    ),
  ];

  return (
    <ProductionWorkbenchClient
      brief={brief}
      projectId={brief.id}
      timeline={timeline}
      assets={assets}
      srtText={readText(paths.srtPath)}
      renderHref={currentRenderStatus.state === 'ready' && existsSync(paths.publicRenderPath) ? paths.publicRenderHref : ''}
      remotionHref={existsSync(remotionPublicPath) ? remotionHref : ''}
      sourceHrefs={Object.fromEntries(
        paths.sources.map((source) => [
          source.id,
          source.sourceType === 'audio'
            ? `/api/projects/${encodeURIComponent(brief.id)}/sources/${encodeURIComponent(source.id)}/preview`
            : source.href ?? '',
        ]),
      )}
      renderStatus={currentRenderStatus}
      renderJob={readRenderJob(paths.renderJobPath)}
      initialView={initialView}
      initialSourceId={initialSourceId}
      initialAdvanced={params.advanced === '1' || Boolean(params.view)}
      initialPrototype={params.prototype === 'clip-candidates' ? 'clip-candidates' : null}
      initialCandidateVariant={params.candidateLayout === 'compare' ? 'compare' : 'ranked'}
      aiAvailable={readAiConfig().apiKeyAvailable}
    />
  );
}
