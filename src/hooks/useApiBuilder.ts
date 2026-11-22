import { useMemo } from 'react';
import type { ApiEndpoint, CollectionNode } from '../types';
import { useSchemaStore } from '../store/useSchemaStore';
import { useUIStore } from '../store/useUIStore';

/**
 * The API builder works on one collection at a time. It follows the canvas
 * selection (so "Open APIs" from the inspector lands on the right collection)
 * and falls back to the first collection.
 */
export function useApiContext(): {
  collection: CollectionNode | undefined;
  endpoints: ApiEndpoint[];
  endpoint: ApiEndpoint | undefined;
} {
  const collections = useSchemaStore((s) => s.collections);
  const selectedCollectionId = useSchemaStore((s) => s.selectedCollectionId);
  const allEndpoints = useSchemaStore((s) => s.endpoints);
  const selectedEndpointId = useSchemaStore((s) => s.selectedEndpointId);

  return useMemo(() => {
    const collection = collections.find((c) => c.id === selectedCollectionId) ?? collections[0];
    const endpoints = collection ? allEndpoints.filter((e) => e.collectionId === collection.id) : [];
    const endpoint = endpoints.find((e) => e.id === selectedEndpointId) ?? endpoints[0];
    return { collection, endpoints, endpoint };
  }, [collections, selectedCollectionId, allEndpoints, selectedEndpointId]);
}

/** Points the API builder at a collection, keeping the route selection inside it. */
export function selectApiCollection(collectionId: string): void {
  const store = useSchemaStore.getState();
  store.setSelectedCollection(collectionId);
  const current = store.endpoints.find((e) => e.id === store.selectedEndpointId);
  if (current?.collectionId !== collectionId) {
    store.setSelectedEndpoint(store.endpoints.find((e) => e.collectionId === collectionId)?.id ?? null);
  }
}

/** Switches to the API & Middleware Builder, optionally focused on one collection. */
export function openApiBuilder(collectionId?: string): void {
  if (collectionId) selectApiCollection(collectionId);
  useUIStore.getState().setWorkspaceView('api');
}

/**
 * One-shot hand-off so the route editor focuses the path input of a route that
 * was just created from the routes list.
 */
let pendingPathFocus: string | null = null;
export function requestPathFocus(endpointId: string): void {
  pendingPathFocus = endpointId;
}
export function consumePathFocus(endpointId: string): boolean {
  if (pendingPathFocus !== endpointId) return false;
  pendingPathFocus = null;
  return true;
}
