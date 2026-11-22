import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useReactFlow } from '@xyflow/react';
import {
  Sparkles,
  LayoutGrid,
  FileCode2,
  ShieldCheck,
  Download,
  Upload,
  Network,
  Share2,
  Trash2,
  Plus,
  Maximize2,
  BookOpen,
  ArrowRight,
  Database,
  Search,
  Hash,
  Route,
} from 'lucide-react';
import { useSchemaStore } from '../store/useSchemaStore';
import { useUIStore } from '../store/useUIStore';
import { useCanvasCommands } from '../hooks/useCanvasCommands';
import { BLUEPRINTS } from '../utils/templates';
import { generateShareUrl } from '../utils/urlSnapshot';
import { MOD_KEY } from './TopBar';
import { openApiBuilder } from '../hooks/useApiBuilder';

interface CommandItem {
  id: string;
  category: 'Actions' | 'Panels & Modals' | 'Blueprints' | 'Collections & Fields';
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  shortcut?: string;
  keywords?: string[];
  action: () => void;
}

export const CommandPalette: React.FC = () => {
  const isOpen = useUIStore((s) => s.isCommandPaletteOpen);
  const setOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const openModal = useUIStore((s) => s.openModal);
  const toggleAuditor = useUIStore((s) => s.toggleAuditor);
  const setCodeDrawerExpanded = useUIStore((s) => s.setCodeDrawerExpanded);
  const isCodeDrawerExpanded = useUIStore((s) => s.isCodeDrawerExpanded);
  const showToast = useUIStore((s) => s.showToast);
  const workspaceView = useUIStore((s) => s.workspaceView);
  const setWorkspaceView = useUIStore((s) => s.setWorkspaceView);

  const collections = useSchemaStore((s) => s.collections);
  const setSelectedCollection = useSchemaStore((s) => s.setSelectedCollection);
  const setSelectedField = useSchemaStore((s) => s.setSelectedField);
  const framework = useSchemaStore((s) => s.framework);
  const projectName = useSchemaStore((s) => s.projectName);

  const { autoArrange, loadTemplate, clearCanvas } = useCanvasCommands();
  const { fitView, setCenter } = useReactFlow();

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [isOpen]);

  const items = useMemo<CommandItem[]>(() => {
    const list: CommandItem[] = [
      // Actions
      {
        id: 'cmd-layout',
        category: 'Actions',
        title: 'Run Auto-Layout',
        subtitle: 'Deterministic relationship-aware queue layout (zero overlaps)',
        icon: <LayoutGrid className="h-4 w-4 text-emerald-400" />,
        shortcut: 'Alt+L',
        keywords: ['arrange', 'organize', 'format', 'clean', 'dagre'],
        action: () => {
          autoArrange();
          showToast({ title: 'Auto-Layout Applied', description: 'Collections arranged cleanly with zero overlaps.', type: 'success' });
        },
      },
      {
        id: 'cmd-add-col',
        category: 'Actions',
        title: 'New Collection',
        subtitle: 'Create a new schema entity',
        icon: <Plus className="h-4 w-4 text-indigo-400" />,
        keywords: ['create', 'add', 'table', 'model'],
        action: () => {
          useUIStore.getState().openCreateCollection({
            screen: { x: window.innerWidth / 2 - 120, y: window.innerHeight / 2 - 100 },
            flow: { x: 400, y: 300 },
          });
        },
      },
      {
        id: 'cmd-fit-view',
        category: 'Actions',
        title: 'Frame Canvas (Fit View)',
        subtitle: 'Center and zoom to fit all collections',
        icon: <Maximize2 className="h-4 w-4 text-sky-400" />,
        shortcut: 'Shift+1',
        keywords: ['zoom', 'center', 'frame', 'reset view'],
        action: () => fitView({ duration: 350, padding: 0.15 }),
      },
      {
        id: 'cmd-share-link',
        category: 'Actions',
        title: 'Copy Shareable URL',
        subtitle: 'Compress entire schema architecture into a URL hash',
        icon: <Share2 className="h-4 w-4 text-warning" />,
        keywords: ['share', 'url', 'export link', 'lz-string', 'link'],
        action: async () => {
          const url = generateShareUrl({ projectName, framework, collections });
          try {
            await navigator.clipboard.writeText(url);
            showToast({
              title: 'Share Link Copied!',
              description: 'URL hash snapshot copied to clipboard. Anyone can open this exact architecture.',
              type: 'success',
            });
          } catch {
            showToast({ title: 'Failed to copy', description: 'Clipboard access denied', type: 'error' });
          }
        },
      },
      {
        id: 'cmd-clear',
        category: 'Actions',
        title: 'Clear Canvas',
        subtitle: 'Remove all collections and start fresh',
        icon: <Trash2 className="h-4 w-4 text-rose-400" />,
        keywords: ['reset', 'delete all', 'empty'],
        action: () => {
          clearCanvas();
          showToast({ title: 'Canvas Cleared', description: 'Started fresh blank canvas.', type: 'info' });
        },
      },

      // Panels & Modals
      {
        id: 'cmd-ai-architect',
        category: 'Panels & Modals',
        title: 'AI Schema Architect',
        subtitle: 'Generate schemas from natural language prompts using Gemini',
        icon: <Sparkles className="h-4 w-4 text-purple-400" />,
        keywords: ['ai', 'gemini', 'generate', 'prompt', 'architect'],
        action: () => openModal('ai'),
      },
      {
        id: 'cmd-auditor',
        category: 'Panels & Modals',
        title: 'Schema Health & Anti-Pattern Auditor',
        subtitle: 'Inspect 8+ MongoDB rules with 1-click auto-fixes',
        icon: <ShieldCheck className="h-4 w-4 text-emerald-400" />,
        keywords: ['audit', 'health', 'errors', 'warnings', 'fixes', 'score'],
        action: () => toggleAuditor(),
      },
      {
        id: 'cmd-code-drawer',
        category: 'Panels & Modals',
        title: isCodeDrawerExpanded ? 'Collapse Code Drawer' : 'Open Code Drawer & Sandbox',
        subtitle: 'Mongoose, Zod, Express, TypeScript, $jsonSchema, and $lookup Sandbox',
        icon: <FileCode2 className="h-4 w-4 text-cyan-400" />,
        shortcut: 'Tab',
        keywords: ['code', 'mongoose', 'zod', 'express', 'sandbox', 'aggregation', 'types'],
        action: () => setCodeDrawerExpanded(!isCodeDrawerExpanded),
      },
      {
        id: 'cmd-workspace-view',
        category: 'Panels & Modals',
        title: workspaceView === 'api' ? 'Back to Schema Canvas' : 'Open API & Middleware Builder',
        subtitle:
          workspaceView === 'api'
            ? 'Return to the collection graph'
            : 'Routes, middleware pipelines (auth, RBAC, Zod, rate limits) and live Express code',
        icon: <Route className="h-4 w-4 text-accent" />,
        keywords: ['api', 'routes', 'endpoints', 'middleware', 'express', 'rest', 'crud', 'canvas', 'schema'],
        action: () => setWorkspaceView(workspaceView === 'api' ? 'canvas' : 'api'),
      },
      {
        id: 'cmd-export-zip',
        category: 'Panels & Modals',
        title: 'Export Project (.ZIP & Schemas)',
        subtitle: 'Download complete backend project or copy code files',
        icon: <Download className="h-4 w-4 text-emerald-400" />,
        keywords: ['zip', 'download', 'export'],
        action: () => openModal('export'),
      },
      {
        id: 'cmd-import-mongo',
        category: 'Panels & Modals',
        title: 'Import from Live MongoDB',
        subtitle: 'Introspect databases and reverse-engineer schemas',
        icon: <Upload className="h-4 w-4 text-warning" />,
        keywords: ['mongodb', 'uri', 'connection', 'reverse engineer'],
        action: () => openModal('importMongo'),
      },
      {
        id: 'cmd-rel-editor',
        category: 'Panels & Modals',
        title: 'Relationship Matrix Editor',
        subtitle: 'View and edit all foreign key references in a unified table',
        icon: <Network className="h-4 w-4 text-indigo-400" />,
        keywords: ['relations', 'foreign keys', 'edges', 'links'],
        action: () => openModal('relationships'),
      },
      {
        id: 'cmd-docs',
        category: 'Panels & Modals',
        title: 'Keyboard Shortcuts & Docs',
        subtitle: 'Reference guide for hotkeys and gestures',
        icon: <BookOpen className="h-4 w-4 text-fg-secondary" />,
        keywords: ['shortcuts', 'help', 'docs', 'guide'],
        action: () => openModal('docs'),
      },

      // Blueprints
      ...BLUEPRINTS.map((bp) => ({
        id: `cmd-bp-${bp.id}`,
        category: 'Blueprints' as const,
        title: `Load Blueprint: ${bp.name}`,
        subtitle: `${bp.description} (${bp.collectionsCount} collections)`,
        icon: <Database className="h-4 w-4 text-warning" />,
        keywords: ['template', 'blueprint', 'starter', bp.name.toLowerCase()],
        action: () => {
          loadTemplate(bp.id);
          showToast({
            title: `Loaded ${bp.name}`,
            description: `${bp.collectionsCount} collections placed on canvas.`,
            type: 'info',
          });
        },
      })),

      // Collections & Fields (Direct Jump)
      ...collections.flatMap((col) => {
        const colItem: CommandItem = {
          id: `cmd-col-${col.id}`,
          category: 'Collections & Fields',
          title: `Jump to Collection: ${col.name}`,
          subtitle: `${col.fields.length} fields · ${col.colorTag}`,
          icon: <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: col.colorTag || '#3B82F6' }} />,
          keywords: ['jump', 'navigate', col.name.toLowerCase()],
          action: () => {
            // In the API builder, jumping to a collection switches the route context instead of panning.
            if (workspaceView === 'api') return openApiBuilder(col.id);
            setSelectedCollection(col.id);
            setCenter(col.position.x + 150, col.position.y + 120, { duration: 400 });
          },
        };

        const apiItem: CommandItem = {
          id: `cmd-api-${col.id}`,
          category: 'Collections & Fields',
          title: `API Routes: ${col.name}`,
          subtitle: 'Open this collection in the API & Middleware Builder',
          icon: <Route className="h-3.5 w-3.5 text-fg-secondary" />,
          keywords: ['api', 'routes', 'endpoints', 'middleware', col.name.toLowerCase()],
          action: () => openApiBuilder(col.id),
        };

        const fieldItems: CommandItem[] = col.fields.map((f) => ({
          id: `cmd-fld-${col.id}-${f.id}`,
          category: 'Collections & Fields',
          title: `${col.name} › ${f.name}`,
          subtitle: `Type: ${f.type}${f.isPrimaryKey ? ' (PK)' : ''}${f.isForeignKey ? ' (FK)' : ''}`,
          icon: <Hash className="h-3.5 w-3.5 text-fg-tertiary" />,
          keywords: ['field', col.name.toLowerCase(), f.name.toLowerCase(), f.type.toLowerCase()],
          action: () => {
            setWorkspaceView('canvas');
            setSelectedCollection(col.id);
            setSelectedField(f.id, col.id);
            setCenter(col.position.x + 150, col.position.y + 120, { duration: 400 });
          },
        }));

        return [colItem, apiItem, ...fieldItems];
      }),
    ];

    return list;
  }, [
    workspaceView,
    setWorkspaceView,
    autoArrange,
    clearCanvas,
    collections,
    fitView,
    framework,
    isCodeDrawerExpanded,
    loadTemplate,
    openModal,
    projectName,
    setCenter,
    setCodeDrawerExpanded,
    setSelectedCollection,
    setSelectedField,
    showToast,
    toggleAuditor,
  ]);

  // Filter items by search query
  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      if (item.title.toLowerCase().includes(q)) return true;
      if (item.subtitle?.toLowerCase().includes(q)) return true;
      if (item.category.toLowerCase().includes(q)) return true;
      if (item.keywords?.some((k) => k.includes(q))) return true;
      return false;
    });
  }, [items, query]);

  // Handle keyboard navigation
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) => (prev + 1 < filteredItems.length ? prev + 1 : 0));
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) => (prev > 0 ? prev - 1 : Math.max(0, filteredItems.length - 1)));
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        const active = filteredItems[activeIndex];
        if (active) {
          active.action();
          setOpen(false);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, filteredItems, activeIndex, setOpen]);

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const activeEl = listRef.current.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    activeEl?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (!isOpen) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
      className="fixed inset-0 z-[100] flex items-start justify-center pt-20 p-4 glass-backdrop animate-in fade-in"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl rounded-panel glass-panel overflow-hidden flex flex-col max-h-[75vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="relative flex items-center border-b border-[var(--glass-border)] px-3.5 py-3 bg-[var(--glass-surface-elevated)]">
          <Search className="h-4 w-4 shrink-0 text-[var(--glass-text-placeholder)]" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            placeholder="Type a command or search schema…"
            className="ml-3 flex-1 bg-transparent text-[14px] text-[var(--glass-text-primary)] placeholder:text-[var(--glass-text-placeholder)] caret-[var(--accent-primary)] focus:outline-none"
          />
          <kbd className="hidden sm:inline-flex items-center rounded border border-[var(--glass-border)] bg-[var(--glass-input-bg)] px-1.5 py-0.5 text-[10px] font-mono text-[var(--glass-text-secondary)]">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div ref={listRef} className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredItems.length === 0 ? (
            <div className="py-12 text-center text-[13px] text-[var(--glass-text-placeholder)]">
              No matching commands or schema elements found.
            </div>
          ) : (
            filteredItems.map((item, index) => {
              const isSelected = index === activeIndex;
              const isFirstOfCategory =
                index === 0 || filteredItems[index - 1]?.category !== item.category;

              return (
                <React.Fragment key={item.id}>
                  {isFirstOfCategory && (
                    <div className="px-2 pt-2.5 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--glass-text-secondary)]">
                      {item.category}
                    </div>
                  )}
                  <button
                    type="button"
                    data-index={index}
                    onClick={() => {
                      item.action();
                      setOpen(false);
                    }}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-control text-left transition ${
                      isSelected
                        ? 'bg-[var(--glass-hover)] text-[var(--glass-text-primary)] border border-[var(--glass-border)] shadow-sm'
                        : 'text-[var(--glass-text-secondary)] hover:bg-[var(--glass-hover)] hover:text-[var(--glass-text-primary)] border border-transparent'
                    }`}
                  >
                    <div className="shrink-0 flex items-center justify-center w-5 h-5">
                      {item.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium leading-tight text-[var(--glass-text-primary)] truncate">
                        {item.title}
                      </div>
                      {item.subtitle && (
                        <div className="text-[11.5px] text-[var(--glass-text-secondary)] leading-tight truncate mt-0.5">
                          {item.subtitle}
                        </div>
                      )}
                    </div>
                    {item.shortcut ? (
                      <kbd className="shrink-0 rounded border border-[var(--glass-border)] bg-[var(--glass-input-bg)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--glass-text-secondary)]">
                        {item.shortcut}
                      </kbd>
                    ) : isSelected ? (
                      <ArrowRight className="h-3.5 w-3.5 text-accent shrink-0" />
                    ) : null}
                  </button>
                </React.Fragment>
              );
            })
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="border-t border-[var(--glass-border)] bg-[var(--glass-surface-elevated)] px-3.5 py-2 flex items-center justify-between text-[11px] text-[var(--glass-text-secondary)] font-mono">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="rounded border border-[var(--glass-border)] bg-[var(--glass-input-bg)] px-1 py-0.5 text-[var(--glass-text-secondary)]">↑↓</kbd> navigate
            </span>
            <span>
              <kbd className="rounded border border-[var(--glass-border)] bg-[var(--glass-input-bg)] px-1 py-0.5 text-[var(--glass-text-secondary)]">↵</kbd> select
            </span>
            <span>
              <kbd className="rounded border border-[var(--glass-border)] bg-[var(--glass-input-bg)] px-1 py-0.5 text-[var(--glass-text-secondary)]">esc</kbd> close
            </span>
          </div>
          <div>
            <kbd className="rounded border border-[var(--glass-border)] bg-[var(--glass-input-bg)] px-1.5 py-0.5 text-[var(--glass-text-secondary)]">{MOD_KEY}+K</kbd>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
