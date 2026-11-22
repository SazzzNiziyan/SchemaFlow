import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Download, FileCode2, ListChecks, Workflow } from 'lucide-react';
import type { ApiEndpoint, CollectionNode } from '../../types';
import {
  generateCollectionRouterCode,
  generateMiddlewareChainCode,
  generateRouteZodCode,
  pluralRouteSegment,
} from '../../utils/apiCodeGenerator';
import { modelNameFor } from '../../utils/naming';
import { CodeViewer } from '../CodeViewer';

type PreviewTab = 'route' | 'zod' | 'chain';

const TABS: { id: PreviewTab; label: string; icon: typeof FileCode2 }[] = [
  { id: 'route', label: 'Route & Handler', icon: FileCode2 },
  { id: 'zod', label: 'Zod Validators', icon: ListChecks },
  { id: 'chain', label: 'Middleware Chain', icon: Workflow },
];

/** Live, read-only TypeScript output for the active collection / route. */
export function ApiCodePreview({
  collection,
  endpoints,
  endpoint,
  className = '',
}: {
  collection: CollectionNode;
  endpoints: ApiEndpoint[];
  endpoint: ApiEndpoint | undefined;
  className?: string;
}) {
  const [tab, setTab] = useState<PreviewTab>('route');
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(copyTimer.current), []);

  const scrollRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const router = useMemo(() => generateCollectionRouterCode(collection, endpoints), [collection, endpoints]);
  const zod = useMemo(() => generateRouteZodCode(collection, endpoints, endpoint), [collection, endpoints, endpoint]);
  const chain = useMemo(
    () =>
      endpoint
        ? generateMiddlewareChainCode(endpoint, collection)
        : '// Select or create a route to see its middleware chain.\n',
    [endpoint, collection],
  );

  const code = tab === 'route' ? router.code : tab === 'zod' ? zod : chain;
  const range = tab === 'route' && endpoint ? router.ranges[endpoint.id] ?? null : null;

  const model = modelNameFor(collection.name).toLowerCase();
  const fileName =
    tab === 'route' ? `${pluralRouteSegment(collection.name)}.routes.ts` : tab === 'zod' ? `${model}.schemas.ts` : 'middleware.ts';

  // Bring the active route's handler into view (inside the pane only).
  useEffect(() => {
    if (!range) return;
    const el = lineRefs.current[range[0]];
    const box = scrollRef.current;
    if (!el || !box) return;
    const top = el.offsetTop - 16;
    const bottom = lineRefs.current[range[1]]?.offsetTop ?? top;
    if (top < box.scrollTop || bottom > box.scrollTop + box.clientHeight - 24) {
      box.scrollTo({ top, behavior: 'smooth' });
    }
  }, [range?.[0], range?.[1], tab, endpoint?.id]);

  useEffect(() => {
    if (tab !== 'route') scrollRef.current?.scrollTo({ top: 0 });
  }, [tab]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([code], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const lineCount = code.split('\n').length - (code.endsWith('\n') ? 1 : 0);

  return (
    <section
      className={`panel flex min-h-[420px] flex-col overflow-hidden !bg-[var(--code-bg)] ${className}`}
      aria-label="Generated code preview"
    >
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-[var(--code-header-bg)] px-2">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto" role="tablist" aria-label="Code sections">
          {TABS.map((t) => {
            const active = tab === t.id;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className={`flex h-7 shrink-0 items-center gap-1.5 rounded-control border px-2.5 text-[12px] font-medium whitespace-nowrap transition ${
                  active
                    ? 'border-accent/30 bg-accent-soft font-semibold text-accent'
                    : 'border-transparent text-fg-secondary hover:bg-surface-hover hover:text-fg'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={copy}
          className={`btn !h-7 shrink-0 !px-2.5 !text-[12px] ${copied ? 'text-accent' : 'btn-secondary'}`}
          title={`Copy ${fileName}`}
          aria-live="polite"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button
          type="button"
          onClick={download}
          className="btn btn-ghost btn-icon !h-7 !w-7 shrink-0"
          title={`Download ${fileName}`}
          aria-label={`Download ${fileName}`}
        >
          <Download className="h-3.5 w-3.5" />
        </button>
      </header>

      <div ref={scrollRef} role="tabpanel" className="relative min-h-0 flex-1 overflow-auto">
        <CodeViewer code={code} language="typescript" highlightRange={range} lineRefs={lineRefs} />
      </div>

      <footer className="flex h-7 shrink-0 items-center gap-3 border-t border-line bg-[var(--code-header-bg)] px-3 font-mono text-[10.5px] text-fg-secondary">
        <span className="truncate text-fg">{fileName}</span>
        <span className="tabular">{lineCount} lines</span>
        <span>TypeScript · Express · Zod</span>
        <span className="ml-auto flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
          Live
        </span>
      </footer>
    </section>
  );
}
