/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Play } from 'lucide-react';
import { ResearchNote } from '../types';

interface ChapterNotesTableProps {
  note: ResearchNote;
  activeTimestamp?: string;
  onSelectTimestamp: (timestamp: string) => void;
  onShowNotification?: (msg: string) => void;
}

export default function ChapterNotesTable({
  note,
  activeTimestamp,
  onSelectTimestamp,
  onShowNotification,
}: ChapterNotesTableProps) {
  const [hoveredChapter, setHoveredChapter] = useState<string | null>(null);

  return (
    <section className="bg-white border border-slate-200/95 rounded-xl overflow-hidden shadow-sm">
      <div className="p-5 border-b border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 select-none">
        <div className="flex items-center gap-2">
          <span className="w-1 h-3.5 bg-blue-600 rounded-sm" />
          <h2 className="text-[10px] font-bold text-slate-600 uppercase tracking-widest font-sans">
            分音阶详细笔记 / Chronological Notes
          </h2>
        </div>
        <span className="text-[11px] text-slate-400 font-medium">
          💡 点击时间戳跳转即可联动右侧 Key Moments 音轨点
        </span>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-widest select-none">
              <th className="py-3 px-6 w-28 text-center">对应时间 / Timeline</th>
              <th className="py-3 px-5 w-64">章节核心议题</th>
              <th className="py-3 px-6">深度透视分析内容</th>
            </tr>
          </thead>
          <tbody className="text-xs sm:text-sm text-slate-850 divide-y divide-slate-100">
            {note.chapters.map((chapter) => {
              const isSelected = activeTimestamp === chapter.timestamp;
              return (
                <tr
                  key={chapter.timestamp}
                  className={`transition-all duration-200 cursor-pointer relative group ${
                    isSelected
                      ? 'bg-blue-50/65 hover:bg-blue-50/80'
                      : 'hover:bg-slate-50/70'
                  }`}
                  onClick={() => {
                    onSelectTimestamp(chapter.timestamp);
                    onShowNotification?.(`已精准切换至音轨节点 [${chapter.timestamp}] - ${chapter.title}`);
                  }}
                  onMouseEnter={() => setHoveredChapter(chapter.timestamp)}
                  onMouseLeave={() => setHoveredChapter(null)}
                >
                  {/* Timestamp cell styled as interactive premium pill */}
                  <td className="py-4 px-6 text-center font-mono">
                    <div className="flex items-center justify-center">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                        isSelected
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-600 group-hover:bg-blue-50 group-hover:text-blue-600'
                      }`}>
                        <Play className={`w-2.5 h-2.5 shrink-0 ${
                          isSelected ? 'fill-current text-white' : 'text-slate-400 group-hover:text-blue-500'
                        }`} />
                        <span>{chapter.timestamp}</span>
                      </span>
                    </div>
                  </td>
                  
                  <td className="py-4 px-5 font-bold text-slate-900 align-top">
                    <div className="flex items-center gap-2">
                      {isSelected && <span className="w-1.5 h-1.5 bg-blue-650 rounded-full shrink-0 animate-ping" />}
                      <span className="leading-tight">{chapter.title}</span>
                    </div>
                  </td>
                  
                  <td className="py-4 px-6 text-slate-650 leading-relaxed text-xs md:text-sm align-top font-medium">
                    {chapter.content}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
