'use client';

import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

interface CopyPromptButtonProps {
  text: string;
}

export default function CopyPromptButton({ text }: CopyPromptButtonProps) {
  const [copied, setCopied] = useState(false);

  async function copyPrompt() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <button
      className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-xs font-extrabold text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
      type="button"
      onClick={() => void copyPrompt()}
    >
      {copied ? <Check aria-hidden="true" className="h-4 w-4 text-emerald-600" /> : <Copy aria-hidden="true" className="h-4 w-4" />}
      {copied ? '已复制' : '复制命题调研提示词'}
    </button>
  );
}
