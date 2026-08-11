'use client';

import { FormEvent, useState } from 'react';
import { ArrowLeft, FolderPlus } from 'lucide-react';

const fieldClass = 'mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 focus-visible:border-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200';

export default function NewProjectForm() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    const formData = new FormData(event.currentTarget);
    const payload = {
      id: String(formData.get('id') ?? '').trim() || `video-project-${Date.now()}`,
      title: String(formData.get('title') ?? ''),
      topicApproval: {
        decidedBy: String(formData.get('decidedBy') ?? ''),
        note: String(formData.get('decisionNote') ?? ''),
      },
      brief: {
        objective: String(formData.get('objective') ?? ''),
        audience: String(formData.get('audience') ?? ''),
        platform: String(formData.get('platform') ?? ''),
        aspectRatio: String(formData.get('aspectRatio') ?? '16:9'),
        targetDurationSeconds: Number(formData.get('targetDurationSeconds') ?? 45),
        tone: String(formData.get('tone') ?? ''),
        style: String(formData.get('style') ?? ''),
        reference: String(formData.get('reference') ?? ''),
        coreMessage: String(formData.get('coreMessage') ?? ''),
        cta: String(formData.get('cta') ?? ''),
        prohibitedMaterial: String(formData.get('prohibitedMaterial') ?? ''),
      },
    };
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? '项目创建失败');
      window.location.href = `/workbench?project=${encodeURIComponent(result.project.id)}&advanced=1&view=sources`;
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '项目创建失败');
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-4 sm:px-6">
          <a className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50" href="/" title="返回项目列表" aria-label="返回项目列表">
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          </a>
          <div>
            <p className="text-xs font-extrabold text-emerald-700">开始创作</p>
            <h1 className="text-lg font-extrabold">创建视频项目</h1>
          </div>
        </div>
      </header>
      <form className="mx-auto max-w-3xl px-4 py-6 sm:px-6" onSubmit={submit} autoComplete="off">
        <section className="border border-slate-200 bg-white">
          <div className="border-b border-slate-200 p-5">
            <p className="text-xs font-extrabold text-emerald-700">第 1 步</p>
            <h2 className="mt-1 text-base font-extrabold">说明这条视频要完成什么</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">先定义目标和受众。创建后会进入素材导入，不会立即生成或发布视频。</p>
          </div>
          <div className="space-y-4 p-5">
            <label className="block"><span className="text-xs font-bold text-slate-600">项目标题</span><input className={fieldClass} name="title" placeholder="例如：3 分钟产品功能介绍…" required /></label>
            <label className="block"><span className="text-xs font-bold text-slate-600">你希望观众看完后知道什么？</span><textarea className={`${fieldClass} min-h-24 resize-y`} name="objective" placeholder="例如：理解产品如何把本地资料整理成可编辑视频…" required /></label>
            <label className="block"><span className="text-xs font-bold text-slate-600">必须讲清楚的核心观点</span><textarea className={`${fieldClass} min-h-24 resize-y`} name="coreMessage" placeholder="例如：AI 准备草案，事实和发布仍由用户确认…" required /></label>
            <label className="block"><span className="text-xs font-bold text-slate-600">主要观众</span><input className={fieldClass} name="audience" placeholder="例如：第一次使用产品的个人创作者…" required /></label>
          </div>
          <details className="border-t border-slate-200">
            <summary className="cursor-pointer px-5 py-4 text-sm font-extrabold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">可选：输出和内容限制</summary>
            <div className="grid gap-4 border-t border-slate-200 bg-slate-50 p-5 sm:grid-cols-2">
              <label className="block"><span className="text-xs font-bold text-slate-600">发布场景</span><input className={fieldClass} name="platform" defaultValue="横版视频" /></label>
              <label className="block"><span className="text-xs font-bold text-slate-600">画幅</span><select className={fieldClass} name="aspectRatio" defaultValue="16:9"><option value="16:9">横屏 16:9</option><option value="9:16">竖屏 9:16</option><option value="1:1">方形 1:1</option></select></label>
              <label className="block"><span className="text-xs font-bold text-slate-600">目标时长（秒）</span><input className={fieldClass} name="targetDurationSeconds" type="number" inputMode="numeric" min="3" max="900" defaultValue="45" /></label>
              <label className="block"><span className="text-xs font-bold text-slate-600">表达语气</span><input className={fieldClass} name="tone" placeholder="例如：清晰、克制…" /></label>
              <label className="block sm:col-span-2"><span className="text-xs font-bold text-slate-600">视觉风格</span><input className={fieldClass} name="style" placeholder="例如：真实录屏、简洁字幕…" /></label>
              <label className="block sm:col-span-2"><span className="text-xs font-bold text-slate-600">参考样例</span><input className={fieldClass} name="reference" placeholder="描述参考节奏或视觉，不需要提供链接…" /></label>
              <label className="block sm:col-span-2"><span className="text-xs font-bold text-slate-600">希望观众采取的行动</span><input className={fieldClass} name="cta" placeholder="例如：查看完整教程…" /></label>
              <label className="block sm:col-span-2"><span className="text-xs font-bold text-slate-600">禁止使用的素材和表达</span><textarea className={`${fieldClass} min-h-20 resize-y`} name="prohibitedMaterial" placeholder="例如：未授权第三方视频、无法核验的数字…" /></label>
              <label className="block sm:col-span-2"><span className="text-xs font-bold text-slate-600">项目 ID（高级）</span><input className={fieldClass} name="id" placeholder="留空会自动生成…" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" spellCheck={false} /></label>
            </div>
          </details>
          <div className="grid gap-4 border-t border-slate-200 p-5 sm:grid-cols-[180px_minmax(0,1fr)]">
            <label className="block"><span className="text-xs font-bold text-slate-600">命题批准者</span><input className={fieldClass} name="decidedBy" placeholder="真实人工批准者" required /></label>
            <label className="block"><span className="text-xs font-bold text-slate-600">命题决策说明</span><input className={fieldClass} name="decisionNote" minLength={12} placeholder="说明为什么值得进入素材与研究阶段" required /></label>
          </div>
        </section>
        <div className="mt-5 flex items-center justify-between gap-4">
          {error ? <p className="text-sm font-bold text-rose-700" role="alert">{error}</p> : <span />}
          <button className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-extrabold text-white disabled:bg-slate-400" type="submit" disabled={submitting}>
            <FolderPlus aria-hidden="true" className="h-4 w-4" />
            {submitting ? '创建中…' : '创建项目，下一步导入素材'}
          </button>
        </div>
      </form>
    </main>
  );
}
