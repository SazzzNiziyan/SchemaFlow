import React, { useEffect, useRef, useState } from 'react';
import { useReactFlow, useStore as useFlowStore } from '@xyflow/react';
import { Braces, Maximize, Minus, Plus, Sparkles, Trash2, Workflow } from 'lucide-react';
import { useSchemaStore } from '../store/useSchemaStore';
import { INSPECTOR_WIDTH, useUIStore } from '../store/useUIStore';
import { hudFitPadding, useCanvasCommands } from '../hooks/useCanvasCommands';
import { useInspectorVisible } from './FieldInspector';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { MOD_KEY } from './TopBar';

/** Floating bottom dock with canvas-level tools. */
export const CanvasDock: React.FC = () => {
  const { zoomIn, zoomOut, fitView, screenToFlowPosition } = useReactFlow();
  const zoom = useFlowStore((s) => s.transform[2]);
  const { autoArrange, clearCanvas } = useCanvasCommands();
  const openModal = useUIStore((s) => s.openModal);
  const isCodeOpen = useUIStore((s) => s.isCodeDrawerExpanded);
  const setCodeOpen = useUIStore((s) => s.setCodeDrawerExpanded);
  const hasCollections = useSchemaStore((s) => s.collections.length > 0);
  const inspectorVisible = useInspectorVisible();
  // On wide screens the inspector is full-height, so the dock re-centres beside it.
  // Below lg the inspector stops above the dock instead (see FieldInspector).
  const isWide = useMediaQuery('(min-width: 1024px)');

  const openCreate = (e: React.MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    useUIStore.getState().openCreateCollection({
      screen: { x: r.left + r.width / 2, y: r.top },
      flow: screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 }),
    });
  };

  const shift = inspectorVisible && isWide ? (INSPECTOR_WIDTH + 12) / 2 : 0;

  return (
    <div
      className="fixed bottom-4 z-20 -translate-x-1/2 transition-[left] duration-300 ease-out"
      style={{ left: `calc(50% - ${shift}px)` }}
    >
      <div className="panel flex h-12 items-center gap-1 px-1.5" role="toolbar" aria-label="Canvas tools">
        <button type="button" onClick={openCreate} className="btn btn-primary !h-9 !px-3" title="Add collection (or double-click the canvas)">
          <Plus className="h-4 w-4" />
          Collection
        </button>

        <div className="divider-v mx-1" />

        <button type="button" className="btn btn-ghost !h-9" onClick={() => void autoArrange()} disabled={!hasCollections} title="Auto-layout">
          <Workflow className="h-4 w-4" />
          <span className="hidden lg:inline">Auto-Layout</span>
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-icon !h-9 !w-9"
          onClick={() => fitView({ duration: 500, padding: hudFitPadding(), maxZoom: 1.1 })}
          title="Fit view"
          aria-label="Fit view"
        >
          <Maximize className="h-4 w-4" />
        </button>

        <div className="flex h-9 items-center rounded-control border border-line bg-surface-subtle">
          <button type="button" className="btn btn-ghost btn-icon !h-8 !w-7" onClick={() => zoomOut({ duration: 200 })} aria-label="Zoom out" title="Zoom out">
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="tabular w-11 text-center font-mono text-[11.5px] text-fg-secondary">{Math.round(zoom * 100)}%</span>
          <button type="button" className="btn btn-ghost btn-icon !h-8 !w-7" onClick={() => zoomIn({ duration: 200 })} aria-label="Zoom in" title="Zoom in">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="divider-v mx-1" />

        <button
          type="button"
          onClick={() => setCodeOpen(!isCodeOpen)}
          aria-pressed={isCodeOpen}
          className="btn btn-ghost !h-9"
          title="Toggle generated code"
        >
          <Braces className="h-4 w-4" />
          <span className="hidden lg:inline">Code</span>
        </button>

        <button type="button" onClick={() => openModal('ai')} className="btn btn-ghost !h-9" title="Generate a schema with AI">
          <Sparkles className="h-4 w-4" />
          <span className="hidden md:inline">AI Architect</span>
        </button>

        <span className="kbd mx-1 hidden lg:inline-flex" title="Search the schema">
          {MOD_KEY} K
        </span>

        <div className="divider-v mx-0.5" />

        <ClearButton disabled={!hasCollections} onConfirm={clearCanvas} />
      </div>
    </div>
  );
};

/** Trash button with an inline confirmation popover (no modal). */
function ClearButton({ disabled, onConfirm }: { disabled: boolean; onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        className="btn btn-ghost btn-icon !h-9 !w-9 hover:!bg-danger-soft hover:!text-danger"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        title="Clear canvas"
        aria-label="Clear canvas"
        aria-expanded={open}
      >
        <Trash2 className="h-4 w-4" />
      </button>
      {open && (
        <div role="dialog" aria-label="Confirm clear canvas" className="popover absolute right-0 bottom-full mb-3 w-64 p-3">
          <div className="text-[13px] font-semibold tracking-[-0.01em] text-fg">Clear the canvas?</div>
          <p className="mt-1 text-[12px] leading-relaxed text-fg-secondary">
            Removes every collection and relation. You can undo with {MOD_KEY}+Z.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className="btn btn-secondary !h-7" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              autoFocus
              className="btn !h-7 bg-danger !text-surface hover:opacity-90"
              onClick={() => {
                setOpen(false);
                onConfirm();
              }}
            >
              Clear canvas
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
