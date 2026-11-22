import { CollectionNode, XYPosition } from '../types';

/** Rendered CollectionNode metrics (keep in sync with CollectionNode.tsx). */
export const NODE_WIDTH = 300;
export const GAP_X = 96;
export const GAP_Y = 88;

const HEADER_HEIGHT = 44;
const FIELD_ROW_HEIGHT = 32;
const FOOTER_HEIGHT = 44;
export const NODE_CHROME_HEIGHT = HEADER_HEIGHT + FOOTER_HEIGHT + 8; // 96px: header + footer/add-field + padding

export const estimateNodeHeight = (col: CollectionNode): number =>
  NODE_CHROME_HEIGHT + col.fields.length * FIELD_ROW_HEIGHT;

export type LayoutFn = (cols: CollectionNode[]) => CollectionNode[];

/**
 * Balanced Columns-Per-Row Rule:
 * - 1–3 collections: up to 3 columns (1 row: 1→1, 2→2, 3→3)
 * - 4 collections: 2 columns (clean 2×2 grid)
 * - 5–9 collections: 3 columns per row (e.g., 5 cards = 3 on Row 1, 2 on Row 2; 6 cards = 3×2)
 * - 10+ collections: 4 columns per row
 */
export function getColumnCount(totalCount: number): number {
  if (totalCount <= 3) return Math.max(1, totalCount);
  if (totalCount === 4) return 2;
  if (totalCount <= 9) return 3;
  return 4;
}

/**
 * Orders collections into a 1D queue using relationship-aware clustering:
 * 1. Build an undirected adjacency list from all foreign key relationships.
 * 2. Find connected components, sorted by size (largest first).
 * 3. Within each component, start at the highest-degree hub node and traverse via BFS.
 * 4. Append standalone/unconnected collections at the end (sorted alphabetically).
 */
export function orderCollectionsQueue(cols: CollectionNode[]): CollectionNode[] {
  if (cols.length <= 1) return [...cols];

  const colById = new Map<string, CollectionNode>(cols.map((c) => [c.id, c]));
  const adj = new Map<string, Set<string>>();

  cols.forEach((c) => adj.set(c.id, new Set<string>()));

  // Populate adjacency list from foreign key relations
  cols.forEach((col) => {
    col.fields.forEach((field) => {
      if (field.isForeignKey && field.foreignKeyRef?.targetCollectionId) {
        const targetId = field.foreignKeyRef.targetCollectionId;
        if (targetId !== col.id && adj.has(targetId)) {
          adj.get(col.id)!.add(targetId);
          adj.get(targetId)!.add(col.id);
        }
      }
    });
  });

  const visited = new Set<string>();
  const connectedComponents: string[][] = [];
  const standalone: string[] = [];

  // Identify connected components vs standalone nodes
  cols.forEach((col) => {
    if (visited.has(col.id)) return;

    const degree = adj.get(col.id)!.size;
    if (degree === 0) {
      visited.add(col.id);
      standalone.push(col.id);
      return;
    }

    // BFS to gather all nodes in this connected component
    const comp: string[] = [];
    const q: string[] = [col.id];
    visited.add(col.id);

    while (q.length > 0) {
      const current = q.shift()!;
      comp.push(current);

      adj.get(current)!.forEach((neighbor) => {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          q.push(neighbor);
        }
      });
    }

    connectedComponents.push(comp);
  });

  // Sort connected components by size descending (largest first)
  connectedComponents.sort((compA, compB) => {
    if (compB.length !== compA.length) return compB.length - compA.length;
    // Tie-breaker: highest degree in component
    const maxDegA = Math.max(...compA.map((id) => adj.get(id)!.size));
    const maxDegB = Math.max(...compB.map((id) => adj.get(id)!.size));
    if (maxDegB !== maxDegA) return maxDegB - maxDegA;
    // Secondary tie-breaker: alphabetical collection name
    const nameA = colById.get(compA[0])?.name ?? '';
    const nameB = colById.get(compB[0])?.name ?? '';
    return nameA.localeCompare(nameB);
  });

  const orderedIds: string[] = [];

  // For each component, start at the highest-degree hub node and traverse via BFS
  connectedComponents.forEach((comp) => {
    // Find highest-degree hub node
    const sortedComp = [...comp].sort((idA, idB) => {
      const degA = adj.get(idA)!.size;
      const degB = adj.get(idB)!.size;
      if (degB !== degA) return degB - degA;
      const nameA = colById.get(idA)?.name ?? '';
      const nameB = colById.get(idB)?.name ?? '';
      return nameA.localeCompare(nameB);
    });

    const hubId = sortedComp[0];
    const bfsVisited = new Set<string>([hubId]);
    const bfsQueue: string[] = [hubId];

    while (bfsQueue.length > 0) {
      const currentId = bfsQueue.shift()!;
      orderedIds.push(currentId);

      // Collect unvisited neighbors within this component
      const unvisitedNeighbors = Array.from(adj.get(currentId)!).filter((nId) => !bfsVisited.has(nId));

      // Sort neighbors: highest degree first, then alphabetically
      unvisitedNeighbors.sort((nA, nB) => {
        const degA = adj.get(nA)!.size;
        const degB = adj.get(nB)!.size;
        if (degB !== degA) return degB - degA;
        const nameA = colById.get(nA)?.name ?? '';
        const nameB = colById.get(nB)?.name ?? '';
        return nameA.localeCompare(nameB);
      });

      unvisitedNeighbors.forEach((nId) => {
        bfsVisited.add(nId);
        bfsQueue.push(nId);
      });
    }
  });

  // Append standalone collections sorted alphabetically
  standalone.sort((idA, idB) => {
    const nameA = colById.get(idA)?.name ?? '';
    const nameB = colById.get(idB)?.name ?? '';
    return nameA.localeCompare(nameB);
  });
  orderedIds.push(...standalone);

  return orderedIds.map((id) => colById.get(id)!);
}

