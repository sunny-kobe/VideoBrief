'use client';

import { ArrowRight, Check, LoaderCircle, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { ShortVideoProject } from '@/src/shortVideoBrief';
import type { WorkflowStage } from '@/src/productionWorkflow';

interface DeliveryWorkflowResponse {
  project: ShortVideoProject;
  workflow: {
    stages: WorkflowStage[];
    next: WorkflowStage | null;
  };
}

interface DeliveryReviewPanelProps {
  projectId: string;
  projectUpdatedAt: string;
  onProjectChange: (project: ShortVideoProject) => void;
}

export default function DeliveryReviewPanel({
  projectId,
  projectUpdatedAt,
  onProjectChange,
}: DeliveryReviewPanelProps) {
  const onProjectChangeRef = useRef(onProjectChange);
  const [payload, setPayload] = useState<DeliveryWorkflowResponse | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    onProjectChangeRef.current = onProjectChange;
  }, [onProjectChange]);

  const load = useCallback(async () => {
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/workflow`, {
      cache: 'no-store',
    });
    const next = await response.json() as DeliveryWorkflowResponse & { error?: string };
    if (!response.ok) throw new Error(next.error ?? '审片状态读取失败');
    setPayload(next);
    onProjectChangeRef.current(next.project);
  }, [projectId, projectUpdatedAt]);

  useEffect(() => {
    let active = true;
    load().catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : '审片状态读取失败');
    });
    return () => { active = false; };
  }, [load]);

  async function decide(type: 'approve_delivery' | 'reject_delivery', label: string) {
    setBusy(type);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/workflow`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type, decidedBy: 'local-user', note }),
      });
      const next = await response.json() as DeliveryWorkflowResponse & { error?: string };
      if (!response.ok) throw new Error(next.error ?? `${label}失败`);
      setPayload(next);
      onProjectChangeRef.current(next.project);
      setNote('');
      setMessage(type === 'approve_delivery'
        ? '当前成片已通过真人审片，项目状态已更新为“已完成”。'
        : '当前成片已退回，项目状态已更新为“需处理”。');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : `${label}失败`);
    } finally {
      setBusy('');
    }
  }

  if (!payload && !error) {
    return (
      <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-3 text-xs text-slate-500" role="status">
        <LoaderCircle aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />读取审片状态
      </div>
    );
  }

  const acceptance = payload?.workflow.stages.find((stage) => stage.id === 'acceptance');
  const nextStage = payload?.workflow.next;

  if (!error && acceptance?.status !== 'ready' && acceptance?.status !== 'approved' && !message) {
    if (!nextStage) return null;
    const view = ['topic', 'research', 'materials'].includes(nextStage.id)
      ? 'sources'
      : ['narrative'].includes(nextStage.id)
        ? 'planning'
        : ['shots'].includes(nextStage.id)
          ? 'clips'
          : 'export';
    return (
      <div className="flex flex-col gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-extrabold text-amber-900">还不能提交审片结论</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">请先处理“{nextStage.label}”：{nextStage.message}</p>
        </div>
        <a
          className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md border border-amber-300 bg-white px-3 text-xs font-extrabold text-amber-900 hover:bg-amber-100"
          href={`/workbench?project=${encodeURIComponent(projectId)}&advanced=1&view=${view}`}
        >
          前往处理<ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
        </a>
      </div>
    );
  }

  return (
    <div className={`border-b px-4 py-3 ${acceptance?.status === 'approved' ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
      <div className="flex flex-col gap-3">
        <div>
          <p className={`text-xs font-extrabold ${acceptance?.status === 'approved' ? 'text-emerald-800' : 'text-amber-900'}`}>
            {acceptance?.status === 'approved' ? '真人审片已通过' : '等待真人审片'}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            {acceptance?.status === 'approved'
              ? '当前视频已通过 Delivery Gate；这表示制作完成，不代表已经发布。'
              : '请以 1 倍速完整观看当前成片，确认画面语义、字幕可读性和片尾后再作决定。'}
          </p>
        </div>

        {acceptance?.status === 'ready' ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              className="h-9 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 text-xs"
              aria-label="审片结论"
              placeholder="审片结论（可选）"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
            <div className="flex gap-2">
              <button
                className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md bg-emerald-700 px-3 text-xs font-extrabold text-white disabled:bg-slate-400 sm:flex-none"
                type="button"
                disabled={Boolean(busy)}
                onClick={() => void decide('approve_delivery', '确认通过')}
              >
                {busy === 'approve_delivery' ? <LoaderCircle aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> : <Check aria-hidden="true" className="h-3.5 w-3.5" />}
                确认通过
              </button>
              <button
                className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md border border-rose-300 bg-white px-3 text-xs font-extrabold text-rose-700 disabled:opacity-40 sm:flex-none"
                type="button"
                disabled={Boolean(busy)}
                onClick={() => void decide('reject_delivery', '退回修改')}
              >
                <X aria-hidden="true" className="h-3.5 w-3.5" />退回修改
              </button>
            </div>
          </div>
        ) : null}

        {error ? <p className="border-l-2 border-rose-500 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800" role="alert">{error}</p> : null}
        {message ? <p className="border-l-2 border-emerald-500 bg-white/70 px-3 py-2 text-xs font-bold text-emerald-800" role="status">{message}</p> : null}
      </div>
    </div>
  );
}
