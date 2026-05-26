/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ThumbsUp, ThumbsDown, AlertOctagon, HelpCircle, Users, Layers, Award } from 'lucide-react';
import { KeyMoment, ResearchNote } from '../types';

interface KeyMomentsProps {
  note: ResearchNote;
  activeTimestamp?: string;
  onSelectTimestamp: (timestamp: string) => void;
  onShowNotification?: (msg: string) => void;
}

export default function KeyMoments({
  note,
  activeTimestamp,
  onSelectTimestamp,
  onShowNotification,
}: KeyMomentsProps) {
  const [rated, setRated] = useState<'up' | 'down' | null>(null);
  const [missingReported, setMissingReported] = useState(false);

  const handleRate = (direction: 'up' | 'down') => {
    setRated(direction);
    if (onShowNotification) {
      onShowNotification(
        direction === 'up' 
          ? '很棒！感谢您的反馈，我们将持续优化算法精度。' 
          : '抱歉，我们会将反馈同步给技术专家，在今后的摘要中提供更精确的归纳。'
      );
    }
  };

  const handleReportMissing = () => {
    if (missingReported) return;
    setMissingReported(true);
    if (onShowNotification) {
      onShowNotification('反馈成功！产品后台已分派微调任务，我们将在5分钟内重新生成该视频笔记，并发送通知给您。');
    }
  };

  return (
    <div className="flex flex-col gap-5">
      
      {/* Key Moments Card */}
      <section className="bg-white border border-slate-200 rounded-lg p-5 shadow-[0_1px_3px_rgba(15,23,42,0.03)] flex-1 flex flex-col">
        <div className="flex items-center justify-between mb-4.5 border-b border-slate-100 pb-2.5">
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-blue-600" />
            <span>精选标志性瞬间 (Key Moments)</span>
          </h2>
          <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-mono">
            {note.keyMoments.length} 处
          </span>
        </div>

        {/* List of scrollable moments */}
        <div className="flex flex-col gap-3">
          {note.keyMoments.map((moment) => {
            const isSelected = activeTimestamp === moment.timestamp;
            return (
              <div
                key={moment.id}
                onClick={() => {
                  onSelectTimestamp(moment.timestamp);
                  onShowNotification?.(`定位至精选瞬间: ${moment.timestamp} - ${moment.title}`);
                }}
                className={`group flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-all duration-200 ${
                  isSelected
                    ? 'bg-blue-50/70 border-blue-400 shadow-sm'
                    : 'bg-white border-slate-100 hover:border-slate-200 hover:bg-slate-50'
                }`}
              >
                {/* Thumbnail container */}
                <div className="relative w-24 h-14 rounded-md overflow-hidden bg-slate-100 shrink-0 border border-slate-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt={moment.title}
                    referrerPolicy="no-referrer"
                    src={moment.thumbnailUrl}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  {/* Overlay timestamp */}
                  <span className="absolute bottom-1 right-1 bg-slate-950/85 text-white font-mono text-[10px] px-1 rounded-sm">
                    {moment.timestamp}
                  </span>
                </div>

                {/* Meta details */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-slate-900 text-xs md:text-sm group-hover:text-blue-600 transition-colors truncate">
                    {moment.title}
                  </h3>
                  <p className="text-[11px] text-slate-550 leading-relaxed line-clamp-2 mt-1">
                    {moment.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Interactive feedback & Credits card */}
      <section className="bg-white border border-slate-200 rounded-lg p-4 shadow-[0_1px_3px_rgba(15,23,42,0.03)] mt-auto select-none">
        <div className="flex flex-wrap items-center justify-between gap-3.5 text-xs text-slate-700">
          
          {/* Action buttons (left side feedback icons) */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => handleRate('up')}
              className={`flex items-center justify-center p-2 rounded-lg border transition-all duration-150 cursor-pointer ${
                rated === 'up'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                  : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-slate-700'
              }`}
              title="大纲结构非常有用"
            >
              <ThumbsUp className="w-3.5 h-3.5" />
            </button>
            
            <button
              onClick={() => handleRate('down')}
              className={`flex items-center justify-center p-2 rounded-lg border transition-all duration-150 cursor-pointer ${
                rated === 'down'
                  ? 'bg-red-50 border-red-300 text-red-700'
                  : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-slate-700'
              }`}
              title="不太符合预期"
            >
              <ThumbsDown className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={handleReportMissing}
              disabled={missingReported}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] font-bold transition-all duration-150 cursor-pointer ${
                missingReported
                  ? 'bg-amber-50 border-amber-300 text-amber-700 cursor-not-allowed opacity-80'
                  : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700'
              }`}
            >
              <AlertOctagon className="w-3 h-3 text-amber-600 shrink-0" />
              <span>{missingReported ? '解析补充中' : '缺失关键点'}</span>
            </button>
          </div>

          {/* Point status display context (Right utility margin metadata banner) */}
          <div className="flex items-center gap-1.5 text-slate-500 text-[11px] md:text-xs font-semibold shrink-0 bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1">
            <Award className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span>剩余点数:</span>
            <span className="font-mono text-slate-900 font-bold">{note.remainingCredits}</span>
          </div>

        </div>
      </section>

    </div>
  );
}
