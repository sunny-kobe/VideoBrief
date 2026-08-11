import { createHash } from 'node:crypto';

function hash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function selectedCandidate(scene) {
  return (scene?.candidates ?? []).find((candidate) => candidate.id === scene.selectedCandidateId) ?? null;
}

export function materialQualitySceneFingerprint(project, scene) {
  const candidate = selectedCandidate(scene);
  return hash({
    scene: {
      id: scene?.id,
      title: scene?.title,
      subtitle: scene?.subtitle,
      narration: scene?.narration,
      visualRequirement: scene?.visualRequirement,
      sourceReferences: scene?.sourceReferences ?? [],
      selectedCandidateId: scene?.selectedCandidateId,
      sourceId: scene?.sourceId,
      sourceStart: scene?.sourceStart,
      sourceEnd: scene?.sourceEnd,
      mediaFit: scene?.mediaFit ?? project?.render?.mediaFit,
      mediaFocalX: scene?.mediaFocalX ?? null,
      mediaFocalY: scene?.mediaFocalY ?? null,
      mediaPlaybackRate: scene?.mediaPlaybackRate ?? 1,
      mediaMotion: scene?.mediaMotion ?? 'none',
      mediaMotionAmount: scene?.mediaMotionAmount ?? null,
      subtitleBottom: scene?.subtitleBottom ?? project?.render?.subtitleBottom ?? null,
    },
    candidate: candidate ? {
      id: candidate.id,
      sourceId: candidate.sourceId,
      assetPath: candidate.assetPath,
      mediaType: candidate.mediaType,
      sourceStart: candidate.sourceStart,
      sourceEnd: candidate.sourceEnd,
    } : null,
    render: {
      width: project?.render?.width,
      height: project?.render?.height,
      fps: project?.render?.fps,
      renditions: project?.renditions ?? [],
    },
  });
}

function reviewIssueLabel(scene) {
  return `场景「${scene?.title || scene?.id || 'unknown'}」`;
}

export function materialQualityGateReadiness(project) {
  const gate = project?.materialQualityReview;
  if (!gate) {
    if (project?.workflow) {
      return {
        ready: false,
        required: true,
        issues: ['正式项目缺少当前版本的素材质量 Gate。'],
        reviewedSceneCount: 0,
      };
    }
    return { ready: true, required: false, issues: [], reviewedSceneCount: 0 };
  }

  const issues = [];
  const enabledScenes = (project?.scenes ?? []).filter((scene) => scene.enabled !== false);
  const reviews = Array.isArray(gate.sceneReviews) ? gate.sceneReviews : [];

  if (gate.schemaVersion !== 1) issues.push('素材质量 Gate 版本不受支持。');
  if (gate.status !== 'passed') issues.push(`素材质量 Gate 当前状态为 ${gate.status ?? 'pending'}。`);
  if (gate.status === 'passed' && (!String(gate.reviewer ?? '').trim() || !String(gate.reviewedAt ?? '').trim())) {
    issues.push('素材质量 Gate 缺少复核人或复核时间。');
  }

  for (const scene of enabledScenes) {
    const label = reviewIssueLabel(scene);
    const review = reviews.find((item) => item.sceneId === scene.id);
    if (!review) {
      issues.push(`${label}没有当前素材质量复核。`);
      continue;
    }
    const candidate = selectedCandidate(scene);
    if (!candidate) {
      issues.push(`${label}没有可绑定的已选候选。`);
      continue;
    }
    if (
      review.candidate?.sourceId !== scene.sourceId
      || review.candidate?.sourceStart !== scene.sourceStart
      || review.candidate?.sourceEnd !== scene.sourceEnd
    ) {
      issues.push(`${label}的素材质量复核未绑定当前 sourceId/sourceStart/sourceEnd。`);
    }
    if (review.sceneFingerprint !== materialQualitySceneFingerprint(project, scene)) {
      issues.push(`${label}的旁白、画面要求、候选、运动或输出规格已变化，必须重新复核。`);
    }
    if (review.decision !== 'accept') issues.push(`${label}的素材质量结论不是 accept。`);
    if (Number(review.narrationMatch?.score) < 2) issues.push(`${label}不能直接支持当前旁白。`);

    const informationBearing = !['transition', 'background'].includes(review.evidenceRole);
    if (informationBearing && review.readability?.desktop !== 'passed') {
      issues.push(`${label}在目标桌面视口不可直接读取。`);
    }
    if (informationBearing && review.readability?.mobile !== 'passed') {
      issues.push(`${label}在目标移动视口不可直接读取。`);
    }
    if (review.temporalCompleteness?.status === 'failed') {
      issues.push(`${label}的候选窗口没有覆盖完整教学状态。`);
    }
    if (
      review.stability?.status === 'unstable'
      || (review.stability?.status === 'minor-motion' && review.stability?.motionNecessary !== true)
    ) {
      issues.push(`${label}存在不必要或影响阅读的镜头运动。`);
    }
    if (review.uniqueness?.status === 'duplicate') {
      issues.push(`${label}重复使用不能支持当前观点的通用画面。`);
    }
    if (review.platformWatermark?.status === 'present') {
      const marks = Array.isArray(review.platformWatermark.marks)
        ? review.platformWatermark.marks.filter(Boolean).join('、')
        : '';
      issues.push(`${label}包含不允许进入正式成片的平台或账号水印${marks ? `：${marks}` : '。'}`);
    } else if (!['absent', 'not-applicable'].includes(review.platformWatermark?.status)) {
      issues.push(`${label}尚未完成平台水印复核。`);
    }
    if (!Array.isArray(review.evidence) || review.evidence.length === 0) {
      issues.push(`${label}没有 start/mid/end 或视口证据。`);
    }
  }

  return {
    ready: issues.length === 0,
    required: true,
    issues,
    reviewedSceneCount: reviews.length,
  };
}

