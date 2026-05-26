/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Target, AlertTriangle } from 'lucide-react';
import { ResearchNote } from '../types';

interface AudienceAndLimitsProps {
  note: ResearchNote;
  onShowNotification?: (msg: string) => void;
}

export default function AudienceAndLimits({
  note,
  onShowNotification,
}: AudienceAndLimitsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 select-none">
      
      {/* 1. Target Audience */}
      <section className="bg-white border border-slate-200/95 rounded-xl p-6 flex flex-col justify-between shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-4">
            <span className="w-1 h-3.5 bg-slate-800 rounded-sm" />
            <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-sans flex items-center gap-1">
              <Target className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              <span>目标读者 / Target Audience</span>
            </h2>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {note.audiences.map((aud, i) => (
              <span
                key={i}
                className="px-2.5 py-1 bg-slate-50 text-slate-850 rounded text-xs font-semibold border border-slate-200 hover:bg-slate-100 hover:border-slate-300 transition-all duration-150 select-none cursor-pointer"
                onClick={() => onShowNotification?.(`已自动按「${aud}」偏好过滤重点数据`)}
              >
                {aud}
              </span>
            ))}
          </div>
        </div>
        <div className="text-[11px] text-slate-400 mt-5 italic border-t border-slate-100 pt-3">
          * 笔记已基于该群体之合伙合规及运营维度智能润色
        </div>
      </section>

      {/* 2. Limitations */}
      <section className="bg-white border border-slate-200/95 rounded-xl p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-1 h-3.5 bg-slate-800 rounded-sm" />
          <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-sans flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>原视频限制偏见 / Limitations</span>
          </h2>
        </div>
        <ul className="flex flex-col gap-3 text-xs md:text-sm text-slate-650 list-none pl-1 leading-relaxed">
          {note.limitations.map((lim, i) => (
            <li key={i} className="flex items-start gap-2 hover:text-slate-900 transition-colors duration-150">
              <span className="text-amber-500 font-bold shrink-0 mt-0.5">▪</span>
              <span className="font-medium text-slate-700">{lim}</span>
            </li>
          ))}
        </ul>
      </section>

    </div>
  );
}
