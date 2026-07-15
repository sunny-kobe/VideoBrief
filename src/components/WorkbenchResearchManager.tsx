import {
  ArrowLeft,
  ArrowRight,
  BrainCircuit,
  Check,
  CheckCheck,
  CircleDot,
  Eye,
  FileSearch,
  RefreshCw,
  TriangleAlert,
  X,
} from 'lucide-react';
import type {
  ResearchFact,
  ResearchUncertainty,
  ShortVideoProject,
  ShortVideoSource,
  SourceReference,
} from '@/src/shortVideoBrief';
import { researchReviewSummary } from '@/src/researchReview';

interface WorkbenchResearchManagerProps {
  project: ShortVideoProject;
  activeSourceId: string;
  busy: boolean;
  onProcessAll: () => void;
  onProcessSource: (sourceId: string) => void;
  onUpdateSource: (sourceId: string, patch: Partial<ShortVideoSource>) => void;
  onUpdateFact: (factId: string, patch: Partial<ResearchFact>) => void;
  onUpdateUncertainty: (uncertaintyId: string, patch: Partial<ResearchUncertainty>) => void;
  onConfirmSourceFacts: (sourceId: string) => void;
  onSelectSource: (sourceId: string) => void;
  onBackToSources: () => void;
  onContinue: () => void;
}

const statusTone = {
  idle: 'bg-slate-100 text-slate-700',
  pending: 'bg-amber-50 text-amber-800',
  running: 'bg-sky-50 text-sky-800',
  completed: 'bg-emerald-50 text-emerald-800',
  failed: 'bg-rose-50 text-rose-800',
};

const factReviewOptions = [
  { value: 'proposed', label: '待确认', Icon: CircleDot },
  { value: 'confirmed', label: '确认', Icon: Check },
  { value: 'rejected', label: '驳回', Icon: X },
] as const;

function referenceLabel(reference: SourceReference, sources: ShortVideoSource[]) {
  const sourceLabel = sources.find((source) => source.id === reference.sourceId)?.label ?? reference.sourceId;
  if (reference.locatorType === 'time') {
    return `${sourceLabel} · ${reference.start?.toFixed(2) ?? '?'}-${reference.end?.toFixed(2) ?? '?'}s`;
  }
  if (reference.locatorType === 'line') {
    return `${sourceLabel} · L${reference.lineStart ?? '?'}-${reference.lineEnd ?? reference.lineStart ?? '?'}`;
  }
  return `${sourceLabel} · ${reference.locatorType}`;
}

function FactRow({
  fact,
  sources,
  keyFact,
  onUpdate,
  onSelectSource,
}: {
  fact: ResearchFact;
  sources: ShortVideoSource[];
  keyFact: boolean;
  onUpdate: (patch: Partial<ResearchFact>) => void;
  onSelectSource: (sourceId: string) => void;
}) {
  return (
    <div className="border-b border-slate-200 py-3 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded px-2 py-1 text-[10px] font-extrabold ${keyFact ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
            {keyFact ? '关键主张' : fact.kind === 'visual_metadata' ? '视觉元数据' : '补充主张'}
          </span>
          <span className="font-mono text-[10px] text-slate-400">相关度 {Math.round(fact.briefRelevance)}</span>
        </div>
        <button
          className="h-7 rounded-md border border-slate-300 bg-white px-2 text-[10px] font-extrabold text-slate-700 hover:bg-slate-50"
          type="button"
          onClick={() => onUpdate(keyFact
            ? { reviewPriority: 'supporting', briefRelevance: Math.min(fact.briefRelevance, 70) }
            : { kind: 'claim', reviewPriority: 'required', briefRelevance: 100 })}
        >
          {keyFact ? '移出关键核验' : '设为关键主张'}
        </button>
      </div>
      <p className="mt-2 text-xs font-bold leading-relaxed text-slate-900">{fact.statement}</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-md border border-slate-300 bg-slate-50 p-0.5" role="group" aria-label={`${fact.id} 审核状态`}>
          {factReviewOptions.map(({ value, label, Icon }) => {
            const selected = fact.reviewStatus === value;
            return (
              <button
                className={`inline-flex h-7 items-center gap-1.5 rounded px-2 text-[10px] font-extrabold ${selected ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-white'}`}
                type="button"
                aria-pressed={selected}
                key={value}
                onClick={() => onUpdate({ reviewStatus: value })}
              >
                <Icon aria-hidden="true" className="h-3 w-3" />
                {label}
              </button>
            );
          })}
        </div>
        <details className="min-w-0 max-w-full text-right">
          <summary className="cursor-pointer text-[10px] font-bold text-slate-500 hover:text-emerald-700">编辑表述与查看来源</summary>
          <div className="mt-2 w-full min-w-64 space-y-2 text-left sm:w-96">
            <label className="block">
              <span className="sr-only">事实表述</span>
              <textarea aria-label={`编辑事实 ${fact.id}`} className="min-h-20 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-bold leading-relaxed text-slate-800 focus-visible:border-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200" value={fact.statement} onChange={(event) => onUpdate({ statement: event.target.value })} />
            </label>
            {fact.sourceReferences.map((reference, index) => (
              <button className="block w-full break-words text-left text-[10px] leading-relaxed text-slate-500 hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" type="button" key={`${reference.sourceId}-${index}`} onClick={() => onSelectSource(reference.sourceId)}>
                <span className="font-mono font-bold">{referenceLabel(reference, sources)}</span> {reference.note}
              </button>
            ))}
          </div>
        </details>
      </div>
    </div>
  );
}

