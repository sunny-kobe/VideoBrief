import { EyeOff, ListVideo, Play, Subtitles } from 'lucide-react';
import { ShortVideoProject, ShortVideoProjectScene } from '@/src/shortVideoBrief';
import { SceneTiming, formatTimecode } from '@/src/workbench';

interface WorkbenchSubtitleManagerProps {
  project: ShortVideoProject;
  activeSceneId: string;
  timings: Map<string, SceneTiming>;
  onSelect: (sceneId: string) => void;
  onUpdate: (sceneId: string, patch: Partial<ShortVideoProjectScene>) => void;
  onPreview: (sceneId: string) => void;
  onJumpToClip: (sceneId: string) => void;
}

export default function WorkbenchSubtitleManager({
  project,
  activeSceneId,
  timings,
  onSelect,
  onUpdate,
  onPreview,
  onJumpToClip,
}: WorkbenchSubtitleManagerProps) {
  return (
    <section className="min-w-0 overflow-hidden rounded-md border border-slate-200 bg-white md:flex md:h-full md:flex-col">
      <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
        <Subtitles aria-hidden="true" className="h-4 w-4 text-slate-600" />
        <div>
          <h2 className="text-sm font-extrabold text-slate-950">旁白与字幕</h2>
          <p className="mt-1 text-xs text-slate-500">逐段校对 {project.scenes.length} 个片段</p>
        </div>
      </div>

      <div className="divide-y divide-slate-200 md:min-h-0 md:flex-1 md:overflow-y-auto">
        {project.scenes.map((scene, index) => {
          const timing = timings.get(scene.id);
          const active = activeSceneId === scene.id;
          return (
            <article
              key={scene.id}
              className={`px-4 py-4 ${active ? 'bg-emerald-50/70' : 'bg-white'} ${scene.enabled ? '' : 'opacity-60'}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  className="min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                  type="button"
                  onClick={() => onSelect(scene.id)}
                >
                  <span className="mr-2 inline-flex h-6 min-w-6 items-center justify-center rounded bg-slate-900 px-1.5 font-mono text-[10px] font-extrabold text-white">
                    {index + 1}
                  </span>
                  <span className="text-xs font-extrabold text-slate-900">
                    {scene.title || '未命名片段'}
                  </span>
                </button>
                <div className="flex items-center gap-2 text-[11px] font-bold text-slate-500">
                  {!scene.enabled ? <EyeOff aria-label="片段已停用" className="h-3.5 w-3.5" /> : null}
                  <span className="font-mono">
                    {scene.enabled && timing?.outputStart != null && timing.outputEnd != null
                      ? `${formatTimecode(timing.outputStart)} - ${formatTimecode(timing.outputEnd)}`
                      : '不参与成片'}
                  </span>
                </div>
              </div>

              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-bold text-slate-600">旁白文案</span>
                  <textarea
                    className="mt-1.5 min-h-28 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm leading-relaxed text-slate-950 shadow-sm focus-visible:border-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
                    aria-label={`片段 ${index + 1} 旁白文案`}
                    value={scene.narration}
                    onFocus={() => onSelect(scene.id)}
                    onChange={(event) => onUpdate(scene.id, { narration: event.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold text-slate-600">屏幕字幕</span>
                  <textarea
                    className="mt-1.5 min-h-28 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm leading-relaxed text-slate-950 shadow-sm focus-visible:border-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
                    aria-label={`片段 ${index + 1} 字幕文案`}
                    value={scene.subtitle}
                    onFocus={() => onSelect(scene.id)}
                    onChange={(event) => onUpdate(scene.id, { subtitle: event.target.value })}
                  />
                </label>
              </div>

              <div className="mt-2 flex justify-end gap-2">
                <button
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                  type="button"
                  onClick={() => onPreview(scene.id)}
                >
                  <Play aria-hidden="true" className="h-3.5 w-3.5" />
                  播放
                </button>
                <button
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                  type="button"
                  onClick={() => onJumpToClip(scene.id)}
                >
                  <ListVideo aria-hidden="true" className="h-3.5 w-3.5" />
                  查看片段
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
