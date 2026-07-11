/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface KeyMoment {
  id: string;
  timestamp: string;
  title: string;
  description: string;
  thumbnailUrl: string;
}

export interface ChapterNote {
  timestamp: string;
  title: string;
  content: string;
}

export interface KeyInsight {
  title: string;
  description: string;
}

export interface ConceptExplanation {
  concept: string;
  explanation: string;
}

export interface ActionItem {
  task: string;
  priority: 'high' | 'medium' | 'low';
  context: string;
}

export interface ResearchNote {
  id: string;
  videoUrl: string;
  channelName: string;
  duration: string;
  languageDirection: string;
  status: 'completed' | 'processing' | 'failed';
  title: string;
  conclusion: string;
  coreSummaries: {
    label: string;
    description: string;
  }[];
  audiences: string[];
  limitations: string[];
  chapters: ChapterNote[];
  insights: KeyInsight[];
  concepts: ConceptExplanation[];
  actions: ActionItem[];
  questions: string[];
  keyMoments: KeyMoment[];
  disclaimer: string;
  remainingCredits: number;
}

export interface GroundedSource {
  timestamp: string;
  label: string;
}

export interface QAPair {
  question: string;
  answer: string;
  sources: GroundedSource[];
  keywords: string[];
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}

export type SignalSourceType =
  | 'official'
  | 'github'
  | 'paper'
  | 'demo'
  | 'social'
  | 'video'
  | 'news';

export type VerificationStatus = 'verified' | 'needs_check' | 'weak';

export type SignalStage =
  | 'intake'
  | 'source_check'
  | 'judgment'
  | 'packaged'
  | 'ready_to_publish'
  | 'published';

export interface SignalSource {
  id: string;
  title: string;
  sourceUrl: string;
  sourceType: SignalSourceType;
  publishedAt: string;
  stage: SignalStage;
  verificationStatus: VerificationStatus;
  claim: string;
  whyItMatters: string;
  chinaContext: string;
  riskNote: string;
  tags: string[];
  clipReference?: string;
}

export interface ShortVideoScript {
  hook: string;
  voiceover: string[];
  subtitleLines: string[];
  shotList: string[];
}

export interface PlatformCopy {
  xiaohongshuCards: string[];
  wechatParagraph: string;
  sourceLinks: string[];
  callToAction: string;
}

export interface FeedbackMetric {
  platform: 'douyin' | 'xiaohongshu' | 'wechat' | 'bilibili' | 'other';
  publishedAt?: string;
  views?: number;
  saves?: number;
  comments?: number;
  dms?: number;
  downloads?: number;
  paidIntent?: number;
  notes: string;
}

export interface ContentBrief {
  id: string;
  title: string;
  format: 'weekly_roundup' | 'single_signal' | 'deep_dive';
  targetAudience: string;
  status: 'draft' | 'review' | 'ready' | 'published';
  signals: SignalSource[];
  shortVideo: ShortVideoScript;
  platformCopy: PlatformCopy;
  feedback: FeedbackMetric[];
  nextAction: string;
}
