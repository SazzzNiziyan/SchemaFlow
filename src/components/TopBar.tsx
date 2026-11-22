import React, { useEffect, useRef, useState } from 'react';
import { BookOpen, Check, Download, Moon, Network, Redo2, Route, Search, Share2, Sun, Undo2, Upload } from 'lucide-react';
import { redo, undo, useCanRedo, useCanUndo, useSchemaStore } from '../store/useSchemaStore';
import { useUIStore } from '../store/useUIStore';
import { useThemeStore } from '../store/useThemeStore';
import { countRelationships } from '../utils/schemaOps';
import { useSchemaAudit } from '../utils/schemaAuditor';
import { generateShareUrl } from '../utils/urlSnapshot';

export const SEARCH_INPUT_ID = 'sf-search';

const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC');
export const MOD_KEY = isMac ? '⌘' : 'Ctrl';

/** Slim floating top bar: identity, schema status, history and document actions. */
export const TopBar: React.FC = () => {
  const openModal = useUIStore((s) => s.openModal);
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();

  return (
    <header className="panel fixed top-3 right-3 left-3 z-40 flex h-11 items-center gap-2 pr-1.5 pl-2">
      {/* Identity */}
      <div className="flex min-w-0 items-center gap-2">
        <Logo />
        <ProjectTitle />
        <ViewSwitch />
        <HealthPill />
        <SchemaCounts onOpenRelations={() => openModal('relationships')} />
      </div>

      <div className="flex-1" />

      <SearchBox />

      <div className="divider-v mx-1" />

      <div className="flex items-center">
        <button type="button" className="btn btn-ghost btn-icon" onClick={undo} disabled={!canUndo} title={`Undo (${MOD_KEY}+Z)`} aria-label="Undo">
          <Undo2 className="h-4 w-4" />
        </button>
        <button type="button" className="btn btn-ghost btn-icon" onClick={redo} disabled={!canRedo} title={`Redo (${MOD_KEY}+Shift+Z)`} aria-label="Redo">
          <Redo2 className="h-4 w-4" />
        </button>
      </div>

      <div className="divider-v mx-1" />

      <div className="flex items-center gap-0.5">
        <button type="button" className="btn btn-ghost" onClick={() => openModal('importMongo')} title="Import from MongoDB">
          <Upload className="h-4 w-4" />
          <span className="hidden lg:inline">Import</span>
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => openModal('export')} title="Export schema code">
          <Download className="h-4 w-4" />
          <span className="hidden lg:inline">Export</span>
        </button>
        <button type="button" className="btn btn-ghost btn-icon" onClick={() => openModal('docs')} title="Docs & shortcuts" aria-label="Docs">
          <BookOpen className="h-4 w-4" />
        </button>
        <ThemeToggle />
        <ShareButton />
      </div>
    </header>
  );
};

function Logo() {
  return (
    <div
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control border border-line-strong bg-surface-subtle font-mono text-[11px] font-semibold tracking-[-0.02em] text-fg"
      aria-label="SchemaFlow"
    >
      SF
    </div>
  );
}

function ProjectTitle() {
  const projectName = useSchemaStore((s) => s.projectName);
  const setProjectName = useSchemaStore((s) => s.setProjectName);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(projectName);

  const commit = () => {
    setProjectName(draft);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setEditing(false);
        }}
        aria-label="Project name"
        className="field-input !h-7 !w-48 text-[13px] font-semibold"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        setDraft(projectName);
        setEditing(true);
      }}
      title="Rename project"
      className="h-7 max-w-[120px] truncate rounded-control px-1.5 text-[13.5px] font-semibold tracking-[-0.02em] text-fg transition hover:bg-surface-hover lg:max-w-[200px]"
    >
      {projectName}
    </button>
  );
}

/** Schema Canvas ⇄ API & Middleware Builder workspace switch. */
function ViewSwitch() {
  const view = useUIStore((s) => s.workspaceView);
  const setView = useUIStore((s) => s.setWorkspaceView);
  const routeCount = useSchemaStore((s) => s.endpoints.length);
  return (
    <div className="segmented !gap-0.5 shrink-0" role="group" aria-label="Workspace">
      <button type="button" aria-pressed={view === 'canvas'} onClick={() => setView('canvas')} title="Schema Canvas" className="flex items-center gap-1.5">
        <Network className="h-3.5 w-3.5" />
        <span className="hidden md:inline">Schema</span>
      </button>
      <button
        type="button"
        aria-pressed={view === 'api'}
        onClick={() => setView('api')}
        title="API & Middleware Builder"
        className="flex items-center gap-1.5"
      >
        <Route className="h-3.5 w-3.5" />
        <span className="hidden md:inline">API</span>
        {routeCount > 0 && <span className="tabular font-mono text-[10.5px] text-fg-secondary">{routeCount}</span>}
      </button>
    </div>
  );
}

