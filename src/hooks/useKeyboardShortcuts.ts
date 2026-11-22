import { useEffect, useRef } from 'react';
import { useReactFlow } from '@xyflow/react';
import type { CollectionNode } from '../types';
import { batchHistory, redo, undo, useSchemaStore } from '../store/useSchemaStore';
import { useUIStore } from '../store/useUIStore';
import { cloneCollection, fieldIdFromRelationshipId } from '../utils/schemaOps';
import { SEARCH_INPUT_ID } from '../components/TopBar';

/** True when the event originates from a text-entry control. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/**
 * Global editor shortcuts:
 * - Cmd/Ctrl+Z            undo
 * - Cmd/Ctrl+Shift+Z, +Y  redo
 * - Delete / Backspace    delete selected collection(s) and edges
 * - Cmd/Ctrl+C / V        copy / paste the selected collection
 * - Cmd/Ctrl+K            focus schema search
 * - Escape                clear the selection
 *
 * Must be used inside a <ReactFlowProvider>. React Flow's own delete key is
 * disabled on the canvas so this hook is the single owner of deletion.
 */
export function useKeyboardShortcuts() {
  const { getNodes, getEdges } = useReactFlow();
  const clipboardRef = useRef<CollectionNode[]>([]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const mod = isMac ? e.metaKey : e.ctrlKey;
      const key = e.key.toLowerCase();
      const ui = useUIStore.getState();

      // Leave shortcuts to the open modal.
      if (ui.activeModal) return;

      if (mod && key === 'k') {
        e.preventDefault();
        ui.toggleCommandPalette();
        return;
      }

      if (isTypingTarget(e.target) || isTypingTarget(document.activeElement)) return;

      // Outside the canvas only history shortcuts apply: Delete / copy / paste /
      // Escape act on canvas selection and must not fire from the API builder.
      if (ui.workspaceView !== 'canvas' && !(mod && (key === 'z' || key === 'y'))) return;

      if (key === 'escape') {
        if (ui.createCollectionAt) ui.closeCreateCollection();
        else useSchemaStore.getState().setSelectedCollection(null);
        return;
      }

      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && key === 'y') {
        e.preventDefault();
        redo();
        return;
      }

      if (mod && key === 'c') {
        const { collections, selectedCollectionId } = useSchemaStore.getState();
        const selected = collections.filter((c) => c.id === selectedCollectionId);
        if (selected.length > 0) clipboardRef.current = structuredClone(selected);
        return;
      }

      if (mod && key === 'v') {
        if (clipboardRef.current.length === 0) return;
        const clones = clipboardRef.current.map((col) =>
          cloneCollection(col, { offset: { x: 50, y: 50 }, stripForeignKeys: true }),
        );
        // Keep the pasted node where the user expects it (offset from the original),
        // rather than letting addCollection auto-place it.
        useSchemaStore.getState().importSchema(clones, { mode: 'merge' });
        return;
      }

      if (!mod && (e.key === 'Delete' || e.key === 'Backspace')) {
        const store = useSchemaStore.getState();
        const nodeIds = new Set(getNodes().filter((n) => n.selected).map((n) => n.id));
        if (store.selectedCollectionId) nodeIds.add(store.selectedCollectionId);
        const relIds = getEdges()
          .filter((edge) => edge.selected)
          .map((edge) => edge.id);
        if (nodeIds.size === 0 && relIds.length === 0) return;

        e.preventDefault();
        batchHistory(() => {
          relIds.forEach((id) => {
            // Skip edges whose field is about to vanish with its collection.
            if (store.collections.some((c) => nodeIds.has(c.id) && c.fields.some((f) => f.id === fieldIdFromRelationshipId(id)))) return;
            useSchemaStore.getState().deleteRelationship(id);
          });
          nodeIds.forEach((id) => useSchemaStore.getState().deleteCollection(id));
        });
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [getNodes, getEdges]);
}
