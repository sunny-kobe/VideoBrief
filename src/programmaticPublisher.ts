import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';

import { exportPackageReadiness, fileSha256, readExportPackageReceipt } from './exportPackage';
import { applyProductionWorkflowAction } from './productionWorkflow';
import { workflowRuntimeEvidence } from './productionWorkflowServer';
import {
  projectFingerprint,
  projectPackageContentFingerprint,
  projectPaths,
  projectProductionContentFingerprint,
  readBrief,
  readRenderManifest,
  updateCanonicalProject,
} from './shortVideoProjectServer';
import { approvalIsCurrent } from '../scripts/lib/production-workflow-contract.mjs';

export type ProgrammaticPublisherPlatform =
  | 'bilibili'
  | 'douyin'
  | 'xiaohongshu'
  | 'tencent'
  | 'youtube';

export interface ProgrammaticPublicationCopy {
  title: string;
  description: string;
  hashtags: string[];
  generatedByAi: boolean;
}

export interface SauUploadPlanInput {
  platform: ProgrammaticPublisherPlatform;
  accountName: string;
  videoPath: string;
  coverPath: string;
  copy: ProgrammaticPublicationCopy;
  schedule?: string;
  bilibiliCategoryId?: number;
  headed?: boolean;
}

export interface ProgrammaticPublicationPlan {
  projectId: string;
  targetId: string;
  platform: ProgrammaticPublisherPlatform;
  publisher: 'social-auto-upload';
  accountName: string;
  executable: string;
  cwd: string;
  args: string[];
  schedule: string;
  scheduledAt: string;
  videoPath: string;
  coverPath: string;
  runDirectory: string;
  copy: ProgrammaticPublicationCopy;
}

const defaultPublisherHome = resolve('output/publish-pilot-20260808/tool/social-auto-upload');

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizePublisherPlatform(value: string): ProgrammaticPublisherPlatform {
  const normalized = value.trim().toLowerCase();
  const aliases: Record<string, ProgrammaticPublisherPlatform> = {
    'b站': 'bilibili', bilibili: 'bilibili',
    '抖音': 'douyin', douyin: 'douyin',
    '小红书': 'xiaohongshu', xiaohongshu: 'xiaohongshu',
    '视频号': 'tencent', '微信视频号': 'tencent', 'wechat-channels': 'tencent', tencent: 'tencent',
    youtube: 'youtube', 'YouTube': 'youtube',
  };
  const platform = aliases[value.trim()] ?? aliases[normalized];
  if (!platform) throw new Error(`暂不支持程序化上传平台：${value}`);
  return platform;
}

