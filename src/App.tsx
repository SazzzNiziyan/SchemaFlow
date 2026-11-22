import React, { useEffect } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { TopBar } from './components/TopBar';
import { CanvasDock } from './components/CanvasDock';
import { Canvas } from './components/Canvas';
import { FieldInspector } from './components/FieldInspector';
import { CodeDrawer } from './components/CodeDrawer';
import { CreateCollectionPopover } from './components/CreateCollectionPopover';
import { SchemaAuditorDrawer } from './components/SchemaAuditorDrawer';
import { CommandPalette } from './components/CommandPalette';
import { ToastNotification } from './components/ToastNotification';
import { AiGeneratorModal } from './components/AiGeneratorModal';
import { ExportModal } from './components/ExportModal';
import { DocsModal } from './components/DocsModal';
import { ImportMongoDBModal } from './components/ImportMongoDBModal';
import { RelationshipModal } from './components/RelationshipModal';
import { ApiBuilder } from './components/api/ApiBuilder';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { decodeSchemaFromUrlHash } from './utils/urlSnapshot';
import { useSchemaStore } from './store/useSchemaStore';
import { useUIStore } from './store/useUIStore';
import { layoutCollections } from './utils/autoLayout';

/**
 * Spatial workspace shell: a full-bleed canvas with floating HUD panels.
 * All schema, selection and UI state lives in `src/store/`.
 */
function Workspace() {
  useKeyboardShortcuts();
  const view = useUIStore((s) => s.workspaceView);

  // Load URL-compressed snapshot on first render if #schema= is present
  useEffect(() => {
    const snapshot = decodeSchemaFromUrlHash();
    if (snapshot && snapshot.collections.length > 0) {
      const store = useSchemaStore.getState();
      store.importSchema(snapshot.collections, {
        mode: 'replace',
        transform: layoutCollections,
      });
      if (snapshot.projectName) store.setProjectName(snapshot.projectName);
      if (snapshot.framework) store.setFramework(snapshot.framework);

      useUIStore.getState().showToast({
        title: 'Shared Architecture Loaded',
        description: `Loaded "${snapshot.projectName}" (${snapshot.collections.length} collections) from URL.`,
        type: 'info',
      });
    }
  }, []);

  return (
    <div className="h-screen w-screen overflow-hidden bg-canvas font-sans text-fg">
      {/* The canvas stays mounted (viewport, layout) but is inert behind the API builder. */}
      <div inert={view === 'api'}>
        <Canvas />
      </div>

      <TopBar />
      {view === 'canvas' ? (
        <>
          <FieldInspector />
          <CodeDrawer />
          <CanvasDock />
          <CreateCollectionPopover />
          <SchemaAuditorDrawer />
        </>
      ) : (
        <ApiBuilder />
      )}
      <CommandPalette />
      <ToastNotification />

      {/* High-level flows only */}
      <AiGeneratorModal />
      <ExportModal />
      <ImportMongoDBModal />
      <RelationshipModal />
      <DocsModal />
    </div>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <Workspace />
    </ReactFlowProvider>
  );
}
