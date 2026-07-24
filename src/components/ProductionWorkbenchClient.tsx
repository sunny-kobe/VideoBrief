'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Film,
  FolderKanban,
  ListVideo,
  RefreshCw,
  Save,
  Subtitles,
  Upload,
  WandSparkles,
} from 'lucide-react';
import ClipCandidatePrototype, {
  CandidatePrototypeVariant,
} from '@/src/components/ClipCandidatePrototype';
import WorkbenchClipManager from '@/src/components/WorkbenchClipManager';
import WorkbenchDetails from '@/src/components/WorkbenchDetails';
import WorkbenchExportManager from '@/src/components/WorkbenchExportManager';
import FinalVideoWorkspace from '@/src/components/FinalVideoWorkspace';
import WorkbenchPreview from '@/src/components/WorkbenchPreview';
import WorkbenchPlanningManager from '@/src/components/WorkbenchPlanningManager';
import WorkbenchResearchManager from '@/src/components/WorkbenchResearchManager';
import WorkbenchSourceManager from '@/src/components/WorkbenchSourceManager';
import WorkbenchSubtitleManager from '@/src/components/WorkbenchSubtitleManager';
import {
  ProductionTimeline,
  ResearchFact,
  ResearchUncertainty,
  RenderJobRecord,
  ShortVideoProject,
  ShortVideoProjectScene,
  ShortVideoSource,
  WorkbenchRenderStatus,
} from '@/src/shortVideoBrief';
import type { PersistedSourceProcessingJob } from '@/src/sourceProcessingQueue';
import {
  WorkbenchAsset,
  WorkbenchView,
  renderStatusTone,
  sceneTimings,
  workbenchSteps,
} from '@/src/workbench';
import { researchReviewSummary } from '@/src/researchReview';

export type { WorkbenchAsset } from '@/src/workbench';

interface ProductionWorkbenchClientProps {
  projectId: string;
  brief: ShortVideoProject;
  timeline: ProductionTimeline;
  assets: WorkbenchAsset[];
  srtText: string;
  renderHref: string;
  remotionHref: string;
  sourceHrefs: Record<string, string>;
  renderStatus: WorkbenchRenderStatus;
  renderJob: RenderJobRecord | null;
  initialView: WorkbenchView;
  initialSourceId: string;
  initialAdvanced: boolean;
  initialPrototype: 'clip-candidates' | null;
  initialCandidateVariant: CandidatePrototypeVariant;
  aiAvailable: boolean;
}

const projectStatusLabel: Record<ShortVideoProject['status'], string> = {
  draft: '草稿',
  review: '审核中',
  ready: '待发布',
  published: '已发布',
};

const viewItems = [
  ['sources', '素材与核验', Film],
  ['planning', '脚本', WandSparkles],
  ['clips', '画面', ListVideo],
  ['subtitles', '字幕', Subtitles],
  ['export', '导出', Upload],
] as const;

function replaceWorkbenchQuery(updates: Record<string, string | null>) {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(updates)) {
    if (value == null) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  }
  window.history.replaceState(null, '', url);
}

function nextSceneId(scenes: ShortVideoProjectScene[]) {
  const nextNumber = scenes.reduce((highest, scene) => {
    const match = /^scene-(\d+)$/.exec(scene.id);
    return Math.max(highest, match ? Number(match[1]) : 0);
  }, 0) + 1;
  return `scene-${String(nextNumber).padStart(2, '0')}`;
}

function withSyncedChapterScenes(project: ShortVideoProject, scenes: ShortVideoProjectScene[]) {
  const chapters = project.chapters.length
    ? project.chapters
    : scenes.length
      ? [{
          id: 'chapter-01',
          title: project.title,
          summary: '',
          order: 0,
          sceneIds: [],
          sourceReferences: [],
        }]
      : [];
  const fallbackChapterId = chapters[0]?.id ?? '';
  const normalizedScenes = scenes.map((scene) => ({
    ...scene,
    chapterId: chapters.some((chapter) => chapter.id === scene.chapterId)
      ? scene.chapterId
      : fallbackChapterId,
  }));
  return {
    ...project,
    scenes: normalizedScenes,
    chapters: chapters.map((chapter) => ({
      ...chapter,
      sceneIds: normalizedScenes.filter((scene) => scene.chapterId === chapter.id).map((scene) => scene.id),
    })),
  };
}

function playVideo(video: HTMLVideoElement) {
  void video.play().catch((error: unknown) => {
    if (!(error instanceof DOMException) || error.name !== 'NotAllowedError') return;
    video.muted = true;
    void video.play().catch(() => undefined);
  });
}

