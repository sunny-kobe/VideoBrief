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

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}
