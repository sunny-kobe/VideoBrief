'use client';

import {
  Check,
  Circle,
  ExternalLink,
  Eye,
  LoaderCircle,
  Play,
  Plus,
  RefreshCw,
  ShieldAlert,
  UserRound,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  ProductionWorkflowAction,
  ProductionWorkflowAutomaticAction,
  WorkflowRuntimeEvidence,
  WorkflowStage,
  ProductionWorkflowAutomaticFailure,
} from '@/src/productionWorkflow';
import type { ShortVideoProject } from '@/src/shortVideoBrief';

interface WorkflowResponse {
  project: ShortVideoProject;
  workflow: {
    stages: WorkflowStage[];
    next: WorkflowStage | null;
    automaticAction: ProductionWorkflowAutomaticAction | null;
    runtime: WorkflowRuntimeEvidence;
    activity: {
      action: Exclude<ProductionWorkflowAutomaticAction, 'package'>;
      state: string;
      message: string;
    } | null;
    failure: ProductionWorkflowAutomaticFailure | null;
  };
}

interface WorkflowProgressProps {
  projectId: string;
  projectUpdatedAt?: string;
  onProjectChange?: (project: ShortVideoProject) => void;
}

const automaticLabels: Record<ProductionWorkflowAutomaticAction, string> = {
  process_sources: '解析全部来源',
  plan_project: '生成脚本与候选',
  render: '渲染并执行技术验收',
  package: '生成 Production package',
};

const stageLinks: Partial<Record<WorkflowStage['id'], string>> = {
  materials: 'sources',
  research: 'research',
  narrative: 'planning',
  shots: 'clips',
  technical: 'export',
  acceptance: 'export',
  package: 'export',
};