/**
 * Deterministic Multi-Row Queue Layout:
 * Arranges collections row by row with balanced columns, generous gaps,
 * aligned top coordinates, and dynamic row-height advancement to prevent overlaps.
 */
export function layoutCollections(
  cols: CollectionNode[],
  measuredDimensions?: Map<string, { width: number; height: number }>,
): CollectionNode[] {
  if (cols.length === 0) return [];

  const ordered = orderCollectionsQueue(cols);
  const colsPerRow = getColumnCount(ordered.length);

  const getNodeHeight = (col: CollectionNode): number =>
    measuredDimensions?.get(col.id)?.height ?? estimateNodeHeight(col);

  const totalRows = Math.ceil(ordered.length / colsPerRow);
  const result: CollectionNode[] = [];
  let currentY = 0;

  for (let rowIndex = 0; rowIndex < totalRows; rowIndex++) {
    const rowCols = ordered.slice(rowIndex * colsPerRow, (rowIndex + 1) * colsPerRow);
    const tallestCardHeight = Math.max(...rowCols.map((c) => getNodeHeight(c)), 120);

    rowCols.forEach((col, colIndex) => {
      const x = colIndex * (NODE_WIDTH + GAP_X);
      const y = currentY;

      result.push({
        ...col,
        position: { x, y },
      });
    });

    currentY += tallestCardHeight + GAP_Y;
  }

  return result;
}

/**
 * Backward-compatible async loader for auto-layout.
 * Returns the deterministic layout function.
 */
export async function loadDagreLayout(): Promise<LayoutFn> {
  return (cols) => layoutCollections(cols);
}

/** Places a new collection below the existing graph, horizontally centered on it. */
export function nextCollectionPosition(existing: CollectionNode[]): { x: number; y: number } {
  if (existing.length === 0) return { x: 0, y: 0 };
  let maxY = -Infinity;
  let sumX = 0;
  existing.forEach((c) => {
    maxY = Math.max(maxY, c.position.y + estimateNodeHeight(c));
    sumX += c.position.x;
  });
  return { x: sumX / existing.length, y: maxY + 50 };
}

/**
 * Nearest position to `desired` where a node with `fieldCount` fields does not
 * overlap any existing collection (with a small gap). Searches a 40px grid
 * outward from the desired point; falls back to `desired` if nothing is free.
 */
export function findFreePosition(existing: CollectionNode[], desired: XYPosition, fieldCount = 3): XYPosition {
  const GAP = 32;
  const STEP = 40;
  const RADIUS = 24; // grid steps in each direction
  const h = NODE_CHROME_HEIGHT + fieldCount * FIELD_ROW_HEIGHT;
  const boxes = existing.map((c) => ({ x: c.position.x, y: c.position.y, w: NODE_WIDTH, h: estimateNodeHeight(c) }));
  const isFree = (x: number, y: number) =>
    boxes.every((b) => x + NODE_WIDTH + GAP <= b.x || b.x + b.w + GAP <= x || y + h + GAP <= b.y || b.y + b.h + GAP <= y);

  if (isFree(desired.x, desired.y)) return desired;
  const candidates: XYPosition[] = [];
  for (let i = -RADIUS; i <= RADIUS; i++) {
    for (let j = -RADIUS; j <= RADIUS; j++) candidates.push({ x: desired.x + i * STEP, y: desired.y + j * STEP });
  }
  candidates.sort((a, b) => Math.hypot(a.x - desired.x, a.y - desired.y) - Math.hypot(b.x - desired.x, b.y - desired.y));
  return candidates.find((p) => isFree(p.x, p.y)) ?? desired;
}
