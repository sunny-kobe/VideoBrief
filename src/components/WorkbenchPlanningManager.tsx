import { ArrowLeft, ArrowRight, BrainCircuit, Check, Image, Sparkles, Trash2, TriangleAlert, WandSparkles } from 'lucide-react';
import { Fragment } from 'react';
import type { ShortVideoProject } from '@/src/shortVideoBrief';
import { researchReviewSummary } from '@/src/researchReview';

interface WorkbenchPlanningManagerProps {
  project: ShortVideoProject;
  aiAvailable: boolean;
  busy: boolean;
  onGenerateNarrative: () => void;
  onApplyNarrative: () => void;
  onDiscardNarrative: () => void;
  onGenerateCandidates: () => void;
  onGenerateAssets: () => void;
  onSelectCandidate: (sceneId: string, candidateId: string) => void;
  onReviewResearch: () => void;
  onContinue: () => void;
}

export default function WorkbenchPlanningManager({
  project,
  aiAvailable,
  busy,
  onGenerateNarrative,
  onApplyNarrative,
  onDiscardNarrative,
  onGenerateCandidates,
  onGenerateAssets,
  onSelectCandidate,
  onReviewResearch,
  onContinue,
}: WorkbenchPlanningManagerProps) {
  const draft = project.narrative.pendingDraft;
  const review = researchReviewSummary(project);
  const researchReady = review.ready;
  const displayedScenes = draft || project.narrative.pendingScenes.length
    ? project.narrative.pendingScenes
    : project.narrative.activeVersionId
      ? project.scenes
      : [];
  const displayedChapters = draft || project.narrative.pendingChapters.length
    ? project.narrative.pendingChapters
    : project.chapters;
  return (
    <section className="min-w-0 overflow-hidden rounded-md border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-3">
          <WandSparkles aria-hidden="true" className="h-4 w-4 text-slate-600" />
          <div>
            <h2 className="text-sm font-extrabold text-slate-950">生成并确认脚本</h2>
            <p className="mt-1 text-xs text-slate-500">只使用已经人工确认的事实生成原创叙事和场景</p>
          </div>
        </div>
        <span className={`rounded px-2.5 py-1.5 text-xs font-extrabold ${aiAvailable ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>{aiAvailable ? 'AI 服务已配置' : 'AI 服务未配置'}</span>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 bg-slate-50 p-4">
        <button className="inline-flex h-9 items-center gap-2 rounded-md bg-slate-950 px-3 text-xs font-extrabold text-white disabled:bg-slate-400" type="button" disabled={busy || !aiAvailable || !researchReady} onClick={onGenerateNarrative}><BrainCircuit aria-hidden="true" className="h-3.5 w-3.5" />生成脚本草案</button>
        <button className="inline-flex h-9 items-center gap-2 rounded-md border border-emerald-700 bg-emerald-700 px-3 text-xs font-extrabold text-white disabled:border-slate-300 disabled:bg-slate-300" type="button" disabled={busy || !draft || !researchReady} onClick={onApplyNarrative}><Check aria-hidden="true" className="h-3.5 w-3.5" />确认并应用草案</button>
        <button className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-xs font-extrabold text-slate-700 disabled:opacity-40" type="button" disabled={busy || !draft} onClick={onDiscardNarrative}><Trash2 aria-hidden="true" className="h-3.5 w-3.5" />丢弃草案</button>
      </div>

      {!researchReady ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3">
          <p className="flex items-start gap-2 text-xs font-bold leading-relaxed text-amber-900">
            <TriangleAlert aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {!review.allSourcesProcessed
              ? '还有素材未完成解析。'
              : review.pendingFacts.length > 0
                ? `还有 ${review.pendingFacts.length} 条关键主张待确认。脚本不会使用未经确认的内容。`
                : review.unresolvedUncertainties.length > 0
                  ? `还有 ${review.unresolvedUncertainties.length} 条高风险问题待处理。`
                  : '至少确认一条关键主张后才能生成脚本。'}
          </p>
          <button className="inline-flex h-8 items-center gap-2 rounded-md border border-amber-700 bg-white px-2.5 text-xs font-extrabold text-amber-900" type="button" onClick={onReviewResearch}>
            <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
            返回关键核验
          </button>
        </div>
      ) : null}

      {project.narrative.error ? <p className="border-b border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-800">{project.narrative.error}</p> : null}

      {!draft && project.narrative.pendingChapters.length ? (
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-extrabold text-slate-900">
            逐章策划：{project.narrative.pendingChapters.filter((chapter) => chapter.inputHash).length} / {project.narrative.pendingChapters.length} 章完成
          </p>
          <p className="mt-1 text-[11px] text-slate-500">已完成章节会保留并按输入哈希复用。</p>
        </div>
      ) : null}

      <div className="grid lg:grid-cols-2">
        <div className="border-b border-slate-200 p-4 lg:border-b-0 lg:border-r">
          <h3 className="text-xs font-extrabold text-slate-950">叙事版本</h3>
          {draft ? (
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3">
              <p className="text-[10px] font-extrabold uppercase text-amber-700">待人工应用</p>
              <p className="mt-2 text-sm font-extrabold text-amber-950">{draft.conclusion}</p>
              <p className="mt-2 text-xs leading-relaxed text-amber-900">{draft.hook}</p>
              <p className="mt-3 text-[10px] text-amber-700">{project.narrative.pendingScenes.length} 个场景 · AI 草案</p>
              <ol className="mt-3 space-y-1 border-t border-amber-200 pt-3 text-xs leading-relaxed text-amber-950">
                {draft.outline.map((item, index) => <li key={`${index}-${item}`}>{index + 1}. {item}</li>)}
              </ol>
              <div className="mt-3 border-t border-amber-200 pt-3">
                <p className="text-[10px] font-extrabold text-amber-800">来源依据</p>
                <div className="mt-1 space-y-1">
                  {draft.sourceReferences.map((reference, index) => (
                    <p className="text-[11px] leading-relaxed text-amber-900" key={`${reference.sourceId}-${index}`}>
                      <span className="font-mono font-bold">{reference.sourceId} · {reference.locatorType}</span> {reference.note}
                    </p>
                  ))}
                </div>
              </div>
              {draft.uncertainties.length ? (
                <div className="mt-3 border-t border-amber-200 pt-3">
                  <p className="text-[10px] font-extrabold text-amber-800">待确认风险</p>
                  <ul className="mt-1 space-y-1 text-[11px] leading-relaxed text-amber-900">
                    {draft.uncertainties.map((item, index) => <li key={`${index}-${item}`}>{index + 1}. {item}</li>)}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="mt-3 space-y-2">
            {project.narrative.versions.map((version) => (
              <div className="rounded-md border border-slate-200 p-3" key={version.id}>
                <p className="text-xs font-bold text-slate-900">{version.conclusion}</p>
                <p className="mt-2 font-mono text-[10px] text-slate-500">{version.id} · {version.model}</p>
              </div>
            ))}
            {!draft && !project.narrative.versions.length ? <p className="text-xs text-slate-500">尚未生成叙事。</p> : null}
          </div>
        </div>

        <div className="p-4">
          <h3 className="text-xs font-extrabold text-slate-950">{draft ? '待审场景' : '已应用场景'}</h3>
          <div className="mt-3 space-y-3">
            {displayedScenes.map((scene, sceneIndex) => {
              const chapter = displayedChapters.find((item) => item.id === scene.chapterId);
              const showChapterHeader = Boolean(chapter && displayedScenes[sceneIndex - 1]?.chapterId !== scene.chapterId);
              return (
              <Fragment key={scene.id}>
              {showChapterHeader ? (
                <div className="border-y border-slate-300 bg-slate-100 px-3 py-2.5">
                  <p className="text-[10px] font-extrabold uppercase text-emerald-700">章节 {chapter!.order + 1}</p>
                  <div className="mt-0.5 flex items-baseline justify-between gap-3">
                    <h4 className="min-w-0 truncate text-xs font-extrabold text-slate-950">{chapter!.title}</h4>
                    <span className="shrink-0 font-mono text-[10px] font-bold text-slate-500">{chapter!.targetDurationSeconds ? `${chapter!.targetDurationSeconds}s` : ''}</span>
                  </div>
                  {chapter!.objective ? <p className="mt-1 text-[11px] leading-relaxed text-slate-600">{chapter!.objective}</p> : null}
                </div>
              ) : null}
              <div className="rounded-md border border-slate-200 p-3">
                <p className="text-xs font-extrabold text-slate-900">{sceneIndex + 1}. {scene.title}</p>
                <p className="mt-1 text-xs font-bold leading-relaxed text-slate-700">{scene.subtitle}</p>
                <p className="mt-2 text-xs leading-relaxed text-slate-600">{scene.narration || '尚未填写旁白'}</p>
                <p className="mt-2 border-l-2 border-slate-300 pl-2 text-[11px] leading-relaxed text-slate-500">{scene.visualRequirement || '尚未填写画面需求'}</p>
                <div className="mt-2 space-y-1">
                  {scene.sourceReferences.map((reference, index) => (
                    <p className="text-[10px] leading-relaxed text-slate-500" key={`${reference.sourceId}-${index}`}>
                      <span className="font-mono font-bold">{reference.sourceId} · {reference.locatorType}</span> {reference.note}
                    </p>
                  ))}
                </div>
                <div className="mt-3 space-y-2">
                  {scene.candidates.map((candidate) => {
                    const selected = scene.selectedCandidateId === candidate.id;
                    return draft ? (
                      <div className="w-full rounded-md border border-slate-200 bg-slate-50 p-2.5 text-left" key={candidate.id}>
                        <span className="block text-xs font-bold text-slate-900">{candidate.sourceId} · {candidate.mediaType}</span>
                        <span className="mt-1 block text-[11px] leading-relaxed text-slate-600">{candidate.matchReason}</span>
                        <span className="mt-1 block font-mono text-[10px] text-slate-400">{candidate.rightsStatus} · {candidate.sourceStart.toFixed(1)}-{candidate.sourceEnd.toFixed(1)}s</span>
                      </div>
                    ) : (
                      <button className={`w-full rounded-md border p-2.5 text-left ${selected ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white'}`} type="button" key={candidate.id} onClick={() => onSelectCandidate(scene.id, candidate.id)}>
                        <span className="block text-xs font-bold text-slate-900">{candidate.sourceId} · {candidate.mediaType}</span>
                        <span className="mt-1 block text-[11px] leading-relaxed text-slate-600">{candidate.matchReason}</span>
                        <span className="mt-1 block font-mono text-[10px] text-slate-400">{candidate.rightsStatus} · {candidate.sourceStart.toFixed(1)}-{candidate.sourceEnd.toFixed(1)}s</span>
                      </button>
                    );
                  })}
                  {!scene.candidates.length ? <p className="text-xs text-slate-500">尚无候选。</p> : null}
                </div>
              </div>
              </Fragment>
              );
            })}
            {!displayedScenes.length ? <p className="text-xs leading-relaxed text-slate-500">生成脚本后会在这里看到完整场景草案；导入素材时创建的占位场景不会当作脚本。</p> : null}
          </div>
        </div>
      </div>
      <details className="border-t border-slate-200">
        <summary className="cursor-pointer px-4 py-3 text-xs font-extrabold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">可选：继续使用 AI 准备候选画面和发布文案</summary>
        <div className="flex flex-wrap gap-2 border-t border-slate-200 bg-slate-50 p-4">
          <button className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-xs font-extrabold text-slate-700 disabled:opacity-40" type="button" disabled={busy || !researchReady || !project.scenes.length} onClick={onGenerateCandidates}><Image aria-hidden="true" className="h-3.5 w-3.5" />推荐候选画面</button>
          <button className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-xs font-extrabold text-slate-700 disabled:opacity-40" type="button" disabled={busy || !researchReady || !project.scenes.length} onClick={onGenerateAssets}><Sparkles aria-hidden="true" className="h-3.5 w-3.5" />生成封面与文案草稿</button>
        </div>
      </details>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-emerald-50 px-4 py-3">
        <p className="text-xs font-bold leading-relaxed text-emerald-900">
          {project.narrative.activeVersionId && !draft ? '脚本已经应用，可以继续检查和调整画面。' : '先生成并确认脚本草案。'}
        </p>
        <button className="inline-flex h-9 items-center gap-2 rounded-md bg-emerald-700 px-3 text-xs font-extrabold text-white disabled:bg-slate-400" type="button" disabled={!project.narrative.activeVersionId || Boolean(draft)} onClick={onContinue}>
          下一步：编辑画面
          <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      </div>
    </section>
  );
}
