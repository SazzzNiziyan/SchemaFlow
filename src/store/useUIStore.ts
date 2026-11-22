import { create } from 'zustand';
import type { XYPosition } from '../types';

/** Transient UI chrome state. Not persisted and not part of undo history. */

/** Remaining full-screen modals, reserved for high-level flows. */
export type ModalId = 'ai' | 'export' | 'docs' | 'importMongo' | 'relationships';

/** Where the inline "new collection" popover is anchored. */
export interface CreateCollectionAnchor {
  /** Viewport (client) coordinates for the popover. */
  screen: XYPosition;
  /** Canvas coordinates where the collection will be placed. */
  flow: XYPosition;
}

export interface ToastData {
  id: string;
  title: string;
  description?: string;
  type?: 'success' | 'info' | 'error';
}

interface UIState {
  activeModal: ModalId | null;
  searchQuery: string;
  isCodeDrawerExpanded: boolean;
  /** User collapsed the inspector while keeping the selection. */
  isInspectorCollapsed: boolean;
  /** Collection under the pointer; drives Focus Mode together with selection. */
  hoveredCollectionId: string | null;
  createCollectionAt: CreateCollectionAnchor | null;
  /** Whether the Schema Auditor drawer/panel is currently expanded. */
  isAuditorOpen: boolean;
  focusedIssueId: string | null;
  /** Whether the global Cmd+K command palette is open. */
  isCommandPaletteOpen: boolean;
  /** Active transient toast notification. */
  toast: ToastData | null;
  /**
   * Set right before a layout pass so the canvas tweens nodes to their new
   * positions instead of jumping. Consumed (reset) by the canvas.
   */
  animateNextLayout: boolean;

  openModal: (modal: ModalId) => void;
  closeModal: () => void;
  setSearchQuery: (query: string) => void;
  setCodeDrawerExpanded: (expanded: boolean) => void;
  setInspectorCollapsed: (collapsed: boolean) => void;
  setAuditorOpen: (open: boolean) => void;
  toggleAuditor: () => void;
  setFocusedIssueId: (id: string | null) => void;
  setHoveredCollectionId: (id: string | null) => void;
  openCreateCollection: (anchor: CreateCollectionAnchor) => void;
  closeCreateCollection: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  toggleCommandPalette: () => void;
  showToast: (toast: Omit<ToastData, 'id'>) => void;
  dismissToast: () => void;
}

let toastTimer: any = null;

export const useUIStore = create<UIState>()((set) => ({
  activeModal: null,
  searchQuery: '',
  isCodeDrawerExpanded: false,
  isInspectorCollapsed: false,
  isAuditorOpen: false,
  focusedIssueId: null,
  hoveredCollectionId: null,
  createCollectionAt: null,
  animateNextLayout: false,
  isCommandPaletteOpen: false,
  toast: null,

  openModal: (activeModal) => set({ activeModal, createCollectionAt: null, isCommandPaletteOpen: false }),
  closeModal: () => set({ activeModal: null }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setCodeDrawerExpanded: (isCodeDrawerExpanded) => set({ isCodeDrawerExpanded }),
  setInspectorCollapsed: (isInspectorCollapsed) => set({ isInspectorCollapsed }),
  setAuditorOpen: (isAuditorOpen) => set({ isAuditorOpen }),
  toggleAuditor: () => set((s) => ({ isAuditorOpen: !s.isAuditorOpen })),
  setFocusedIssueId: (focusedIssueId) => set({ focusedIssueId }),
  setHoveredCollectionId: (hoveredCollectionId) => set({ hoveredCollectionId }),
  openCreateCollection: (createCollectionAt) => set({ createCollectionAt, isCommandPaletteOpen: false }),
  closeCreateCollection: () => set({ createCollectionAt: null }),
  setCommandPaletteOpen: (isCommandPaletteOpen) => set({ isCommandPaletteOpen }),
  toggleCommandPalette: () => set((s) => ({ isCommandPaletteOpen: !s.isCommandPaletteOpen })),
  showToast: (toast) => {
    if (toastTimer) clearTimeout(toastTimer);
    const id = `toast_${Date.now()}`;
    set({ toast: { ...toast, id } });
    toastTimer = setTimeout(() => {
      set((s) => (s.toast?.id === id ? { toast: null } : {}));
    }, 4000);
  },
  dismissToast: () => {
    if (toastTimer) clearTimeout(toastTimer);
    set({ toast: null });
  },
}));

/** Hook for a modal's open flag + close handler. */
export function useModal(id: ModalId) {
  const isOpen = useUIStore((s) => s.activeModal === id);
  const close = useUIStore((s) => s.closeModal);
  return { isOpen, close };
}

/** Inspector is visible when something is selected and the user hasn't collapsed it. */
export const INSPECTOR_WIDTH = 340;
