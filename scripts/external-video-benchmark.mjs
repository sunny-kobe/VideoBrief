import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ffmpegPath from 'ffmpeg-static';

const outputDir = resolve('output/external-benchmarks');
const voiceoverAiff = resolve('public/audio/voiceover.aiff');
const voiceoverMp3 = resolve('public/audio/voiceover.mp3');
const sourceAssetPath = 'source-clips/openai-codex-app-vertical-30fps.mp4';
const voiceoverAssetPath = 'audio/voiceover.mp3';
const publicAssetBaseUrl = process.env.PUBLIC_ASSET_BASE_URL?.replace(/\/$/, '');
const submitProvider = process.argv.find((arg) => arg.startsWith('--submit='))?.split('=')[1];

const scenes = [
  {
    id: 'hook',
    start: 0,
    end: 5,
    sourceStart: 0,
    title: 'AI 编程，不只是聊天框了',
    eyebrow: 'OPENAI / CODEX APP',
    body: 'OpenAI 的 Codex app，把 coding agent 做成了可以持续跟进的任务台。',
    subtitle: 'OpenAI 的 Codex app，重点不是聊天，而是把 AI 编程变成任务台。',
  },
  {
    id: 'mobile',
    start: 5,
    end: 11,
    sourceStart: 66,
    title: '任务可以在手机上继续追踪',
    eyebrow: 'MOBILE WORKFLOW',
    body: '它更像一个远程工程任务系统：发起、等待、回看进展，而不是一直盯着 IDE。',
    subtitle: '第一点：AI 编程正在从本地 IDE，扩展到手机和远程任务流。',
  },
  {
    id: 'progress',
    start: 11,
    end: 18,
    sourceStart: 109,
    title: '关键变化：进度可见',
    eyebrow: 'TASK DASHBOARD',
    body: '如果 agent 要接真实开发任务，最重要的不是会回答，而是状态、结果和失败原因可追踪。',
    subtitle: '第二点：真正有价值的是进度可见，结果可检查。',
  },
  {
    id: 'code-review',
    start: 18,
    end: 25,
    sourceStart: 159,
    title: '它瞄准的是“交付任务”',
    eyebrow: 'CODE AGENT',
    body: '修 bug、查代码、生成改动、解释实现，这类任务才是 coding agent 的核心战场。',
    subtitle: '第三点：它不是写几行代码，而是在接一整个开发任务。',
  },
  {
    id: 'templates',
    start: 25,
    end: 32,
    sourceStart: 190,
    title: '可复用任务会变成模板',
    eyebrow: 'REPEATABLE TASKS',
    body: '对中文开发者更重要的是：能不能把常见需求沉淀成稳定任务模板和检查清单。',
    subtitle: '真正值得跟的，是能不能沉淀成可复用任务模板。',
  },
  {
    id: 'takeaway',
    start: 32,
    end: 38,
    sourceStart: 231,
    title: '判断：这不是工具更新，是工作流迁移',
    eyebrow: 'MY TAKE',
    body: '先别急着追新名词。该验证的是：它能否稳定接住真实项目里的小任务。',
    subtitle: '我的判断：别只看发布会，要拿真实项目小任务去测。',
  },
];

function ensureVoiceoverMp3() {
  if (!ffmpegPath) throw new Error('ffmpeg-static did not resolve a binary path.');
  if (!existsSync(voiceoverAiff)) {
    throw new Error(`Voiceover AIFF not found: ${voiceoverAiff}. Run npm run audio:voiceover first.`);
  }

  mkdirSync(dirname(voiceoverMp3), { recursive: true });
  const result = spawnSync(
    ffmpegPath,
    ['-y', '-i', voiceoverAiff, '-ar', '48000', '-ac', '2', '-b:a', '192k', voiceoverMp3],
    { encoding: 'utf8' },
  );

  if (result.status !== 0) {
    console.error(result.stdout);
    console.error(result.stderr);
    throw new Error('Failed to convert voiceover to MP3.');
  }
}

function publicUrl(path) {
  if (!publicAssetBaseUrl) return `https://PUBLIC_ASSET_BASE_URL/${path}`;
  return `${publicAssetBaseUrl}/${path}`;
}

function duration(scene) {
  return scene.end - scene.start;
}

function subtitleElements(provider) {
  return scenes.map((scene) => ({
    provider,
    scene: scene.id,
    start: scene.start,
    length: duration(scene),
    text: scene.subtitle,
  }));
}

