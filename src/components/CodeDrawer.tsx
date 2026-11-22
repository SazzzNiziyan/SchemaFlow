import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  Check,
  Copy,
  Download,
  X,
  Maximize2,
  Minimize2,
  Edit3,
  Eye,
  CheckCircle2,
  AlertCircle,
  Play,
  GripHorizontal,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { Highlight, type PrismTheme } from 'prism-react-renderer';
import { useSchemaStore, type CodeSyncSummary } from '../store/useSchemaStore';
import { useUIStore } from '../store/useUIStore';
import {
  generateMongooseCode,
  generateZodCode,
  generateTypeScriptCode,
  generateExpressApiCode,
  generateJsonSchemaCode,
  generateMockDataCode,
  generateAggregationPipeline,
} from '../utils/codeGenerators';
import { parseMongooseCode, type ParseResult } from '../utils/mongooseParser';

export type CodeTab =
  | 'mongoose'
  | 'zod'
  | 'typescript'
  | 'express'
  | 'jsonSchema'
  | 'mock'
  | 'sandbox';

const TABS: { id: CodeTab; label: string; lang: string; ext: string }[] = [
  { id: 'mongoose', label: 'Mongoose', lang: 'typescript', ext: 'ts' },
  { id: 'zod', label: 'Zod', lang: 'typescript', ext: 'ts' },
  { id: 'typescript', label: 'TypeScript', lang: 'typescript', ext: 'ts' },
  { id: 'express', label: 'Express API', lang: 'typescript', ext: 'ts' },
  { id: 'jsonSchema', label: '$jsonSchema', lang: 'javascript', ext: 'js' },
  { id: 'mock', label: 'Mock Data', lang: 'json', ext: 'json' },
  { id: 'sandbox', label: 'Query Sandbox', lang: 'javascript', ext: 'js' },
];

/**
 * Custom theme-aware PrismTheme mapping to active CSS variables:
 * Flexoki / Alabaster warm paper in light mode; Warm hardware charcoal in dark mode.
 */
const themeAwarePrismTheme: PrismTheme = {
  plain: {
    color: 'var(--code-text)',
    backgroundColor: 'transparent',
  },
  styles: [
    {
      types: ['comment', 'prolog', 'doctype', 'cdata'],
      style: {
        color: 'var(--code-comment)',
        fontStyle: 'italic',
      },
    },
    {
      types: ['punctuation'],
      style: {
        color: 'var(--code-punctuation)',
      },
    },
    {
      types: ['property', 'tag', 'boolean', 'number', 'constant', 'symbol', 'deleted'],
      style: {
        color: 'var(--code-number)',
      },
    },
    {
      types: ['selector', 'attr-name', 'string', 'char', 'builtin', 'inserted'],
      style: {
        color: 'var(--code-string)',
      },
    },
    {
      types: ['operator', 'entity', 'url'],
      style: {
        color: 'var(--code-punctuation)',
      },
    },
    {
      types: ['atrule', 'attr-value', 'keyword'],
      style: {
        color: 'var(--code-keyword)',
      },
    },
    {
      types: ['function', 'class-name'],
      style: {
        color: 'var(--code-function)',
      },
    },
    {
      types: ['regex', 'important', 'variable'],
      style: {
        color: 'var(--code-type)',
      },
    },
  ],
};

export const CodeDrawer: React.FC = () => {
  const isOpen = useUIStore((s) => s.isCodeDrawerExpanded);
  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>{isOpen && <CodePanel key="code-ide" />}</AnimatePresence>,
    document.body,
  );
};

