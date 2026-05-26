/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ClipboardCheck, Check, FileDown, Loader2, Share2 } from 'lucide-react';

interface HeaderActionsProps {
  onCopyMarkdown: () => void;
  onExportPdf: () => void;
  onShare: () => void;
  isExporting: boolean;
  exportProgress: number;
}

export default function HeaderActions({
  onCopyMarkdown,
  onExportPdf,
  onShare,
  isExporting,
  exportProgress,
}: HeaderActionsProps) {
  const [copiedMarkdown, setCopiedMarkdown] = useState(false);
  const [shared, setShared] = useState(false);

  const handleCopy = () => {
    onCopyMarkdown();
    setCopiedMarkdown(true);
    setTimeout(() => setCopiedMarkdown(false), 3000);
  };

  const handleShare = () => {
    onShare();
    setShared(true);
    setTimeout(() => setShared(false), 3000);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 md:self-start shrink-0 select-none">
      {/* 1. Copy Markdown */}
      <button
        onClick={handleCopy}
        disabled={copiedMarkdown}
        className={`flex items-center gap-2 px-3.5 py-2.5 rounded-lg text-xs font-semibold shadow-sm transition-all duration-200 active:scale-95 cursor-pointer ${
          copiedMarkdown
            ? 'bg-emerald-50 border border-emerald-300 text-emerald-850'
            : 'bg-white border border-slate-300 hover:border-slate-400 text-slate-700 hover:bg-slate-50'
        }`}
        title="复制结构化 Markdown 笔记"
      >
        {copiedMarkdown ? (
          <>
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Copied 复制成功</span>
          </>
        ) : (
          <>
            <ClipboardCheck className="w-4 h-4 text-slate-450 shrink-0" />
            <span>Copy Markdown</span>
          </>
        )}
      </button>

      {/* 2. Export PDF */}
      <button
        onClick={onExportPdf}
        disabled={isExporting}
        className={`flex items-center gap-2 px-3.5 py-2.5 rounded-lg text-xs font-semibold shadow-sm transition-all duration-200 active:scale-95 cursor-pointer ${
          isExporting
            ? 'bg-blue-50 border border-blue-200 text-blue-800 cursor-not-allowed'
            : 'bg-white border border-slate-300 hover:border-slate-400 text-slate-700 hover:bg-slate-50'
        }`}
        title="生成 PDF 完整研报"
      >
        {isExporting ? (
          <>
            <Loader2 className="w-4 h-4 text-blue-650 animate-spin shrink-0" />
            <span>Exporting... {exportProgress}%</span>
          </>
        ) : (
          <>
            <FileDown className="w-4 h-4 text-slate-450 shrink-0" />
            <span>Export PDF</span>
          </>
        )}
      </button>

      {/* 3. Share URL */}
      <button
        onClick={handleShare}
        disabled={shared}
        className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold shadow-sm transition-all duration-200 active:scale-95 cursor-pointer ${
          shared
            ? 'bg-slate-100 border border-slate-300 text-slate-800'
            : 'bg-slate-900 text-white hover:bg-slate-850'
        }`}
        title="分享团队协作链接"
      >
        {shared ? (
          <>
            <Check className="w-4 h-4 text-emerald-650 shrink-0" />
            <span>Link Copied 已复制</span>
          </>
        ) : (
          <>
            <Share2 className="w-4 h-4 text-slate-300 shrink-0" />
            <span>Share</span>
          </>
        )}
      </button>
    </div>
  );
}
