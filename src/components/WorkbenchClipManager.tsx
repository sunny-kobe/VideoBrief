import {
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  EyeOff,
  Play,
  Plus,
  Trash2,
} from 'lucide-react';
import { ShortVideoProject } from '@/src/shortVideoBrief';
import { SceneTiming, formatTimecode } from '@/src/workbench';

interface WorkbenchClipManagerProps {
  project: ShortVideoProject;
  activeSceneId: string;
  timings: Map<string, SceneTiming>;
  onAdd: () => void;
  onSelect: (sceneId: string) => void;
  onPreview: (sceneId: string) => void;
  onToggle: (sceneId: string) => void;
  onDuplicate: (sceneId: string) => void;
  onMove: (sceneId: string, direction: -1 | 1) => void;
  onDelete: (sceneId: string) => void;
}

const iconButton =
  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:bg-slate-50 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:cursor-not-allowed disabled:opacity-35';

export default function WorkbenchClipManager({
  project,
  activeSceneId,
  timings,
  onAdd,
  onSelect,
  onPreview,
  onToggle,
  onDuplicate,
  onMove,
  onDelete,
}: WorkbenchClipManagerProps) {
  const enabledCount = project.scenes.filter((scene) => scene.enabled).length;

  return (
    <section className="min-w-0 overflow-hidden rounded-md border border-slate-200 bg-white md:flex md:h-full md:flex-col">
      <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-4 py-3">
        <div>
          <h2 className="text-sm font-extrabold text-slate-950">片段列表</h2>
          <p className="mt-1 text-xs text-slate-500">
            {project.scenes.length} 个片段，{enabledCount} 个参与成片
          </p>
        </div>
        <button
          className="inline-flex h-9 items-center gap-2 rounded-md bg-slate-950 px-3 text-xs font-extrabold text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
          type="button"
          onClick={onAdd}
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
          新增片段
        </button>
      </div>

      <div className="divide-y divide-slate-200 md:min-h-0 md:flex-1 md:overflow-y-auto">
        {project.scenes.map((scene, index) => {
          const source = project.sources.find((item) => item.id === scene.sourceId);
          const timing = timings.get(scene.id);
          const active = scene.id === activeSceneId;

          return (
            <article
              key={scene.id}
              className={`px-3 py-3 sm:px-4 ${active ? 'bg-emerald-50/70' : 'bg-white'} ${scene.enabled ? '' : 'opacity-60'}`}
              data-scene-id={scene.id}
            >
              <div className="flex items-start gap-3">
                <button
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md font-mono text-xs font-extrabold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${active ? 'bg-emerald-700 text-white' : 'bg-slate-900 text-white'}`}
                  type="button"
                  title={`编辑片段 ${index + 1}`}
                  aria-label={`编辑片段 ${index + 1}`}
                  aria-current={active ? 'true' : undefined}
                  onClick={() => onSelect(scene.id)}
                >
                  {index + 1}
                </button>

                <button
                  className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                  type="button"
                  onClick={() => onSelect(scene.id)}
                >
                  <span className="block truncate text-sm font-extrabold text-slate-950">
                    {scene.title || '未命名片段'}
                  </span>
                  <span className="mt-1 line-clamp-2 block text-xs leading-relaxed text-slate-600">
                    {scene.subtitle || '暂无字幕文案'}
                  </span>
                </button>

                <button
                  className={iconButton}
                  type="button"
                  title={scene.enabled ? '停用片段' : '启用片段'}
                  aria-label={scene.enabled ? `停用片段 ${index + 1}` : `启用片段 ${index + 1}`}
                  onClick={() => onToggle(scene.id)}
                >
                  {scene.enabled ? <Eye aria-hidden="true" className="h-4 w-4" /> : <EyeOff aria-hidden="true" className="h-4 w-4" />}
                </button>
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 pl-11 text-[11px] sm:grid-cols-4">
                <div>
                  <dt className="font-bold text-slate-400">成片时间</dt>
                  <dd className="mt-0.5 font-mono font-bold text-slate-700">
                    {scene.enabled && timing?.outputStart != null && timing.outputEnd != null
                      ? `${formatTimecode(timing.outputStart)} - ${formatTimecode(timing.outputEnd)}`
                      : '不参与成片'}
                  </dd>
                </div>
                <div>
                  <dt className="font-bold text-slate-400">素材入点 / 出点</dt>
                  <dd className="mt-0.5 font-mono font-bold text-slate-700">
                    {scene.sourceStart.toFixed(2)}s - {scene.sourceEnd.toFixed(2)}s
                  </dd>
                </div>
                <div>
                  <dt className="font-bold text-slate-400">片段时长</dt>
                  <dd className="mt-0.5 font-mono font-bold text-slate-700">
                    {(timing?.duration ?? 0).toFixed(2)}s
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="font-bold text-slate-400">素材</dt>
                  <dd className="mt-0.5 truncate font-bold text-slate-700">
                    {source?.label ?? '素材缺失'}
                  </dd>
                </div>
              </dl>

              <div className="mt-3 flex flex-wrap justify-end gap-1.5 pl-11">
                <button className={iconButton} type="button" title="播放本片段" aria-label={`播放片段 ${index + 1}`} onClick={() => onPreview(scene.id)}>
                  <Play aria-hidden="true" className="h-4 w-4" />
                </button>
                <button className={iconButton} type="button" title="复制片段" aria-label={`复制片段 ${index + 1}`} onClick={() => onDuplicate(scene.id)}>
                  <Copy aria-hidden="true" className="h-4 w-4" />
                </button>
                <button className={iconButton} type="button" title="上移" aria-label={`上移片段 ${index + 1}`} disabled={index === 0} onClick={() => onMove(scene.id, -1)}>
                  <ChevronUp aria-hidden="true" className="h-4 w-4" />
                </button>
                <button className={iconButton} type="button" title="下移" aria-label={`下移片段 ${index + 1}`} disabled={index === project.scenes.length - 1} onClick={() => onMove(scene.id, 1)}>
                  <ChevronDown aria-hidden="true" className="h-4 w-4" />
                </button>
                <button className={`${iconButton} hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700`} type="button" title="删除片段" aria-label={`删除片段 ${index + 1}`} onClick={() => onDelete(scene.id)}>
                  <Trash2 aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
            </article>
          );
        })}

        {project.scenes.length === 0 ? (
          <div className="px-4 py-14 text-center text-sm text-slate-500">暂无片段</div>
        ) : null}
      </div>
    </section>
  );
}
