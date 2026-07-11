'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Film,
  ListVideo,
  RefreshCw,
  Save,
  ShieldCheck,
  Subtitles,
  Upload,
} from 'lucide-react';
import ClipCandidatePrototype, {
  CandidatePrototypeVariant,
} from '@/src/components/ClipCandidatePrototype';
import WorkbenchClipManager from '@/src/components/WorkbenchClipManager';
import WorkbenchDetails from '@/src/components/WorkbenchDetails';
import WorkbenchExportManager from '@/src/components/WorkbenchExportManager';
import WorkbenchPreview from '@/src/components/WorkbenchPreview';
import WorkbenchSourceManager from '@/src/components/WorkbenchSourceManager';
import WorkbenchSubtitleManager from '@/src/components/WorkbenchSubtitleManager';
import {
  ProductionTimeline,
  ShortVideoEditorial,
  ShortVideoProject,
  ShortVideoProjectScene,
  ShortVideoSource,
  WorkbenchRenderStatus,
} from '@/src/shortVideoBrief';
import {
  WorkbenchAsset,
  WorkbenchView,
  renderStatusTone,
  sceneTimings,
} from '@/src/workbench';

export type { WorkbenchAsset } from '@/src/workbench';

interface ProductionWorkbenchClientProps {
  brief: ShortVideoProject;
  timeline: ProductionTimeline;
  assets: WorkbenchAsset[];
  srtText: string;
  renderHref: string;
  sourceHrefs: Record<string, string>;
  renderStatus: WorkbenchRenderStatus;
  renderCommand: string;
  initialView: WorkbenchView;
  initialPrototype: 'clip-candidates' | null;
  initialCandidateVariant: CandidatePrototypeVariant;
}

const projectStatusLabel: Record<ShortVideoProject['status'], string> = {
  draft: '草稿',
  review: '审核中',
  ready: '待发布',
  published: '已发布',
};

