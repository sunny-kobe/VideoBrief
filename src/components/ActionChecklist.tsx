/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { CheckSquare } from 'lucide-react';
import { ResearchNote } from '../types';

interface ActionChecklistProps {
  note: ResearchNote;
}

export default function ActionChecklist({ note }: ActionChecklistProps) {
  // Helper for priority badges
  const getPriorityStyle = (priority: 'high' | 'medium' | 'low') => {
    switch (priority) {
      case 'high':
        return 'bg-red-50 text-red-700 border-red-200';
      case 'medium':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'low':
        return 'bg-sky-50 text-sky-700 border-sky-200';
    }
  };

  const getPriorityLabel = (priority: 'high' | 'medium' | 'low') => {
    switch (priority) {
      case 'high':
        return '高优先 (High)';
      case 'medium':
        return '中优先 (Medium)';
      case 'low':
        return '低优先 (Low)';
    }
  };

  // Simple integer to roman converter helper
  const iToRoman = (num: number): string => {
    const map = ['I', 'II', 'III', 'IV', 'V', 'VI'];
    return map[num - 1] || num.toString();
  };

  return (
    <section className="bg-white border border-slate-200/95 rounded-xl p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <span className="w-1 h-3.5 bg-blue-700 rounded-sm" />
        <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-sans flex items-center gap-1.5">
          <CheckSquare className="w-4 h-4 text-blue-700 shrink-0" />
          <span>精细化合伙人行动清单 / Investment Action Plan</span>
        </h2>
      </div>
      <div className="flex flex-col gap-4">
        {note.actions.map((action, index) => (
          <div key={index} className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 p-4 bg-slate-50 border border-slate-200 rounded-lg hover:border-blue-400 hover:bg-white transition-all duration-300">
            <div className="flex-1">
              <div className="flex items-center gap-2.5 mb-2 select-none">
                <span className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded border ${getPriorityStyle(action.priority)}`}>
                  {getPriorityLabel(action.priority)}
                </span>
              </div>
              <h4 className="font-extrabold text-slate-900 text-sm mb-1.5">
                Action {iToRoman(index + 1)}: {action.task}
              </h4>
              <p className="text-xs md:text-sm text-slate-600 leading-relaxed font-semibold">
                {action.context}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
