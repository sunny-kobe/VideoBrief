import ShortVideoPreviewClient from '@/src/components/ShortVideoPreviewClient';
import {
  projectPaths,
  readBrief,
  readRenderManifest,
  renderStatus,
} from '@/src/shortVideoProjectServer';

export const dynamic = 'force-dynamic';

interface ShortVideoPageProps {
  searchParams: Promise<{ project?: string }>;
}

export default async function ShortVideoPage({ searchParams }: ShortVideoPageProps) {
  const brief = readBrief((await searchParams).project);
  const paths = projectPaths(brief);
  const status = renderStatus(readRenderManifest(paths.manifestPath), brief.id);

  return (
    <ShortVideoPreviewClient
      projectId={brief.id}
      renderHref={status.state === 'ready' ? paths.publicRenderHref : ''}
      title={brief.title}
    />
  );
}