function CodePanel() {
  const collections = useSchemaStore((s) => s.collections);
  const selectedCollectionId = useSchemaStore((s) => s.selectedCollectionId);
  const selectedFieldId = useSchemaStore((s) => s.selectedFieldId);
  const close = () => useUIStore.getState().setCodeDrawerExpanded(false);

  const [activeTab, setActiveTab] = useState<CodeTab>('mongoose');
  const [copied, setCopied] = useState(false);
  const [height, setHeight] = useState(500);
  const [isMaximized, setIsMaximized] = useState(false);

  // Bi-directional sync state (Mongoose tab)
  const [isEditMode, setIsEditMode] = useState(false);
  const [draftCode, setDraftCode] = useState('');
  /** Mongoose tab shows every collection, or only the selected one. */
  const [mongooseScope, setMongooseScope] = useState<'all' | 'selected'>('all');
  /** Ids of the collections the draft was generated from (what "Sync" may delete). */
  const [editScopeIds, setEditScopeIds] = useState<string[]>([]);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [lastSync, setLastSync] = useState<CodeSyncSummary | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Query Sandbox state
  const [sandboxSourceColId, setSandboxSourceColId] = useState<string>('');
  const [sandboxTargetColId, setSandboxTargetColId] = useState<string>('');

  const selectedCol = collections.find((c) => c.id === selectedCollectionId);
  const selectedField = selectedCol?.fields.find((f) => f.id === selectedFieldId);

  // Lock background scroll when in fullscreen mode
  useEffect(() => {
    if (isMaximized) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isMaximized]);

  // Pressing Escape in fullscreen exits back to docked mode
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMaximized) {
        e.preventDefault();
        e.stopPropagation();
        setIsMaximized(false);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isMaximized]);

  const scopedCollections = useMemo(
    () => (mongooseScope === 'selected' && selectedCol ? [selectedCol] : collections),
    [mongooseScope, selectedCol, collections],
  );

  // Code generation outputs
  const codeOutputs = useMemo(() => {
    return {
      mongoose: generateMongooseCode(scopedCollections, { allCollections: collections }),
      zod: generateZodCode(collections),
      typescript: generateTypeScriptCode(collections),
      express: generateExpressApiCode(collections),
      jsonSchema: generateJsonSchemaCode(collections),
      mock: generateMockDataCode(collections),
      sandbox: '',
    };
  }, [collections, scopedCollections]);

  // Aggregation sandbox generation
  const aggregationResult = useMemo(() => {
    return generateAggregationPipeline(collections, sandboxSourceColId || undefined, sandboxTargetColId || undefined);
  }, [collections, sandboxSourceColId, sandboxTargetColId]);

  const activeCode = activeTab === 'sandbox' ? aggregationResult.pipelineCode : codeOutputs[activeTab];

  // ----- Mongoose Edit & Sync -------------------------------------------
  const enterEditMode = () => {
    // Schema-only code (no TS interfaces): each field lives in exactly one place,
    // so every edit the user makes is one that Sync can apply.
    const editable = generateMongooseCode(scopedCollections, { allCollections: collections, interfaces: false });
    setDraftCode(editable);
    setEditScopeIds(scopedCollections.map((c) => c.id));
    setParseResult(parseMongooseCode(editable, collections));
    setLastSync(null);
    setIsEditMode(true);
  };

  // Live validation while typing (debounced). Never touches the canvas.
  useEffect(() => {
    if (!isEditMode) return;
    const t = setTimeout(() => setParseResult(parseMongooseCode(draftCode, useSchemaStore.getState().collections)), 200);
    return () => clearTimeout(t);
  }, [draftCode, isEditMode]);

  const handleSync = () => {
    const current = useSchemaStore.getState().collections;
    const result = parseMongooseCode(draftCode, current);
    setParseResult(result);
    if (!result.success || !result.collections) {
      setLastSync(null);
      return;
    }
    const summary = useSchemaStore.getState().syncFromCode(result.collections, editScopeIds);
    setLastSync(summary);
    // Collections that now exist in the code are the new edit scope.
    const ids = new Set(useSchemaStore.getState().collections.map((c) => c.id));
    setEditScopeIds(result.collections.map((c) => c.id).filter((id) => ids.has(id)));
    if (summary.changed) {
      const parts = [
        summary.added && `${summary.added} added`,
        summary.updated && `${summary.updated} updated`,
        summary.removed && `${summary.removed} removed`,
      ].filter(Boolean);
      useUIStore.getState().showToast({
        title: 'Canvas synced from code',
        description: `${parts.join(', ')}. Press Ctrl/Cmd+Z on the canvas to undo.`,
        type: 'success',
      });
    } else {
      const firstWarning = result.warnings?.[0];
      useUIStore.getState().showToast({
        title: 'Nothing to sync',
        description: firstWarning
          ? `${firstWarning.line ? `Line ${firstWarning.line}: ` : ''}${firstWarning.message}`
          : 'The canvas already matches this code. Edit the fields inside new Schema({ ... }) to change the graph.',
        type: 'info',
      });
    }
  };

  const jumpToLine = (line: number) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const lines = draftCode.split('\n');
    const pos = lines.slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0);
    ta.focus();
    ta.setSelectionRange(pos, pos + (lines[line - 1]?.length ?? 0));
    const lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 21;
    ta.scrollTop = Math.max(0, (line - 4) * lineHeight);
  };

  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && (e.key === 'Enter' || e.key === 's')) {
      e.preventDefault();
      handleSync();
      return;
    }
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      const ta = e.currentTarget;
      const { selectionStart: a, selectionEnd: b } = ta;
      setDraftCode(draftCode.slice(0, a) + '  ' + draftCode.slice(b));
      requestAnimationFrame(() => ta.setSelectionRange(a + 2, a + 2));
    }
  };

  const syncBadge = (() => {
    if (!parseResult) return { tone: 'idle' as const, text: 'Editing Mongoose…', title: '' };
    if (!parseResult.success) {
      const where = parseResult.errorLine ? `Line ${parseResult.errorLine}: ` : '';
      return { tone: 'error' as const, text: `${where}${parseResult.error}`, title: `${where}${parseResult.error}` };
    }
    const st = parseResult.stats!;
    const warnCount = parseResult.warnings?.length ?? 0;
    const text =
      `Valid: ${st.collections} collection${st.collections === 1 ? '' : 's'}, ${st.fields} field${st.fields === 1 ? '' : 's'}` +
      (st.relationships ? `, ${st.relationships} ref${st.relationships === 1 ? '' : 's'}` : '') +
      (warnCount ? ` · ${warnCount} warning${warnCount === 1 ? '' : 's'}` : '');
    return {
      tone: warnCount ? ('warn' as const) : ('ok' as const),
      text,
      title: parseResult.warnings?.map((w) => (w.line ? `Line ${w.line}: ${w.message}` : w.message)).join('\n') ?? '',
    };
  })();

  const handleCopy = () => {
    const textToCopy = isEditMode && activeTab === 'mongoose' ? draftCode : activeCode;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownload = () => {
    const tabInfo = TABS.find((t) => t.id === activeTab);
    const ext = tabInfo?.ext ?? 'ts';
    const textToDownload = isEditMode && activeTab === 'mongoose' ? draftCode : activeCode;
    const blob = new Blob([textToDownload], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeTab}-schema.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Canvas-to-Code Line Highlighting
  const lineHighlightIndex = useMemo(() => {
    if (!selectedField || isEditMode) return -1;
    const lines = activeCode.split('\n');
    const regex = new RegExp(`\\b${selectedField.name}\\b\\s*[:(]`, 'i');
    return lines.findIndex((line) => regex.test(line));
  }, [selectedField, activeCode, isEditMode]);

  const lineRefs = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => {
    if (lineHighlightIndex !== -1 && lineRefs.current[lineHighlightIndex]) {
      lineRefs.current[lineHighlightIndex]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [lineHighlightIndex]);

  // Drag-to-resize panel (docked mode only)
  const handleResizeStart = (e: React.PointerEvent) => {
    if (isMaximized) return;
    e.preventDefault();
    const startY = e.clientY;
    const startH = height;
    const onMove = (moveEvent: PointerEvent) => {
      const delta = startY - moveEvent.clientY;
      const nextH = Math.max(320, Math.min(window.innerHeight - 90, startH + delta));
      setHeight(nextH);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const currentLang = TABS.find((t) => t.id === activeTab)?.lang ?? 'typescript';

  return (
    <motion.section
      initial={{ opacity: 0, y: isMaximized ? 0 : 20, scale: isMaximized ? 1 : 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: isMaximized ? 0 : 20, scale: isMaximized ? 1 : 0.99 }}
      transition={{ type: 'spring', stiffness: 450, damping: 35 }}
      style={
        isMaximized
          ? { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh', zIndex: 100 }
          : { height: `${height}px` }
      }
      className={
        isMaximized
          ? 'fixed inset-0 z-[100] flex w-screen h-screen flex-col overflow-hidden bg-[var(--code-bg)] text-fg shadow-2xl'
          : 'panel fixed bottom-[76px] left-3 z-30 flex w-[min(940px,calc(100vw-24px))] flex-col overflow-hidden rounded-panel border border-line bg-[var(--code-bg)] text-fg shadow-panel backdrop-blur-2xl'
      }
      aria-label="Full-Stack MongoDB Code Engine"
    >
      {/* Resizer Bar (visible in docked mode) */}
      {!isMaximized && (
        <div
          onPointerDown={handleResizeStart}
          className="group relative flex h-2 w-full cursor-ns-resize items-center justify-center border-b border-line bg-[var(--code-header-bg)] hover:bg-accent-soft transition-colors"
          title="Drag up/down to resize code engine"
        >
          <GripHorizontal className="h-3 w-3 text-fg-muted group-hover:text-accent" />
        </div>
      )}

      {/* Header Bar */}
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-line bg-[var(--code-header-bg)] px-3 text-fg">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  setIsEditMode(false);
                }}
                className={`flex items-center gap-1.5 rounded-control px-2.5 py-1 text-xs font-medium transition ${
                  isActive
                    ? 'bg-accent-soft text-accent border border-accent/30 font-semibold shadow-xs'
                    : 'text-fg-secondary hover:bg-surface-hover hover:text-fg border border-transparent'
                }`}
              >
                {tab.id === 'sandbox' && <Play className="h-3 w-3 text-accent" />}
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Actions & Status */}
        <div className="flex items-center gap-1.5 pl-2">
          {/* Scope: whole schema or only the selected collection (Mongoose tab) */}
          {activeTab === 'mongoose' && selectedCol && (
            <div
              className="flex items-center rounded-control border border-line p-0.5 text-[11px]"
              title={isEditMode ? 'Switch to View Mode to change scope' : 'Choose which collections the code shows'}
            >
              {(['all', 'selected'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={isEditMode}
                  onClick={() => setMongooseScope(s)}
                  className={`max-w-[120px] truncate rounded px-1.5 py-0.5 font-medium transition disabled:cursor-not-allowed ${
                    mongooseScope === s ? 'bg-accent-soft text-accent' : 'text-fg-secondary hover:text-fg'
                  } ${isEditMode && mongooseScope !== s ? 'opacity-40' : ''}`}
                >
                  {s === 'all' ? 'All' : selectedCol.name}
                </button>
              ))}
            </div>
          )}

          {/* Bi-Directional Sync Toggle (Mongoose Tab only) */}
          {activeTab === 'mongoose' && (
            <button
              type="button"
              onClick={() => (isEditMode ? setIsEditMode(false) : enterEditMode())}
              className={`flex items-center gap-1 rounded-control px-2 py-1 text-xs font-medium transition ${
                isEditMode
                  ? 'bg-warning-soft text-warning border border-warning-line'
                  : 'text-fg-secondary hover:bg-surface-hover hover:text-fg border border-transparent'
              }`}
              title="Toggle bi-directional live code editing & canvas sync"
            >
              {isEditMode ? <Eye className="h-3.5 w-3.5" /> : <Edit3 className="h-3.5 w-3.5" />}
              <span>{isEditMode ? 'View Mode' : 'Edit & Sync'}</span>
            </button>
          )}

          {/* Live parse status + Sync */}
          {activeTab === 'mongoose' && isEditMode && (
            <>
              <span
                role="status"
                title={syncBadge.title || syncBadge.text}
                className={`flex max-w-[340px] items-center gap-1 truncate rounded px-2 py-0.5 text-[10.5px] font-mono ${
                  syncBadge.tone === 'ok'
                    ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10'
                    : syncBadge.tone === 'warn'
                      ? 'text-warning bg-warning-soft'
                      : syncBadge.tone === 'error'
                        ? 'text-rose-600 dark:text-rose-400 bg-rose-500/10'
                        : 'text-fg-muted'
                }`}
              >
                {syncBadge.tone === 'ok' ? (
                  <CheckCircle2 className="h-3 w-3 shrink-0" />
                ) : syncBadge.tone === 'warn' ? (
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                ) : syncBadge.tone === 'error' ? (
                  <AlertCircle className="h-3 w-3 shrink-0" />
                ) : null}
                <span className="truncate">{syncBadge.text}</span>
              </span>
              <button
                type="button"
                onClick={handleSync}
                disabled={!parseResult?.success}
                className="flex items-center gap-1 rounded-control border border-accent/30 bg-accent-soft px-2 py-1 text-xs font-semibold text-accent transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                title="Apply the code to the canvas (Ctrl/Cmd+Enter). Undo with Ctrl/Cmd+Z on the canvas."
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Sync</span>
              </button>
            </>
          )}

          <div className="h-4 w-px bg-line-strong mx-1" />

          {/* Copy Button */}
          <button
            type="button"
            className={`flex items-center gap-1 rounded-control px-2.5 py-1 text-xs font-medium transition hover:bg-surface-hover ${
              copied ? 'text-accent font-semibold' : 'text-fg-secondary hover:text-fg'
            }`}
            onClick={handleCopy}
            title="Copy code to clipboard"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-accent" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>

          {/* Download Button */}
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-control text-fg-secondary transition hover:bg-surface-hover hover:text-fg"
            onClick={handleDownload}
            title="Download file"
            aria-label="Download file"
          >
            <Download className="h-3.5 w-3.5" />
          </button>

          {/* Maximize Toggle */}
          <button
            type="button"
            className={`flex h-7 w-7 items-center justify-center rounded-control transition ${
              isMaximized
                ? 'bg-accent-soft text-accent'
                : 'text-fg-secondary hover:bg-surface-hover hover:text-fg'
            }`}
            onClick={() => setIsMaximized(!isMaximized)}
            title={isMaximized ? 'Restore docked mode (Esc)' : 'Maximize to fullscreen'}
            aria-label={isMaximized ? 'Restore docked mode' : 'Maximize to fullscreen'}
          >
            {isMaximized ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>

          {/* Close Button */}
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-control text-fg-secondary transition hover:bg-surface-hover hover:text-fg"
            onClick={close}
            title="Close code engine"
            aria-label="Close code engine"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Panel Body */}
      <div className="flex-1 overflow-hidden bg-[var(--code-bg)] text-[var(--code-text)]">
        {/* TAB: Query Sandbox */}
        {activeTab === 'sandbox' ? (
          <div className="grid h-full grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-line overflow-y-auto">
            {/* Left Column: Relationship Selector & Aggregation Code */}
            <div className="flex flex-col p-4 overflow-y-auto space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Play className="h-4 w-4 text-accent" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-fg">
                    $lookup Pipeline Generator
                  </h3>
                </div>
              </div>

              {/* Relationship Selector */}
              <div className="rounded-card border border-line bg-[var(--code-header-bg)] p-3 space-y-2">
                <label className="text-[11px] font-medium text-fg-secondary">Join Target Collections:</label>
                <div className="flex items-center gap-2">
                  <select
                    value={sandboxSourceColId}
                    onChange={(e) => setSandboxSourceColId(e.target.value)}
                    className="flex-1 rounded-control border border-line bg-surface px-2 py-1.5 text-xs text-fg focus:outline-none focus:border-accent"
                  >
                    <option value="">Auto-Detect Relation Source</option>
                    {collections.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs text-fg-muted font-mono">→</span>
                  <select
                    value={sandboxTargetColId}
                    onChange={(e) => setSandboxTargetColId(e.target.value)}
                    className="flex-1 rounded-control border border-line bg-surface px-2 py-1.5 text-xs text-fg focus:outline-none focus:border-accent"
                  >
                    <option value="">Auto-Detect Parent</option>
                    {collections.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Aggregation Code Box */}
              <div className="flex-1 rounded-card border border-line bg-[var(--code-bg)] overflow-auto">
                <CodeViewer code={aggregationResult.pipelineCode} language="javascript" />
              </div>

              {/* Required Index Recommendation */}
              <div className="rounded-card border border-accent/30 bg-accent-soft p-3 text-[11.5px] text-accent">
                <div className="font-semibold">⚡ Zero-COLLSCAN Index Recommendation:</div>
                <pre className="mt-1 font-mono text-[11px] whitespace-pre-wrap text-fg">
                  {aggregationResult.indexRecommendation}
                </pre>
              </div>
            </div>

            {/* Right Column: Live Simulated Aggregated Output */}
            <div className="flex flex-col p-4 overflow-y-auto space-y-2 bg-[var(--code-gutter-bg)]/40">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-fg-secondary">
                  Simulated Aggregation Output (Mock Documents)
                </span>
                <span className="font-mono text-[10.5px] text-fg-muted">Live JSON preview</span>
              </div>
              <div className="flex-1 rounded-card border border-line bg-[var(--code-bg)] overflow-auto">
                <CodeViewer code={aggregationResult.simulatedOutput} language="json" />
              </div>
            </div>
          </div>
        ) : isEditMode && activeTab === 'mongoose' ? (
          /* TAB: Editable Mongoose Code Area */
          <div className="relative h-full flex flex-col">
            <textarea
              ref={textareaRef}
              value={draftCode}
              onChange={(e) => setDraftCode(e.target.value)}
              onKeyDown={handleEditorKeyDown}
              spellCheck={false}
              aria-label="Mongoose schema code editor"
              className="min-h-0 flex-1 w-full resize-none bg-[var(--code-bg)] p-4 font-mono text-[13px] leading-[1.65] text-[var(--code-text)] outline-none selection:bg-accent-soft border-none"
              placeholder="Edit Mongoose schemas here, then press Sync (Ctrl/Cmd+Enter) to update the canvas..."
            />
            {/* Problems strip: exact error / warning locations, click to jump */}
            {parseResult && (!parseResult.success || (parseResult.warnings?.length ?? 0) > 0 || lastSync) && (
              <div className="max-h-28 shrink-0 overflow-y-auto border-t border-line bg-[var(--code-header-bg)] px-3 py-1.5 font-mono text-[11px] space-y-0.5">
                {!parseResult.success && (
                  <ProblemRow tone="error" line={parseResult.errorLine} message={parseResult.error ?? 'Parse error'} onJump={jumpToLine} />
                )}
                {parseResult.success &&
                  parseResult.warnings?.map((w, i) => (
                    <ProblemRow key={i} tone="warn" line={w.line} message={w.message} onJump={jumpToLine} />
                  ))}
                {parseResult.success && lastSync && (
                  <div className="text-fg-muted">
                    {lastSync.changed
                      ? `Last sync: ${lastSync.added} added · ${lastSync.updated} updated · ${lastSync.removed} removed — Ctrl/Cmd+Z on the canvas reverts it.`
                      : 'Last sync: canvas already matches this code.'}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          /* TAB: Read-only Syntax Highlighted Code with Canvas-to-Code line jump */
          <div className="h-full overflow-auto">
            <CodeViewer
              code={activeCode}
              language={currentLang}
              highlightedLineIndex={lineHighlightIndex}
              lineRefs={lineRefs}
            />
          </div>
        )}
      </div>
    </motion.section>
  );
}

/** One clickable error/warning line under the Mongoose editor. */
const ProblemRow: React.FC<{
  tone: 'error' | 'warn';
  line?: number;
  message: string;
  onJump: (line: number) => void;
}> = ({ tone, line, message, onJump }) => {
  const color = tone === 'error' ? 'text-rose-600 dark:text-rose-400' : 'text-warning';
  const Icon = tone === 'error' ? AlertCircle : AlertTriangle;
  return (
    <div className={`flex items-start gap-1.5 ${color}`}>
      <Icon className="mt-[2px] h-3 w-3 shrink-0" />
      {line ? (
        <button type="button" onClick={() => onJump(line)} className="shrink-0 underline-offset-2 hover:underline">
          Line {line}
        </button>
      ) : null}
      <span className="text-fg-secondary">{message}</span>
    </div>
  );
}

/**
 * Syntax highlighter component powered by prism-react-renderer with line numbers
 * and canvas-to-code line highlight.
 * Consumes themeAwarePrismTheme and CSS tokens (--code-*) with IBM Plex Mono font.
 */
function CodeViewer({
  code,
  language,
  highlightedLineIndex = -1,
  lineRefs,
}: {
  code: string;
  language: string;
  highlightedLineIndex?: number;
  lineRefs?: React.MutableRefObject<Record<number, HTMLDivElement | null>>;
}) {
  return (
    <Highlight theme={themeAwarePrismTheme} code={code} language={language as any}>
      {({ className, style, tokens, getLineProps, getTokenProps }) => (
        <pre
          className={`${className} font-mono text-[13px] leading-[1.65] bg-[var(--code-bg)] text-[var(--code-text)] selection:bg-accent-soft py-3`}
          style={{ ...style, background: 'var(--code-bg)', color: 'var(--code-text)' }}
        >
          {tokens.map((line, i) => {
            const isHighlighted = i === highlightedLineIndex;
            return (
              <div
                key={i}
                ref={(el) => {
                  if (lineRefs) lineRefs.current[i] = el;
                }}
                {...getLineProps({ line, key: i })}
                className={`flex transition-colors duration-150 ${
                  isHighlighted
                    ? 'bg-[var(--code-line-highlight)] border-l-2 border-accent pl-1 font-semibold'
                    : 'hover:bg-surface-hover/50'
                }`}
              >
                {/* Line number gutter with subtle border-subtle divider */}
                <span className="w-12 shrink-0 select-none text-right pr-3 pl-2 text-[12px] font-mono bg-[var(--code-gutter-bg)] text-[var(--code-gutter-text)] border-r border-line">
                  {i + 1}
                </span>

                {/* Code body */}
                <span className="flex-1 pl-4 pr-3 overflow-x-auto">
                  {line.map((token, key) => (
                    <span key={key} {...getTokenProps({ token, key })} />
                  ))}
                </span>
              </div>
            );
          })}
        </pre>
      )}
    </Highlight>
  );
}
