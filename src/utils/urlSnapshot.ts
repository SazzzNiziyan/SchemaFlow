import LZString from 'lz-string';
import type { CollectionNode, TargetFramework } from '../types';

export interface SchemaSnapshot {
  projectName: string;
  framework: TargetFramework;
  collections: CollectionNode[];
  v?: number;
}

/**
 * Compresses current schema data into an URL hash fragment safe for resume/portfolio links.
 */
export function encodeSchemaToUrlHash(data: SchemaSnapshot): string {
  try {
    const payload = {
      v: 1,
      projectName: data.projectName,
      framework: data.framework,
      collections: data.collections,
    };
    const json = JSON.stringify(payload);
    const compressed = LZString.compressToEncodedURIComponent(json);
    return `#schema=${compressed}`;
  } catch (err) {
    console.error('Failed to encode schema to URL hash:', err);
    return '';
  }
}

/**
 * Builds the full shareable URL including origin, path, and compressed hash.
 */
export function generateShareUrl(data: SchemaSnapshot): string {
  if (typeof window === 'undefined') return '';
  const hash = encodeSchemaToUrlHash(data);
  return `${window.location.origin}${window.location.pathname}${hash}`;
}

/**
 * Extracts and decompresses schema snapshot from URL hash if present.
 */
export function decodeSchemaFromUrlHash(hashString?: string): SchemaSnapshot | null {
  try {
    const hash = hashString ?? (typeof window !== 'undefined' ? window.location.hash : '');
    if (!hash || !hash.includes('#schema=')) return null;

    const encoded = hash.slice(hash.indexOf('#schema=') + 8);
    if (!encoded) return null;

    const decompressed = LZString.decompressFromEncodedURIComponent(encoded);
    if (!decompressed) return null;

    const parsed = JSON.parse(decompressed);
    if (parsed && Array.isArray(parsed.collections)) {
      return {
        projectName: typeof parsed.projectName === 'string' ? parsed.projectName : 'Shared Architecture',
        framework: parsed.framework || 'mongoose',
        collections: parsed.collections,
        v: parsed.v || 1,
      };
    }
  } catch (err) {
    console.error('Failed to decode schema from URL hash:', err);
  }
  return null;
}
