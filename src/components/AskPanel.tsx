/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, User, Database, RefreshCw, Cpu, HelpCircle, ArrowUpCircle, CheckCircle } from 'lucide-react';
import { ChatMessage } from '../types';
import { mockQaPairs } from '../mockData';

interface AskPanelProps {
  draftQuestion?: string;
  onDraftQuestionChange?: (question: string) => void;
  onShowNotification?: (msg: string) => void;
  onSelectTimestamp?: (timestamp: string) => void;
}

interface GroundedSource {
  timestamp: string;
  label: string;
}

export default function AskPanel({
  draftQuestion,
  onDraftQuestionChange,
  onShowNotification,
  onSelectTimestamp,
}: AskPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: '你好！我是你的 VideoBrief AI 助手。我已经通篇掌握了该视频的英语原声音轨与转译底稿。你可以向我追问任何关于此视频的投资干货、自动化细节、或是 AI 应用的局限，我将结合视频原文为你一一作答。',
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
      // Look for custom matched answers
      let finalResponse = '关于这个问题，虽然原视频没有给出直接的统计指标，但我们可以推断出其中逻辑：AI 的核心目的是将非结构化、隐蔽的数据量化，从而增强投资机构的前置判断力。你可以点击下方的提示词获取明确录入的信息。';
      let sources: GroundedSource[] = [
        { timestamp: '00:00', label: '引言：变革最前沿杠杆' }
      ];
      
      const queryLower = textToSend.toLowerCase();
      
      if (queryLower.includes('工具') || queryLower.includes('软件') || queryLower.includes('开发') || queryLower.includes('系统') || queryLower.includes('爬虫') || queryLower.includes('sourcing')) {
        finalResponse = mockQaPairs[0].answer;
        sources = [
          { timestamp: '18:40', label: 'Deal Sourcing 项目寻源新纪元' },
          { timestamp: '29:05', label: '自研 VC-AI 平台技术架构' }
        ];
      } else if (queryLower.includes('局限') || queryLower.includes('缺点') || queryLower.includes('早期') || queryLower.includes('种子') || queryLower.includes('幻觉') || queryLower.includes('识别')) {
        finalResponse = mockQaPairs[1].answer;
        sources = [
          { timestamp: '00:00', label: '引言：关系直觉与数据盲区' },
          { timestamp: '18:40', label: '早期种子轮非标特质评估' }
        ];
      } else if (queryLower.includes('机密') || queryLower.includes('安全') || queryLower.includes('泄露') || queryLower.includes('合规') || queryLower.includes('脱敏')) {
        finalResponse = mockQaPairs[2].answer;
        sources = [
          { timestamp: '08:15', label: '尽职调查安全与脱敏实例' }
        ];
      } else if (queryLower.includes('投后') || queryLower.includes('赋能') || queryLower.includes('建议') || queryLower.includes('管理') || queryLower.includes('agent')) {
        finalResponse = mockQaPairs[3].answer;
        sources = [
          { timestamp: '29:05', label: '投后赋能与 AI Agent 业务重组' }
        ];
      } else {
        // Try to match partial question names
        const matchedIndex = mockQaPairs.findIndex(p => queryLower.includes(p.question.substring(0, 6)));
        if (matchedIndex !== -1) {
          finalResponse = mockQaPairs[matchedIndex].answer;
          if (matchedIndex === 0) {
            sources = [
              { timestamp: '18:40', label: 'Sourcing 爬虫流程监控' },
              { timestamp: '29:05', label: '自研技术堆栈' }
            ];
          } else if (matchedIndex === 1) {
            sources = [
              { timestamp: '18:40', label: '早期极低数据基础局限' }
            ];
          } else if (matchedIndex === 2) {
            sources = [
              { timestamp: '08:15', label: 'DD 文件解析风控脱敏' }
            ];
          } else if (matchedIndex === 3) {
            sources = [
              { timestamp: '29:05', label: 'Portfolio Support 效能重构' }
            ];
          }
        }
      }

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
      onShowNotification?.('AI 助手已检索音轨比对并完成合规回答');
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
        <span className="text-[10px] font-bold text-slate-400 block px-0.5 uppercase tracking-wider">💡 精选疑点追问 / Suggested Grounded Questions</span>
        <div className="flex flex-col gap-1">
          <button
            onClick={() => handleQuickAsk('有哪些具体的 AI 寻源工具视频里有提到吗？')}
            className="text-left w-full px-2 py-1.5 bg-white hover:bg-slate-100 text-[10px] text-slate-650 rounded border border-slate-200/80 transition-colors cursor-pointer truncate"
          >
            🔍 视频中探讨的具体 AI 寻源具有哪些工程实现？
          </button>
          <button
            onClick={() => handleQuickAsk('大语言模型在识别极早期项目时的局限性是什么？')}
            className="text-left w-full px-2 py-1.5 bg-white hover:bg-slate-100 text-[10px] text-slate-650 rounded border border-slate-200/80 transition-colors cursor-pointer truncate"
          >
            ⚠️ 大模型在判断「极早期非结构化项目」的局限及偏见？
          </button>
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
