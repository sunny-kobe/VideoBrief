import { createHash } from 'node:crypto';

function sha256Text(value) {
  return createHash('sha256').update(value).digest('hex');
}

function isSha256(value) {
  return /^[a-f0-9]{64}$/i.test(String(value ?? ''));
}

function sameNumber(left, right, tolerance = 0.001) {
  return Number.isFinite(Number(left))
    && Number.isFinite(Number(right))
    && Math.abs(Number(left) - Number(right)) <= tolerance;
}

export function validateRenderPlan(plan, manifest) {
  const issues = [];
  if (!plan || typeof plan !== 'object') return ['Render plan is not a JSON object.'];
  const segmented = plan.schemaVersion === 3 && plan.strategy === 'segmented-concat';
  if (plan.schemaVersion !== 2 && !segmented) {
    issues.push(`Unsupported render plan schemaVersion ${plan.schemaVersion}.`);
  }
  if (plan.projectId !== manifest.projectId) issues.push('Render plan projectId does not match the manifest.');
  const renderProjectFingerprint = manifest.renderProjectFingerprint ?? manifest.projectFingerprint;
  if (plan.projectFingerprint !== renderProjectFingerprint) {
    issues.push('Render plan project fingerprint does not match the rendered project version.');
  }
  if (!sameNumber(plan.expectedDuration, manifest.render?.duration, 0.001)) {
    issues.push('Render plan duration does not match the manifest.');
  }
  for (const field of ['width', 'height', 'fps']) {
    if (!sameNumber(plan.render?.[field], manifest.render?.[field], 0.001)) {
      issues.push(`Render plan ${field} does not match the manifest.`);
    }
  }

  const filterComplex = String(plan.graph?.filterComplex ?? '');
  if (!segmented) {
    if (!filterComplex) {
      issues.push('Render plan has no filter_complex graph.');
    } else {
      const graphSha256 = sha256Text(filterComplex);
      if (graphSha256 !== plan.graph?.filterComplexSha256) {
        issues.push('Render plan filter_complex hash is invalid.');
      }
    }
  }

  const planInputs = Array.isArray(plan.inputs) ? plan.inputs : [];
  const manifestInputs = Array.isArray(manifest.renderInputs) ? manifest.renderInputs : [];
  if (planInputs.length === 0) issues.push('Render plan has no source inputs.');
  if (planInputs.length !== manifestInputs.length) {
    issues.push('Render plan source input count does not match the manifest.');
  }
  const manifestInputById = new Map(manifestInputs.map((input) => [input.sourceId, input]));
  for (const input of planInputs) {
    if (!isSha256(input.contentSha256)) {
      issues.push(`Render plan source ${input.sourceId ?? 'unknown'} has no valid content SHA-256.`);
    }
    const rendered = manifestInputById.get(input.sourceId);
    if (!rendered) {
      issues.push(`Render plan source ${input.sourceId ?? 'unknown'} is missing from the manifest.`);
      continue;
    }
    if (
      input.inputIndex !== rendered.inputIndex
      || input.sourceType !== rendered.sourceType
      || input.resolvedPath !== rendered.resolvedPath
      || input.contentSha256 !== rendered.contentSha256
    ) {
      issues.push(`Render plan source ${input.sourceId} does not match the manifest input.`);
    }
  }

  const commandArgs = Array.isArray(plan.command?.args)
    ? plan.command.args.map((value) => String(value))
    : [];
  if (commandArgs.length === 0) {
    issues.push('Render plan has no FFmpeg command arguments.');
  } else if (segmented) {
    const commandSha256 = sha256Text(JSON.stringify(commandArgs));
    if (commandSha256 !== plan.command?.argsSha256) {
      issues.push('Render plan concat command hash is invalid.');
    }
    if (commandSha256 !== manifest.renderCommandSha256) {
      issues.push('Render plan concat command does not match the manifest.');
    }
    const listInputIndex = commandArgs.indexOf('-i');
    if (
      listInputIndex < 0
      || commandArgs[listInputIndex + 1] !== plan.concat?.listPath
      || plan.concat?.command?.argsSha256 !== commandSha256
    ) {
      issues.push('Render plan concat command does not use the recorded segment list.');
    }
    if (
      commandArgs.at(-1) !== plan.concat?.command?.temporaryOutputPath
      || plan.command?.outputPath !== manifest.artifacts?.outputVideo
      || plan.concat?.command?.outputPath !== manifest.artifacts?.outputVideo
    ) {
      issues.push('Render plan concat output does not match the manifest.');
    }
  } else {
    const commandSha256 = sha256Text(JSON.stringify(commandArgs));
    if (commandSha256 !== plan.command?.argsSha256) {
      issues.push('Render plan FFmpeg command hash is invalid.');
    }
    if (commandSha256 !== manifest.renderCommandSha256) {
      issues.push('Render plan FFmpeg command does not match the manifest.');
    }
    const filterIndex = commandArgs.indexOf('-filter_complex');
    if (filterIndex < 0 || commandArgs[filterIndex + 1] !== filterComplex) {
      issues.push('Render plan FFmpeg command does not use the recorded filter_complex graph.');
    }
    const durationIndex = commandArgs.indexOf('-t');
    if (durationIndex < 0 || !sameNumber(commandArgs[durationIndex + 1], plan.expectedDuration, 0.001)) {
      issues.push('Render plan FFmpeg command duration does not match the plan.');
    }
    const commandInputs = commandArgs
      .map((value, index) => (value === '-i' ? commandArgs[index + 1] : null))
      .filter(Boolean);
    const expectedInputs = [...planInputs]
      .sort((left, right) => left.inputIndex - right.inputIndex)
      .map((input) => input.resolvedPath);
    if (
      commandInputs.length !== expectedInputs.length + 1
      || expectedInputs.some((path, index) => commandInputs[index] !== path)
      || commandInputs.at(-1) !== plan.command?.audioInputPath
    ) {
      issues.push('Render plan FFmpeg command inputs do not match the recorded source and audio inputs.');
    }
    if (commandArgs.at(-1) !== plan.command?.outputPath
      || plan.command?.outputPath !== manifest.artifacts?.outputVideo) {
      issues.push('Render plan FFmpeg output does not match the manifest.');
    }
  }

  const planScenes = Array.isArray(plan.scenes) ? plan.scenes : [];
  const manifestScenes = Array.isArray(manifest.scenes) ? manifest.scenes : [];
  if (planScenes.length !== manifestScenes.length) {
    issues.push('Render plan scene count does not match the manifest.');
  }
  const manifestById = new Map(manifestScenes.map((scene) => [scene.id, scene]));
  for (const scene of planScenes) {
    const rendered = manifestById.get(scene.id);
    if (!rendered) {
      issues.push(`Render plan scene ${scene.id} is missing from the manifest.`);
      continue;
    }
    if (
      scene.sourceId !== rendered.sourceId
      || !sameNumber(scene.sourceStart, rendered.sourceStart)
      || !sameNumber(scene.sourceEnd, rendered.sourceEnd)
      || !sameNumber(scene.mediaPlaybackRate ?? 1, rendered.mediaPlaybackRate ?? 1)
      || (scene.mediaMotion ?? 'none') !== (rendered.mediaMotion ?? 'none')
      || !sameNumber(scene.mediaMotionAmount ?? 0, rendered.mediaMotionAmount ?? 0)
      || (scene.mediaBackground ?? 'solid') !== (rendered.mediaBackground ?? 'solid')
      || !sameNumber(scene.outputStart, rendered.start)
      || !sameNumber(scene.outputEnd, rendered.end)
    ) {
      issues.push(`Render plan scene ${scene.id} does not match the manifest timeline.`);
    }
    if (!Number.isInteger(scene.frameCount) || scene.frameCount <= 0) {
      issues.push(`Render plan scene ${scene.id} has no positive integer frameCount.`);
    } else {
      const plannedDuration = Number(scene.outputEnd) - Number(scene.outputStart);
      if (!sameNumber(plannedDuration, scene.frameCount / Number(plan.render?.fps), 0.001)) {
        issues.push(`Render plan scene ${scene.id} duration is not aligned to its frameCount.`);
      }
      if (scene.frameCount !== rendered.frameCount) {
        issues.push(`Render plan scene ${scene.id} frameCount does not match the manifest.`);
      }
    }
    const sourceType = planInputs.find((input) => input.sourceId === scene.sourceId)?.sourceType;
    if (sourceType === 'video') {
      if (!sameNumber(scene.renderSourceEnd, rendered.renderSourceEnd, 0.001)) {
        issues.push(`Render plan scene ${scene.id} rendered source end does not match the manifest.`);
      }
      if (
        !Number.isFinite(Number(scene.renderSourceEnd))
        || Number(scene.renderSourceEnd) < Number(scene.sourceStart)
        || Number(scene.renderSourceEnd) > Number(scene.sourceEnd) + 0.001
      ) {
        issues.push(`Render plan scene ${scene.id} renders outside its selected source window.`);
      }
    }
    if (segmented) {
      if (
        !isSha256(scene.cacheKey)
        || !isSha256(scene.segmentSha256)
        || scene.cacheKey !== rendered.segmentCacheKey
        || scene.segmentSha256 !== rendered.segmentSha256
        || scene.segmentPath !== rendered.segmentPath
      ) {
        issues.push(`Render plan scene ${scene.id} has invalid segment cache evidence.`);
      }
      const createdFilter = String(scene.createdFrom?.filterComplex ?? '');
      if (
        !createdFilter
        || sha256Text(createdFilter) !== scene.createdFrom?.filterComplexSha256
      ) {
        issues.push(`Render plan scene ${scene.id} has invalid segment filter evidence.`);
      }
      const createdArgs = Array.isArray(scene.createdFrom?.command?.args)
        ? scene.createdFrom.command.args.map((value) => String(value))
        : [];
      if (
        createdArgs.length === 0
        || sha256Text(JSON.stringify(createdArgs)) !== scene.createdFrom?.command?.argsSha256
      ) {
        issues.push(`Render plan scene ${scene.id} has invalid segment command evidence.`);
      }
    }
  }
  return issues;
}
