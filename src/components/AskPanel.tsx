/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { Cpu, Database, RefreshCw, Send, Sparkles, User } from 'lucide-react';
import { ChatMessage, GroundedSource, QAPair } from '../types';

interface AskPanelProps {
  draftQuestion?: string;
  qaPairs: QAPair[];
  onDraftQuestionChange?: (question: string) => void;
  onShowNotification?: (msg: string) => void;
  onSelectTimestamp?: (timestamp: string) => void;
}

export default function AskPanel({
  draftQuestion,
  qaPairs,
  onDraftQuestionChange,
  onShowNotification,
  onSelectTimestamp,
}: AskPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: '你好！我是你的 VideoBrief AI 助手。当前样例只围绕这条公开视频的内容回答；如果问题超出视频信息，我会说明原视频没有直接支持。',
      timestamp: new Date()
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [messageSources, setMessageSources] = useState<Record<string, GroundedSource[]>>({});
  
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof draftQuestion === 'string') {
      setInputText(draftQuestion);
    }
  }, [draftQuestion]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSendMessage = (textToSend: string) => {
    if (!textToSend.trim()) return;

    // Add user message
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: textToSend,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    onDraftQuestionChange?.('');
    setIsTyping(true);

    // Simulate thinking/retrieval speed
    setTimeout(() => {
      const queryLower = textToSend.toLowerCase();
      const matchedPair =
        qaPairs.find((pair) => pair.question === textToSend) ??
        qaPairs.find((pair) =>
          pair.keywords.some((keyword) => queryLower.includes(keyword.toLowerCase())),
        ) ??
        qaPairs.find((pair) => queryLower.includes(pair.question.slice(0, 6).toLowerCase()));

      const finalResponse =
        matchedPair?.answer ??
        '这条公开视频没有直接支持这个问题的完整答案。建议把问题收窄到视频中的观点、案例、限制或行动启发；也可以点击下方推荐问题，我会按可追溯时间戳回答。';
      const sources: GroundedSource[] =
        matchedPair?.sources ?? [{ timestamp: '00:00', label: '视频开场与主题范围' }];

      const aiMsgId = `ai-${Date.now()}`;
      const aiMsg: ChatMessage = {
        id: aiMsgId,
        sender: 'assistant',
        text: finalResponse,
        timestamp: new Date()
      };

      setMessageSources(prev => ({
        ...prev,
        [aiMsgId]: sources
      }));

      setMessages(prev => [...prev, aiMsg]);
      setIsTyping(false);
      onShowNotification?.('AI Ask 已基于当前样例的可追溯信息源完成回答');
    }, 1200);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSendMessage(inputText);
  };

  const handleQuickAsk = (q: string) => {
    handleSendMessage(q);
  };

  return (
    <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col h-[520px]">
      {/* Title block */}
      <div className="px-4 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between select-none">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
          <Sparkles className="w-4 h-4 text-blue-600 fill-blue-50" />
          <span>AI 事实溯源追问 / Grounded AI Ask</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-50 text-[9px] text-blue-700 rounded border border-blue-100 font-mono font-semibold">
            Fine-tuned Agent v1.4
          </span>
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
        </div>
      </div>

      {/* Message space */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 bg-slate-50/30">
        {messages.map((msg) => {
          const isAi = msg.sender === 'assistant';
          const sources = messageSources[msg.id] || [];
          return (
            <div
              key={msg.id}
              className={`flex gap-2.5 max-w-[90%] ${isAi ? 'self-start' : 'self-end flex-row-reverse'}`}
            >
              <div className={`w-7 h-7 rounded-lg shrink-0 flex items-center justify-center text-xs font-bold select-none shadow-sm ${
                isAi ? 'bg-blue-600 text-white' : 'bg-slate-900 text-white'
              }`}>
                {isAi ? <Cpu className="w-4 h-4 animate-pulse" /> : <User className="w-4 h-4" />}
               </div>
              
              <div className={`p-3.5 rounded-xl text-xs sm:text-[13px] leading-relaxed shadow-[0_1px_2px_rgba(20,20,20,0.02)] ${
                isAi 
                  ? 'bg-white border border-slate-200 text-slate-800' 
                  : 'bg-blue-600 text-white'
              }`}>
                {msg.text.split('\n').map((line, idx) => (
                  <p key={idx} className={idx > 0 ? 'mt-2' : ''}>{line}</p>
                ))}

                {/* Grounded Sources section inside message bubble for AI replies */}
                {isAi && sources.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col gap-2 select-none">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      <Database className="w-3.5 h-3.5 text-blue-500" />
                      <span>已核实的信息源 / Verified Grounding Sources</span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {sources.map((src, sIdx) => (
                        <button
                          key={sIdx}
                          onClick={() => {
                            if (onSelectTimestamp) {
                              onSelectTimestamp(src.timestamp);
                              onShowNotification?.(`已通过 AI 引用链，瞬间跳转至原片 [${src.timestamp}] 节点`);
                            }
                          }}
                          className="text-left py-1 px-2 rounded bg-slate-50 border border-slate-250 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 text-[10px] text-slate-650 transition-all font-semibold flex items-center justify-between duration-200 cursor-pointer"
                          title="点击左侧报告跳转"
                        >
                          <span className="truncate pr-4">🔊 {src.label}</span>
                          <span className="font-mono text-[9px] px-1.5 py-0.5 bg-white border border-slate-200 rounded text-blue-600 font-bold shrink-0">{src.timestamp}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Typing indicator */}
        {isTyping && (
          <div className="flex gap-2.5 self-start max-w-[85%]">
            <div className="w-7 h-7 rounded-lg bg-blue-600 text-white shrink-0 flex items-center justify-center text-xs shadow-sm">
              <Cpu className="w-4 h-4 animate-spin" />
            </div>
            <div className="p-3 bg-white border border-slate-200 rounded-xl text-xs text-slate-400 font-medium flex items-center gap-2 shadow-sm">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-500" />
              <span>AI 正在快速溯源底稿特征并匹配答案...</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Suggested quick buttons */}
      <div className="p-3 bg-slate-50/80 border-t border-slate-100 flex flex-col gap-1.5 max-h-[140px] overflow-y-auto shrink-0 select-none">
        <span className="text-[10px] font-bold text-slate-400 block px-0.5 uppercase tracking-wider">精选疑点追问 / Suggested Grounded Questions</span>
        <div className="flex flex-col gap-1">
          {qaPairs.slice(0, 2).map((pair) => (
            <button
              key={pair.question}
              onClick={() => handleQuickAsk(pair.question)}
              className="text-left w-full px-2 py-1.5 bg-white hover:bg-slate-100 text-[10px] text-slate-650 rounded border border-slate-200/80 transition-colors cursor-pointer truncate"
            >
              {pair.question}
            </button>
          ))}
        </div>
      </div>

      {/* Send message box */}
      <form onSubmit={handleFormSubmit} className="p-2 border-t border-slate-200 bg-white flex gap-2 shrink-0">
        <textarea
          id="ai-ask-textarea"
          value={inputText}
          onChange={(e) => {
            setInputText(e.target.value);
            onDraftQuestionChange?.(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSendMessage(inputText);
            }
          }}
          className="flex-1 bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-3 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-all resize-none h-10 inline-flex align-middle leading-normal"
          placeholder="围绕音频原文发起深度追问，回车发送..."
        />
        <button
          type="submit"
          disabled={!inputText.trim() || isTyping}
          className="bg-blue-600 group hover:opacity-90 active:scale-95 disabled:bg-slate-100 disabled:text-slate-350 text-white w-10 rounded-lg flex items-center justify-center transition-all cursor-pointer shadow-sm"
        >
          <Send className="w-4 h-4 text-white shrink-0" />
        </button>
      </form>
    </section>
  );
}
