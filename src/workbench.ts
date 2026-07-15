import {
  ProductionTimeline,
  ShortVideoProject,
  WorkbenchRenderStatus,
} from './shortVideoBrief';
import { researchReviewSummary } from './researchReview';

export interface WorkbenchAsset {
  label: string;
  kind: '素材' | '音频' | '字幕' | '时间轴' | '成片' | '封面' | '文案' | '清单' | '项目' | '导出包' | '实验';
  path: string;
  href?: string;
  size: string;
  exists: boolean;
}

export type WorkbenchView = 'research' | 'planning' | 'clips' | 'subtitles' | 'sources' | 'export';

export const workbenchSteps: Array<{
  view: WorkbenchView;
  label: string;
  description: string;
}> = [
  { view: 'sources', label: '素材与核验', description: '导入资料、登记来源，只确认会影响脚本的关键内容' },
  { view: 'planning', label: '脚本', description: '生成并确认原创叙事与场景草案' },
  { view: 'clips', label: '画面', description: '选择画面并调整场景顺序' },
  { view: 'subtitles', label: '字幕', description: '校对旁白和字幕文案' },
  { view: 'export', label: '导出', description: '渲染、技术验收并下载成片' },
];

export function suggestedWorkbenchView(project: ShortVideoProject): WorkbenchView {
  if (!project.sources.length) return 'sources';
  if (!researchReviewSummary(project).ready) return 'sources';
  if (project.narrative.pendingDraft || !project.scenes.length) return 'planning';
  if (project.technical_status === 'passed') return 'export';
  return 'clips';
}

export interface SceneTiming {
  duration: number;
  outputStart?: number;
  outputEnd?: number;
}

export function sceneTimings(project: ShortVideoProject, timeline: ProductionTimeline) {
  const renderedById = new Map(timeline.scenes.map((scene) => [scene.id, scene]));
  const timings = new Map<string, SceneTiming>();
  let cursor = 0;

  for (const scene of project.scenes) {
    const duration = Math.max(
      0,
      renderedById.get(scene.id)?.duration ?? scene.sourceEnd - scene.sourceStart,
    );
    if (scene.enabled) {
      timings.set(scene.id, {
        duration,
        outputStart: cursor,
        outputEnd: cursor + duration,
      });
      cursor += duration;
    } else {
      timings.set(scene.id, { duration });
    }
  }

  return timings;
}

export function formatTimecode(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remaining = (safeSeconds % 60).toFixed(1).padStart(4, '0');
  return `${String(minutes).padStart(2, '0')}:${remaining}`;
}

export const renderStatusTone: Record<
  WorkbenchRenderStatus['state'],
  { badge: string; dot: string }
> = {
  missing: { badge: 'border-slate-300 bg-slate-100 text-slate-700', dot: 'bg-slate-400' },
  stale: { badge: 'border-amber-300 bg-amber-50 text-amber-800', dot: 'bg-amber-500' },
  unverified: { badge: 'border-sky-300 bg-sky-50 text-sky-800', dot: 'bg-sky-500' },
  ready: { badge: 'border-emerald-300 bg-emerald-50 text-emerald-800', dot: 'bg-emerald-500' },
};
