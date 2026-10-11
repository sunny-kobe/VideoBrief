import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  FileText,
  Play,
  ShieldCheck,
} from 'lucide-react';
import CopyPromptButton from '@/src/components/CopyPromptButton';
import { readAudienceSampleShowcase } from '@/src/audienceSampleWorkflowServer';
import type { ProjectRightsStatus, PublicationStatus } from '@/src/shortVideoBrief';

export const dynamic = 'force-dynamic';

function compactHash(value: string) {
  return value ? `${value.slice(0, 10)}...${value.slice(-6)}` : '暂无';
}

const rightsLabel: Record<ProjectRightsStatus, string> = {
  cleared: '素材权利已确认',
  review_required: '素材权利待复核',
  blocked: '素材权利受阻',
};

const publicationLabel: Record<PublicationStatus, string> = {
  'draft-unpublished': '未发布',
  'ready-for-review': '等待发布确认',
  published: '已发布',
};

export default function ShowcasePage() {
  const { workflow, kickoffPrompt, styleExperiment, samples } = readAudienceSampleShowcase();
  const passedCount = samples.filter((sample) => sample.automatedAcceptancePassed).length;
  const publishedCount = samples.filter((sample) => sample.project.publication_status === 'published').length;
  const pendingDeliveryCount = samples.filter((sample) => sample.project.workflow.deliveryApproval.status === 'pending').length;

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <a className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50" href="/" title="返回项目列表" aria-label="返回项目列表">
              <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            </a>
            <div className="min-w-0">
              <p className="text-xs font-extrabold text-emerald-700">{workflow.label}</p>
              <h1 className="mt-1 truncate text-xl font-extrabold">{workflow.title}</h1>
            </div>
          </div>
          <CopyPromptButton text={kickoffPrompt} />
        </div>
      </header>

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-7 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
          <div>
            <p className="max-w-3xl text-base font-bold leading-7 text-slate-800">{workflow.direction}</p>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">页面只聚合当前 canonical project 与 render manifest 的仓库证据；外部 B站发布与反馈需实时核验，Topic Gate 评分不等于市场验证。</p>
          </div>
          <dl className="grid grid-cols-3 border border-slate-200 bg-slate-50 text-center">
            <div className="px-3 py-3"><dt className="text-[10px] font-bold text-slate-500">参考样片</dt><dd className="mt-1 text-lg font-extrabold">{samples.length}</dd></div>
            <div className="border-x border-slate-200 px-3 py-3"><dt className="text-[10px] font-bold text-slate-500">自动验收</dt><dd className="mt-1 text-lg font-extrabold text-emerald-700">{passedCount}</dd></div>
            <div className="px-3 py-3"><dt className="text-[10px] font-bold text-slate-500">仓库发布记录</dt><dd className="mt-1 text-lg font-extrabold">{publishedCount}</dd></div>
          </dl>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6" aria-labelledby="samples-heading">
        <div className="flex items-end justify-between gap-4">
          <div><p className="text-xs font-extrabold text-slate-500">CURRENT OUTPUTS</p><h2 id="samples-heading" className="mt-1 text-lg font-extrabold">已完成样片</h2></div>
          <p className="text-xs font-bold text-slate-500">{pendingDeliveryCount}/{samples.length} 停在人工 Delivery Gate</p>
        </div>
        <div className="mt-4 border-y border-slate-200 bg-white">
          {samples.map((sample, index) => {
            const accepted = sample.automatedAcceptancePassed;
            return (
              <article className={`grid gap-5 p-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)] lg:items-center ${index > 0 ? 'border-t border-slate-200' : ''}`} key={sample.project.id}>
                <div className="aspect-video min-w-0 overflow-hidden bg-black">
                  {sample.renderHref ? (
                    <video className="h-full w-full object-contain" controls playsInline preload="metadata" src={sample.renderHref} />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm font-bold text-slate-400">当前成片不可播放</div>
                  )}
                </div>
                <div className="min-w-0 py-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs font-extrabold">
                    <span className="text-emerald-700">{sample.reference.role}</span>
                    <span>{sample.reference.topicScore}/{sample.reference.topicScoreMax}</span>
                    <span>{sample.duration.toFixed(1)} 秒</span>
                  </div>
                  <h3 className="mt-3 text-lg font-extrabold leading-7">{sample.project.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{sample.reference.learning}</p>
                  <div className="mt-4 grid gap-2 text-xs font-bold text-slate-700 sm:grid-cols-2">
                    <p className="flex items-center gap-2">{accepted ? <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-emerald-600" /> : <CircleAlert aria-hidden="true" className="h-4 w-4 text-amber-600" />}{accepted ? '自动验收通过' : sample.render.label}</p>
                    <p className="flex items-center gap-2"><ShieldCheck aria-hidden="true" className={`h-4 w-4 ${sample.project.rights_status === 'cleared' ? 'text-emerald-600' : sample.project.rights_status === 'blocked' ? 'text-red-600' : 'text-amber-600'}`} />{rightsLabel[sample.project.rights_status]}</p>
                    <p className="flex items-center gap-2"><FileText aria-hidden="true" className="h-4 w-4 text-slate-500" />Delivery Gate: {sample.project.workflow.deliveryApproval.status}</p>
                    <p className="flex items-center gap-2"><ExternalLink aria-hidden="true" className="h-4 w-4 text-slate-500" />{publicationLabel[sample.project.publication_status]}</p>
                    <p className="truncate font-mono text-[11px] text-slate-500" title={sample.videoSha256}>SHA {compactHash(sample.videoSha256)}</p>
                  </div>
                  <a className="mt-5 inline-flex h-9 items-center gap-2 rounded-md bg-slate-950 px-3 text-xs font-extrabold text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" href={`/short-video?project=${encodeURIComponent(sample.project.id)}`}>
                    <Play aria-hidden="true" className="h-4 w-4" />
                    单片播放
                    <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white" aria-labelledby="experiment-heading">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-4xl">
              <p className="text-xs font-extrabold text-emerald-700">ACTIVE STYLE EXPERIMENT</p>
              <h2 id="experiment-heading" className="mt-1 text-lg font-extrabold">{styleExperiment.label}</h2>
              <p className="mt-3 text-sm font-bold leading-6 text-slate-900">{styleExperiment.audiencePromise}</p>
              <p className="mt-3 text-sm leading-6 text-slate-600">{styleExperiment.hypothesis}</p>
            </div>
            <span className="border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-extrabold text-emerald-800">
              {styleExperiment.status === 'active' ? '实验中' : '已完成'}
            </span>
          </div>
          <dl className="mt-6 grid border-y border-slate-200 text-sm sm:grid-cols-3">
            <div className="py-4 sm:pr-5">
              <dt className="text-xs font-bold text-slate-500">格式与时长</dt>
              <dd className="mt-1 space-y-1 font-extrabold">
                {styleExperiment.formats.map((format) => (
                  <span className="block" key={format.id}>{format.label} {format.minDurationSeconds}-{format.maxDurationSeconds} 秒</span>
                ))}
              </dd>
            </div>
            <div className="border-t border-slate-200 py-4 sm:border-l sm:border-t-0 sm:px-5">
              <dt className="text-xs font-bold text-slate-500">数据快照</dt>
              <dd className="mt-1 font-extrabold">{styleExperiment.measurement.snapshotHours.map((hour) => `${hour}h`).join(' / ')}</dd>
            </div>
            <div className="border-t border-slate-200 py-4 sm:border-l sm:border-t-0 sm:pl-5">
              <dt className="text-xs font-bold text-slate-500">下次复盘</dt>
              <dd className="mt-1 font-extrabold">{styleExperiment.reviewAfterPublishedVideos} 条新视频或 {styleExperiment.reviewDeadline}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white" aria-labelledby="workflow-heading">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <p className="text-xs font-extrabold text-slate-500">WORKFLOW V1</p>
          <h2 id="workflow-heading" className="mt-1 text-lg font-extrabold">从发布复盘到 Topic Gate</h2>
          <ol className="mt-5 grid gap-px overflow-hidden border border-slate-200 bg-slate-200 sm:grid-cols-2 lg:grid-cols-4">
            {workflow.stages.map((stage, index) => (
              <li className="min-h-40 bg-white p-4" key={stage.id}>
                <div className="flex items-start justify-between gap-3"><span className="font-mono text-xs font-extrabold text-emerald-700">{String(index + 1).padStart(2, '0')}</span>{stage.gate ? <span className="text-[10px] font-extrabold text-amber-700">{stage.gate}</span> : null}</div>
                <h3 className="mt-5 text-sm font-extrabold">{stage.label}</h3>
                <p className="mt-2 text-xs leading-5 text-slate-500">{stage.description}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6" aria-labelledby="prompt-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-xs font-extrabold text-slate-500">REUSABLE PROMPT</p><h2 id="prompt-heading" className="mt-1 text-lg font-extrabold">下一阶段命题调研提示词</h2></div>
          <CopyPromptButton text={kickoffPrompt} />
        </div>
        <pre
          className="mt-4 overflow-auto border border-slate-800 bg-slate-950 p-5 font-mono text-xs leading-6 whitespace-pre-wrap text-slate-100"
          style={{ maxHeight: 'min(34rem, 60vh)' }}
        >
          {kickoffPrompt}
        </pre>
        <div className="mt-4 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
          <p><span className="font-bold text-slate-700">生产手册：</span><code>{workflow.playbookPath}</code></p>
          <p><span className="font-bold text-slate-700">流程配置：</span><code>content/workflows/self-owned-explainer-v1/workflow.json</code></p>
          <p><span className="font-bold text-slate-700">风格实验：</span><code>{workflow.styleExperimentPath}</code></p>
          <p><span className="font-bold text-slate-700">表现复盘：</span><code>{workflow.performanceReviewPath}</code></p>
        </div>
      </section>
    </main>
  );
}
