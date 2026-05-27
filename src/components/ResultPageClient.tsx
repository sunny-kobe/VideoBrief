'use client';

import { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckSquare,
  FileText,
  Info,
  Sparkles,
} from 'lucide-react';
import AskPanel from './AskPanel';
import KeyMoments from './KeyMoments';
import ResearchNoteContent from './ResearchNoteContent';
import ResultPageHeader from './ResultPageHeader';
import Sidebar from './Sidebar';
import { QAPair, ResearchNote } from '../types';
import { generateMarkdownNote } from '../utils/markdownHelper';

interface Notification {
  id: string;
  message: string;
  type?: 'info' | 'success' | 'warn';
}

interface ResultPageClientProps {
  note: ResearchNote;
  noteId: string;
  qaPairs: QAPair[];
}

async function copyText(text: string) {
  const clipboard = globalThis.navigator?.clipboard ?? window.navigator?.clipboard;

  if (clipboard?.writeText) {
    await clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.setAttribute('readonly', '');
  textArea.style.position = 'fixed';
  textArea.style.left = '-9999px';
  document.body.appendChild(textArea);
  textArea.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(textArea);

  if (!copied) {
    throw new Error('Fallback copy failed');
  }
}

export default function ResultPageClient({ note, noteId, qaPairs }: ResultPageClientProps) {
  const [activeTab, setActiveTab] = useState('briefs');
  const [activeTimestamp, setActiveTimestamp] = useState(
    note.keyMoments[0]?.timestamp ?? note.chapters[0]?.timestamp ?? '00:00',
  );
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isPdfExporting, setIsPdfExporting] = useState(false);
  const [pdfProgress, setPdfProgress] = useState(0);
  const [draftQuestion, setDraftQuestion] = useState('');

  useEffect(() => {
    if (notifications.length === 0) return;

    const timer = window.setTimeout(() => {
      setNotifications((prev) => prev.slice(1));
    }, 3500);

    return () => window.clearTimeout(timer);
  }, [notifications]);

  const showNotification = (
    message: string,
    type: 'info' | 'success' | 'warn' = 'success',
  ) => {
    setNotifications((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${prev.length}`,
        message,
        type,
      },
    ]);
  };

  const handleCopyMarkdown = async () => {
    const markdown = generateMarkdownNote(note);

    try {
      await copyText(markdown);
      showNotification('结构化 Markdown 已复制，可直接贴到飞书、Notion 或微信。');
    } catch {
      showNotification('复制失败，请检查浏览器剪贴板权限后重试。', 'warn');
    }
  };

  const handleExportPdf = () => {
    if (isPdfExporting) return;

    setIsPdfExporting(true);
    setPdfProgress(10);
    showNotification('正在模拟生成 PDF 报告。真实导出会在后续接入。', 'info');

    const interval = window.setInterval(() => {
      setPdfProgress((prev) => {
        if (prev >= 100) {
          window.clearInterval(interval);
          window.setTimeout(() => {
            setIsPdfExporting(false);
            showNotification('PDF 导出模拟完成。');
          }, 300);
          return 100;
        }

        return Math.min(prev + Math.floor(Math.random() * 20) + 12, 100);
      });
    }, 280);
  };

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/notes/${noteId}`;

    try {
      await copyText(shareUrl);
      showNotification(`分享链接已复制：${shareUrl}`);
    } catch {
      showNotification(`分享链接：${shareUrl}`, 'info');
    }
  };

  const handleSelectTimestamp = (timestamp: string) => {
    setActiveTimestamp(timestamp);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased flex">
      <Sidebar
        activeTab={activeTab}
        onToggleTab={(tab) => setActiveTab(tab)}
        onShowNotification={(message) => showNotification(message, 'info')}
      />

      <div className="flex-1 ml-0 md:ml-20 flex flex-col min-h-screen overflow-x-hidden">
        <div className="bg-blue-600 text-white px-6 py-2.5 flex items-center justify-between text-xs font-semibold select-none shadow-[inset_0_-1px_0_rgba(255,255,255,0.1)]">
          <div className="flex items-center gap-2 min-w-0">
            <Info className="w-4 h-4 text-blue-200 shrink-0" />
            <span className="truncate">
              VideoBrief MVP Pro 样例页：基于公开视频信息整理，transcript-first，不接后端 API
            </span>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <span>Sample reader:</span>
            <span className="font-mono bg-blue-700 px-2 py-0.5 rounded text-blue-100">
              early-user@videobrief.local
            </span>
          </div>
        </div>

        <ResultPageHeader
          note={note}
          onCopyMarkdown={handleCopyMarkdown}
          onExportPdf={handleExportPdf}
          onShare={handleShare}
          isExporting={isPdfExporting}
          exportProgress={pdfProgress}
        />

        <main className="flex-1 p-4 sm:p-6 md:p-8">
          <div className="max-w-[1240px] mx-auto grid grid-cols-12 gap-6 lg:gap-8">
            <div className="col-span-12 md:col-span-7 lg:col-span-8 flex flex-col gap-6">
              <div className="bg-white border border-slate-200 rounded-lg p-4 flex items-start gap-3 shadow-[0_1px_2px_rgba(15,23,42,0.01)]">
                <Sparkles className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                <div className="text-xs text-slate-600 leading-relaxed">
                  <strong className="text-slate-900">Transcript-first 边界：</strong>
                  当前页面使用真实公开英文视频作为样例，笔记已按 transcript-first 方式整理。AI Ask 现在读取本样例的本地 grounded Q&A，后续可替换成真实 RAG / Responses API。
                </div>
              </div>

              <ResearchNoteContent
                note={note}
                activeTimestamp={activeTimestamp}
                onSelectTimestamp={handleSelectTimestamp}
                onShowNotification={(message) => showNotification(message)}
                onDraftQuestion={setDraftQuestion}
              />
            </div>

            <div className="col-span-12 md:col-span-5 lg:col-span-4 flex flex-col gap-6">
              <AskPanel
                draftQuestion={draftQuestion}
                qaPairs={qaPairs}
                onDraftQuestionChange={setDraftQuestion}
                onShowNotification={(message) => showNotification(message)}
                onSelectTimestamp={handleSelectTimestamp}
              />

              <KeyMoments
                note={note}
                activeTimestamp={activeTimestamp}
                onSelectTimestamp={handleSelectTimestamp}
                onShowNotification={(message) => showNotification(message)}
              />
            </div>
          </div>
        </main>
      </div>

      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm sm:max-w-md pointer-events-none">
        {notifications.map((notification) => (
          <div
            key={notification.id}
            className={`p-3.5 rounded-lg shadow-lg flex items-start gap-2.5 pointer-events-auto border animate-in slide-in-from-bottom-2 duration-200 ${
              notification.type === 'warn'
                ? 'bg-amber-900 border-amber-800 text-amber-50'
                : notification.type === 'info'
                  ? 'bg-slate-900 border-slate-800 text-slate-100'
                  : 'bg-white border-slate-200 text-slate-800 shadow-slate-950/5'
            }`}
          >
            <div className="shrink-0 mt-0.5">
              {notification.type === 'warn' ? (
                <AlertCircle className="w-4 h-4 text-amber-400" />
              ) : notification.type === 'info' ? (
                <Sparkles className="w-4 h-4 text-blue-400 animate-pulse" />
              ) : (
                <CheckSquare className="w-4 h-4 text-emerald-600" />
              )}
            </div>
            <p className="text-xs font-semibold leading-relaxed">{notification.message}</p>
          </div>
        ))}
      </div>

      {isPdfExporting && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm border border-slate-100 animate-in zoom-in-95 duration-150">
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                <FileText className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <h3 className="font-display font-bold text-slate-900 text-base">
                  导出高保真 PDF 研究报告中
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  演示环境正在模拟生成。正式版本会接真实导出任务队列。
                </p>
              </div>

              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden mt-2">
                <div
                  className="bg-blue-600 h-full rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(pdfProgress, 100)}%` }}
                />
              </div>
              <span className="text-xs font-mono font-bold text-slate-600">
                {Math.min(pdfProgress, 100)}%
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
