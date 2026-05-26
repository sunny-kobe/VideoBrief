/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Link, User, Clock, Languages } from 'lucide-react';
import { ResearchNote } from '../types';
import HeaderActions from './HeaderActions';

interface ResultPageHeaderProps {
  note: ResearchNote;
  onCopyMarkdown: () => void;
  onExportPdf: () => void;
  onShare: () => void;
  isExporting: boolean;
  exportProgress: number;
}

export default function ResultPageHeader({
  note,
  onCopyMarkdown,
  onExportPdf,
  onShare,
  isExporting,
  exportProgress,
}: ResultPageHeaderProps) {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40 transition-shadow duration-200 shadow-[0_1px_2px_rgba(0,0,0,0.03)] selection:bg-blue-100">
      <div className="max-w-[1240px] mx-auto px-6 py-4">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          
          {/* Metadata Display and Title info */}
          <div className="flex-1 min-w-0">
            {/* Premium Metadata Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4 select-none">
              
              {/* 1. Video Source */}
              <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-lg flex flex-col gap-1 hover:bg-slate-100/50 transition-colors">
                <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase font-sans">视频源 / Video Source</span>
                <a
                  href={note.videoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-mono font-semibold text-slate-700 truncate flex items-center gap-1.5 hover:text-blue-600 transition-colors cursor-pointer"
                  title="点击在新窗口打开原版 YouTube 视频"
                >
                  <Link className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">{note.videoUrl.replace('https://www.youtube.com/watch?v=', 'youtube.com/...')}</span>
                </a>
              </div>

              {/* 2. Channel Name */}
              <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-lg flex flex-col gap-1 hover:bg-slate-100/50 transition-colors">
                <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase font-sans">发布频道 / Channel</span>
                <div className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">{note.channelName}</span>
                </div>
              </div>

              {/* 3. Duration */}
              <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-lg flex flex-col gap-1 hover:bg-slate-100/50 transition-colors">
                <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase font-sans">原声时长 / Duration</span>
                <div className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 font-mono">
                  <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>{note.duration}</span>
                </div>
              </div>

              {/* 4. Language direction */}
              <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-lg flex flex-col gap-1 hover:bg-slate-100/50 transition-colors">
                <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase font-sans">摘要方向 / Translation</span>
                <div className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Languages className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                  <span>{note.languageDirection}</span>
                </div>
              </div>

              {/* 5. Completion State */}
              <div className="col-span-2 sm:col-span-3 lg:col-span-1 p-3 bg-emerald-50/50 border border-emerald-200/85 rounded-lg flex flex-col gap-1">
                <span className="text-[10px] font-bold text-emerald-600/85 tracking-wider uppercase font-sans">系统状态 / Note Status</span>
                <div className="text-xs font-bold text-emerald-800 flex items-center gap-1.5 select-none">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  <span>研报分析已就绪</span>
                </div>
              </div>

            </div>

            {/* Video title */}
            <h1 className="text-lg md:text-xl font-bold font-sans tracking-tight text-slate-900 leading-snug truncate" title={note.title}>
              {note.title}
            </h1>
          </div>

          {/* Interactive controls */}
          <HeaderActions
            onCopyMarkdown={onCopyMarkdown}
            onExportPdf={onExportPdf}
            onShare={onShare}
            isExporting={isExporting}
            exportProgress={exportProgress}
          />

        </div>
      </div>
    </header>
  );
}
