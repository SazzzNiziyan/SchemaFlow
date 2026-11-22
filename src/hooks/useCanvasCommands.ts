import { useCallback } from 'react';
import { useReactFlow, type FitViewOptions } from '@xyflow/react';
import type { CollectionNode, TemplateId } from '../types';
import { useSchemaStore } from '../store/useSchemaStore';
import { INSPECTOR_WIDTH, useUIStore } from '../store/useUIStore';
import { layoutCollections } from '../utils/autoLayout';

/** Duration of the node glide after a layout pass (keep in sync with Canvas). */
export const LAYOUT_TWEEN_MS = 350;

/**
 * Fit padding that keeps nodes clear of the floating HUD: top bar, bottom
 * dock, and the inspector when it is open.
 */
export function hudFitPadding(): NonNullable<FitViewOptions['padding']> {
  const { selectedCollectionId, collections } = useSchemaStore.getState();
  const inspectorOpen =
    !useUIStore.getState().isInspectorCollapsed && !!selectedCollectionId && collections.some((c) => c.id === selectedCollectionId);
  return { top: '84px', bottom: '100px', left: '48px', right: `${inspectorOpen ? INSPECTOR_WIDTH + 48 : 48}px` };
}

/**
 * Schema commands that also need to move the React Flow viewport.
 * Must be used inside a <ReactFlowProvider>.
 */
export function useCanvasCommands() {
  const { fitView, setViewport } = useReactFlow();

  /** Fit smoothly with 0.15 padding over 350ms once nodes have settled */
  const fitAfterLayout = useCallback(
    (delay = LAYOUT_TWEEN_MS + 20) => {
      setTimeout(() => {
        fitView({ duration: 350, padding: 0.15 });
      }, delay);
    },
    [fitView],
  );

  const autoArrange = useCallback(() => {
    useUIStore.setState({ animateNextLayout: true });
    useSchemaStore.getState().applyLayout(layoutCollections);
    fitAfterLayout(LAYOUT_TWEEN_MS + 20);
  }, [fitAfterLayout]);

  /** Replaces the schema with AI output, auto-arranged. */
  const applyGeneratedSchema = useCallback(
    (collections: CollectionNode[]) => {
      useSchemaStore.getState().importSchema(collections, { mode: 'replace', transform: layoutCollections });
      fitAfterLayout(50);
    },
    [fitAfterLayout],
  );

  /** Appends imported collections and re-arranges the whole graph (existing nodes glide). */
  const mergeImportedSchema = useCallback(
    (collections: CollectionNode[]) => {
      useUIStore.setState({ animateNextLayout: true });
      useSchemaStore.getState().importSchema(collections, { mode: 'merge', transform: layoutCollections });
      fitAfterLayout(LAYOUT_TWEEN_MS + 20);
    },
    [fitAfterLayout],
  );

  /** Loads template and frames it smoothly with fitView */
  const loadTemplate = useCallback(
    (templateId: TemplateId) => {
      useSchemaStore.getState().loadTemplate(templateId);
      fitAfterLayout(50);
    },
    [fitAfterLayout],
  );

  const clearCanvas = useCallback(() => {
    useSchemaStore.getState().clearCanvas();
    setTimeout(() => setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 350 }), 50);
  }, [setViewport]);

  return { autoArrange, applyGeneratedSchema, mergeImportedSchema, loadTemplate, clearCanvas };
}