const viewItems = [
  ['clips', '片段', ListVideo],
  ['subtitles', '字幕', Subtitles],
  ['sources', '素材', Film],
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

function playVideo(video: HTMLVideoElement) {
  void video.play().catch((error: unknown) => {
    if (!(error instanceof DOMException) || error.name !== 'NotAllowedError') return;
    video.muted = true;
    void video.play().catch(() => undefined);
  });
}

export default function ProductionWorkbenchClient({
  brief,
  timeline,
  assets,
  srtText,
  renderHref,
  sourceHrefs,
  renderStatus,
  renderCommand,
  initialView,
  initialPrototype,
  initialCandidateVariant,
}: ProductionWorkbenchClientProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [persistedProject, setPersistedProject] = useState(brief);
  const [draftProject, setDraftProject] = useState(brief);
  const [activeSceneId, setActiveSceneId] = useState(brief.scenes[0]?.id ?? '');
  const [activeSourceId, setActiveSourceId] = useState(brief.sources[0]?.id ?? '');
  const [view, setView] = useState<WorkbenchView>(initialView);
  const [prototypeMode, setPrototypeMode] = useState<'clip-candidates' | null>(initialPrototype);
  const [candidateVariant, setCandidateVariant] = useState<CandidatePrototypeVariant>(initialCandidateVariant);
  const [previewMode, setPreviewMode] = useState<'render' | 'source'>('render');
  const [currentRenderStatus, setCurrentRenderStatus] = useState(renderStatus);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'rendering' | 'error'>('idle');
  const [statusText, setStatusText] = useState('');

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
  const previewSource = view === 'sources' ? detailSource : sceneSource;
  const sourceHref = previewSource ? sourceHrefs[previewSource.id] ?? '' : '';
  const dirty = useMemo(
    () => JSON.stringify(draftProject) !== JSON.stringify(persistedProject),
    [draftProject, persistedProject],
  );
  const visibleRenderStatus: WorkbenchRenderStatus = dirty
    ? {
        state: 'stale',
        label: '有未保存修改',
        message: '保存并重新渲染后，成片才会对应当前项目。',
        duration: currentRenderStatus.duration,
        renderedAt: currentRenderStatus.renderedAt,
      }
    : currentRenderStatus;
  const statusTone = renderStatusTone[visibleRenderStatus.state];

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedScene = params.get('scene');
    const requestedView = params.get('view') as WorkbenchView | null;
    const legacyPanel = params.get('panel');
    const requestedPrototype = params.get('prototype');
    const requestedVariant = params.get('candidateLayout');
    if (requestedScene && brief.scenes.some((scene) => scene.id === requestedScene)) {
      setActiveSceneId(requestedScene);
      const requestedSceneSource = brief.scenes.find((scene) => scene.id === requestedScene)?.sourceId;
      if (requestedSceneSource) setActiveSourceId(requestedSceneSource);
    }
    if (requestedView && viewItems.some(([value]) => value === requestedView)) {
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
  }, [brief.scenes]);

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
    if (nextView === 'sources' && sceneSource) {
      setActiveSourceId(sceneSource.id);
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
      scenes: current.scenes.map((scene) => scene.id === sceneId ? { ...scene, ...patch } : scene),
    }));
  }

  function updateActiveScene(patch: Partial<ShortVideoProjectScene>) {
    if (!activeScene) return;
    updateSceneById(activeScene.id, patch);
    if (patch.sourceId) setActiveSourceId(patch.sourceId);
  }

  function updateEditorial(patch: Partial<ShortVideoEditorial>) {
    markChanged();
    setDraftProject((current) => ({
      ...current,
      editorial: { ...current.editorial, ...patch },
    }));
  }

  function updateSource(sourceId: string, patch: Partial<ShortVideoSource>) {
    markChanged();
    setDraftProject((current) => ({
      ...current,
      sources: current.sources.map((source) => source.id === sourceId ? { ...source, ...patch } : source),
    }));
  }

  function addScene() {
    const id = nextSceneId(draftProject.scenes);
    const sourceId = activeScene?.sourceId ?? draftProject.sources[0]?.id ?? '';
    const sourceStart = activeScene?.sourceEnd ?? 0;
    const newScene: ShortVideoProjectScene = {
      id,
      enabled: true,
      sourceId,
      sourceStart,
      sourceEnd: sourceStart + 3,
      eyebrow: '',
      title: '新片段',
      subtitle: '',
    };
    markChanged();
    setDraftProject((current) => ({ ...current, scenes: [...current.scenes, newScene] }));
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
    const duplicate = { ...original, id, title: `${original.title || '未命名片段'}（副本）` };
    const scenes = [...draftProject.scenes];
    scenes.splice(index + 1, 0, duplicate);
    markChanged();
    setDraftProject((current) => ({ ...current, scenes }));
    setActiveSceneId(id);
    replaceWorkbenchQuery({ scene: id });
  }

  function moveScene(sceneId: string, direction: -1 | 1) {
    const index = draftProject.scenes.findIndex((scene) => scene.id === sceneId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= draftProject.scenes.length) return;
    const scenes = [...draftProject.scenes];
    [scenes[index], scenes[target]] = [scenes[target], scenes[index]];
    markChanged();
    setDraftProject((current) => ({ ...current, scenes }));
  }

  function deleteScene(sceneId: string) {
    const index = draftProject.scenes.findIndex((scene) => scene.id === sceneId);
    const scene = draftProject.scenes[index];
    if (!scene || !window.confirm(`删除片段“${scene.title || `片段 ${index + 1}`}”？`)) return;
    const scenes = draftProject.scenes.filter((item) => item.id !== sceneId);
    const nextActive = scenes[Math.min(index, scenes.length - 1)]?.id ?? '';
    markChanged();
    setDraftProject((current) => ({ ...current, scenes }));
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
        body: JSON.stringify({ brief: draftProject }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? '保存失败');
      setDraftProject(payload.brief);
      setPersistedProject(payload.brief);
      setCurrentRenderStatus({
        state: 'stale',
        label: '成片已过期',
        message: '项目已保存，重新渲染并通过验收后才会对应当前内容。',
        duration: currentRenderStatus.duration,
        renderedAt: currentRenderStatus.renderedAt,
      });
      setSaveState('saved');
      setStatusText('项目已保存；现有成片已标记为过期。');
      return payload.brief as ShortVideoProject;
    } catch (error) {
      setSaveState('error');
      setStatusText(error instanceof Error ? error.message : '保存失败');
      return null;
    }
  }

  async function renderProject() {
    setSaveState('rendering');
    setStatusText('正在保存、渲染并执行验收…');
    try {
      const response = await fetch('/api/workbench/render', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brief: draftProject }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? '渲染失败');
      setSaveState('saved');
      setStatusText('渲染和验收已完成，正在刷新项目状态…');
      window.location.href = `/workbench?view=export&scene=${encodeURIComponent(activeSceneId)}&refresh=${Date.now()}`;
    } catch (error) {
      setSaveState('error');
      setStatusText(error instanceof Error ? error.message : '渲染失败');
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

  const primaryContent = prototypeMode === 'clip-candidates' ? (
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
      activeSourceId={activeSourceId}
      onSelect={setActiveSourceId}
    />
  ) : (
    <WorkbenchExportManager
      project={draftProject}
      assets={assets}
      srtText={srtText}
      renderHref={renderHref}
      renderStatus={visibleRenderStatus}
    />
  );

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <header className="relative z-30 border-b border-slate-200 bg-white/95 backdrop-blur md:sticky md:top-0">
        <div className="w-full px-3 pt-3 sm:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
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
              <button
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
                type="button"
                title="还原未保存修改"
                aria-label="还原未保存修改"
                disabled={!dirty || saveState === 'saving' || saveState === 'rendering'}
                onClick={resetDraft}
              >
                <RefreshCw aria-hidden="true" className="h-4 w-4" />
              </button>
              <button
                className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-xs font-extrabold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
                type="button"
                disabled={!dirty || saveState === 'saving' || saveState === 'rendering'}
                onClick={saveProject}
              >
                <Save aria-hidden="true" className="h-3.5 w-3.5" />
                {saveState === 'saving' ? '保存中…' : '保存'}
              </button>
              <button
                className="inline-flex h-9 items-center gap-2 rounded-md bg-slate-950 px-3 text-xs font-extrabold text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-400"
                type="button"
                title={renderCommand}
                disabled={saveState === 'saving' || saveState === 'rendering'}
                onClick={renderProject}
              >
                <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />
                {saveState === 'rendering' ? '渲染中…' : '渲染并验收'}
              </button>
            </div>
          </div>

          <nav className="mt-3 flex gap-1 overflow-x-auto" aria-label="工作台视图">
            {viewItems.map(([value, label, Icon]) => {
              const count = value === 'clips' || value === 'subtitles'
                ? draftProject.scenes.length
                : value === 'sources'
                  ? draftProject.sources.length
                  : null;
              const active = view === value && !prototypeMode;
              return (
                <button
                  key={value}
                  className={`inline-flex h-10 shrink-0 items-center gap-2 border-b-2 px-3 text-xs font-extrabold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${active ? 'border-emerald-600 text-slate-950' : 'border-transparent text-slate-500 hover:text-slate-900'}`}
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  onClick={() => changeView(value)}
                >
                  <Icon aria-hidden="true" className="h-4 w-4" />
                  {label}
                  {count != null ? <span className="font-mono text-[10px] text-slate-400">{count}</span> : null}
                </button>
              );
            })}
          </nav>
        </div>
        {statusText ? (
          <div className={`border-t px-4 py-2 text-center text-xs font-bold ${saveState === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`} role="status" aria-live="polite">
            {statusText}
          </div>
        ) : null}
      </header>

      <section className="w-full px-3 py-3 sm:px-5">
        <div className="grid grid-cols-1 gap-3 md:h-[calc(100dvh-194px)] md:grid-cols-[minmax(0,1fr)_340px] md:grid-rows-[auto_minmax(0,1fr)] md:overflow-hidden lg:h-[calc(100dvh-134px)] lg:grid-cols-[minmax(0,1fr)_380px] 2xl:grid-cols-[minmax(0,1fr)_460px]">
          <div className="order-2 min-w-0 md:order-1 md:col-start-1 md:row-span-2 md:min-h-0 md:overflow-y-auto">
            {primaryContent}
          </div>
          <div className="sticky top-0 z-20 order-1 min-w-0 md:static md:order-2 md:col-start-2 md:row-start-1">
            <WorkbenchPreview
              videoRef={videoRef}
              previewMode={previewMode}
              renderHref={renderHref}
              sourceHref={sourceHref}
              source={previewSource}
              scene={activeScene}
              renderedScene={renderedScene}
              onPreviewModeChange={setPreviewMode}
              onPlayScene={() => seekScene()}
            />
          </div>
          <aside className="order-3 min-w-0 md:col-start-2 md:row-start-2 md:min-h-0 md:overflow-y-auto md:pr-1">
            <WorkbenchDetails
              view={view}
              project={draftProject}
              activeScene={activeScene}
              activeSceneIndex={activeSceneIndex}
              activeSource={detailSource}
              renderedScene={renderedScene}
              onUpdateScene={updateActiveScene}
              onUpdateEditorial={updateEditorial}
              onUpdateSource={updateSource}
            />
          </aside>
        </div>
      </section>
    </main>
  );
}
