import React from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Database } from 'lucide-react';
import { useUIStore } from '../../store/useUIStore';
import { useApiContext } from '../../hooks/useApiBuilder';
import { RoutesPanel } from './RoutesPanel';
import { RouteEditor } from './RouteEditor';
import { ApiCodePreview } from './ApiCodePreview';

/**
 * API & Middleware Builder workspace. Replaces the canvas below the top bar
 * (no modal): routes list · route editor · live code, side by side on wide
 * screens, stacking progressively on narrower ones.
 */
export const ApiBuilder: React.FC = () => {
  const { collection, endpoints, endpoint } = useApiContext();

  return (
    <motion.main
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="fixed inset-0 z-10 overflow-y-auto bg-canvas px-3 pt-[64px] pb-3 lg:overflow-hidden"
      aria-label="API & Middleware Builder"
    >
      {!collection ? (
        <NoCollections />
      ) : (
        <div className="grid gap-3 lg:h-full lg:grid-cols-[288px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[300px_minmax(380px,1fr)_minmax(420px,1.15fr)] xl:grid-rows-1">
          <RoutesPanel
            collection={collection}
            endpoints={endpoints}
            endpoint={endpoint}
            className="lg:row-span-2 xl:row-span-1"
          />
          <RouteEditor collection={collection} endpoints={endpoints} endpoint={endpoint} />
          <ApiCodePreview collection={collection} endpoints={endpoints} endpoint={endpoint} />
        </div>
      )}
    </motion.main>
  );
};

function NoCollections() {
  const setView = useUIStore((s) => s.setWorkspaceView);
  return (
    <div className="flex h-full items-center justify-center">
      <div className="panel max-w-sm p-6 text-center">
        <Database className="mx-auto h-6 w-6 text-fg-muted" />
        <h2 className="mt-3 text-[14px] font-semibold text-fg">No collections yet</h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-fg-secondary">
          Routes are generated from your schema. Add a collection on the canvas, then come back to build its API.
        </p>
        <button type="button" className="btn btn-primary mt-4" onClick={() => setView('canvas')}>
          <ArrowLeft className="h-4 w-4" /> Back to Schema Canvas
        </button>
      </div>
    </div>
  );
}
