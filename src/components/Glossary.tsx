/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { GraduationCap, BrainCircuit } from 'lucide-react';
import { ResearchNote } from '../types';

interface GlossaryProps {
  note: ResearchNote;
}

export default function Glossary({ note }: GlossaryProps) {
  return (
    <section className="bg-white border border-slate-200/95 rounded-xl p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <span className="w-1 h-3.5 bg-orange-600 rounded-sm" />
        <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-sans flex items-center gap-1.5">
          <GraduationCap className="w-4.5 h-4.5 text-orange-600 shrink-0" />
          <span>重要概念溯源释义 / Concept Glossaries</span>
        </h2>
      </div>
      <div className="flex flex-col gap-3">
        {note.concepts.map((concept, index) => (
          <div key={index} className="p-4 bg-orange-50/15 border border-orange-100 rounded-lg hover:border-orange-350 transition-colors duration-250">
            <h3 className="font-bold text-slate-900 mb-1.5 text-xs sm:text-sm flex items-center gap-2 select-none">
              <BrainCircuit className="w-4 h-4 text-orange-650 shrink-0" />
              <span>{concept.concept}</span>
            </h3>
            <p className="text-slate-650 text-xs md:text-sm leading-relaxed font-semibold">
              {concept.explanation}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
