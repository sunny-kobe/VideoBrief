import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, resolve } from 'node:path';
import ffmpegPath from 'ffmpeg-static';

const briefArg = process.argv.slice(2).find((arg) => arg.startsWith('--brief='));
const briefPath = resolve(briefArg?.slice('--brief='.length) ?? 'content/projects/codex-app-explainer/project.json');
const briefText = readFileSync(briefPath, 'utf8');
const project = JSON.parse(briefText);
const workDir = resolve(project.outputs?.workDir ?? dirname(briefPath));
const timelinePath = resolve(workDir, 'timeline.json');
const voiceoverPath = resolve(workDir, 'voiceover-synced.aiff');

if (!existsSync(timelinePath) || !existsSync(voiceoverPath)) {
  throw new Error('请先完成 FFmpeg 正式导出，再生成 Remotion 候选。');
}

const timeline = JSON.parse(readFileSync(timelinePath, 'utf8'));
const enabledScenes = (project.scenes ?? []).filter((scene) => scene.enabled !== false);
const projectScenes = new Map(enabledScenes.map((scene) => [scene.id, scene]));
const propsScenes = timeline.scenes.map((timedScene) => {
  const scene = projectScenes.get(timedScene.id);
  if (!scene) throw new Error(`时间线场景 ${timedScene.id} 不存在于项目。`);
  const candidate = scene.candidates?.find((item) => item.id === scene.selectedCandidateId);
  const assetPath = candidate?.assetPath ?? project.sources?.find((item) => item.id === scene.sourceId)?.assetPath;
  if (!assetPath?.startsWith('public/') || !existsSync(resolve(assetPath))) {
    throw new Error(`场景 ${scene.id} 的 Remotion 素材必须位于 public 目录。`);
  }
  return {
    id: scene.id,
    start: timedScene.start,
    end: timedScene.end,
    eyebrow: scene.eyebrow,
    title: scene.title,
    subtitle: scene.subtitle,
    assetPath,
    sourceStart: Number(timedScene.sourceStart ?? 0),
  };
});

const publicAudioDir = resolve('public/remotion-assets');
mkdirSync(publicAudioDir, { recursive: true });
const publicAudioPath = resolve(publicAudioDir, `${project.id}-voiceover.m4a`);
if (!ffmpegPath) throw new Error('ffmpeg-static did not resolve a binary path.');
const audioConversion = spawnSync(ffmpegPath, [
  '-y',
  '-i', voiceoverPath,
  '-c:a', 'aac',
  '-b:a', '192k',
  publicAudioPath,
], { cwd: process.cwd(), stdio: 'inherit' });
if (audioConversion.status !== 0) throw new Error('Remotion voiceover conversion failed.');

const propsPath = resolve(workDir, 'remotion-props.json');
writeFileSync(propsPath, `${JSON.stringify({
  title: project.title,
  audioPath: `remotion-assets/${basename(publicAudioPath)}`,
  renderWidth: Number(project.render?.width ?? 1080),
  renderHeight: Number(project.render?.height ?? 1920),
  mediaFit: project.render?.mediaFit === 'cover' ? 'cover' : 'contain',
  scenes: propsScenes,
}, null, 2)}\n`);

const outputStem = basename(project.outputs.outputVideo, extname(project.outputs.outputVideo));
const outputPath = resolve(dirname(project.outputs.outputVideo), `${outputStem}-remotion-final.mp4`);
const publicPath = resolve(dirname(project.outputs.publicRender), `${outputStem}-remotion-final.mp4`);
mkdirSync(dirname(outputPath), { recursive: true });
mkdirSync(dirname(publicPath), { recursive: true });

const render = spawnSync(
  resolve('node_modules/.bin/remotion'),
  [
    'render',
    'remotion/index.ts',
    'CanonicalProject',
    outputPath,
    `--props=${propsPath}`,
    '--codec=h264',
    '--pixel-format=yuv420p',
    '--crf=18',
  ],
  { cwd: process.cwd(), encoding: 'utf8', stdio: 'inherit' },
);
if (render.status !== 0) process.exit(render.status ?? 1);
copyFileSync(outputPath, publicPath);

const manifestPath = resolve(workDir, 'remotion-render-manifest.json');
const currentBriefText = readFileSync(briefPath, 'utf8');
writeFileSync(manifestPath, `${JSON.stringify({
  schemaVersion: 1,
  projectId: project.id,
  projectFingerprint: createHash('sha256').update(currentBriefText).digest('hex'),
  renderedAt: new Date().toISOString(),
  briefPath,
  render: {
    width: Number(project.render?.width ?? 1080),
    height: Number(project.render?.height ?? 1920),
    fps: Number(project.render?.fps ?? 30),
    duration: timeline.duration,
    voice: project.render?.voice,
    rate: project.render?.rate,
  },
  artifacts: {
    outputVideo: outputPath,
    publicRender: publicPath,
    voiceover: voiceoverPath,
    timeline: timelinePath,
  },
  scenes: timeline.scenes.map((scene) => ({
    id: scene.id,
    sourceId: scene.sourceId,
    start: scene.start,
    end: scene.end,
    sourceStart: scene.sourceStart,
    sourceEnd: scene.sourceEnd,
    showEditorialOverlay: scene.showEditorialOverlay !== false,
  })),
}, null, 2)}\n`);

const proof = spawnSync(process.execPath, [
  'scripts/proof-video.mjs',
  `--manifest=${manifestPath}`,
  `--proof-dir=${resolve(workDir, 'remotion-proof')}`,
], { cwd: process.cwd(), stdio: 'inherit' });
if (proof.status !== 0) process.exit(proof.status ?? 1);

console.log(JSON.stringify({
  output: outputPath,
  publicRender: publicPath,
  manifest: manifestPath,
  duration: timeline.duration,
  bytes: statSync(outputPath).size,
}, null, 2));
