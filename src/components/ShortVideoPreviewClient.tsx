'use client';

import { useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';

interface ShortVideoPreviewClientProps {
  projectId: string;
  renderHref: string;
  title: string;
}

export default function ShortVideoPreviewClient({ projectId, renderHref, title }: ShortVideoPreviewClientProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoMissing, setVideoMissing] = useState(false);
  const previewVideoSrc = `${renderHref}?v=${encodeURIComponent(title)}`;

  if (!renderHref || videoMissing) {
    return (
      <main className="min-h-screen bg-black text-white">
        <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">
            Short Video Preview
          </p>
          <h1 className="mt-4 text-2xl font-display font-extrabold">
            还没有可播放的成片
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">
            先在工作台重新渲染并通过技术验收，页面才会播放当前项目对应的最终 MP4。
          </p>
          <code className="mt-6 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100">
            npm run video:export
          </code>
          <a
            className="mt-6 inline-flex items-center gap-2 rounded-md border border-white/15 px-3 py-2 text-sm font-bold text-slate-100 hover:bg-white/10"
            href={`/workbench?project=${encodeURIComponent(projectId)}`}
          >
            <ArrowLeft className="h-4 w-4" />
            返回工作台
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="h-[100svh] w-screen overflow-hidden bg-black text-white">
      <video
        ref={videoRef}
        className="h-full w-full bg-black object-contain"
        src={previewVideoSrc}
        controls
        preload="auto"
        loop
        playsInline
        onError={() => setVideoMissing(true)}
      />
    </main>
  );
}
