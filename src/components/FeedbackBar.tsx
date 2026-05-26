/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ThumbsUp, ThumbsDown, AlertCircle, Sparkles, Check } from 'lucide-react';

interface FeedbackBarProps {
  remainingCredits: number;
  onShowNotification?: (msg: string) => void;
}

export default function FeedbackBar({ remainingCredits, onShowNotification }: FeedbackBarProps) {
  const [feedbackGiven, setFeedbackGiven] = useState<'up' | 'down' | null>(null);

  const handleFeedback = (type: 'up' | 'down') => {
    setFeedbackGiven(type);
    if (type === 'up') {
      onShowNotification?.('👍 感谢您的积极反馈！我们将继续优化投研摘要精度。');
    } else {
      onShowNotification?.('👎 抱歉未能让您完全满意。我们会根据此标记持续校准。');
    }
  };

  const handleReportIssue = () => {
    onShowNotification?.('⚠️ 报告问题已登记，技术专家将快速拉取此音轨检查转写偏误。');
  };

  return (
    <footer className="bg-slate-50 border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 select-none mt-4 transition-all hover:bg-slate-100/40">
      
      {/* Thumbs / Feedback actions */}
      <div className="flex flex-wrap items-center gap-4">
        <span className="text-xs font-semibold text-slate-500">这份投研分析对您有帮助吗？</span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => handleFeedback('up')}
            disabled={feedbackGiven !== null}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
              feedbackGiven === 'up'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                : 'bg-white border-slate-200 hover:border-slate-350 text-slate-600 hover:text-slate-900 active:scale-95 cursor-pointer'
            }`}
          >
            <ThumbsUp className={`w-3.5 h-3.5 ${feedbackGiven === 'up' ? 'text-emerald-600' : 'text-slate-405'}`} />
            <span>有用</span>
          </button>
          <button
            onClick={() => handleFeedback('down')}
            disabled={feedbackGiven !== null}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
              feedbackGiven === 'down'
                ? 'bg-red-50 border-red-300 text-red-800'
                : 'bg-white border-slate-200 hover:border-slate-350 text-slate-600 hover:text-slate-900 active:scale-95 cursor-pointer'
            }`}
          >
            <ThumbsDown className={`w-3.5 h-3.5 ${feedbackGiven === 'down' ? 'text-red-500' : 'text-slate-405'}`} />
            <span>不准确</span>
          </button>
        </div>

        <button
          onClick={handleReportIssue}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-620 transition-colors cursor-pointer border-l border-slate-200 pl-4"
          title="反馈转写不完整或专业名词提取错误"
        >
          <AlertCircle className="w-3.5 h-3.5 text-slate-400" />
          <span>提报漏测错译词</span>
        </button>
      </div>

      {/* Credit display and premium branding badge */}
      <div className="flex items-center gap-3.5 text-xs">
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50/70 border border-blue-100 text-blue-700 rounded-lg">
          <Sparkles className="w-3.5 h-3.5 text-blue-500 shrink-0" />
          <span className="font-semibold">极速研报剩余额度:</span>
          <span className="font-bold font-mono">{remainingCredits} 次</span>
        </div>
        <div className="hidden lg:flex items-center gap-1 text-[11px] text-slate-400 font-medium">
          <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          <span>合规双重加密</span>
        </div>
      </div>

    </footer>
  );
}
