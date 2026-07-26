function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function overlaps(leftStart, leftEnd, rightStart, rightEnd) {
  return leftStart < rightEnd && rightStart < leftEnd;
}

export function buildReviewWorkPackage(project, manifest) {
  const renderedById = new Map((manifest.scenes ?? []).map((scene) => [scene.id, scene]));
  const reviewedById = new Map((manifest.acceptance?.semantic?.scenes ?? []).map((scene) => [scene.sceneId, scene]));
  const freezes = manifest.proof?.quality?.freezeIntervals ?? [];
  const sources = new Map((project.sources ?? []).map((source) => [source.id, source]));

  const scenes = (project.scenes ?? []).filter((scene) => scene.enabled !== false).map((scene) => {
    const rendered = renderedById.get(scene.id) ?? {};
    const review = reviewedById.get(scene.id) ?? {};
    const candidate = (scene.candidates ?? []).find((item) => item.id === scene.selectedCandidateId);
    const outputStart = finite(rendered.start);
    const outputEnd = finite(rendered.end, outputStart);
    const risks = [];
    if (!candidate
      || candidate.sourceId !== scene.sourceId
      || candidate.sourceStart !== scene.sourceStart
      || candidate.sourceEnd !== scene.sourceEnd) {
      risks.push('选中候选与 canonical scene 的来源窗口不一致。');
    }
    const freezeIntervals = freezes.filter((interval) => overlaps(
      outputStart,
      outputEnd,
      finite(interval.start),
      finite(interval.end),
    ));
    if (freezeIntervals.length > 0) risks.push(`该幕与 ${freezeIntervals.length} 个冻结提示区间重叠。`);
    if (String(scene.subtitle ?? '').length > 34) risks.push('字幕字符较多，需要真人检查阅读压力和断句。');

    return {
      sceneId: scene.id,
      title: scene.title ?? '',
      subtitle: scene.subtitle ?? '',
      narration: scene.narration ?? '',
      visualRequirement: scene.visualRequirement ?? '',
      outputStart,
      outputEnd,
      sourceId: scene.sourceId,
      sourceLabel: sources.get(scene.sourceId)?.label ?? scene.sourceId,
      sourceStart: finite(scene.sourceStart),
      sourceEnd: finite(scene.sourceEnd),
      selectedCandidateId: scene.selectedCandidateId ?? '',
      selectionStatus: scene.selectionStatus ?? 'unselected',
      matchReason: candidate?.matchReason ?? '',
      rightsStatus: candidate?.rightsStatus ?? sources.get(scene.sourceId)?.rightsStatus ?? 'review_required',
      frames: Array.isArray(review.frames) ? review.frames : [],
      freezeIntervals,
      risks,
    };
  });

  return {
    schemaVersion: 1,
    projectId: project.id,
    projectTitle: project.title,
    videoPath: manifest.artifacts?.publicRender ?? manifest.artifacts?.outputVideo ?? '',
    videoSha256: manifest.acceptance?.videoSha256 ?? '',
    duration: finite(manifest.render?.duration),
    technicalProofPassed: manifest.proof?.passed === true,
    technicalWarnings: manifest.proof?.quality?.warnings ?? [],
    sceneCount: scenes.length,
    scenes,
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderReviewWorkPackageHtml(reviewPackage, pathToUrl = (value) => value) {
  const sceneHtml = reviewPackage.scenes.map((scene, index) => `
    <section class="scene">
      <header><span>${String(index + 1).padStart(2, '0')}</span><h2>${escapeHtml(scene.title || scene.sceneId)}</h2><time>${scene.outputStart.toFixed(2)}s–${scene.outputEnd.toFixed(2)}s</time></header>
      <div class="frames">${scene.frames.map((frame, frameIndex) => `<figure><img src="${escapeHtml(pathToUrl(frame))}" alt="${escapeHtml(scene.sceneId)} ${['开始', '中间', '结束'][frameIndex] ?? `帧${frameIndex + 1}`}" /><figcaption>${['开始', '中间', '结束'][frameIndex] ?? `帧 ${frameIndex + 1}`}</figcaption></figure>`).join('')}</div>
      <dl>
        <div><dt>旁白</dt><dd>${escapeHtml(scene.narration)}</dd></div>
        <div><dt>字幕</dt><dd>${escapeHtml(scene.subtitle)}</dd></div>
        <div><dt>画面要求</dt><dd>${escapeHtml(scene.visualRequirement)}</dd></div>
        <div><dt>来源窗口</dt><dd>${escapeHtml(scene.sourceLabel)} · ${scene.sourceStart.toFixed(2)}s–${scene.sourceEnd.toFixed(2)}s · ${escapeHtml(scene.selectionStatus)} · ${escapeHtml(scene.rightsStatus)}</dd></div>
        <div><dt>匹配理由</dt><dd>${escapeHtml(scene.matchReason || '未填写')}</dd></div>
      </dl>
      ${scene.risks.length ? `<ul class="risks">${scene.risks.map((risk) => `<li>${escapeHtml(risk)}</li>`).join('')}</ul>` : '<p class="clear">未发现机械风险提示，仍需真人判断语义和观看体验。</p>'}
    </section>`).join('');
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><link rel="icon" href="/icon.svg" /><title>${escapeHtml(reviewPackage.projectTitle)} · 审片工作包</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#eef1f4;color:#17202a;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;letter-spacing:0}.top{position:sticky;top:0;z-index:2;display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,420px);gap:20px;align-items:center;padding:18px 24px;background:#fff;border-bottom:1px solid #cfd6dd}.top h1{margin:0;font-size:20px}.top p{margin:7px 0 0;color:#5b6570;font-size:13px}.top video{width:100%;max-height:240px;background:#000}.content{max-width:1280px;margin:auto;padding:20px}.scene{margin-bottom:18px;background:#fff;border:1px solid #d6dce2}.scene header{display:grid;grid-template-columns:36px minmax(0,1fr) auto;gap:10px;align-items:center;padding:12px 14px;border-bottom:1px solid #d6dce2}.scene h2{margin:0;font-size:15px}.scene header span,.scene time{font-size:11px;font-weight:700;color:#607080}.frames{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;background:#d6dce2}.frames figure{margin:0;background:#0b1015}.frames img{display:block;width:100%;aspect-ratio:9/16;max-height:520px;object-fit:contain}.frames figcaption{padding:6px;text-align:center;color:#dfe7ee;font-size:11px}dl{margin:0;padding:12px 14px}dl div{display:grid;grid-template-columns:82px minmax(0,1fr);gap:12px;padding:7px 0;border-bottom:1px solid #edf0f2}dl div:last-child{border:0}dt{font-size:11px;font-weight:700;color:#607080}dd{margin:0;font-size:13px;line-height:1.65}.risks,.clear{margin:0;padding:10px 14px;background:#fff4df;color:#774b00;font-size:12px}.risks{padding-left:32px}.clear{background:#eaf7ef;color:#22613a}@media(max-width:720px){.top{position:static;grid-template-columns:1fr;padding:14px}.content{padding:10px}.scene header{grid-template-columns:30px minmax(0,1fr)}.scene time{grid-column:2}.frames{grid-template-columns:1fr}dl div{grid-template-columns:1fr;gap:3px}.frames img{max-height:none}}
</style></head><body><header class="top"><div><h1>${escapeHtml(reviewPackage.projectTitle)}</h1><p>${reviewPackage.sceneCount} 幕 · ${reviewPackage.duration.toFixed(2)} 秒 · video SHA-256 ${escapeHtml(reviewPackage.videoSha256 || '待绑定')}</p></div><video src="${escapeHtml(pathToUrl(reviewPackage.videoPath))}" controls playsinline></video></header><main class="content">${sceneHtml}</main></body></html>`;
}
