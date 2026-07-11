import ShortVideoPreviewClient from '@/src/components/ShortVideoPreviewClient';
import { projectPaths, readBrief } from '@/src/shortVideoProjectServer';

export const dynamic = 'force-dynamic';

export default function ShortVideoPage() {
  const brief = readBrief();
  const paths = projectPaths(brief);

  return <ShortVideoPreviewClient renderHref={paths.publicRenderHref} title={brief.title} />;
}