export default function WorkflowProgress({
  projectId,
  projectUpdatedAt = '',
  onProjectChange,
}: WorkflowProgressProps) {
  const onProjectChangeRef = useRef(onProjectChange);
  const [payload, setPayload] = useState<WorkflowResponse | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');
  const [decidedBy, setDecidedBy] = useState('');
  const [note, setNote] = useState('');
  const [platform, setPlatform] = useState('');
  const [publishedUrl, setPublishedUrl] = useState('');
  const [publishedAt, setPublishedAt] = useState('');
  const [metricSource, setMetricSource] = useState('');
  const [metricSourceUrl, setMetricSourceUrl] = useState('');
  const [metric, setMetric] = useState('');
  const [metricValue, setMetricValue] = useState('');
  const [metricUnit, setMetricUnit] = useState('');

  useEffect(() => {
    onProjectChangeRef.current = onProjectChange;
  }, [onProjectChange]);

  const load = useCallback(async () => {
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/workflow`, { cache: 'no-store' });
    const next = await response.json() as WorkflowResponse & { error?: string };
    if (!response.ok) throw new Error(next.error ?? '流程状态读取失败');
    setPayload(next);
    onProjectChangeRef.current?.(next.project);
    return next;
  }, [projectId, projectUpdatedAt]);

  useEffect(() => {
    let active = true;
    load().catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : '流程状态读取失败');
    });
    return () => { active = false; };
  }, [load]);

  useEffect(() => {
    if (!payload?.workflow.activity) return undefined;
    const timer = window.setInterval(() => {
      load().catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : '流程状态读取失败');
      });
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [load, payload?.workflow.activity]);

  async function post(path: string, body: unknown, label: string) {
    setBusy(label);
    setError('');
    setMessage('');
    try {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const next = await response.json() as WorkflowResponse & { error?: string; state?: string };
      if (!response.ok) throw new Error(next.error ?? `${label}失败`);
      if (next.project && next.workflow) {
        setPayload(next);
        onProjectChangeRef.current?.(next.project);
      } else {
        await load();
      }
      setMessage(`${label}已执行${next.state ? `：${next.state}` : ''}。`);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : `${label}失败`);
      return false;
    } finally {
      setBusy('');
    }
  }

  async function submitAction(action: ProductionWorkflowAction, label: string) {
    const succeeded = await post(
      `/api/projects/${encodeURIComponent(projectId)}/workflow`,
      action,
      label,
    );
    if (succeeded) setNote('');
  }

  const nextStage = payload?.workflow.next ?? null;
  const automaticAction = payload?.workflow.automaticAction ?? null;
  const activity = payload?.workflow.activity ?? null;
  const workflowFailure = payload?.workflow.failure ?? null;
  const publicationApproved = payload?.workflow.stages.find((stage) => stage.id === 'publication')?.status === 'approved';
  const hasMarketEvidence = Boolean(payload?.project.workflow.market.evidence.length);
  const decisionReady = decidedBy.trim().length > 0 && note.trim().length >= 12;

  if (!payload && !error) {
    return <p className="flex items-center gap-2 border-t border-slate-200 px-4 py-3 text-xs text-slate-500"><LoaderCircle aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />读取生产流程</p>;
  }

  return (
    <div className="border-t border-slate-200">
      {payload ? <ol className="grid bg-slate-200 sm:grid-cols-2 lg:grid-cols-5">
        {payload.workflow.stages.map((stage, index) => {
          const complete = stage.status === 'approved' || stage.status === 'completed';
          const blocked = stage.status === 'blocked';
          const Icon = complete
            ? Check
            : blocked
              ? ShieldAlert
              : stage.responsibility === 'human_gate'
                ? UserRound
                : stage.responsibility === 'operator_review'
                  ? Eye
                  : Circle;
          return (
            <li className="min-w-0 border-b border-r border-slate-200 bg-white px-3 py-3" key={stage.id} title={stage.message}>
              <div className="flex items-center gap-2">
                <Icon aria-hidden="true" className={`h-4 w-4 shrink-0 ${complete ? 'text-emerald-600' : blocked ? 'text-rose-600' : stage.status === 'ready' ? 'text-amber-600' : 'text-slate-400'}`} />
                <span className="text-[10px] font-bold text-slate-400">{String(index + 1).padStart(2, '0')}</span>
                <span className="truncate text-xs font-extrabold text-slate-800">{stage.label}</span>
              </div>
              <p className="mt-1.5 line-clamp-2 text-[10px] leading-relaxed text-slate-500">{stage.message}</p>
            </li>
          );
        })}
      </ol> : null}

      <div className="flex flex-col gap-3 bg-white px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold text-emerald-700">当前节点</p>
            <p className="mt-1 text-sm font-extrabold text-slate-950">{nextStage?.label ?? '生产流程已完成'}</p>
            {nextStage ? <p className="mt-1 text-xs leading-relaxed text-slate-500">{nextStage.message}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 disabled:opacity-50" type="button" title="刷新流程" aria-label="刷新流程" disabled={Boolean(busy)} onClick={() => void load()}><RefreshCw aria-hidden="true" className="h-4 w-4" /></button>
            {nextStage && stageLinks[nextStage.id] ? <a className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-xs font-extrabold text-slate-700" href={`/workbench?project=${encodeURIComponent(projectId)}&advanced=1&view=${stageLinks[nextStage.id]}`}><ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />打开当前节点</a> : null}
            {automaticAction ? <button className="inline-flex h-9 items-center gap-2 rounded-md bg-slate-950 px-3 text-xs font-extrabold text-white disabled:bg-slate-400" type="button" disabled={Boolean(busy) || Boolean(activity)} onClick={() => void post(`/api/projects/${encodeURIComponent(projectId)}/workflow/advance`, {}, workflowFailure?.action === automaticAction ? `重试${automaticLabels[automaticAction]}` : automaticLabels[automaticAction])}>{busy || activity ? <LoaderCircle aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> : <Play aria-hidden="true" className="h-3.5 w-3.5" />}{activity?.message ?? (workflowFailure?.action === automaticAction ? `重试${automaticLabels[automaticAction]}` : automaticLabels[automaticAction])}</button> : null}
          </div>
        </div>

        {nextStage && ['topic', 'research', 'acceptance'].includes(nextStage.id) ? <div className="grid gap-2 sm:grid-cols-[180px_minmax(0,1fr)_auto]">
          <input className="h-9 rounded-md border border-slate-300 px-3 text-xs" aria-label="人工批准者" placeholder="人工批准者" value={decidedBy} onChange={(event) => setDecidedBy(event.target.value)} />
          <input className="h-9 rounded-md border border-slate-300 px-3 text-xs" aria-label="决策说明" placeholder="决策说明（至少 12 字）" value={note} onChange={(event) => setNote(event.target.value)} />
          <div className="flex gap-2">
            <button className="inline-flex h-9 items-center gap-1.5 rounded-md bg-emerald-700 px-3 text-xs font-extrabold text-white disabled:bg-slate-400" type="button" disabled={Boolean(busy) || !decisionReady || nextStage.status !== 'ready' && nextStage.id !== 'topic'} onClick={() => void submitAction({ type: nextStage.id === 'topic' ? 'approve_topic' : nextStage.id === 'research' ? 'approve_research' : 'approve_delivery', decidedBy, note }, '批准当前 Gate')}><Check aria-hidden="true" className="h-3.5 w-3.5" />批准</button>
            <button className="inline-flex h-9 items-center gap-1.5 rounded-md border border-rose-300 bg-white px-3 text-xs font-extrabold text-rose-700 disabled:opacity-40" type="button" disabled={Boolean(busy) || !decisionReady} onClick={() => void submitAction({ type: nextStage.id === 'topic' ? 'reject_topic' : nextStage.id === 'research' ? 'reject_research' : 'reject_delivery', decidedBy, note }, '退回当前 Gate')}><X aria-hidden="true" className="h-3.5 w-3.5" />退回</button>
          </div>
        </div> : null}

        {nextStage?.id === 'publication' && !publicationApproved ? <div className="grid gap-2 sm:grid-cols-[160px_180px_minmax(0,1fr)_auto]">
          <input className="h-9 rounded-md border border-slate-300 px-3 text-xs" aria-label="发布平台" placeholder="发布平台" value={platform} onChange={(event) => setPlatform(event.target.value)} />
          <input className="h-9 rounded-md border border-slate-300 px-3 text-xs" aria-label="发布批准者" placeholder="人工批准者" value={decidedBy} onChange={(event) => setDecidedBy(event.target.value)} />
          <input className="h-9 rounded-md border border-slate-300 px-3 text-xs" aria-label="发布决策说明" placeholder="发布决策说明（至少 12 字）" value={note} onChange={(event) => setNote(event.target.value)} />
          <button className="inline-flex h-9 items-center gap-1.5 rounded-md bg-emerald-700 px-3 text-xs font-extrabold text-white disabled:bg-slate-400" type="button" disabled={Boolean(busy) || !decisionReady || !platform.trim() || payload?.project.rights_status !== 'cleared'} onClick={() => void submitAction({ type: 'approve_publication', decidedBy, note, platform }, '批准人工发布')}><Check aria-hidden="true" className="h-3.5 w-3.5" />批准发布</button>
        </div> : null}

        {nextStage?.id === 'publication' && publicationApproved ? <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_220px_auto]">
          <input className="h-9 rounded-md border border-slate-300 px-3 text-xs" type="url" aria-label="真实发布 URL" placeholder="真实发布 URL" value={publishedUrl} onChange={(event) => setPublishedUrl(event.target.value)} />
          <input className="h-9 rounded-md border border-slate-300 px-3 text-xs" type="datetime-local" aria-label="发布时间" value={publishedAt} onChange={(event) => setPublishedAt(event.target.value)} />
          <button className="inline-flex h-9 items-center gap-1.5 rounded-md bg-slate-950 px-3 text-xs font-extrabold text-white disabled:bg-slate-400" type="button" disabled={Boolean(busy) || !publishedUrl.trim() || !publishedAt} onClick={() => void submitAction({ type: 'record_publication', publishedUrl, publishedAt: new Date(publishedAt).toISOString() }, '记录真实发布')}><Plus aria-hidden="true" className="h-3.5 w-3.5" />记录发布</button>
        </div> : null}

        {nextStage?.id === 'market' ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[160px_minmax(0,1fr)_140px_100px_100px_auto]">
          <input className="h-9 rounded-md border border-slate-300 px-3 text-xs" aria-label="数据来源" placeholder="数据来源" value={metricSource} onChange={(event) => setMetricSource(event.target.value)} />
          <input className="h-9 rounded-md border border-slate-300 px-3 text-xs" type="url" aria-label="数据 URL" placeholder="数据 URL（可选）" value={metricSourceUrl} onChange={(event) => setMetricSourceUrl(event.target.value)} />
          <input className="h-9 rounded-md border border-slate-300 px-3 text-xs" aria-label="市场指标" placeholder="指标" value={metric} onChange={(event) => setMetric(event.target.value)} />
          <input className="h-9 rounded-md border border-slate-300 px-3 text-xs" type="number" aria-label="指标值" placeholder="数值" value={metricValue} onChange={(event) => setMetricValue(event.target.value)} />
          <input className="h-9 rounded-md border border-slate-300 px-3 text-xs" aria-label="指标单位" placeholder="单位" value={metricUnit} onChange={(event) => setMetricUnit(event.target.value)} />
          <button className="inline-flex h-9 items-center gap-1.5 rounded-md bg-slate-950 px-3 text-xs font-extrabold text-white disabled:bg-slate-400" type="button" disabled={Boolean(busy) || !metricSource.trim() || !metric.trim() || !metricUnit.trim() || !metricValue.trim() || !Number.isFinite(Number(metricValue))} onClick={() => void submitAction({ type: 'record_market_evidence', evidence: { source: metricSource, sourceUrl: metricSourceUrl, metric, value: Number(metricValue), unit: metricUnit, periodStart: '', periodEnd: '', note: '' } }, '记录市场证据')}><Plus aria-hidden="true" className="h-3.5 w-3.5" />{hasMarketEvidence ? '追加证据' : '记录证据'}</button>
        </div> : null}

        {nextStage?.id === 'market' && hasMarketEvidence ? <div className="grid gap-2 sm:grid-cols-[180px_minmax(0,1fr)_auto]">
          <input className="h-9 rounded-md border border-slate-300 px-3 text-xs" aria-label="市场结论批准者" placeholder="人工批准者" value={decidedBy} onChange={(event) => setDecidedBy(event.target.value)} />
          <input className="h-9 rounded-md border border-slate-300 px-3 text-xs" aria-label="市场结论说明" placeholder="市场结论说明（至少 12 字）" value={note} onChange={(event) => setNote(event.target.value)} />
          <div className="flex flex-wrap gap-2">
            {([['validated', '验证成立'], ['not_validated', '未验证'], ['inconclusive', '证据不足']] as const).map(([decision, label]) => <button className="h-9 rounded-md border border-slate-300 bg-white px-3 text-xs font-extrabold text-slate-700 disabled:opacity-40" key={decision} type="button" disabled={Boolean(busy) || !decisionReady} onClick={() => void submitAction({ type: 'decide_market', decidedBy, note, decision }, `形成市场结论：${label}`)}>{label}</button>)}
          </div>
        </div> : null}

        {workflowFailure ? <p className="border-l-2 border-rose-500 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800" role="alert">自动步骤 {automaticLabels[workflowFailure.action]} 未完成：{workflowFailure.message}</p> : null}
        {error ? <p className="border-l-2 border-rose-500 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800" role="alert">{error}</p> : null}
        {message ? <p className="border-l-2 border-emerald-500 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800" role="status">{message}</p> : null}
      </div>
    </div>
  );
}
