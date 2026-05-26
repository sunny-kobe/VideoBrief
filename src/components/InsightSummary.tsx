/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ResearchNote } from '../types';

interface InsightSummaryProps {
  note: ResearchNote;
}

export default function InsightSummary({ note }: InsightSummaryProps) {
  return (
    <div className="flex flex-col gap-6">
      
      {/* 1. 一句话结论 / Core Takeaway */}
      <section className="bg-white border border-slate-200/95 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow duration-300">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-1 h-3.5 bg-blue-600 rounded-sm" />
          <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-sans">
            核心要点 / Core Takeaway
          </h2>
        </div>
        <p className="font-display font-semibold text-slate-900 text-base sm:text-lg md:text-xl leading-relaxed tracking-tight">
          {note.conclusion}
        </p>
      </section>

      {/* 2. 3行核心摘要 / Executive Summary */}
      <section className="bg-white border border-slate-200/95 rounded-xl p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-5">
          <span className="w-1 h-3.5 bg-blue-600 rounded-sm" />
          <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-sans">
            高管速读摘要 / Executive Summary
          </h2>
        </div>
        <div className="flex flex-col gap-4">
          {note.coreSummaries.map((summary, index) => (
            <div key={index} className="flex items-start gap-4 p-3.5 rounded-lg hover:bg-slate-50 transition-colors duration-150">
              <span className="flex items-center justify-center w-6 h-6 rounded-md bg-slate-900 text-white font-mono text-xs font-bold shrink-0 mt-0.5 select-none shadow-sm">
                0{index + 1}
              </span>
              <div className="flex-1">
                <span className="font-extrabold text-slate-900 mr-2 border-b-2 border-blue-150 pb-0.5 text-sm md:text-base">
                  {summary.label}
                </span>
                <span className="text-slate-600 leading-relaxed text-xs sm:text-sm md:text-base font-medium">
                  {summary.description}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

    </div>
  );
}