function buildCreatomateRender() {
  const sourceUrl = publicUrl(sourceAssetPath);
  const audioUrl = publicUrl(voiceoverAssetPath);

  return {
    output_format: 'mp4',
    width: 1080,
    height: 1920,
    frame_rate: 30,
    duration: 38,
    elements: [
      {
        name: 'Source footage',
        type: 'composition',
        track: 1,
        time: 0,
        duration: 38,
        elements: scenes.map((scene, index) => ({
          name: `Video-${scene.id}`,
          type: 'video',
          track: 1,
          time: scene.start,
          duration: duration(scene),
          source: sourceUrl,
          trim_start: scene.sourceStart,
          fit: 'cover',
          animations:
            index === 0
              ? []
              : [{ time: 0, duration: 0.18, transition: true, type: 'fade', enable: 'second-only' }],
        })),
      },
      {
        name: 'Voiceover',
        type: 'audio',
        track: 2,
        time: 0,
        source: audioUrl,
      },
      ...scenes.flatMap((scene) => [
        {
          name: `Eyebrow-${scene.id}`,
          type: 'text',
          track: 3,
          time: scene.start,
          duration: duration(scene),
          x: '8%',
          y: '7%',
          width: '84%',
          height: '4%',
          text: scene.eyebrow,
          font_family: 'Inter',
          font_weight: '800',
          font_size: '2.2 vmin',
          fill_color: '#d1fae5',
        },
        {
          name: `Title-${scene.id}`,
          type: 'text',
          track: 4,
          time: scene.start,
          duration: duration(scene),
          x: '8%',
          y: '11%',
          width: '84%',
          height: '10%',
          text: scene.title,
          font_family: 'Noto Sans SC',
          font_weight: '900',
          font_size: '4.8 vmin',
          fill_color: '#ffffff',
        },
        {
          name: `Subtitle-${scene.id}`,
          type: 'text',
          track: 5,
          time: scene.start,
          duration: duration(scene),
          x: '7%',
          y: '83%',
          width: '86%',
          height: '12%',
          text: scene.subtitle,
          font_family: 'Noto Sans SC',
          font_weight: '900',
          font_size: '3.8 vmin',
          fill_color: '#ffffff',
          background_color: 'rgba(0,0,0,0.62)',
          background_border_radius: '18%',
          background_x_padding: '8%',
          background_y_padding: '4%',
        },
      ]),
    ],
  };
}

function buildShotstackEdit() {
  const sourceUrl = publicUrl(sourceAssetPath);
  const audioUrl = publicUrl(voiceoverAssetPath);

  return {
    timeline: {
      background: '#020617',
      tracks: [
        {
          clips: scenes.map((scene, index) => ({
            asset: {
              type: 'video',
              src: sourceUrl,
              trim: scene.sourceStart,
              volume: 0,
            },
            start: scene.start,
            length: duration(scene),
            fit: 'cover',
            effect: 'zoomIn',
            transition: {
              in: index === 0 ? 'none' : 'fade',
              out: index === scenes.length - 1 ? 'none' : 'fade',
            },
          })),
        },
        {
          clips: scenes.map((scene) => ({
            asset: {
              type: 'html',
              html: `<div style="font-family: Arial, sans-serif; color: white; text-shadow: 0 4px 16px rgba(0,0,0,.9);"><div style="font-size: 30px; font-weight: 800; color: #d1fae5;">${scene.eyebrow}</div><div style="margin-top: 16px; font-size: 54px; line-height: 1.12; font-weight: 900;">${scene.title}</div></div>`,
              width: 900,
              height: 260,
            },
            start: scene.start,
            length: duration(scene),
            position: 'top',
            offset: { x: 0, y: 0.08 },
            transition: { in: 'fade', out: 'fade' },
          })),
        },
        {
          clips: scenes.map((scene) => ({
            asset: {
              type: 'html',
              html: `<div style="box-sizing:border-box;width:100%;height:100%;padding:24px 36px;border-radius:24px;background:rgba(0,0,0,.66);font-family:Arial,sans-serif;color:white;font-size:42px;line-height:1.28;font-weight:900;text-align:center;text-shadow:0 3px 12px rgba(0,0,0,.9);">${scene.subtitle}</div>`,
              width: 900,
              height: 210,
            },
            start: scene.start,
            length: duration(scene),
            position: 'bottom',
            offset: { x: 0, y: -0.06 },
            transition: { in: 'fade', out: 'fade' },
          })),
        },
        {
          clips: [
            {
              asset: {
                type: 'audio',
                src: audioUrl,
                volume: 1,
              },
              start: 0,
              length: 38,
            },
          ],
        },
      ],
      cache: true,
    },
    output: {
      format: 'mp4',
      size: { width: 1080, height: 1920 },
      fps: 30,
      quality: 'high',
      poster: { capture: 1 },
      destinations: [{ provider: 'shotstack' }],
    },
  };
}

