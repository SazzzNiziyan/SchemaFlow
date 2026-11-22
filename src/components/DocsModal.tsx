import React from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, X, Code, Database, Key, ShieldCheck, Sparkles } from 'lucide-react';

import { useModal } from '../store/useUIStore';

export const DocsModal: React.FC = () => {
  const { isOpen, close: onClose } = useModal('docs');
  if (!isOpen) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="SchemaFlow Documentation"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 glass-backdrop animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl glass-panel rounded-panel overflow-hidden flex flex-col h-[550px]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-[var(--glass-border)] flex items-center justify-between bg-[var(--glass-surface-elevated)]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-control bg-[var(--glass-hover)] border border-[var(--glass-border)] flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-accent" />
            </div>
            <h3 className="text-base font-bold text-[var(--glass-text-primary)]">SchemaFlow Documentation & Reference</h3>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)] p-1.5 rounded-control transition-colors cursor-pointer hover:bg-[var(--glass-hover)]"
            aria-label="Close documentation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs text-[var(--glass-text-primary)] leading-relaxed">
          {/* Section 1 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-bold text-accent">
              <Database className="w-4 h-4 text-accent" />
              <span>1. Visual Schema Canvas & Multi-Row Queue Layout</span>
            </div>
            <p className="text-[var(--glass-text-secondary)]">
              SchemaFlow allows you to visually design and model MongoDB collections and relational schemas.
              Move collection cards anywhere on the canvas, add typed fields, and run the relationship-aware queue layout algorithm (<kbd className="rounded border border-[var(--glass-border)] bg-[var(--glass-input-bg)] px-1 py-0.5 font-mono text-[10px] text-[var(--glass-text-secondary)]">Alt+L</kbd>) to prevent overlaps.
            </p>
          </div>

          {/* Section 2 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-bold text-accent">
              <Key className="w-4 h-4 text-accent" />
              <span>2. Foreign Keys & Relationship Mapping</span>
            </div>
            <p className="text-[var(--glass-text-secondary)]">
              Select any field in the Right Field Inspector, check <span className="font-mono text-accent font-semibold">Foreign Key Relation</span>, and select a target collection & field.
              SchemaFlow will render smooth, animated Bezier connection paths connecting references (e.g. <span className="font-mono text-accent font-semibold">Users._id</span> → <span className="font-mono text-accent font-semibold">Posts.authorId</span>).
            </p>
          </div>

          {/* Section 3 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-bold text-accent">
              <Sparkles className="w-4 h-4 text-accent" />
              <span>3. AI Schema Architect via Gemini</span>
            </div>
            <p className="text-[var(--glass-text-secondary)]">
              Click the <span className="font-mono text-accent font-semibold">AI Architect</span> button or press <kbd className="rounded border border-[var(--glass-border)] bg-[var(--glass-input-bg)] px-1 py-0.5 font-mono text-[10px] text-[var(--glass-text-secondary)]">Cmd+K</kbd>. Enter any plain English domain prompt or pick a starter template. Gemini constructs complete collections, typed fields, and foreign keys automatically.
            </p>
          </div>

          {/* Section 4 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-bold text-accent">
              <ShieldCheck className="w-4 h-4 text-accent" />
              <span>4. Real-Time MongoDB Anti-Pattern Auditor</span>
            </div>
            <p className="text-[var(--glass-text-secondary)]">
              Click the Shield button in the top bar to inspect 8+ production MongoDB engineering checks (unbounded arrays, missing $lookup indexes, TTL expirations, compound indexes) with 1-Click auto-fixes and full Cmd+Z undo.
            </p>
          </div>

          {/* Section 5 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-bold text-accent">
              <Code className="w-4 h-4 text-accent" />
              <span>5. Multi-Framework Code & Project Export</span>
            </div>
            <p className="text-[var(--glass-text-secondary)]">
              As you modify your visual canvas, the bottom Code Drawer generates real-time, syntax-valid code for Mongoose, Zod, TypeScript, Express CRUD APIs, and $lookup Aggregation pipelines. Export a complete, runnable full-stack backend (.zip) at any time.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--glass-border)] bg-[var(--glass-surface-elevated)] flex justify-end">
          <button
            onClick={onClose}
            className="btn btn-primary text-xs"
          >
            Got It
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