export function buildMaterialQualityReview(project, report, reviewer, reviewedAt = new Date().toISOString()) {
  if (!report || report.projectId !== project.id || !Array.isArray(report.reviews)) {
    throw new Error('素材质量报告必须包含匹配当前项目的 projectId 和 reviews。');
  }
  const enabledScenes = (project.scenes ?? []).filter((scene) => scene.enabled !== false);
  const sceneReviews = enabledScenes.map((scene) => {
    const review = report.reviews.find((item) => item.sceneId === scene.id);
    if (!review) throw new Error(`素材质量报告缺少场景 ${scene.id}。`);
    const candidate = selectedCandidate(scene);
    if (!candidate) throw new Error(`场景 ${scene.id} 没有已选候选。`);
    if (
      review.candidate?.sourceId !== scene.sourceId
      || review.candidate?.sourceStart !== scene.sourceStart
      || review.candidate?.sourceEnd !== scene.sourceEnd
    ) {
      throw new Error(`场景 ${scene.id} 的报告候选与当前 sourceId/sourceStart/sourceEnd 不一致。`);
    }
    return {
      sceneId: scene.id,
      sceneFingerprint: materialQualitySceneFingerprint(project, scene),
      candidate: {
        sourceId: review.candidate.sourceId,
        sourceStart: review.candidate.sourceStart,
        sourceEnd: review.candidate.sourceEnd,
      },
      visibleClaim: String(review.visibleClaim ?? ''),
      evidenceRole: review.evidenceRole,
      narrationMatch: review.narrationMatch,
      readability: review.readability,
      temporalCompleteness: review.temporalCompleteness,
      stability: review.stability,
      uniqueness: review.uniqueness,
      platformWatermark: {
        status: ['absent', 'present', 'not-applicable'].includes(review.platformWatermark?.status)
          ? review.platformWatermark.status
          : 'not-reviewed',
        marks: Array.isArray(review.platformWatermark?.marks)
          ? review.platformWatermark.marks.map((mark) => String(mark).trim()).filter(Boolean)
          : [],
        reason: String(review.platformWatermark?.reason ?? ''),
      },
      decision: review.decision,
      decisionReasons: Array.isArray(review.decisionReasons) ? review.decisionReasons : [],
      evidence: Array.isArray(review.evidence) ? review.evidence : [],
    };
  });
  const passed = sceneReviews.every((review) => review.decision === 'accept');
  return {
    schemaVersion: 1,
    status: passed ? 'passed' : 'failed',
    reviewedAt,
    reviewer: String(reviewer ?? '').trim(),
    reviewScope: String(report.reviewScope ?? ''),
    sceneReviews,
  };
}
