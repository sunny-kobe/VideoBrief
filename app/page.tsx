import { ArrowRight, FolderPlus, Radar, ShieldAlert, ShieldCheck } from 'lucide-react';
import { listProjects, projectPaths, readRenderManifest, renderStatus } from '@/src/shortVideoProjectServer';
import { suggestedWorkbenchView, workbenchSteps } from '@/src/workbench';

export const dynamic = 'force-dynamic';

const rightsLabel = {
  cleared: '素材权利已确认',
  review_required: '素材权利待复核',
  blocked: '存在禁用素材',
} as const;

export default function HomePage() {
  const projects = listProjects().map((project) => {
    const paths = projectPaths(project);
    return { project, render: renderStatus(readRenderManifest(paths.manifestPath), project.id) };
  });

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
          <div>
            <p className="text-xs font-extrabold text-emerald-700">VIDEOBRIEF</p>
            <h1 className="mt-1 text-xl font-extrabold">视频项目</h1>
          </div>
          <div className="flex items-center gap-2">
            <a className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50" href="/signals" title="每日候选命题" aria-label="每日候选命题"><Radar aria-hidden="true" className="h-4 w-4" /></a>
            <a className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-extrabold text-white hover:bg-slate-800" href="/projects/new">
              <FolderPlus aria-hidden="true" className="h-4 w-4" />
              新建项目
            </a>
          </div>
        </div>
      </header>
      <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-500 sm:grid-cols-[minmax(0,1fr)_150px_170px_auto]">
            <span>项目</span><span className="hidden sm:block">成片状态</span><span className="hidden sm:block">素材权利</span><span>下一步</span>
          </div>
          <div className="divide-y divide-slate-200">
            {projects.map(({ project, render }) => {
              const TechnicalIcon = render.state === 'ready' ? ShieldCheck : ShieldAlert;
              const nextView = suggestedWorkbenchView(project);
              const nextStep = workbenchSteps.find((step) => step.view === nextView)!;
              return (
                <article className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_150px_170px_auto]" key={project.id}>
                  <div className="min-w-0"><h2 className="truncate text-sm font-extrabold">{project.title}</h2><p className="mt-1 truncate text-[11px] text-slate-500">{project.sources.length} 份素材 · {project.scenes.length} 个场景</p></div>
                  <div className="hidden items-center gap-2 text-xs font-bold text-slate-700 sm:flex"><TechnicalIcon aria-hidden="true" className={`h-4 w-4 ${render.state === 'ready' ? 'text-emerald-600' : 'text-amber-600'}`} />{render.label}</div>
                  <div className="hidden text-xs font-bold text-slate-700 sm:block">{rightsLabel[project.rights_status]}</div>
                  <a className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 px-3 text-xs font-extrabold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" href={`/workbench?project=${encodeURIComponent(project.id)}&view=${nextView}`}>
                    {nextStep.label}
                    <ArrowRight aria-hidden="true" className="h-4 w-4" />
                  </a>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}
