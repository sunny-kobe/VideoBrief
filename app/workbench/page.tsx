import { existsSync } from 'node:fs';
import ProductionWorkbenchClient, { WorkbenchAsset } from '@/src/components/ProductionWorkbenchClient';
import {
  briefPath,
  fileSize,
  projectPaths,
  readBrief,
  readRenderManifest,
  readText,
  readTimeline,
  renderStatus,
} from '@/src/shortVideoProjectServer';
import { WorkbenchView } from '@/src/workbench';

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
  }>;
}

export default async function WorkbenchPage({ searchParams }: WorkbenchPageProps) {
  const params = await searchParams;
  const brief = readBrief();
  const paths = projectPaths(brief);
  const timeline = readTimeline(paths.timelinePath);
  const manifest = readRenderManifest(paths.manifestPath);
  const initialView: WorkbenchView = ['clips', 'subtitles', 'sources', 'export'].includes(params.view ?? '')
    ? params.view as WorkbenchView
    : 'clips';
  const assets: WorkbenchAsset[] = [
    ...paths.sources.map((source) => asset(source.path, source.label, '素材', source.href)),
    asset(briefPath, '项目配置 project.json', '时间轴'),
    asset(paths.voiceoverPath, '分句拼接中文配音', '音频'),
    asset(paths.srtPath, '可编辑 SRT 字幕', '字幕'),
    asset(paths.assPath, '烧录 ASS 字幕', '字幕'),
    asset(paths.timelinePath, '同步时间轴 JSON', '时间轴'),
    asset(paths.publicRenderPath, '当前生产 MP4', '成片', paths.publicRenderHref),
  ];

  return (
    <ProductionWorkbenchClient
      brief={brief}
      timeline={timeline}
      assets={assets}
      srtText={readText(paths.srtPath)}
      renderHref={existsSync(paths.publicRenderPath) ? paths.publicRenderHref : ''}
      sourceHrefs={Object.fromEntries(
        paths.sources.map((source) => [source.id, source.href ?? '']),
      )}
      renderStatus={renderStatus(manifest)}
      renderCommand="npm run video:export:production"
      initialView={initialView}
      initialPrototype={params.prototype === 'clip-candidates' ? 'clip-candidates' : null}
      initialCandidateVariant={params.candidateLayout === 'compare' ? 'compare' : 'ranked'}
    />
  );
}