export default function ProductionWorkbenchClient({
  projectId,
  brief,
  timeline,
  assets,
  srtText,
  renderHref,
  remotionHref,
  sourceHrefs,
  renderStatus,
  renderJob,
  initialView,
  initialSourceId,
  initialAdvanced,
  initialPrototype,
  initialCandidateVariant,
  aiAvailable,
}: ProductionWorkbenchClientProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [persistedProject, setPersistedProject] = useState(brief);
  const [draftProject, setDraftProject] = useState(brief);
  const [activeSceneId, setActiveSceneId] = useState(brief.scenes[0]?.id ?? '');
  const [activeSourceId, setActiveSourceId] = useState(initialSourceId);
  const [view, setView] = useState<WorkbenchView>(initialView);
  const [prototypeMode, setPrototypeMode] = useState<'clip-candidates' | null>(initialPrototype);
  const [candidateVariant, setCandidateVariant] = useState<CandidatePrototypeVariant>(initialCandidateVariant);
  const [advancedMode, setAdvancedMode] = useState(initialAdvanced);
  const [previewMode, setPreviewMode] = useState<'render' | 'source'>(
    initialView === 'sources' || initialView === 'research' || !renderHref ? 'source' : 'render',
  );
  const [currentRenderStatus, setCurrentRenderStatus] = useState(renderStatus);
  const [currentRenderJob, setCurrentRenderJob] = useState(renderJob);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'rendering' | 'error'>('idle');
  const [statusText, setStatusText] = useState('');
  const [projectAction, setProjectAction] = useState('');

  const renderedById = useMemo(
    () => new Map(timeline.scenes.map((scene) => [scene.id, scene])),
    [timeline.scenes],
  );
  const timings = useMemo(() => sceneTimings(draftProject, timeline), [draftProject, timeline]);
  const foundSceneIndex = draftProject.scenes.findIndex((scene) => scene.id === activeSceneId);
  const activeSceneIndex = foundSceneIndex >= 0 ? foundSceneIndex : 0;
  const activeScene = foundSceneIndex >= 0 ? draftProject.scenes[foundSceneIndex] : undefined;
  const renderedScene = activeScene ? renderedById.get(activeScene.id) : undefined;
  const sceneSource = draftProject.sources.find((source) => source.id === activeScene?.sourceId);
  const detailSource = draftProject.sources.find((source) => source.id === activeSourceId);
  const sourceFocusedView = view === 'sources' || view === 'research';
  const previewSource = sourceFocusedView ? detailSource : sceneSource;
  const sourceHref = previewSource ? sourceHrefs[previewSource.id] ?? '' : '';
  const dirty = useMemo(
    () => JSON.stringify(draftProject) !== JSON.stringify(persistedProject),
    [draftProject, persistedProject],
  );
  const visibleRenderStatus: WorkbenchRenderStatus = dirty
    ? {
        state: currentRenderStatus.state === 'missing' ? 'missing' : 'stale',
        label: '有未保存修改',
        message: currentRenderStatus.state === 'missing'
          ? '先保存项目，再渲染并执行技术验收。'
          : '保存并重新渲染后，成片才会对应当前项目。',
        duration: currentRenderStatus.duration,
        renderedAt: currentRenderStatus.renderedAt,
      }
    : currentRenderStatus;
  const statusTone = renderStatusTone[visibleRenderStatus.state];
  const reviewSummary = researchReviewSummary(draftProject);
  const stepView = view === 'research' ? 'sources' : view;
  const currentStepIndex = Math.max(0, workbenchSteps.findIndex((step) => step.view === stepView));
  const currentStep = workbenchSteps[currentStepIndex];
  const nextStep = workbenchSteps[currentStepIndex + 1];
  const canAdvance = view === 'sources'
    ? draftProject.materialReview.status === 'approved'
    : view === 'research'
      ? reviewSummary.ready
      : view === 'planning'
        ? draftProject.scenes.length > 0 && !draftProject.narrative.pendingDraft
        : view === 'clips'
          ? draftProject.scenes.length > 0 && draftProject.scenes.filter((scene) => scene.enabled).every((scene) => (
              scene.selectionStatus === 'codex_reviewed' || scene.selectionStatus === 'user_approved'
            ))
          : view === 'subtitles'
            ? draftProject.scenes.length > 0
          : false;
  const renderBlockReason = !draftProject.sources.length
    ? '请先导入素材。'
    : draftProject.materialReview.status !== 'approved'
      ? '请先预览并确认包含真实视频的素材包。'
    : !draftProject.scenes.length
      ? '请先生成或添加场景。'
      : reviewSummary.pendingFacts.length > 0
        ? `还有 ${reviewSummary.pendingFacts.length} 条关键主张待确认。`
        : reviewSummary.unresolvedUncertainties.length > 0
          ? `还有 ${reviewSummary.unresolvedUncertainties.length} 条高风险问题待处理。`
          : draftProject.rights_status === 'blocked'
            ? '项目包含禁止使用的素材。'
            : draftProject.scenes.some((scene) => !draftProject.sources.some((source) => source.id === scene.sourceId))
              ? '有场景尚未选择有效素材。'
              : draftProject.scenes.some((scene) => scene.enabled && (
                  scene.selectionStatus !== 'codex_reviewed' && scene.selectionStatus !== 'user_approved'
                ))
                ? '每个参与成片的画面都必须经过 Codex 复核或用户确认。'
                : '';
  const showPreviewPanel = advancedMode && view !== 'sources' && (sourceFocusedView
    ? Boolean(previewSource)
    : view !== 'planning' || Boolean(draftProject.narrative.activeVersionId && activeScene));

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedScene = params.get('scene');
    const requestedSource = params.get('source');
    const requestedView = params.get('view') as WorkbenchView | null;
    const legacyPanel = params.get('panel');
    const requestedPrototype = params.get('prototype');
    const requestedVariant = params.get('candidateLayout');
    if (requestedScene && brief.scenes.some((scene) => scene.id === requestedScene)) {
      setActiveSceneId(requestedScene);
      const requestedSceneSource = brief.scenes.find((scene) => scene.id === requestedScene)?.sourceId;
      if (requestedSceneSource) setActiveSourceId(requestedSceneSource);
    }
    if (requestedSource && brief.sources.some((source) => source.id === requestedSource)) {
      setActiveSourceId(requestedSource);
    }
    if (requestedView === 'research' || (requestedView && viewItems.some(([value]) => value === requestedView))) {
      setView(requestedView);
    } else if (legacyPanel === 'source') {
      setView('sources');
    } else if (legacyPanel === 'qa') {
      setView('export');
    }
    if (requestedPrototype === 'clip-candidates') setPrototypeMode('clip-candidates');
    if (requestedVariant === 'compare' || requestedVariant === 'ranked') {
      setCandidateVariant(requestedVariant);
    }
  }, [brief.scenes, brief.sources]);

  useEffect(() => {
    const warnBeforeLeave = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warnBeforeLeave);
    return () => window.removeEventListener('beforeunload', warnBeforeLeave);
  }, [dirty]);

  function markChanged() {
    setSaveState('idle');
    setStatusText('');
  }

  function selectScene(sceneId: string) {
    setActiveSceneId(sceneId);
    const sourceId = draftProject.scenes.find((scene) => scene.id === sceneId)?.sourceId;
    if (sourceId) setActiveSourceId(sourceId);
    replaceWorkbenchQuery({ scene: sceneId });
  }

  function selectClip(sceneId: string) {
    selectScene(sceneId);
    if (window.matchMedia('(max-width: 1023px)').matches) {
      window.setTimeout(() => document.getElementById('clip-editor')?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  }

  function changeView(nextView: WorkbenchView) {
    setView(nextView);
    setPrototypeMode(null);
    if (nextView === 'sources' || nextView === 'research' || (!renderHref && nextView !== 'export')) {
      if (!detailSource && draftProject.sources[0]) setActiveSourceId(draftProject.sources[0].id);
      setPreviewMode('source');
    }
    replaceWorkbenchQuery({
      view: nextView,
      panel: null,
      prototype: null,
      candidateLayout: null,
    });
  }

  function updateSceneById(sceneId: string, patch: Partial<ShortVideoProjectScene>) {
    markChanged();
    setDraftProject((current) => ({
      ...current,
      scenes: current.scenes.map((scene) => scene.id === sceneId ? { ...scene, ...patch, userEdited: true } : scene),
    }));
  }

  function acceptServerProject(project: ShortVideoProject) {
    setDraftProject(project);
    setPersistedProject(project);
    if (project.technical_status === 'not_rendered') {
      setCurrentRenderStatus({
        state: 'missing',
        label: '尚未渲染',
        message: '保存分镜后运行生产渲染，才会生成可验收成片。',
      });
    } else if (project.technical_status === 'stale') {
      setCurrentRenderStatus((current) => ({
        state: 'stale',
        label: '成片已过期',
        message: '项目文件已修改，当前 MP4 不再对应最新分镜。',
        duration: current.duration,
        renderedAt: current.renderedAt,
      }));
    } else if (project.technical_status === 'failed') {
      setCurrentRenderStatus((current) => ({
        state: 'unverified',
        label: '技术验收失败',
        message: '最近一次技术验收失败，请查看 render job 错误并重试。',
        duration: current.duration,
        renderedAt: current.renderedAt,
      }));
    }
    if (!project.scenes.some((scene) => scene.id === activeSceneId)) {
      setActiveSceneId(project.scenes[0]?.id ?? '');
    }
    if (!project.sources.some((source) => source.id === activeSourceId)) {
      setActiveSourceId(project.sources[0]?.id ?? '');
    }
  }

  async function runProjectAction(
    action: string,
    path: string,
    options: RequestInit = { method: 'POST' },
  ) {
    setProjectAction(action);
    setStatusText(`${action}…`);
    setSaveState('idle');
    try {
      const response = await fetch(path, options);
      const payload = await response.json();
      if (payload.project) acceptServerProject(payload.project as ShortVideoProject);
      if (!response.ok) throw new Error(payload.error ?? `${action}失败`);
      if (Array.isArray(payload.failures) && payload.failures.length) {
        throw new Error(payload.failures.map((item: { sourceId: string; error: string }) => `${item.sourceId}: ${item.error}`).join('；'));
      }
      setStatusText(`${action}完成。`);
      return payload;
    } catch (error) {
      setSaveState('error');
      setStatusText(error instanceof Error ? error.message : `${action}失败`);
      return null;
    } finally {
      setProjectAction('');
    }
  }

  async function runSourceProcessing(action: string, path: string) {
    setProjectAction(action);
    setStatusText(`${action}：正在加入持久化队列…`);
    setSaveState('idle');
    try {
      const response = await fetch(path, { method: 'POST' });
      const payload = await response.json();
      if (payload.project) acceptServerProject(payload.project as ShortVideoProject);
      if (!response.ok) throw new Error(payload.error ?? `${action}入队失败`);
      const jobs = (Array.isArray(payload.jobs) ? payload.jobs : payload.job ? [payload.job] : []) as PersistedSourceProcessingJob[];
      const jobIds = new Set(jobs.map((job) => job.jobId));
      if (!jobIds.size) {
        setStatusText(`${action}：没有需要执行的任务。`);
        return;
      }

      while (true) {
        await new Promise((resolvePromise) => window.setTimeout(resolvePromise, 750));
        const statusResponse = await fetch(`/api/projects/${encodeURIComponent(projectId)}/process`, { cache: 'no-store' });
        const statusPayload = await statusResponse.json();
        if (statusPayload.project) acceptServerProject(statusPayload.project as ShortVideoProject);
        if (!statusResponse.ok) throw new Error(statusPayload.error ?? '无法读取资料处理任务状态。');
        const currentJobs = (statusPayload.jobs as PersistedSourceProcessingJob[])
          .filter((job) => jobIds.has(job.jobId));
        const active = currentJobs.filter((job) => ['queued', 'running', 'cancelling'].includes(job.state));
        const currentProject = statusPayload.project as ShortVideoProject;
        const progress = currentProject.sources
          .filter((source) => currentJobs.some((job) => job.sourceId === source.id))
          .map((source) => {
            const chapterProgress = source.processing.chapterProgress;
            return chapterProgress?.total
              ? `${source.label} ${chapterProgress.completed}/${chapterProgress.total} 章`
              : source.label;
          });
        if (active.length) {
          const queuedCount = active.filter((job) => job.state === 'queued').length;
          setStatusText(`${action}：${progress.join('；')}${queuedCount ? `；${queuedCount} 项等待执行` : ''}…`);
          continue;
        }
        const failed = currentJobs.find((job) => job.state === 'failed');
        if (failed) throw new Error(failed.error || '资料处理失败');
        const cancelled = currentJobs.filter((job) => job.state === 'cancelled').length;
        setStatusText(cancelled ? `${action}已取消，已完成章节继续保留。` : `${action}完成。`);
        break;
      }
    } catch (error) {
      setSaveState('error');
      setStatusText(error instanceof Error ? error.message : `${action}失败`);
    } finally {
      setProjectAction('');
    }
  }

  function processSource(sourceId: string) {
    void runSourceProcessing(
      '处理来源',
      `/api/projects/${encodeURIComponent(projectId)}/sources/${encodeURIComponent(sourceId)}/process`,
    );
  }

  function processAllSources() {
    void runSourceProcessing('处理全部来源', `/api/projects/${encodeURIComponent(projectId)}/process`);
  }

  async function cancelSourceProcessing(sourceId: string) {
    setStatusText('正在取消资料处理任务…');
    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/sources/${encodeURIComponent(sourceId)}/process`,
        { method: 'DELETE' },
      );
      const payload = await response.json();
      if (payload.project) acceptServerProject(payload.project as ShortVideoProject);
      if (!response.ok) throw new Error(payload.error ?? '取消资料处理失败');
      setStatusText('已发送取消请求；已完成章节会保留。');
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : '取消资料处理失败');
    }
  }

  async function approveMaterials(sourceIds: string[]) {
    const payload = await runProjectAction(
      '确认素材包',
      `/api/projects/${encodeURIComponent(projectId)}/material-review`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sourceIds }),
      },
    );
    if (!payload) throw new Error('素材包确认失败，请查看页面状态提示。');
  }

  async function projectSavedForAction() {
    if (!dirty) return persistedProject;
    return saveProject();
  }

  async function generateNarrative() {
    if (!await projectSavedForAction()) return;
    await runProjectAction('生成叙事草案', `/api/projects/${encodeURIComponent(projectId)}/narrative`);
  }

  async function applyNarrative() {
    const savedProject = await projectSavedForAction();
    if (!savedProject) return;
    if (!savedProject.narrative.pendingDraft) {
      setStatusText('研究资料已修改，旧待审草案已失效；请重新生成叙事。');
      return;
    }
    const confirmReplace = !savedProject.scenes.length || window.confirm('应用 AI 草案会替换当前场景。继续？');
    if (!confirmReplace) return;
    await runProjectAction(
      '应用叙事草案',
      `/api/projects/${encodeURIComponent(projectId)}/narrative/apply`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirmReplace: true }),
      },
    );
  }

  async function discardNarrative() {
    const savedProject = await projectSavedForAction();
    if (!savedProject?.narrative.pendingDraft) {
      setStatusText('当前没有待审叙事草案。');
      return;
    }
    if (!window.confirm('丢弃当前待审叙事草案？已应用版本和当前场景不会改变。')) return;
    await runProjectAction(
      '丢弃叙事草案',
      `/api/projects/${encodeURIComponent(projectId)}/narrative`,
      { method: 'DELETE' },
    );
  }

  async function generateCandidates() {
    if (!await projectSavedForAction()) return;
    await runProjectAction('推荐候选画面', `/api/projects/${encodeURIComponent(projectId)}/candidates`);
  }

  async function generateAssets() {
    if (!await projectSavedForAction()) return;
    await runProjectAction('生成生产资产草稿', `/api/projects/${encodeURIComponent(projectId)}/production-assets`);
  }

  function selectCandidate(sceneId: string, candidateId: string) {
    const scene = draftProject.scenes.find((item) => item.id === sceneId);
    const candidate = scene?.candidates.find((item) => item.id === candidateId);
    if (!scene || !candidate) return;
    updateSceneById(sceneId, {
      selectedCandidateId: candidate.id,
      selectionStatus: 'ai_suggested',
      selectionReviewedAt: '',
      selectionNote: '已选择候选，仍需明确确认当前画面。',
      sourceId: candidate.sourceId,
      sourceStart: candidate.sourceStart,
      sourceEnd: candidate.sourceEnd,
    });
  }

  function updateActiveScene(patch: Partial<ShortVideoProjectScene>) {
    if (!activeScene) return;
    const sourceChanged = patch.sourceId != null && patch.sourceId !== activeScene.sourceId;
    const timingChanged = (
      (patch.sourceStart != null && patch.sourceStart !== activeScene.sourceStart) ||
      (patch.sourceEnd != null && patch.sourceEnd !== activeScene.sourceEnd)
    );
    updateSceneById(activeScene.id, sourceChanged
      ? {
          ...patch,
          candidates: [],
          selectedCandidateId: '',
          selectionStatus: 'unselected',
          selectionReviewedAt: '',
          selectionNote: '',
        }
      : timingChanged
        ? {
            ...patch,
            selectedCandidateId: '',
            selectionStatus: 'unselected',
            selectionReviewedAt: '',
            selectionNote: '',
          }
        : patch);
    if (patch.sourceId) setActiveSourceId(patch.sourceId);
  }

  function confirmActiveSceneVisual() {
    if (!activeScene) return;
    const source = draftProject.sources.find((item) => item.id === activeScene.sourceId);
    if (!source || (source.sourceType !== 'video' && source.sourceType !== 'image')) {
      setSaveState('error');
      setStatusText('请先为当前片段选择图片或视频素材。');
      return;
    }
    const matchingCandidate = activeScene.candidates.find((candidate) => (
      candidate.sourceId === activeScene.sourceId &&
      candidate.sourceStart === activeScene.sourceStart &&
      candidate.sourceEnd === activeScene.sourceEnd
    ));
    const candidate = matchingCandidate ?? {
      id: `candidate-user-${Date.now()}`,
      sourceId: source.id,
      assetPath: source.assetPath,
      mediaType: source.sourceType,
      sourceStart: activeScene.sourceStart,
      sourceEnd: activeScene.sourceEnd,
      matchReason: '用户在画面编辑步骤中确认。',
      rightsStatus: source.rightsStatus,
    };
    updateSceneById(activeScene.id, {
      candidates: matchingCandidate ? activeScene.candidates : [...activeScene.candidates, candidate],
      selectedCandidateId: candidate.id,
      selectionStatus: 'user_approved',
      selectionReviewedAt: new Date().toISOString(),
      selectionNote: '用户在画面编辑步骤中预览并确认。',
      sourceReferences: activeScene.sourceReferences.some((reference) => reference.sourceId === source.id)
        ? activeScene.sourceReferences
        : [
            ...activeScene.sourceReferences,
            {
              sourceId: source.id,
              locatorType: source.sourceType === 'video' ? 'time' : 'image',
              start: source.sourceType === 'video' ? activeScene.sourceStart : undefined,
              end: source.sourceType === 'video' ? activeScene.sourceEnd : undefined,
              note: '用户确认用于当前画面的素材。',
            },
          ],
    });
    setStatusText('当前画面已确认。保存项目后，这个选片决定会写入 project.json。');
  }

  function updatePlatformCopy(patch: Partial<ShortVideoProject['platformCopy']>) {
    markChanged();
    setDraftProject((current) => ({
      ...current,
      platformCopy: { ...current.platformCopy, ...patch },
    }));
  }

  function updateAspectRatio(aspectRatio: ShortVideoProject['brief']['aspectRatio']) {
    const size = aspectRatio === '16:9'
      ? { width: 1920, height: 1080 }
      : aspectRatio === '1:1'
        ? { width: 1080, height: 1080 }
        : { width: 1080, height: 1920 };
    markChanged();
    setDraftProject((current) => ({
      ...current,
      brief: { ...current.brief, aspectRatio },
      render: { ...current.render, ...size, mediaFit: 'contain' },
    }));
  }

  function updateSource(sourceId: string, patch: Partial<ShortVideoSource>) {
    markChanged();
    setDraftProject((current) => {
      const sources = current.sources.map((source) => source.id === sourceId ? { ...source, ...patch } : source);
      return {
        ...current,
        sources,
        research: patch.analysis
          ? {
              transcripts: sources.flatMap((source) => source.analysis.transcript),
              facts: sources.flatMap((source) => source.analysis.facts),
              uncertainties: sources.flatMap((source) => source.analysis.uncertainties),
            }
          : current.research,
      };
    });
  }

  function updateResearchFact(factId: string, patch: Partial<ResearchFact>) {
    markChanged();
    setDraftProject((current) => ({
      ...current,
      sources: current.sources.map((source) => ({
        ...source,
        analysis: {
          ...source.analysis,
          facts: source.analysis.facts.map((fact) => fact.id === factId ? { ...fact, ...patch } : fact),
        },
      })),
      research: {
        ...current.research,
        facts: current.research.facts.map((fact) => fact.id === factId ? { ...fact, ...patch } : fact),
      },
    }));
  }

  function updateResearchUncertainty(uncertaintyId: string, patch: Partial<ResearchUncertainty>) {
    markChanged();
    setDraftProject((current) => ({
      ...current,
      sources: current.sources.map((source) => ({
        ...source,
        analysis: {
          ...source.analysis,
          uncertainties: source.analysis.uncertainties.map((item) => (
            item.id === uncertaintyId ? { ...item, ...patch } : item
          )),
        },
      })),
      research: {
        ...current.research,
        uncertainties: current.research.uncertainties.map((item) => (
          item.id === uncertaintyId ? { ...item, ...patch } : item
        )),
      },
    }));
  }

  function confirmSourceProposedFacts(sourceId: string) {
    const sourceFactIds = new Set(
      draftProject.sources.find((source) => source.id === sourceId)?.analysis.facts
        .filter((fact) => reviewSummary.keyFactIds.has(fact.id))
        .map((fact) => fact.id) ?? [],
    );
    const proposedCount = draftProject.research.facts.filter((fact) => (
      sourceFactIds.has(fact.id) && fact.reviewStatus === 'proposed'
    )).length;
    if (!proposedCount) return;
    if (!window.confirm(`确认这份素材中的 ${proposedCount} 条关键主张？请先对照右侧原始素材。`)) return;
    markChanged();
    setDraftProject((current) => ({
      ...current,
      sources: current.sources.map((source) => ({
        ...source,
        analysis: {
          ...source.analysis,
          facts: source.analysis.facts.map((fact) => (
            source.id === sourceId && sourceFactIds.has(fact.id) && fact.reviewStatus === 'proposed'
              ? { ...fact, reviewStatus: 'confirmed' as const }
              : fact
          )),
        },
      })),
      research: {
        ...current.research,
        facts: current.research.facts.map((fact) => (
          sourceFactIds.has(fact.id) && fact.reviewStatus === 'proposed'
            ? { ...fact, reviewStatus: 'confirmed' as const }
            : fact
        )),
      },
    }));
  }

  function addScene() {
    const id = nextSceneId(draftProject.scenes);
    const firstVisualSource = draftProject.sources.find((source) => source.sourceType === 'video' || source.sourceType === 'image');
    const sourceId = activeScene?.sourceId ?? firstVisualSource?.id ?? '';
    const sourceStart = activeScene?.sourceEnd ?? 0;
    const newScene: ShortVideoProjectScene = {
      id,
      chapterId: activeScene?.chapterId ?? draftProject.chapters[0]?.id ?? '',
      enabled: true,
      sourceId,
      sourceStart,
      sourceEnd: sourceStart + 3,
      eyebrow: '',
      title: '新片段',
      subtitle: '',
      narration: '',
      visualRequirement: '',
      sourceReferences: sourceId
        ? [{ sourceId, locatorType: 'time', start: sourceStart, end: sourceStart + 3, note: '用户新增片段' }]
        : [],
      candidates: [],
      selectedCandidateId: '',
      selectionStatus: 'unselected',
      selectionReviewedAt: '',
      selectionNote: '',
      generatedBy: 'user',
      userEdited: true,
    };
    markChanged();
    setDraftProject((current) => {
      const scenes = [...current.scenes];
      const chapterId = newScene.chapterId;
      const lastChapterSceneIndex = scenes.reduce(
        (lastIndex, scene, index) => scene.chapterId === chapterId ? index : lastIndex,
        -1,
      );
      scenes.splice(lastChapterSceneIndex + 1, 0, newScene);
      return withSyncedChapterScenes(current, scenes);
    });
    setActiveSceneId(id);
    replaceWorkbenchQuery({ view: 'clips', scene: id });
    if (window.matchMedia('(max-width: 1023px)').matches) {
      window.setTimeout(() => document.getElementById('clip-editor')?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  }

  function duplicateScene(sceneId: string) {
    const index = draftProject.scenes.findIndex((scene) => scene.id === sceneId);
    if (index < 0) return;
    const id = nextSceneId(draftProject.scenes);
    const original = draftProject.scenes[index];
    const duplicate = {
      ...original,
      id,
      title: `${original.title || '未命名片段'}（副本）`,
      selectionStatus: 'unselected' as const,
      selectionReviewedAt: '',
      selectionNote: '',
    };
    const scenes = [...draftProject.scenes];
    scenes.splice(index + 1, 0, duplicate);
    markChanged();
    setDraftProject((current) => withSyncedChapterScenes(current, scenes));
    setActiveSceneId(id);
    replaceWorkbenchQuery({ scene: id });
  }

  function moveScene(sceneId: string, direction: -1 | 1) {
    const index = draftProject.scenes.findIndex((scene) => scene.id === sceneId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= draftProject.scenes.length) return;
    if (draftProject.scenes[index].chapterId !== draftProject.scenes[target].chapterId) return;
    const scenes = [...draftProject.scenes];
    [scenes[index], scenes[target]] = [scenes[target], scenes[index]];
    markChanged();
    setDraftProject((current) => withSyncedChapterScenes(current, scenes));
  }

  function deleteScene(sceneId: string) {
    const index = draftProject.scenes.findIndex((scene) => scene.id === sceneId);
    const scene = draftProject.scenes[index];
    if (!scene || !window.confirm(`删除片段“${scene.title || `片段 ${index + 1}`}”？`)) return;
    const scenes = draftProject.scenes.filter((item) => item.id !== sceneId);
    const nextActive = scenes[Math.min(index, scenes.length - 1)]?.id ?? '';
    markChanged();
    setDraftProject((current) => withSyncedChapterScenes(current, scenes));
    if (activeSceneId === sceneId) setActiveSceneId(nextActive);
    replaceWorkbenchQuery({ scene: nextActive || null });
  }

  function resetDraft() {
    setDraftProject(persistedProject);
    const nextSceneId = persistedProject.scenes.some((scene) => scene.id === activeSceneId)
      ? activeSceneId
      : persistedProject.scenes[0]?.id ?? '';
    setActiveSceneId(nextSceneId);
    setSaveState('idle');
    setStatusText('已还原到最近一次保存的项目文件。');
  }

  async function saveProject() {
    setSaveState('saving');
    setStatusText('正在保存项目…');
    try {
      const response = await fetch('/api/workbench/brief', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId, brief: draftProject }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? '保存失败');
      const savedProject = payload.brief as ShortVideoProject;
      const pendingNarrativeInvalidated = Boolean(
        draftProject.narrative.pendingDraft && !savedProject.narrative.pendingDraft,
      );
      setDraftProject(savedProject);
      setPersistedProject(savedProject);
      setCurrentRenderStatus(savedProject.technical_status === 'not_rendered'
        ? {
            state: 'missing',
            label: '尚未渲染',
            message: '项目已保存，运行渲染并通过验收后才会生成成片。',
          }
        : {
            state: 'stale',
            label: '成片已过期',
            message: '项目已保存，重新渲染并通过验收后才会对应当前内容。',
            duration: currentRenderStatus.duration,
            renderedAt: currentRenderStatus.renderedAt,
          });
      setSaveState('saved');
      setStatusText(pendingNarrativeInvalidated
        ? '项目已保存；研究输入已修改，旧待审草案已失效。'
        : savedProject.technical_status === 'not_rendered'
          ? '项目已保存，可以继续完成字幕并导出。'
          : '项目已保存；现有成片已标记为过期。');
      return payload.brief as ShortVideoProject;
    } catch (error) {
      setSaveState('error');
      setStatusText(error instanceof Error ? error.message : '保存失败');
      return null;
    }
  }

  async function renderProject(
    projectToRender: ShortVideoProject = draftProject,
    mode: 'start' | 'resume' = 'start',
  ) {
    setSaveState('rendering');
    setStatusText('正在保存项目并加入渲染队列…');
    const pollRenderJob = async () => {
      const response = await fetch(`/api/workbench/render?projectId=${encodeURIComponent(projectId)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('无法读取渲染任务状态。');
      const payload = await response.json();
      if (payload.job) {
        setCurrentRenderJob(payload.job as RenderJobRecord);
        const stageLabel: Record<RenderJobRecord['stage'], string> = {
          saving: (payload.job as RenderJobRecord).state === 'queued' ? '等待执行' : '保存项目',
          rendering: '生成配音、字幕和画面',
          proof: '执行技术验收',
          review: '等待逐场景与浏览器验收',
          packaging: '生成封面和导出包',
          completed: '完成',
        };
        const job = payload.job as RenderJobRecord;
        const queueLabel = job.state === 'queued' && job.queuePosition
          ? `（队列第 ${job.queuePosition} 位）`
          : '';
        setStatusText(`渲染任务：${stageLabel[job.stage]}${queueLabel}…`);
      }
      return payload;
    };
    try {
      const response = await fetch('/api/workbench/render', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId, brief: projectToRender, mode }),
      });
      const payload = await response.json();
      if (payload.renderJob) setCurrentRenderJob(payload.renderJob as RenderJobRecord);
      if (!response.ok) throw new Error(payload.error ?? '渲染入队失败');

      while (true) {
        await new Promise((resolvePromise) => window.setTimeout(resolvePromise, 750));
        const statusPayload = await pollRenderJob();
        const job = statusPayload?.job as RenderJobRecord | undefined;
        if (!job || ['queued', 'running', 'cancelling'].includes(job.state)) continue;
        if (job.state === 'failed') throw new Error(job.error || '渲染失败');
        if (job.state === 'cancelled') {
          setSaveState('saved');
          setStatusText('渲染任务已取消，可以继续渲染。');
          return;
        }
        break;
      }
      setSaveState('saved');
      setStatusText('技术渲染已完成，正在刷新内容验收状态…');
      window.location.href = `/workbench?project=${encodeURIComponent(projectId)}&view=export&scene=${encodeURIComponent(activeSceneId)}&refresh=${Date.now()}`;
    } catch (error) {
      setSaveState('error');
      setStatusText(error instanceof Error ? error.message : '渲染失败');
    }
  }

  async function cancelRenderProject() {
    setStatusText('正在取消渲染任务…');
    try {
      const response = await fetch(`/api/workbench/render?projectId=${encodeURIComponent(projectId)}`, {
        method: 'DELETE',
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? '取消渲染失败');
      if (payload.job) setCurrentRenderJob(payload.job as RenderJobRecord);
      setStatusText('已发送取消请求，正在停止渲染进程…');
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : '取消渲染失败');
    }
  }

  async function importSource(
    formData: FormData,
    onProgress: (progress: number) => void,
    signal: AbortSignal,
  ) {
    setSaveState('saving');
    setStatusText('正在导入本地素材…');
    try {
      const file = formData.get('file');
      if (!(file instanceof File)) throw new Error('请选择本地素材文件。');
      const metadata = {
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        label: String(formData.get('label') ?? ''),
        originUrl: String(formData.get('originUrl') ?? ''),
        materialRole: String(formData.get('materialRole') ?? 'official_demo'),
        verificationStatus: String(formData.get('verificationStatus') ?? 'needs_check'),
        rightsStatus: String(formData.get('rightsStatus') ?? 'review_required'),
        rightsNote: String(formData.get('rightsNote') ?? ''),
        confirmRights: String(formData.get('confirmRights') ?? ''),
      };
      const payload = await new Promise<Record<string, unknown>>((resolvePromise, rejectPromise) => {
        const request = new XMLHttpRequest();
        const abort = () => request.abort();
        request.open('POST', `/api/projects/${encodeURIComponent(projectId)}/sources`);
        request.setRequestHeader('content-type', file.type || 'application/octet-stream');
        request.setRequestHeader(
          'x-videobrief-source-metadata',
          encodeURIComponent(JSON.stringify(metadata)),
        );
        request.upload.onprogress = (event) => {
          if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
        };
        request.onerror = () => rejectPromise(new Error('素材上传网络失败。'));
        request.onabort = () => rejectPromise(new DOMException('素材导入已取消。', 'AbortError'));
        request.onload = () => {
          signal.removeEventListener('abort', abort);
          let body: Record<string, unknown> = {};
          try {
            body = JSON.parse(request.responseText) as Record<string, unknown>;
          } catch {
            rejectPromise(new Error('素材导入返回了无效响应。'));
            return;
          }
          if (request.status < 200 || request.status >= 300) {
            rejectPromise(new Error(typeof body.error === 'string' ? body.error : '素材导入失败'));
            return;
          }
          onProgress(1);
          resolvePromise(body);
        };
        signal.addEventListener('abort', abort, { once: true });
        request.send(file);
      });
      if (!payload.source) throw new Error('素材导入结果缺少来源记录。');
      setStatusText('素材已导入，正在刷新项目…');
      window.location.href = `/workbench?project=${encodeURIComponent(projectId)}&view=sources&refresh=${Date.now()}`;
    } catch (error) {
      setSaveState('error');
      setStatusText(error instanceof Error ? error.message : '素材导入失败');
      throw error;
    }
  }

  function seekScene(sceneId = activeSceneId, mode: 'render' | 'source' = previewMode) {
    const scene = draftProject.scenes.find((item) => item.id === sceneId);
    if (!videoRef.current || !scene) return;
    videoRef.current.currentTime = mode === 'render' ? renderedById.get(sceneId)?.start ?? 0 : scene.sourceStart;
    playVideo(videoRef.current);
  }

  function previewScene(sceneId: string) {
    const scene = draftProject.scenes.find((item) => item.id === sceneId);
    const nextSource = draftProject.sources.find((source) => source.id === scene?.sourceId);
    const canUseCurrentVideo =
      previewMode === 'render' || nextSource?.id === sceneSource?.id;
    selectScene(sceneId);
    if (videoRef.current && scene && canUseCurrentVideo) {
      videoRef.current.currentTime =
        previewMode === 'render' ? renderedById.get(sceneId)?.start ?? 0 : scene.sourceStart;
      playVideo(videoRef.current);
      return;
    }
    window.setTimeout(() => seekScene(sceneId, previewMode), 100);
  }

  function jumpToClip(sceneId: string) {
    setView('clips');
    selectScene(sceneId);
    replaceWorkbenchQuery({ view: 'clips', scene: sceneId });
    window.setTimeout(() => document.querySelector(`[data-scene-id="${sceneId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  }

  function closeClipPrototype() {
    setPrototypeMode(null);
    setView('clips');
    replaceWorkbenchQuery({ view: 'clips', prototype: null, candidateLayout: null });
  }

  function changeCandidateVariant(variant: CandidatePrototypeVariant) {
    setCandidateVariant(variant);
    replaceWorkbenchQuery({ candidateLayout: variant });
  }

  function previewCandidate(start: number) {
    setPreviewMode('source');
    window.setTimeout(() => {
      if (!videoRef.current) return;
      videoRef.current.currentTime = start;
      playVideo(videoRef.current);
    }, 100);
  }

  function selectSourceForReview(sourceId: string) {
    setActiveSourceId(sourceId);
    setPreviewMode('source');
    replaceWorkbenchQuery({ source: sourceId });
  }

  function reviewSource(sourceId: string) {
    selectSourceForReview(sourceId);
    changeView('research');
  }

  function playCurrentPreview() {
    if (previewMode === 'source' && sourceFocusedView) {
      if (!videoRef.current) return;
      videoRef.current.currentTime = 0;
      playVideo(videoRef.current);
      return;
    }
    seekScene();
  }

  const primaryContent = !advancedMode ? (
    <FinalVideoWorkspace
      projectId={projectId}
      project={draftProject}
      renderHref={renderHref}
      remotionHref={remotionHref}
      renderStatus={visibleRenderStatus}
      renderJob={currentRenderJob}
    />
  ) : view === 'research' ? (
    <WorkbenchResearchManager
      project={draftProject}
      activeSourceId={activeSourceId}
      busy={Boolean(projectAction)}
      onProcessAll={processAllSources}
      onProcessSource={processSource}
      onCancelSource={cancelSourceProcessing}
      onUpdateSource={updateSource}
      onUpdateFact={updateResearchFact}
      onUpdateUncertainty={updateResearchUncertainty}
      onConfirmSourceFacts={confirmSourceProposedFacts}
      onSelectSource={selectSourceForReview}
      onBackToSources={() => changeView('sources')}
      onContinue={() => changeView('planning')}
    />
  ) : view === 'planning' ? (
    <WorkbenchPlanningManager
      project={draftProject}
      aiAvailable={aiAvailable}
      busy={Boolean(projectAction)}
      onGenerateNarrative={generateNarrative}
      onApplyNarrative={applyNarrative}
      onDiscardNarrative={discardNarrative}
      onGenerateCandidates={generateCandidates}
      onGenerateAssets={generateAssets}
      onSelectCandidate={selectCandidate}
      onReviewResearch={() => changeView('research')}
      onContinue={() => changeView('clips')}
    />
  ) : prototypeMode === 'clip-candidates' ? (
    <ClipCandidatePrototype
      scene={activeScene}
      source={sceneSource}
      variant={candidateVariant}
      onVariantChange={changeCandidateVariant}
      onPreview={(candidate) => previewCandidate(candidate.start)}
      onClose={closeClipPrototype}
    />
  ) : view === 'clips' ? (
    <WorkbenchClipManager
      project={draftProject}
      activeSceneId={activeSceneId}
      timings={timings}
      onAdd={addScene}
      onSelect={selectClip}
      onPreview={previewScene}
      onToggle={(sceneId) => updateSceneById(sceneId, { enabled: !draftProject.scenes.find((scene) => scene.id === sceneId)?.enabled })}
      onDuplicate={duplicateScene}
      onMove={moveScene}
      onDelete={deleteScene}
    />
  ) : view === 'subtitles' ? (
    <WorkbenchSubtitleManager
      project={draftProject}
      activeSceneId={activeSceneId}
      timings={timings}
      onSelect={selectScene}
      onUpdate={updateSceneById}
      onPreview={previewScene}
      onJumpToClip={jumpToClip}
    />
  ) : view === 'sources' ? (
    <WorkbenchSourceManager
      project={draftProject}
      assets={assets}
      sourceHrefs={sourceHrefs}
      activeSourceId={activeSourceId}
      onSelect={selectSourceForReview}
      onReview={reviewSource}
      onImport={importSource}
      onApproveMaterials={approveMaterials}
      onContinue={() => changeView('research')}
    />
  ) : (
    <WorkbenchExportManager
      projectId={projectId}
      project={draftProject}
      assets={assets}
      srtText={srtText}
      renderHref={renderHref}
      renderStatus={visibleRenderStatus}
      renderJob={currentRenderJob}
      renderBlockedReason={renderBlockReason}
      rendering={saveState === 'rendering'}
      onRender={() => void renderProject()}
      onResume={() => void renderProject(draftProject, 'resume')}
      onCancel={() => void cancelRenderProject()}
    />
  );

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <header className="relative z-30 border-b border-slate-200 bg-white/95 backdrop-blur md:sticky md:top-0">
        <div className="w-full px-3 pt-3 sm:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <a
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                href="/"
                title="返回项目列表"
                aria-label="返回项目列表"
              >
                <FolderKanban aria-hidden="true" className="h-4 w-4" />
              </a>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-slate-950 text-xs font-extrabold text-white">VB</div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-extrabold text-emerald-700">视频项目</span>
                  <span className="text-[11px] font-bold text-slate-400">{projectStatusLabel[draftProject.status]}</span>
                </div>
                <h1 className="truncate text-base font-extrabold text-slate-950 sm:text-lg">{draftProject.title}</h1>
              </div>
              <span className={`inline-flex h-8 shrink-0 items-center gap-2 rounded-md border px-2.5 text-[11px] font-extrabold ${statusTone.badge}`}>
                <span aria-hidden="true" className={`h-2 w-2 rounded-full ${statusTone.dot}`} />
                {visibleRenderStatus.label}
              </span>
            </div>

            <div className="flex items-center justify-end gap-2">
              {advancedMode ? (
                <button className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-xs font-extrabold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" type="button" onClick={() => {
                  setAdvancedMode(false);
                  setView('export');
                  replaceWorkbenchQuery({ advanced: null, view: null, scene: null, source: null });
                }}>
                  <Film aria-hidden="true" className="h-3.5 w-3.5" />返回成片
                </button>
              ) : null}
              {advancedMode ? <>
              <button
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
                type="button"
                title="还原未保存修改"
                aria-label="还原未保存修改"
                disabled={!dirty || saveState === 'saving' || saveState === 'rendering' || Boolean(projectAction)}
                onClick={resetDraft}
              >
                <RefreshCw aria-hidden="true" className="h-4 w-4" />
              </button>
              <button
                className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-xs font-extrabold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
                type="button"
                disabled={!dirty || saveState === 'saving' || saveState === 'rendering' || Boolean(projectAction)}
                onClick={saveProject}
              >
                <Save aria-hidden="true" className="h-3.5 w-3.5" />
                {saveState === 'saving' ? '保存中…' : '保存'}
              </button>
              </> : null}
            </div>
          </div>

          {advancedMode ? <nav className="mt-3 flex gap-1 overflow-x-auto" aria-label="工作台视图">
            {viewItems.map(([value, label, Icon], stepIndex) => {
              const count = value === 'clips' || value === 'subtitles'
                ? String(draftProject.scenes.length)
                : value === 'sources'
                  ? `${draftProject.sources.length}份 · ${reviewSummary.keyFacts.length - reviewSummary.pendingFacts.length}/${reviewSummary.keyFacts.length}${reviewSummary.unresolvedUncertainties.length ? ` · ${reviewSummary.unresolvedUncertainties.length}待处理` : ''}`
                    : value === 'planning'
                      ? draftProject.narrative.pendingDraft ? '待确认' : draftProject.narrative.activeVersionId ? '已确认' : null
                      : null;
              const active = (value === 'sources' ? sourceFocusedView : view === value) && !prototypeMode;
              return (
                <button
                  key={value}
                  className={`inline-flex h-10 shrink-0 items-center gap-2 border-b-2 px-3 text-xs font-extrabold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${active ? 'border-emerald-600 text-slate-950' : 'border-transparent text-slate-500 hover:text-slate-900'}`}
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  onClick={() => changeView(value)}
                >
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${active ? 'bg-emerald-700 text-white' : 'bg-slate-200 text-slate-600'}`}>{stepIndex + 1}</span>
                  <Icon aria-hidden="true" className="h-4 w-4" />
                  {label}
                  {count != null ? <span className="font-mono text-[10px] text-slate-400">{count}</span> : null}
                </button>
              );
            })}
          </nav> : null}
        </div>
        {statusText ? (
          <div className={`border-t px-4 py-2 text-center text-xs font-bold ${saveState === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`} role="status" aria-live="polite">
            {statusText}
          </div>
        ) : null}
      </header>

      {advancedMode ? <section className="border-b border-slate-200 bg-white px-3 py-3 sm:px-5" aria-label="当前制作步骤">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold text-emerald-700">第 {currentStepIndex + 1} / {workbenchSteps.length} 步</p>
            <p className="mt-1 text-sm font-extrabold text-slate-950">{currentStep.label}</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">{currentStep.description}</p>
          </div>
          {nextStep && (view === 'clips' || view === 'subtitles') ? (
            <button className="inline-flex h-9 items-center gap-2 rounded-md bg-emerald-700 px-3 text-xs font-extrabold text-white disabled:bg-slate-400" type="button" disabled={!canAdvance} onClick={() => changeView(nextStep.view)}>
              下一步：{nextStep.label}
            </button>
          ) : null}
        </div>
      </section> : null}

      <section className="w-full px-3 py-3 sm:px-5">
        <div className={`grid grid-cols-1 gap-3 ${advancedMode ? 'md:h-[calc(100dvh-250px)] md:grid-rows-[auto_minmax(0,1fr)] md:overflow-hidden lg:h-[calc(100dvh-190px)]' : ''} ${showPreviewPanel ? 'md:grid-cols-[minmax(0,1fr)_340px] lg:grid-cols-[minmax(0,1fr)_380px] 2xl:grid-cols-[minmax(0,1fr)_460px]' : 'md:grid-cols-1'}`}>
          <div className={`${sourceFocusedView ? 'order-1' : 'order-2'} min-w-0 md:order-1 md:col-start-1 md:row-span-2 md:min-h-0 md:overflow-y-auto`}>
            {primaryContent}
          </div>
          {showPreviewPanel ? <div className={`${sourceFocusedView ? 'order-2' : 'order-1'} min-w-0 md:order-2 md:col-start-2 md:row-start-1`}>
            <WorkbenchPreview
              videoRef={videoRef}
              previewMode={previewMode}
              renderHref={renderHref}
              sourceHref={sourceHref}
              source={previewSource}
              scene={activeScene}
              renderedScene={renderedScene}
              sourceOnly={sourceFocusedView}
              onPreviewModeChange={setPreviewMode}
              onPlayScene={playCurrentPreview}
            />
          </div> : null}
          {showPreviewPanel ? <aside className="order-3 min-w-0 md:col-start-2 md:row-start-2 md:min-h-0 md:overflow-y-auto md:pr-1">
            <WorkbenchDetails
              view={view}
              project={draftProject}
              activeScene={activeScene}
              activeSceneIndex={activeSceneIndex}
              activeSource={detailSource}
              renderedScene={renderedScene}
              onUpdateScene={updateActiveScene}
              onConfirmVisual={confirmActiveSceneVisual}
              onUpdateSource={updateSource}
              onUpdatePlatformCopy={updatePlatformCopy}
              onUpdateAspectRatio={updateAspectRatio}
            />
          </aside> : null}
        </div>
      </section>
    </main>
  );
}
