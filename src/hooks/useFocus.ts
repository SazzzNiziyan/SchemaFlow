import type { CollectionNode } from '../types';
import { useSchemaStore } from '../store/useSchemaStore';
import { useUIStore } from '../store/useUIStore';

/**
 * Focus Mode: the hovered collection (or, failing that, the selected one) is
 * "in focus". Its directly connected collections stay highlighted; everything
 * else dims.
 */
export type FocusState = 'none' | 'focus' | 'related' | 'dimmed';

export function useFocusId(): string | null {
  const hovered = useUIStore((s) => s.hoveredCollectionId);
  const selected = useSchemaStore((s) => s.selectedCollectionId);
  return hovered ?? selected;
}

/** True when either collection holds a foreign key to the other. */
export function areConnected(collections: CollectionNode[], a: string, b: string): boolean {
  for (const col of collections) {
    if (col.id !== a && col.id !== b) continue;
    const other = col.id === a ? b : a;
    if (col.fields.some((f) => f.isForeignKey && f.foreignKeyRef?.targetCollectionId === other)) return true;
  }
  return false;
}

/** Focus state of a node. Returns a primitive so unaffected nodes don't re-render. */
export function useNodeFocus(collectionId: string): FocusState {
  const focusId = useFocusId();
  return useSchemaStore((s) => {
    if (!focusId || !s.collections.some((c) => c.id === focusId)) return 'none';
    if (focusId === collectionId) return 'focus';
    return areConnected(s.collections, focusId, collectionId) ? 'related' : 'dimmed';
  });
}

/** Focus state of an edge between two collections. */
export function useEdgeFocus(sourceId: string, targetId: string): FocusState {
  const focusId = useFocusId();
  const exists = useSchemaStore((s) => !!focusId && s.collections.some((c) => c.id === focusId));
  if (!focusId || !exists) return 'none';
  return focusId === sourceId || focusId === targetId ? 'focus' : 'dimmed';
}
