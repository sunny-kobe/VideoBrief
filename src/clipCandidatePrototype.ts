import { ShortVideoProjectScene } from './shortVideoBrief';

export interface PrototypeClipCandidate {
  id: string;
  label: string;
  start: number;
  end: number;
  totalScore: number;
  semanticScore: number;
  motionScore: number;
  continuityScore: number;
  rationale: string;
  currentSelection: boolean;
}

export function buildPrototypeClipCandidates(
  scene: ShortVideoProjectScene,
): PrototypeClipCandidate[] {
  const duration = Math.max(0.5, scene.sourceEnd - scene.sourceStart);
  const beforeStart = Math.max(0, scene.sourceStart - Math.min(2.2, duration * 0.35));
  const afterStart = scene.sourceStart + Math.min(1.6, duration * 0.25);

  return [
    {
      id: `${scene.id}-current`,
      label: '当前人工点位',
      start: scene.sourceStart,
      end: scene.sourceEnd,
      totalScore: 91,
      semanticScore: 94,
      motionScore: 84,
      continuityScore: 92,
      rationale: '文案语义最贴近，且已通过当前成片的人工检查。',
      currentSelection: true,
    },
    {
      id: `${scene.id}-lead-in`,
      label: '保留前摇',
      start: beforeStart,
      end: beforeStart + duration,
      totalScore: 84,
      semanticScore: 82,
      motionScore: 89,
      continuityScore: 81,
      rationale: '动作进入更自然，但核心画面出现稍晚。',
      currentSelection: false,
    },
    {
      id: `${scene.id}-follow-through`,
      label: '延后切入',
      start: afterStart,
      end: afterStart + duration,
      totalScore: 78,
      semanticScore: 76,
      motionScore: 86,
      continuityScore: 74,
      rationale: '主体运动更明显，但可能错过文案开头对应画面。',
      currentSelection: false,
    },
  ];
}