async function submitCreatomate(payload) {
  const apiKey = process.env.CREATOMATE_API_KEY;
  if (!apiKey) throw new Error('CREATOMATE_API_KEY is required to submit a Creatomate render.');
  if (!publicAssetBaseUrl) throw new Error('PUBLIC_ASSET_BASE_URL is required so Creatomate can fetch assets.');

  const response = await fetch('https://api.creatomate.com/v2/renders', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Creatomate submit failed: ${response.status} ${body}`);
  return JSON.parse(body);
}

async function submitShotstack(payload) {
  const apiKey = process.env.SHOTSTACK_API_KEY;
  const apiBase = process.env.SHOTSTACK_API_BASE ?? 'https://api.shotstack.io/edit/v1';
  if (!apiKey) throw new Error('SHOTSTACK_API_KEY is required to submit a Shotstack render.');
  if (!publicAssetBaseUrl) throw new Error('PUBLIC_ASSET_BASE_URL is required so Shotstack can fetch assets.');

  const response = await fetch(`${apiBase.replace(/\/$/, '')}/render`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Shotstack submit failed: ${response.status} ${body}`);
  return JSON.parse(body);
}

ensureVoiceoverMp3();
mkdirSync(outputDir, { recursive: true });

const creatomatePayload = buildCreatomateRender();
const shotstackPayload = buildShotstackEdit();
const creatomatePath = resolve(outputDir, 'creatomate-render.json');
const shotstackPath = resolve(outputDir, 'shotstack-edit.json');
const metadataPath = resolve(outputDir, 'benchmark-metadata.json');

writeFileSync(creatomatePath, `${JSON.stringify(creatomatePayload, null, 2)}\n`);
writeFileSync(shotstackPath, `${JSON.stringify(shotstackPayload, null, 2)}\n`);
writeFileSync(
  metadataPath,
  `${JSON.stringify(
    {
      purpose: 'VideoBrief external benchmark',
      source: 'OpenAI official YouTube: Introducing the Codex app',
      note: 'PUBLIC_ASSET_BASE_URL must expose /source-clips/openai-codex-app-vertical-30fps.mp4 and /audio/voiceover.mp3.',
      subtitleElements: {
        creatomate: subtitleElements('creatomate'),
        shotstack: subtitleElements('shotstack'),
      },
    },
    null,
    2,
  )}\n`,
);

const summary = [
  '# External Video Benchmark Payloads',
  '',
  `Generated at: ${new Date().toISOString()}`,
  '',
  'Files:',
  `- ${creatomatePath}`,
  `- ${shotstackPath}`,
  `- ${metadataPath}`,
  '',
  'Required public assets:',
  `- ${publicUrl(sourceAssetPath)}`,
  `- ${publicUrl(voiceoverAssetPath)}`,
  '',
  'Submit commands:',
  '- npm run benchmark:external:creatomate',
  '- npm run benchmark:external:shotstack',
  '',
  'Environment:',
  '- PUBLIC_ASSET_BASE_URL must be a public HTTPS asset host.',
  '- CREATOMATE_API_KEY is required for Creatomate submit.',
  '- SHOTSTACK_API_KEY is required for Shotstack submit.',
  '',
  `Voiceover MP3: ${voiceoverMp3} (${(statSync(voiceoverMp3).size / 1024 / 1024).toFixed(2)} MB)`,
  '',
].join('\n');
writeFileSync(resolve(outputDir, 'README.md'), summary);

console.log(summary);

if (submitProvider === 'creatomate') {
  const result = await submitCreatomate(creatomatePayload);
  writeFileSync(resolve(outputDir, 'creatomate-submit-response.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
} else if (submitProvider === 'shotstack') {
  const result = await submitShotstack(shotstackPayload);
  writeFileSync(resolve(outputDir, 'shotstack-submit-response.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
} else if (submitProvider) {
  throw new Error(`Unknown submit provider: ${submitProvider}`);
}
