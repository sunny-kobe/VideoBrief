'use client';

import { useEffect, useState } from 'react';
import { Volume2 } from 'lucide-react';

interface VoicePreviewPrototypeProps {
  projectId: string;
  sceneId: string;
  text: string;
  voice: string;
}

export default function VoicePreviewPrototype({ projectId, sceneId, text, voice }: VoicePreviewPrototypeProps) {
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [audioHref, setAudioHref] = useState('');
  const [statusText, setStatusText] = useState('');

  useEffect(() => {
    setState('idle');
    setAudioHref('');
    setStatusText('');
  }, [projectId, sceneId, text, voice]);

  async function generatePreview() {
    setState('loading');
    setStatusText('正在生成试听…');
    try {
      const response = await fetch('/api/workbench/voice-preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId, sceneId, text }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? '试听生成失败');
      setAudioHref(`${payload.href}&v=${Date.now()}`);
      setState('ready');
      setStatusText(payload.cacheHit ? '已复用相同文案的本地缓存。' : '已生成新的本地试听缓存。');
    } catch (error) {
      setState('error');
      setStatusText(error instanceof Error ? error.message : '试听生成失败');
    }
  }

  return (
    <section className="border-t border-slate-200 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-900">
            <Volume2 aria-hidden="true" className="h-3.5 w-3.5" />
            旁白试听
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {voice} · {voice.endsWith('Neural') ? '神经语音' : '本地离线音色'}
          </p>
        </div>
        <button
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-slate-950 px-3 text-xs font-extrabold text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-400"
          type="button"
          disabled={state === 'loading' || !text.trim()}
          onClick={generatePreview}
        >
          <Volume2 aria-hidden="true" className="h-3.5 w-3.5" />
          {state === 'loading' ? '生成中…' : '试听旁白'}
        </button>
      </div>
      {audioHref ? (
        <audio
          className="mt-3 h-9 w-full"
          src={audioHref}
          controls
          preload="metadata"
          aria-label="当前场景旁白试听"
        />
      ) : null}
      {statusText ? (
        <p
          className={`mt-2 text-xs font-bold ${state === 'error' ? 'text-rose-700' : 'text-emerald-800'}`}
          role="status"
          aria-live="polite"
        >
          {statusText}
        </p>
      ) : null}
    </section>
  );
}
