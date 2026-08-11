'use client';

import { useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';

interface ShortVideoPreviewClientProps {
  renderHref: string;
  title: string;
  loop?: boolean;
}

export default function ShortVideoPreviewClient({ renderHref, title, loop = true }: ShortVideoPreviewClientProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoMissing, setVideoMissing] = useState(false);
  const previewVideoSrc = `${renderHref}?v=${encodeURIComponent(title)}`;

  if (!renderHref || videoMissing) {
    return (
      <main className="min-h-screen bg-black text-white">
        <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 text-center">
          <p className="text-xs font-bold text-emerald-300">VIDEOBRIEF</p>
          <h1 className="mt-4 text-2xl font-display font-extrabold">
            还没有可播放的成片
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">
            当前项目尚无通过验收的成片，请返回项目列表查看下一步。
          </p>
          <a
            className="mt-6 inline-flex items-center gap-2 rounded-md border border-white/15 px-3 py-2 text-sm font-bold text-slate-100 hover:bg-white/10"
            href="/"
          >
            <ArrowLeft className="h-4 w-4" />
            返回项目列表
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
        loop={loop}
        playsInline
        onError={() => setVideoMissing(true)}
      />
    </main>
  );
}