export function normalizeSchedule(value: string, now = new Date()) {
  if (!value.trim()) return { sauValue: '', isoValue: '' };
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  const parsed = match
    ? new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6] ?? '00'}+08:00`)
    : new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error('定时发布时间无效。');
  if (parsed.getTime() <= now.getTime()) throw new Error('定时发布时间必须晚于当前时间。');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(parsed).reduce<Record<string, string>>((result, part) => {
    if (part.type !== 'literal') result[part.type] = part.value;
    return result;
  }, {});
  return {
    sauValue: `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`,
    isoValue: parsed.toISOString(),
  };
}

export function buildSauUploadArgs(input: SauUploadPlanInput) {
  if (!input.accountName.trim()) throw new Error('程序化发布必须指定账号名称。');
  if (!input.copy.title.trim()) throw new Error('平台标题不能为空。');
  const args = [
    input.platform,
    'upload-video',
    '--account', input.accountName.trim(),
    '--file', resolve(input.videoPath),
    '--title', input.copy.title.trim(),
    '--desc', input.copy.description,
    '--tags', input.copy.hashtags.map((item) => item.replace(/^#/, '').trim()).filter(Boolean).join(','),
  ];
  if (input.platform === 'bilibili') {
    const tid = Number(input.bilibiliCategoryId);
    if (!Number.isInteger(tid) || tid <= 0) throw new Error('B站程序化发布必须指定有效的分区 ID。');
    args.push('--tid', String(tid));
    if (input.coverPath) args.push('--thumbnail', resolve(input.coverPath));
    if (input.schedule) args.push('--schedule', input.schedule);
  } else if (input.platform === 'youtube') {
    if (input.schedule) throw new Error('当前 social-auto-upload 的 YouTube 适配器不支持定时发布。');
    if (input.coverPath) args.push('--thumbnail', resolve(input.coverPath));
    args.push('--visibility', 'public', input.headed ? '--headed' : '--headless');
  } else {
    if (input.schedule) args.push('--schedule', input.schedule);
    if (input.copy.generatedByAi && input.platform === 'douyin') {
      args.push('--declaration', '内容由AI生成');
    }
    if (input.copy.generatedByAi && input.platform === 'tencent') {
      args.push('--declaration', 'AI生成内容');
    }
    args.push(input.headed ? '--headed' : '--headless');
  }
  return args;
}

function publisherHome() {
  return resolve(process.env.VIDEOBRIEF_SOCIAL_AUTO_UPLOAD_HOME || defaultPublisherHome);
}

function publisherExecutable(home = publisherHome()) {
  return join(home, '.venv', 'bin', 'sau');
}

function migrateLegacyBilibiliAccount(home: string, accountName: string) {
  const target = join(home, 'cookies', `bilibili_${accountName}.json`);
  if (existsSync(target)) return;
  const legacy = resolve('output/publish-pilot-20260808', `${accountName}-cookies.json`);
  if (!existsSync(legacy)) return;
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(legacy, target);
  chmodSync(target, 0o600);
}

function migrateLegacyBilibiliRuntime() {
  const system = process.platform === 'darwin' ? 'macos' : process.platform;
  const machine = process.arch === 'arm64' ? 'aarch64' : process.arch === 'x64' ? 'x86_64' : process.arch;
  const target = join(homedir(), '.social-auto-upload', 'tools', 'biliup', `${system}-${machine}`, 'biliup');
  if (existsSync(target)) return;
  const legacy = resolve(
    'output/publish-pilot-20260808/tool/biliupR-v1.2.2-aarch64-macos/biliup',
  );
  if (!existsSync(legacy)) return;
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(legacy, target);
  chmodSync(target, 0o755);
}

function readPublicationCopy(path: string): ProgrammaticPublicationCopy {
  const value = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  const hashtags = Array.isArray(value.hashtags)
    ? value.hashtags.filter((item): item is string => typeof item === 'string')
    : [];
  return {
    title: text(value.title),
    description: typeof value.description === 'string' ? value.description : '',
    hashtags,
    generatedByAi: value.generatedByAi === true,
  };
}

export function prepareProgrammaticPublication(input: {
  projectId: string;
  targetId: string;
  accountName: string;
  schedule?: string;
  bilibiliCategoryId?: number;
  headed?: boolean;
  now?: Date;
}): ProgrammaticPublicationPlan {
  const project = readBrief(input.projectId);
  const runtime = workflowRuntimeEvidence(input.projectId);
  const target = (project.workflow.publicationTargets ?? []).find((item) => item.id === input.targetId);
  if (!target) throw new Error('找不到指定的发布平台目标。');
  if (project.rights_status !== 'cleared') throw new Error('素材权利尚未全部 cleared，程序拒绝上传。');
  if (!runtime.packageReady || !runtime.packageSha256) throw new Error('当前 production package 缺失或已过期。');
  const binding = `${runtime.videoSha256}:${runtime.packageSha256}`;
  if (!approvalIsCurrent(target.approval, binding)) {
    throw new Error('当前平台目标尚未获得与 production package 绑定的人工发布批准。');
  }
  if (target.status === 'published') throw new Error('该平台目标已发布，程序拒绝重复投稿。');

  const paths = projectPaths(project);
  const manifest = readRenderManifest(paths.manifestPath);
  const receipt = readExportPackageReceipt(paths.exportPackageReceiptPath);
  if (!manifest || !receipt) throw new Error('当前导出包缺少渲染清单或版本收据。');
  const readiness = exportPackageReadiness({
    projectId: project.id,
    projectFingerprint: projectFingerprint(project.id),
    productionContentFingerprint: projectProductionContentFingerprint(project.id),
    packageContentFingerprint: projectPackageContentFingerprint(project.id),
    renderedAt: manifest.renderedAt,
    renderManifestPath: paths.manifestPath,
    videoPath: manifest.artifacts.publicRender ?? manifest.artifacts.outputVideo,
    coverPath: paths.coverImagePath,
    zipPath: paths.exportZipPath,
    deliveryApproval: project.workflow.deliveryApproval,
    receipt,
  });
  if (!readiness.ready) throw new Error(readiness.reason);

  const finalVideoPath = join(paths.exportDir, 'final.mp4');
  if (!existsSync(finalVideoPath) || fileSha256(finalVideoPath) !== receipt.videoSha256) {
    throw new Error('导出包中的 final.mp4 与批准成片字节不一致。');
  }
  if (!existsSync(paths.coverImagePath)) throw new Error('正式封面缺失。');

  const platform = normalizePublisherPlatform(target.platform || target.id);
  const schedule = normalizeSchedule(input.schedule ?? '', input.now);
  const home = publisherHome();
  const executable = publisherExecutable(home);
  if (!existsSync(executable)) throw new Error(`程序化上传器尚未安装：${executable}`);
  const copy = readPublicationCopy(paths.platformCopyPath);
  copy.generatedByAi = copy.generatedByAi
    || ['edge-tts', 'gemini-tts', 'macos-say'].includes(project.render.voiceEngine);
  const args = buildSauUploadArgs({
    platform,
    accountName: input.accountName,
    videoPath: finalVideoPath,
    coverPath: paths.coverImagePath,
    copy,
    schedule: schedule.sauValue,
    bilibiliCategoryId: input.bilibiliCategoryId,
    headed: input.headed,
  });
  return {
    projectId: project.id,
    targetId: target.id,
    platform,
    publisher: 'social-auto-upload',
    accountName: input.accountName.trim(),
    executable,
    cwd: home,
    args,
    schedule: schedule.sauValue,
    scheduledAt: schedule.isoValue,
    videoPath: finalVideoPath,
    coverPath: paths.coverImagePath,
    runDirectory: join(paths.exportDir, 'publication-runs'),
    copy,
  };
}

export function sanitizePublisherLog(value: string) {
  const withoutAnsi = value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '');
  return withoutAnsi.split(/\r?\n/).map((line) => (
    /(authorization|cookie|credential|session|access[_ -]?token|refresh[_ -]?token)/i.test(line)
      ? '[sensitive line redacted]'
      : line
  )).join('\n');
}

async function runPublisherCommand(
  executable: string,
  args: string[],
  cwd: string,
  options: { inherit?: boolean } = {},
) {
  return await new Promise<{ code: number; output: string }>((accept, reject) => {
    const child = spawn(executable, args, {
      cwd,
      stdio: options.inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
    let output = '';
    const capture = (chunk: Buffer) => {
      if (output.length < 2_000_000) output += chunk.toString('utf8');
    };
    if (!options.inherit) {
      child.stdout?.on('data', capture);
      child.stderr?.on('data', capture);
    }
    child.on('error', reject);
    child.on('close', (code) => accept({ code: code ?? 1, output: sanitizePublisherLog(output) }));
  });
}

export async function checkProgrammaticPublisherAccount(platformValue: string, accountName: string) {
  const platform = normalizePublisherPlatform(platformValue);
  const home = publisherHome();
  const executable = publisherExecutable(home);
  if (!existsSync(executable)) throw new Error(`程序化上传器尚未安装：${executable}`);
  if (platform === 'bilibili') {
    migrateLegacyBilibiliRuntime();
    migrateLegacyBilibiliAccount(home, accountName);
  }
  const result = await runPublisherCommand(executable, [platform, 'check', '--account', accountName], home);
  return { platform, accountName, valid: result.code === 0, output: result.output.trim() };
}

export async function loginProgrammaticPublisherAccount(platformValue: string, accountName: string) {
  const platform = normalizePublisherPlatform(platformValue);
  const home = publisherHome();
  const executable = publisherExecutable(home);
  if (!existsSync(executable)) throw new Error(`程序化上传器尚未安装：${executable}`);
  if (platform === 'bilibili') {
    migrateLegacyBilibiliRuntime();
    migrateLegacyBilibiliAccount(home, accountName);
  }
  const args = [platform, 'login', '--account', accountName];
  if (platform !== 'bilibili') args.push('--headed');
  const result = await runPublisherCommand(executable, args, home, { inherit: true });
  if (result.code !== 0) throw new Error(`${platform} 登录未完成。`);
  return { platform, accountName, valid: true };
}

function applyPublicationAction(projectId: string, action: Parameters<typeof applyProductionWorkflowAction>[2]) {
  return updateCanonicalProject(projectId, (project) => (
    applyProductionWorkflowAction(project, workflowRuntimeEvidence(projectId), action)
  ), { markRenderStale: false });
}

export async function executeProgrammaticPublication(plan: ProgrammaticPublicationPlan) {
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
  mkdirSync(plan.runDirectory, { recursive: true });
  const logPath = join(plan.runDirectory, `${runId}.log`);
  const recordPath = join(plan.runDirectory, `${runId}.json`);
  const account = await checkProgrammaticPublisherAccount(plan.platform, plan.accountName);
  if (!account.valid) {
    throw new Error(`账号 ${plan.accountName} 的 ${plan.platform} 登录态无效；请先运行程序化 login。`);
  }
  applyPublicationAction(plan.projectId, {
    type: 'start_publication_upload',
    targetId: plan.targetId,
    publisher: plan.publisher,
    accountName: plan.accountName,
    runId,
  });
  const startedAt = new Date().toISOString();
  const result = await runPublisherCommand(plan.executable, plan.args, plan.cwd);
  const completedAt = new Date().toISOString();
  writeFileSync(logPath, `${result.output.trim()}\n`);
  const record = {
    schemaVersion: 1,
    runId,
    projectId: plan.projectId,
    targetId: plan.targetId,
    platform: plan.platform,
    publisher: plan.publisher,
    accountName: plan.accountName,
    schedule: plan.schedule,
    scheduledAt: plan.scheduledAt,
    videoSha256: fileSha256(plan.videoPath),
    coverSha256: fileSha256(plan.coverPath),
    startedAt,
    completedAt,
    exitCode: result.code,
    logPath,
  };
  writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);
  if (result.code !== 0) {
    const error = result.output.trim().split('\n').filter(Boolean).slice(-3).join('；') || '平台上传器返回失败。';
    applyPublicationAction(plan.projectId, {
      type: 'record_publication_failure', targetId: plan.targetId, runId, error,
    });
    throw new Error(error);
  }
  applyPublicationAction(plan.projectId, {
    type: 'record_publication_submission',
    targetId: plan.targetId,
    runId,
    ...(plan.scheduledAt ? { scheduledAt: plan.scheduledAt } : {}),
  });
  updateCanonicalProject(plan.projectId, (project) => {
    const target = (project.workflow.publicationTargets ?? []).find((item) => item.id === plan.targetId);
    if (!target) throw new Error('找不到要记录投稿文案的平台目标。');
    target.copySnapshot = {
      ...plan.copy,
      hashtags: [...plan.copy.hashtags],
      effectiveTitle: '',
      effectiveDescription: '',
      capturedAt: completedAt,
      source: project.outputs.platformCopy,
    };
    return project;
  }, { markRenderStale: false });
  return { ...record, recordPath, logPath };
}

export function publicProgrammaticPublicationPlan(plan: ProgrammaticPublicationPlan) {
  return {
    projectId: plan.projectId,
    targetId: plan.targetId,
    platform: plan.platform,
    publisher: plan.publisher,
    accountName: plan.accountName,
    executable: plan.executable,
    cwd: plan.cwd,
    args: plan.args,
    schedule: plan.schedule,
    scheduledAt: plan.scheduledAt,
    videoPath: plan.videoPath,
    coverPath: plan.coverPath,
    runDirectory: plan.runDirectory,
    copy: plan.copy,
  };
}
