/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Flame } from 'lucide-react';
import { ResearchNote } from '../types';

interface KeyPointsProps {
  note: ResearchNote;
}

export default function KeyPoints({ note }: KeyPointsProps) {
  return (
    <section className="bg-white border border-slate-200/95 rounded-xl p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <span className="w-1 h-3.5 bg-emerald-600 rounded-sm" />
        <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-sans flex items-center gap-1.5">
          <Flame className="w-4 h-4 text-emerald-650" />
          <span>行业深度观察 / Market Deep Insights</span>
        </h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {note.insights.map((insight, index) => (
          <div key={index} className="flex flex-col gap-2 p-4 rounded-xl bg-slate-50 border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/10 transition-all duration-300">
            <span className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-emerald-600 rounded-full shrink-0" />
              {insight.title}
            </span>
            <p className="text-slate-600 leading-relaxed text-xs font-semibold">
              {insight.description}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
