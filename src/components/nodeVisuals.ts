import {
  Calendar,
  CreditCard,
  Database,
  FileText,
  Folder,
  KeyRound,
  MessageSquare,
  Package,
  ShoppingCart,
  Table2,
  Tag,
  Users,
  type LucideIcon,
} from 'lucide-react';

/**
 * Curated, restrained domain palette (used for the node's 2px top rule).
 * Each value reads on both Paper and Carbon; no saturated or neon hues.
 */
export const ACCENT_PALETTE = [
  { name: 'Forest', value: '#3F6B4E' },
  { name: 'Slate blue', value: '#4A6585' },
  { name: 'Ochre', value: '#B0802A' },
  { name: 'Terracotta', value: '#B05A3C' },
  { name: 'Plum brown', value: '#7A5163' },
  { name: 'Charcoal', value: '#5A5752' },
] as const;

export const ACCENT_COLORS = ACCENT_PALETTE.map((c) => c.value);

/** Earlier-phase / template colors mapped to their nearest curated tone. */
const LEGACY_ACCENTS: Record<string, string> = {
  '#afc6ff': '#4A6585',
  '#4ae176': '#3F6B4E',
  '#d0bcff': '#7A5163',
  '#6366f1': '#4A6585',
  '#10b981': '#3F6B4E',
  '#f59e0b': '#B0802A',
  '#f43f5e': '#B05A3C',
  '#06b6d4': '#4A6585',
  '#8b5cf6': '#7A5163',
  '#ec4899': '#B05A3C',
  '#64748b': '#5A5752',
};

/** Collection icon choices, keyed by the value stored in `CollectionNode.icon`. */
export const COLLECTION_ICONS: Record<string, LucideIcon> = {
  Table: Table2,
  Users,
  Posts: FileText,
  Comments: MessageSquare,
  Database,
  Orders: ShoppingCart,
  Products: Package,
  Files: Folder,
  Auth: KeyRound,
  Events: Calendar,
  Billing: CreditCard,
  Tags: Tag,
};

export const iconFor = (name: string | undefined): LucideIcon =>
  (name && COLLECTION_ICONS[name]) || Table2;

/**
 * Resolves a stored `colorTag` to a palette color. Anything off-palette
 * (legacy values, AI-generated hex codes) maps deterministically onto the
 * curated palette so the canvas never shows neon accents.
 */
export function accentFor(color: string | undefined): string {
  if (!color) return ACCENT_COLORS[0];
  const key = color.trim().toLowerCase();
  const onPalette = ACCENT_COLORS.find((c) => c.toLowerCase() === key);
  if (onPalette) return onPalette;
  if (LEGACY_ACCENTS[key]) return LEGACY_ACCENTS[key];
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return ACCENT_COLORS[hash % ACCENT_COLORS.length];
}