function UncertaintyRow({
  item,
  sources,
  required,
  onUpdate,
  onSelectSource,
}: {
  item: ResearchUncertainty;
  sources: ShortVideoSource[];
  required: boolean;
  onUpdate: (patch: Partial<ResearchUncertainty>) => void;
  onSelectSource: (sourceId: string) => void;
}) {
  return (
    <div className={`border-b py-3 last:border-b-0 ${required ? 'border-amber-200' : 'border-slate-200'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`rounded px-2 py-1 text-[10px] font-extrabold ${required ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-600'}`}>
          {required ? '高风险问题' : '一般疑问'}
        </span>
        <button
          className="h-7 rounded-md border border-slate-300 bg-white px-2 text-[10px] font-extrabold text-slate-700 hover:bg-slate-50"
          type="button"
          onClick={() => onUpdate(required
            ? { riskLevel: 'medium', reviewPriority: 'supporting', briefRelevance: Math.min(item.briefRelevance, 70) }
            : { riskLevel: 'high', reviewPriority: 'required', briefRelevance: 100 })}
        >
          {required ? '降为一般问题' : '设为高风险'}
        </button>
      </div>
      <p className={`mt-2 text-xs font-bold leading-relaxed ${required ? 'text-amber-950' : 'text-slate-800'}`}>{item.statement}</p>
      {required && !item.resolution.trim() ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="h-8 rounded-md bg-amber-900 px-2.5 text-[10px] font-extrabold text-white" type="button" onClick={() => onUpdate({ resolution: '已确认：作为限制保留，不写成确定事实。' })}>保留为限制</button>
          <button className="h-8 rounded-md border border-amber-400 bg-white px-2.5 text-[10px] font-extrabold text-amber-900" type="button" onClick={() => onUpdate({ resolution: '已确认：与当前脚本无关，不作为内容依据。' })}>与脚本无关</button>
        </div>
      ) : null}
      {item.resolution.trim() ? <p className="mt-2 rounded-md bg-white/80 px-2.5 py-2 text-[10px] leading-relaxed text-slate-700">{item.resolution}</p> : null}
      <details className="mt-2">
        <summary className={`cursor-pointer text-[10px] font-bold ${required ? 'text-amber-800' : 'text-slate-600'}`}>查看来源与记录其他结论</summary>
        <div className="mt-2 space-y-2">
          {item.sourceReferences.map((reference, index) => (
            <button className={`block w-full break-words text-left text-[10px] leading-relaxed focus-visible:outline-none focus-visible:ring-2 ${required ? 'text-amber-700 hover:text-amber-950 focus-visible:ring-amber-600' : 'text-slate-500 hover:text-emerald-700 focus-visible:ring-emerald-600'}`} type="button" key={`${reference.sourceId}-${index}`} onClick={() => onSelectSource(reference.sourceId)}>
              <span className="font-mono font-bold">{referenceLabel(reference, sources)}</span> {reference.note}
            </button>
          ))}
          <label className="block">
            <span className="sr-only">人工处理结论</span>
            <textarea aria-label={`处理不确定项 ${item.id}`} className={`min-h-16 w-full resize-y rounded-md border bg-white px-3 py-2 text-xs leading-relaxed text-slate-800 focus-visible:border-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200 ${required ? 'border-amber-300' : 'border-slate-300'}`} placeholder="记录核对结论、修正内容或保留风险的理由…" value={item.resolution} onChange={(event) => onUpdate({ resolution: event.target.value })} />
          </label>
        </div>
      </details>
    </div>
  );
}

export default function WorkbenchResearchManager({
  project,
  activeSourceId,
  busy,
  onProcessAll,
  onProcessSource,
  onUpdateSource,
  onUpdateFact,
  onUpdateUncertainty,
  onConfirmSourceFacts,
  onSelectSource,
  onBackToSources,
  onContinue,
}: WorkbenchResearchManagerProps) {
  const review = researchReviewSummary(project);
  const activeSource = project.sources.find((source) => source.id === activeSourceId) ?? project.sources[0];
  const activeFacts = activeSource?.analysis.facts ?? [];
  const activeUncertainties = activeSource?.analysis.uncertainties ?? [];
  const activeKeyFacts = activeFacts.filter((fact) => review.keyFactIds.has(fact.id));
  const otherFacts = activeFacts.filter((fact) => !review.keyFactIds.has(fact.id));
  const activeRequiredUncertainties = activeUncertainties.filter((item) => review.requiredUncertaintyIds.has(item.id));
  const otherUncertainties = activeUncertainties.filter((item) => !review.requiredUncertaintyIds.has(item.id));
  const proposedFacts = activeKeyFacts.filter((fact) => fact.reviewStatus === 'proposed').length;
  const confirmedFacts = activeKeyFacts.filter((fact) => fact.reviewStatus === 'confirmed').length;
  const rejectedFacts = activeKeyFacts.filter((fact) => fact.reviewStatus === 'rejected').length;

  return (
    <section className="min-w-0 overflow-hidden rounded-md border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-3">
          <BrainCircuit aria-hidden="true" className="h-4 w-4 text-slate-600" />
          <div>
            <h2 className="text-sm font-extrabold text-slate-950">关键内容核验</h2>
            <p className="mt-1 text-xs text-slate-500">当前素材：{activeSource?.label ?? '尚未选择素材'} · 只处理会影响脚本的内容</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-xs font-extrabold text-slate-700 hover:bg-slate-50" type="button" onClick={onBackToSources}>
            <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />返回素材库
          </button>
          <button className="inline-flex h-9 items-center gap-2 rounded-md bg-slate-950 px-3 text-xs font-extrabold text-white disabled:bg-slate-400" type="button" disabled={busy || !project.sources.length} onClick={onProcessAll}>
            <FileSearch aria-hidden="true" className="h-3.5 w-3.5" />解析全部素材
          </button>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-px border-b border-slate-200 bg-slate-200 sm:grid-cols-4">
        <div className="bg-white px-4 py-3"><dt className="text-[10px] font-bold text-slate-400">关键主张</dt><dd className="mt-1 font-mono text-sm font-extrabold text-slate-950">{review.keyFacts.length - review.pendingFacts.length} / {review.keyFacts.length}</dd></div>
        <div className="bg-white px-4 py-3"><dt className="text-[10px] font-bold text-slate-400">待确认</dt><dd className="mt-1 font-mono text-sm font-extrabold text-amber-800">{review.pendingFacts.length}</dd></div>
        <div className="bg-white px-4 py-3"><dt className="text-[10px] font-bold text-slate-400">高风险问题</dt><dd className="mt-1 font-mono text-sm font-extrabold text-amber-800">{review.unresolvedUncertainties.length}</dd></div>
        <div className="bg-white px-4 py-3"><dt className="text-[10px] font-bold text-slate-400">完整提取</dt><dd className="mt-1 font-mono text-sm font-extrabold text-slate-950">{project.research.facts.length} + {project.research.uncertainties.length}</dd></div>
      </dl>

      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-[10px] font-extrabold text-slate-500">切换素材</p>
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="核验素材">
          {project.sources.map((source) => {
            const active = source.id === activeSourceId;
            const pending = source.analysis.facts.filter((fact) => review.keyFactIds.has(fact.id) && fact.reviewStatus === 'proposed').length
              + source.analysis.uncertainties.filter((item) => review.requiredUncertaintyIds.has(item.id) && !item.resolution.trim()).length;
            const keyCount = source.analysis.facts.filter((fact) => review.keyFactIds.has(fact.id)).length;
            return (
              <button
                className={`min-w-36 max-w-56 shrink-0 rounded-md border px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${active ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-slate-300 bg-white text-slate-700'}`}
                type="button"
                aria-pressed={active}
                aria-label={`核验素材 ${source.label}`}
                key={source.id}
                onClick={() => onSelectSource(source.id)}
              >
                <span className={`block text-[10px] font-bold ${active ? 'text-emerald-100' : pending ? 'text-amber-700' : 'text-slate-400'}`}>
                  {source.processing.status !== 'completed' ? '待解析' : pending ? `${pending} 项待处理` : keyCount ? '关键内容已完成' : '无需逐条核验'}
                </span>
                <span className="mt-1 block truncate text-xs font-extrabold">{source.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {activeSource ? (
        <article className="border-b border-slate-200 bg-emerald-50/70 p-4" data-source-id={activeSource.id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-extrabold text-slate-950">{activeSource.label}</h3>
                <span className={`rounded px-2 py-1 text-[10px] font-bold ${statusTone[activeSource.processing.status]}`}>
                  {activeSource.processing.status === 'completed' ? '解析完成' : activeSource.processing.status === 'failed' ? '解析失败' : activeSource.processing.status === 'running' ? '正在解析' : '等待解析'}
                </span>
              </div>
              <p className="mt-1 truncate text-[10px] text-slate-500">{activeSource.originalFileName || activeSource.label}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button className="inline-flex h-8 items-center gap-2 rounded-md border border-emerald-700 bg-emerald-700 px-2.5 text-xs font-bold text-white" type="button" aria-pressed="true" aria-label={`正在查看 ${activeSource.label}`} onClick={() => onSelectSource(activeSource.id)}><Eye aria-hidden="true" className="h-3.5 w-3.5" />正在查看</button>
              <button className="inline-flex h-8 items-center gap-2 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-bold text-slate-700 disabled:opacity-40" type="button" disabled={busy || activeSource.processing.status === 'running'} onClick={() => onProcessSource(activeSource.id)}><RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />{activeSource.processing.status === 'idle' || activeSource.processing.status === 'pending' ? '解析这份素材' : '重新解析'}</button>
            </div>
          </div>
          {activeSource.processing.error ? <p className="mt-3 flex items-start gap-2 rounded-md bg-rose-50 px-3 py-2 text-xs font-bold leading-relaxed text-rose-800"><TriangleAlert aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />{activeSource.processing.error}</p> : null}
          <dl className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            <div><dt className="font-bold text-slate-400">关键主张</dt><dd className="mt-1 font-extrabold">{activeKeyFacts.length} 条</dd></div>
            <div><dt className="font-bold text-slate-400">高风险问题</dt><dd className="mt-1 font-extrabold">{activeRequiredUncertainties.length} 条</dd></div>
            <div><dt className="font-bold text-slate-400">其他提取</dt><dd className="mt-1 font-extrabold">{otherFacts.length + otherUncertainties.length} 条</dd></div>
            <div><dt className="font-bold text-slate-400">当前进度</dt><dd className="mt-1 font-extrabold">{confirmedFacts + rejectedFacts} / {activeKeyFacts.length}</dd></div>
          </dl>
          {activeSource.analysis.extractedText ? <details className="mt-3 rounded-md border border-slate-200"><summary className="cursor-pointer px-3 py-2 text-xs font-bold text-slate-700">查看解析正文</summary><pre className="max-h-64 overflow-auto whitespace-pre-wrap border-t border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">{activeSource.analysis.extractedText}</pre></details> : null}
          {activeSource.analysis.transcript.length ? (
            <details className="mt-3 rounded-md border border-slate-200">
              <summary className="cursor-pointer px-3 py-2 text-xs font-bold text-slate-700">校对本地转录</summary>
              <div className="space-y-3 border-t border-slate-200 p-3">
                {activeSource.analysis.transcript.map((segment) => (
                  <label className="block" key={segment.id}>
                    <span className="font-mono text-[10px] font-bold text-slate-500">{segment.start.toFixed(2)}s - {segment.end.toFixed(2)}s</span>
                    <textarea aria-label={`${activeSource.label} ${segment.start.toFixed(2)} 到 ${segment.end.toFixed(2)} 秒转录`} className="mt-1.5 min-h-20 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm leading-relaxed text-slate-900 focus-visible:border-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200" value={segment.text} onChange={(event) => onUpdateSource(activeSource.id, { analysis: { ...activeSource.analysis, transcript: activeSource.analysis.transcript.map((item) => item.id === segment.id ? { ...item, text: event.target.value } : item) } })} />
                  </label>
                ))}
              </div>
            </details>
          ) : null}
        </article>
      ) : <p className="p-6 text-sm text-slate-500">先在素材库导入本地资料。</p>}

      <div className="grid lg:grid-cols-2">
        <div className="border-b border-slate-200 p-4 lg:border-b-0 lg:border-r">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><h3 className="text-xs font-extrabold text-slate-950">需要确认的关键主张</h3><p className="mt-1 text-[10px] text-slate-500">只有确认后的主张会进入 AI 脚本</p></div>
            <button className="inline-flex h-7 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 text-[10px] font-extrabold text-slate-700 disabled:opacity-40" type="button" disabled={proposedFacts === 0} onClick={() => activeSource && onConfirmSourceFacts(activeSource.id)}><CheckCheck aria-hidden="true" className="h-3 w-3" />确认当前关键主张</button>
          </div>
          <div className="mt-2">
            {activeKeyFacts.map((fact) => <FactRow key={fact.id} fact={fact} sources={project.sources} keyFact onUpdate={(patch) => onUpdateFact(fact.id, patch)} onSelectSource={onSelectSource} />)}
            {!activeKeyFacts.length ? <p className="rounded-md bg-slate-50 px-3 py-4 text-xs leading-relaxed text-slate-600">这份素材主要提供画面或补充信息，无需逐条确认。需要时可从下方完整提取结果中手动设为关键主张。</p> : null}
          </div>
        </div>
        <div className="p-4">
          <div><h3 className="text-xs font-extrabold text-slate-950">需要处理的高风险问题</h3><p className="mt-1 text-[10px] text-slate-500">只保留会改变脚本准确性或核心结论的问题</p></div>
          <div className="mt-2">
            {activeRequiredUncertainties.map((item) => <UncertaintyRow key={item.id} item={item} sources={project.sources} required onUpdate={(patch) => onUpdateUncertainty(item.id, patch)} onSelectSource={onSelectSource} />)}
            {!activeRequiredUncertainties.length ? <p className="rounded-md bg-slate-50 px-3 py-4 text-xs text-slate-600">这份素材没有需要阻塞脚本的高风险问题。</p> : null}
          </div>
        </div>
      </div>

      {(otherFacts.length || otherUncertainties.length) ? (
        <details className="border-t border-slate-200 bg-slate-50">
          <summary className="cursor-pointer px-4 py-3 text-xs font-extrabold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">完整提取结果 · 其余 {otherFacts.length + otherUncertainties.length} 条，不阻塞脚本</summary>
          <div className="grid border-t border-slate-200 bg-white lg:grid-cols-2">
            <div className="border-b border-slate-200 px-4 lg:border-b-0 lg:border-r">
              {otherFacts.map((fact) => <FactRow key={fact.id} fact={fact} sources={project.sources} keyFact={false} onUpdate={(patch) => onUpdateFact(fact.id, patch)} onSelectSource={onSelectSource} />)}
              {!otherFacts.length ? <p className="py-4 text-xs text-slate-500">没有其他事实提取。</p> : null}
            </div>
            <div className="px-4">
              {otherUncertainties.map((item) => <UncertaintyRow key={item.id} item={item} sources={project.sources} required={false} onUpdate={(patch) => onUpdateUncertainty(item.id, patch)} onSelectSource={onSelectSource} />)}
              {!otherUncertainties.length ? <p className="py-4 text-xs text-slate-500">没有其他疑问。</p> : null}
            </div>
          </div>
        </details>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-emerald-50 px-4 py-3">
        <p className="text-xs font-bold leading-relaxed text-emerald-900">
          {!review.allSourcesProcessed
            ? `素材已解析 ${review.completedSources} / ${project.sources.length} 份。`
            : review.pendingFacts.length
              ? `还有 ${review.pendingFacts.length} 条关键主张待确认。`
              : review.unresolvedUncertainties.length
                ? `还有 ${review.unresolvedUncertainties.length} 条高风险问题待处理。`
                : !review.confirmedFacts.length
                  ? '至少确认一条关键主张后才能生成脚本。'
                  : '关键内容已完成核验，可以生成脚本草案。'}
        </p>
        <button className="inline-flex h-9 items-center gap-2 rounded-md bg-emerald-700 px-3 text-xs font-extrabold text-white disabled:bg-slate-400" type="button" disabled={!review.ready} onClick={onContinue}>下一步：生成脚本<ArrowRight aria-hidden="true" className="h-3.5 w-3.5" /></button>
      </div>
    </section>
  );
}
