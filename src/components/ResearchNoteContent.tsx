/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ArrowRight, ShieldCheck, HelpCircle } from 'lucide-react';
import { ResearchNote } from '../types';

// Import our cohesive, smaller modular components
import InsightSummary from './InsightSummary';
import AudienceAndLimits from './AudienceAndLimits';
import ChapterNotesTable from './ChapterNotesTable';
import KeyPoints from './KeyPoints';
import Glossary from './Glossary';
import ActionChecklist from './ActionChecklist';
import FeedbackBar from './FeedbackBar';

interface ResearchNoteContentProps {
  note: ResearchNote;
  activeTimestamp?: string;
  onSelectTimestamp: (timestamp: string) => void;
  onShowNotification?: (msg: string) => void;
  onDraftQuestion?: (question: string) => void;
}

export default function ResearchNoteContent({
  note,
  activeTimestamp,
  onSelectTimestamp,
  onShowNotification,
  onDraftQuestion,
}: ResearchNoteContentProps) {
  return (
    <div className="flex flex-col gap-7 selection:bg-blue-100/80">

      {/* 1 & 2. 一句话结论 & 3 行 core takeaways / summaries */}
      <InsightSummary note={note} />

      {/* 3. 适合谁看 & 局限性 */}
      <AudienceAndLimits note={note} onShowNotification={onShowNotification} />

      {/* 4. 分章节详细笔记 Chronological block */}
      <ChapterNotesTable
        note={note}
        activeTimestamp={activeTimestamp}
        onSelectTimestamp={onSelectTimestamp}
        onShowNotification={onShowNotification}
      />

      {/* 5. 关键观点 / Industry Deep Insights */}
      <KeyPoints note={note} />

      {/* 6. 重要概念解释 */}
      <Glossary note={note} />

      {/* 7. 行动清单 */}
      <ActionChecklist note={note} />

      {/* 8. 值得继续追问的问题 (Interactive suggestion actions) */}
      <section className="bg-white border border-slate-200/95 rounded-xl p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4 select-none">
          <span className="w-1 h-3.5 bg-purple-650 rounded-sm" />
          <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-sans flex items-center gap-1.5">
            <HelpCircle className="w-4 h-4 text-purple-650 shrink-0" />
            <span>值得继续延展追问之议题 / Follow-up Questions</span>
          </h2>
        </div>
        <div className="flex flex-col gap-2">
          {note.questions.map((q, i) => (
            <button
              key={i}
              onClick={() => {
                onDraftQuestion?.(q);
                window.setTimeout(() => {
                  document.getElementById('ai-ask-textarea')?.focus();
                }, 0);
                onShowNotification?.('已将问题载入右栏 AI 追问。请点击发送立即解答。');
              }}
              className="text-left w-full p-3 bg-slate-50/50 hover:bg-purple-50/40 hover:border-purple-200 border border-slate-205 rounded-lg text-xs font-semibold text-slate-700 flex items-center justify-between transition-all group duration-200 cursor-pointer"
            >
              <span className="truncate pr-4">{q}</span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-purple-600 group-hover:translate-x-1 transition-all shrink-0 font-bold" />
            </button>
          ))}
        </div>
      </section>

      {/* 9. Interactive Feedback toolbar with status count */}
      <FeedbackBar remainingCredits={note.remainingCredits} onShowNotification={onShowNotification} />

      {/* 10. 免责声明 Disclaimer */}
      <footer className="bg-slate-50 border border-slate-250 rounded-xl p-4 flex items-start gap-2.5 text-[11px] md:text-xs text-slate-400 leading-relaxed select-none">
        <ShieldCheck className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
        <p>{note.disclaimer}</p>
      </footer>

    </div>
  );
}
