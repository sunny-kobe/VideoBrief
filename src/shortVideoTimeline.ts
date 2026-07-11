export const SHORT_VIDEO_FPS = 30;
export const SHORT_VIDEO_TOTAL_SECONDS = 38;
export const SHORT_VIDEO_WIDTH = 1080;
export const SHORT_VIDEO_HEIGHT = 1920;

export interface ShortVideoScene {
  id: string;
  start: number;
  end: number;
  eyebrow: string;
  title: string;
  body: string;
  subtitle: string;
  source: string;
  clip?: {
    src: string;
    startFromSeconds?: number;
    endAtSeconds?: number;
    label: string;
    sourceName: string;
    note: string;
  };
  accentClass: string;
  accentFrom: string;
  accentTo: string;
}

const sourceName = 'OpenAI official YouTube: Introducing the Codex app';
const sourceUrl = 'https://www.youtube.com/watch?v=HFM3se4lNiw';
const smoothSource = 'source-clips/openai-codex-app-vertical-30fps.mp4';

export const shortVideoScenes: ShortVideoScene[] = [
  {
    id: 'hook',
    start: 0,
    end: 5,
    eyebrow: 'OPENAI / CODEX APP',
    title: 'AI 编程，不只是聊天框了',
    body: 'OpenAI 的 Codex app，把 coding agent 做成了可以持续跟进的任务台。',
    subtitle: 'OpenAI 的 Codex app，重点不是聊天，而是把 AI 编程变成任务台。',
    source: sourceUrl,
    clip: {
      src: smoothSource,
      startFromSeconds: 0,
      endAtSeconds: 5,
      label: '官方开场片段',
      sourceName,
      note: '0:00-0:05 presenter opening',
    },
    accentClass: 'from-emerald-300 to-cyan-400',
    accentFrom: '#6ee7b7',
    accentTo: '#22d3ee',
  },
  {
    id: 'mobile',
    start: 5,
    end: 11,
    eyebrow: 'MOBILE WORKFLOW',
    title: '任务可以在手机上继续追踪',
    body: '它更像一个远程工程任务系统：发起、等待、回看进展，而不是一直盯着 IDE。',
    subtitle: '第一点：AI 编程正在从本地 IDE，扩展到手机和远程任务流。',
    source: sourceUrl,
    clip: {
      src: smoothSource,
      startFromSeconds: 66,
      endAtSeconds: 72,
      label: '工作流讲解片段',
      sourceName,
      note: '1:06-1:12 presenter explanation, selected to avoid frozen UI demo frames',
    },
    accentClass: 'from-sky-300 to-blue-500',
    accentFrom: '#7dd3fc',
    accentTo: '#3b82f6',
  },
  {
    id: 'progress',
    start: 11,
    end: 18,
    eyebrow: 'TASK DASHBOARD',
    title: '关键变化：进度可见',
    body: '如果 agent 要接真实开发任务，最重要的不是会回答，而是状态、结果和失败原因可追踪。',
    subtitle: '第二点：真正有价值的是进度可见，结果可检查。',
    source: sourceUrl,
    clip: {
      src: smoothSource,
      startFromSeconds: 109,
      endAtSeconds: 116,
      label: '进度看板片段',
      sourceName,
      note: '1:49-1:56 dashboard workflow, lower-freeze window',
    },
    accentClass: 'from-lime-300 to-emerald-500',
    accentFrom: '#bef264',
    accentTo: '#10b981',
  },
  {
    id: 'code-review',
    start: 18,
    end: 25,
    eyebrow: 'CODE AGENT',
    title: '它瞄准的是“交付任务”',
    body: '修 bug、查代码、生成改动、解释实现，这类任务才是 coding agent 的核心战场。',
    subtitle: '第三点：它不是写几行代码，而是在接一整个开发任务。',
    source: sourceUrl,
    clip: {
      src: smoothSource,
      startFromSeconds: 159,
      endAtSeconds: 166,
      label: '代码任务片段',
      sourceName,
      note: '2:39-2:46 presenter explanation, selected to keep motion continuity',
    },
    accentClass: 'from-violet-300 to-fuchsia-500',
    accentFrom: '#c4b5fd',
    accentTo: '#d946ef',
  },
  {
    id: 'templates',
    start: 25,
    end: 32,
    eyebrow: 'REPEATABLE TASKS',
    title: '可复用任务会变成模板',
    body: '对中文开发者更重要的是：能不能把常见需求沉淀成稳定任务模板和检查清单。',
    subtitle: '真正值得跟的，是能不能沉淀成可复用任务模板。',
    source: sourceUrl,
    clip: {
      src: smoothSource,
      startFromSeconds: 190,
      endAtSeconds: 197,
      label: '任务模板片段',
      sourceName,
      note: '3:10-3:17 task examples, lower-freeze window',
    },
    accentClass: 'from-amber-300 to-orange-500',
    accentFrom: '#fcd34d',
    accentTo: '#f97316',
  },
  {
    id: 'takeaway',
    start: 32,
    end: 38,
    eyebrow: 'MY TAKE',
    title: '判断：这不是工具更新，是工作流迁移',
    body: '先别急着追新名词。该验证的是：它能否稳定接住真实项目里的小任务。',
    subtitle: '我的判断：别只看发布会，要拿真实项目小任务去测。',
    source: sourceUrl,
    clip: {
      src: smoothSource,
      startFromSeconds: 231,
      endAtSeconds: 237,
      label: '官方收尾片段',
      sourceName,
      note: '3:51-3:57 closing explanation before static outro frames',
    },
    accentClass: 'from-slate-200 to-white',
    accentFrom: '#e2e8f0',
    accentTo: '#ffffff',
  },
];

export function getShortVideoScene(second: number) {
  return (
    shortVideoScenes.find((scene) => second >= scene.start && second < scene.end) ??
    shortVideoScenes[0]
  );
}

export function formatShortVideoTime(second: number) {
  return `00:${String(Math.floor(second)).padStart(2, '0')}`;
}
