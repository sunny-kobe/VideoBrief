import { ExternalLink, Film, ShieldCheck, TriangleAlert } from 'lucide-react';
import { ShortVideoProject } from '@/src/shortVideoBrief';
import { WorkbenchAsset } from '@/src/workbench';

interface WorkbenchSourceManagerProps {
  project: ShortVideoProject;
  assets: WorkbenchAsset[];
  activeSourceId: string;
  onSelect: (sourceId: string) => void;
}

const verificationLabel = {
  verified: '已核验',
  needs_check: '待核验',
  weak: '弱证据',
} as const;

const rightsLabel = {
  cleared: '可使用',
  review_required: '待复核',
  blocked: '禁止使用',
} as const;

export default function WorkbenchSourceManager({
  project,
  assets,
  activeSourceId,
  onSelect,
}: WorkbenchSourceManagerProps) {
  return (
    <section className="min-w-0 overflow-hidden rounded-md border border-slate-200 bg-white">
      <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
        <Film aria-hidden="true" className="h-4 w-4 text-slate-600" />
        <div>
          <h2 className="text-sm font-extrabold text-slate-950">素材库</h2>
          <p className="mt-1 text-xs text-slate-500">{project.sources.length} 个项目素材</p>
        </div>
      </div>

      <div className="divide-y divide-slate-200">
        {project.sources.map((source, index) => {
          const usedBy = project.scenes.filter((scene) => scene.sourceId === source.id).length;
          const asset = assets.find(
            (item) => item.kind === '素材' && item.path.endsWith(source.assetPath),
          );
          const active = source.id === activeSourceId;
          return (
            <article key={source.id} className={`px-4 py-4 ${active ? 'bg-emerald-50/70' : 'bg-white'}`}>
              <div className="flex items-start gap-3">
                <button
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md font-mono text-xs font-extrabold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${active ? 'bg-emerald-700 text-white' : 'bg-slate-900 text-white'}`}
                  type="button"
                  aria-label={`编辑素材 ${index + 1}`}
                  onClick={() => onSelect(source.id)}
                >
                  {index + 1}
                </button>
                <button
                  className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                  type="button"
                  onClick={() => onSelect(source.id)}
                >
                  <span className="block truncate text-sm font-extrabold text-slate-950">{source.label}</span>
                  <span className="mt-1 block truncate font-mono text-[11px] text-slate-500">{source.assetPath}</span>
                </button>
                {source.originUrl ? (
                  <a
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                    href={source.originUrl}
                    target="_blank"
                    rel="noreferrer"
                    title="打开一手来源"
                    aria-label={`打开 ${source.label} 的一手来源`}
                  >
                    <ExternalLink aria-hidden="true" className="h-4 w-4" />
                  </a>
                ) : null}
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3 pl-12 text-xs sm:grid-cols-4">
                <div>
                  <dt className="font-bold text-slate-400">类型</dt>
                  <dd className="mt-1 font-bold text-slate-700">{source.sourceType}</dd>
                </div>
                <div>
                  <dt className="font-bold text-slate-400">用于片段</dt>
                  <dd className="mt-1 font-bold text-slate-700">{usedBy} 个</dd>
                </div>
                <div>
                  <dt className="font-bold text-slate-400">本地文件</dt>
                  <dd className={`mt-1 font-bold ${asset?.exists ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {asset?.exists ? asset.size : '文件缺失'}
                  </dd>
                </div>
                <div>
                  <dt className="font-bold text-slate-400">状态</dt>
                  <dd className="mt-1 flex flex-wrap items-center gap-2 font-bold text-slate-700">
                    {source.verificationStatus === 'verified' ? (
                      <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5 text-emerald-600" />
                    ) : (
                      <TriangleAlert aria-hidden="true" className="h-3.5 w-3.5 text-amber-600" />
                    )}
                    {verificationLabel[source.verificationStatus]} / {rightsLabel[source.rightsStatus]}
                  </dd>
                </div>
              </dl>
            </article>
          );
        })}
      </div>
    </section>
  );
}