/** Real-time Schema Health Score badge that opens the Auditor drawer. */
function HealthPill() {
  const audit = useSchemaAudit();
  const isApiView = useUIStore((s) => s.workspaceView === 'api');
  const toggleAuditor = () => {
    const ui = useUIStore.getState();
    if (!isApiView) return ui.toggleAuditor();
    // The auditor pans the canvas to issues, so it opens there.
    ui.setWorkspaceView('canvas');
    ui.setAuditorOpen(true);
  };
  const isAuditorOpen = useUIStore((s) => s.isAuditorOpen && !isApiView);

  const dotColor =
    audit.score >= 85
      ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]'
      : audit.score >= 60
        ? 'bg-warning shadow-[0_0_8px_rgba(240,190,92,0.5)]'
        : 'bg-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.5)]';

  const badgeColor =
    audit.score >= 85
      ? 'hover:border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
      : audit.score >= 60
        ? 'hover:border-warning-line text-warning'
        : 'hover:border-rose-500/40 text-rose-600 dark:text-rose-400';

  return (
    <button
      type="button"
      onClick={toggleAuditor}
      aria-label="Toggle Schema Health Auditor"
      aria-expanded={isAuditorOpen}
      className={`hidden h-7 shrink-0 items-center gap-1.5 rounded-control border border-line bg-surface-subtle px-2.5 text-[12px] transition hover:bg-surface-hover lg:inline-flex ${badgeColor} ${
        isAuditorOpen ? 'border-accent bg-accent-soft text-fg' : ''
      }`}
      title={`Schema Health: ${audit.score}/100 (${audit.issues.length} issues) — Click to open Auditor`}
    >
      <span className={`h-2 w-2 rounded-full ${dotColor}`} />
      <span className="font-semibold text-fg">Health</span>
      <span className="font-mono font-medium">{audit.score}%</span>
      {audit.issues.length > 0 && (
        <span className="ml-0.5 rounded-full bg-white/10 px-1.5 py-px font-mono text-[10px] text-fg-secondary">
          {audit.issues.length}
        </span>
      )}
    </button>
  );
}

function SchemaCounts({ onOpenRelations }: { onOpenRelations: () => void }) {
  const collections = useSchemaStore((s) => s.collections.length);
  const relations = useSchemaStore((s) => countRelationships(s.collections));
  return (
    <div className="hidden shrink-0 items-center gap-1 text-[12px] text-fg-secondary min-[1360px]:flex">
      <span className="px-1">
        <span className="tabular font-mono font-medium text-fg">{collections}</span> collections
      </span>
      <span className="text-line-strong" aria-hidden>
        ·
      </span>
      <button type="button" onClick={onOpenRelations} className="rounded-control px-1 transition hover:bg-surface-hover hover:text-fg" title="Open relationship editor">
        <span className="tabular font-mono font-medium text-fg">{relations}</span> relations
      </button>
    </div>
  );
}

function SearchBox() {
  const searchQuery = useUIStore((s) => s.searchQuery);
  const setSearchQuery = useUIStore((s) => s.setSearchQuery);
  const isApiView = useUIStore((s) => s.workspaceView === 'api');
  const toggleCommandPalette = useUIStore((s) => s.toggleCommandPalette);

  return (
    <div className="relative flex items-center w-40 shrink lg:w-60">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-fg-secondary" />
      <input
        id={SEARCH_INPUT_ID}
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setSearchQuery('');
            e.currentTarget.blur();
          }
        }}
        placeholder={isApiView ? 'Search routes…' : 'Search schema…'}
        aria-label={isApiView ? 'Search routes' : 'Search collections and fields'}
        className="field-input !bg-surface-subtle !pl-8 !pr-16 text-[12.5px]"
      />
      <button
        type="button"
        onClick={toggleCommandPalette}
        title={`Command Palette (${MOD_KEY}+K)`}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded border border-line bg-surface px-1.5 py-0.5 text-[10px] font-mono text-fg-secondary hover:text-fg hover:border-line-strong transition"
      >
        {MOD_KEY}K
      </button>
    </div>
  );
}

/** Paper (light) / Carbon (dark) theme switch; persisted in localStorage. */
function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme);
  const toggle = useThemeStore((s) => s.toggleTheme);
  const next = theme === 'paper' ? 'Carbon' : 'Paper';
  return (
    <button
      type="button"
      onClick={toggle}
      className="btn btn-ghost btn-icon"
      title={`Switch to ${next} theme`}
      aria-label={`Switch to ${next} theme`}
      data-theme-toggle={theme}
    >
      {theme === 'paper' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
    </button>
  );
}

/** Copies the URL-shareable compressed schema link. */
function ShareButton() {
  const [copied, setCopied] = useState(false);
  const showToast = useUIStore((s) => s.showToast);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const share = async () => {
    const { projectName, framework, collections } = useSchemaStore.getState();
    const shareUrl = generateShareUrl({ projectName, framework, collections });
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
      showToast({
        title: 'Share Link Copied!',
        description: 'URL snapshot copied to clipboard. Anyone can open this exact architecture.',
        type: 'success',
      });
    } catch {
      showToast({
        title: 'Clipboard Error',
        description: 'Failed to copy share link to clipboard.',
        type: 'error',
      });
    }
  };

  return (
    <button
      type="button"
      onClick={share}
      title="Copy shareable URL link"
      className="btn btn-secondary ml-1 w-[84px]"
    >
      {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Share2 className="h-4 w-4" />}
      {copied ? 'Copied' : 'Share'}
    </button>
  );
}
