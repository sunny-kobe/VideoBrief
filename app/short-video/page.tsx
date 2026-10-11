import ShortVideoPreviewClient from '@/src/components/ShortVideoPreviewClient';
import { canPreviewRenderForReview } from '@/src/renderAcceptance';
import {
  projectPaths,
  readBrief,
  readRenderManifest,
  renderStatus,
} from '@/src/shortVideoProjectServer';

export const dynamic = 'force-dynamic';

interface ShortVideoPageProps {
  searchParams: Promise<{ project?: string; acceptance?: string; rendition?: string }>;
}

export default async function ShortVideoPage({ searchParams }: ShortVideoPageProps) {
  const params = await searchParams;
  const brief = readBrief(params.project);
  const paths = projectPaths(brief, params.rendition);
  const manifest = readRenderManifest(paths.manifestPath);
  const status = renderStatus(manifest, brief.id);
  const acceptancePreview = canPreviewRenderForReview(status.state, params.acceptance === '1');

  return (
    <ShortVideoPreviewClient
      renderHref={status.state === 'ready' || acceptancePreview ? paths.publicRenderHref : ''}
      title={brief.title}
      loop={!acceptancePreview}
    />
  );
}
