'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Columns3,
  FlaskConical,
  ListOrdered,
  Play,
  X,
} from 'lucide-react';
import { buildPrototypeClipCandidates, PrototypeClipCandidate } from '@/src/clipCandidatePrototype';
import { ShortVideoProjectScene, ShortVideoSource } from '@/src/shortVideoBrief';

export type CandidatePrototypeVariant = 'ranked' | 'compare';

interface ClipCandidatePrototypeProps {
  scene?: ShortVideoProjectScene;
  source?: ShortVideoSource;
  variant: CandidatePrototypeVariant;
  onVariantChange: (variant: CandidatePrototypeVariant) => void;
  onPreview: (candidate: PrototypeClipCandidate) => void;
  onClose: () => void;
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-[10px] font-bold text-slate-500">
        <span>{label}</span>
        <span className="font-mono text-slate-700">{value}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-emerald-600" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function CandidateActions({
  candidate,
  selected,
  onPreview,
  onSelect,
}: {
  candidate: PrototypeClipCandidate;
  selected: boolean;
  onPreview: () => void;
  onSelect: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
        type="button"
        onClick={onPreview}
      >
        <Play aria-hidden="true" className="h-3 w-3" />
        预览
      </button>
      <button
        className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${selected ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-950 text-white hover:bg-slate-800'}`}
        type="button"
        onClick={onSelect}
      >
        {selected ? <Check aria-hidden="true" className="h-3 w-3" /> : null}
        {selected ? '已暂定' : '暂定此段'}
      </button>
    </div>
  );
}

export default function ClipCandidatePrototype({
  scene,
  source,
  variant,
  onVariantChange,
  onPreview,
  onClose,
}: ClipCandidatePrototypeProps) {
  const candidates = useMemo(() => (scene ? buildPrototypeClipCandidates(scene) : []), [scene]);
  const [selectedId, setSelectedId] = useState(candidates[0]?.id ?? '');

  useEffect(() => {
    setSelectedId(candidates[0]?.id ?? '');
  }, [candidates]);

  return (
    <section className="min-w-0 bg-white lg:h-full lg:overflow-y-auto lg:rounded-md lg:border lg:border-slate-200">
      <div className="border-b border-slate-200 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-extrabold text-amber-700">
              <FlaskConical aria-hidden="true" className="h-3.5 w-3.5" />
              交互原型 · 不写入项目
            </div>
            <h2 className="mt-1 text-base font-extrabold text-slate-950">人工选片方式</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              启发式分数仅用于比较信息层级，不代表真实模型结果。
            </p>
          </div>
          <button
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
            type="button"
            aria-label="关闭候选片段原型"
            onClick={onClose}
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-3 inline-flex rounded-md border border-slate-300 p-0.5" aria-label="候选片段布局">
          <button
            className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${variant === 'ranked' ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
            type="button"
            onClick={() => onVariantChange('ranked')}
          >
            <ListOrdered aria-hidden="true" className="h-3.5 w-3.5" />
            排名列表
          </button>
          <button
            className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${variant === 'compare' ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
            type="button"
            onClick={() => onVariantChange('compare')}
          >
            <Columns3 aria-hidden="true" className="h-3.5 w-3.5" />
            并排比较
          </button>
        </div>
      </div>

      <div className="p-4">
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-[10px] font-bold text-slate-500">当前场景 / 来源</p>
          <p className="mt-1 text-sm font-extrabold text-slate-950">{scene?.title ?? '未选择场景'}</p>
          <p className="mt-1 text-xs text-slate-500">{source?.label ?? '来源缺失'}</p>
        </div>

        {variant === 'ranked' ? (
          <div className="mt-4 space-y-2">
            {candidates.map((candidate, index) => (
              <article
                key={candidate.id}
                className={`rounded-md border p-3 ${selectedId === candidate.id ? 'border-emerald-500 bg-emerald-50/60' : 'border-slate-200'}`}
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-slate-950 font-mono text-sm font-extrabold text-white">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-extrabold text-slate-950">{candidate.label}</h3>
                        <p className="mt-1 font-mono text-[11px] text-slate-500">
                          {candidate.start.toFixed(2)}s - {candidate.end.toFixed(2)}s
                        </p>
                      </div>
                      <span className="font-mono text-2xl font-extrabold text-emerald-700">
                        {candidate.totalScore}
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-slate-600">{candidate.rationale}</p>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <span className="text-[10px] font-bold text-slate-500">
                        语义 {candidate.semanticScore} · 运动 {candidate.motionScore} · 连贯 {candidate.continuityScore}
                      </span>
                      <CandidateActions
                        candidate={candidate}
                        selected={selectedId === candidate.id}
                        onPreview={() => onPreview(candidate)}
                        onSelect={() => setSelectedId(candidate.id)}
                      />
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-4 grid gap-3 xl:grid-cols-3">
            {candidates.map((candidate) => (
              <article
                key={candidate.id}
                className={`rounded-md border p-3 ${selectedId === candidate.id ? 'border-emerald-500 bg-emerald-50/60' : 'border-slate-200'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-950">{candidate.label}</h3>
                    <p className="mt-1 font-mono text-[10px] text-slate-500">
                      {candidate.start.toFixed(2)}s - {candidate.end.toFixed(2)}s
                    </p>
                  </div>
                  <span className="font-mono text-2xl font-extrabold text-emerald-700">
                    {candidate.totalScore}
                  </span>
                </div>
                <div className="mt-4 space-y-3">
                  <ScoreBar label="语义" value={candidate.semanticScore} />
                  <ScoreBar label="运动" value={candidate.motionScore} />
                  <ScoreBar label="连贯" value={candidate.continuityScore} />
                </div>
                <p className="mt-4 min-h-16 text-xs leading-relaxed text-slate-600">
                  {candidate.rationale}
                </p>
                <div className="mt-3">
                  <CandidateActions
                    candidate={candidate}
                    selected={selectedId === candidate.id}
                    onPreview={() => onPreview(candidate)}
                    onSelect={() => setSelectedId(candidate.id)}
                  />
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
          当前暂定：{candidates.find((candidate) => candidate.id === selectedId)?.label ?? '未选择'}。切换场景会重置，刷新页面不会保存。
        </div>
      </div>
    </section>
  );
}
