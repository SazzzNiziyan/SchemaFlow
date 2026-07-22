import React, { useState } from 'react';
import { CollectionNode, SchemaField, TargetFramework } from './types';
import { Header } from './components/Header';
import { SideNav } from './components/SideNav';
import { Canvas } from './components/Canvas';
import { FieldInspector } from './components/FieldInspector';
import { CodeDrawer } from './components/CodeDrawer';
import { AiGeneratorModal } from './components/AiGeneratorModal';
import { NewCollectionModal } from './components/NewCollectionModal';
import { ExportModal } from './components/ExportModal';
import { DocsModal } from './components/DocsModal';

// Initial Schema State matching screenshot exactly
const INITIAL_COLLECTIONS: CollectionNode[] = [
  {
    id: 'col_users',
    name: 'Users',
    icon: 'Users',
    colorTag: '#afc6ff',
    position: { x: 50, y: 100 },
    fields: [
      {
        id: 'f_u_1',
        name: '_id',
        type: 'ObjectId',
        isPrimaryKey: true,
        validation: { required: true },
      },
      {
        id: 'f_u_2',
        name: 'email',
        type: 'String',
        validation: {
          required: true,
          unique: true,
          match: '/^\\S+@\\S+\\.\\S+$/',
          defaultVal: '',
        },
      },
      {
        id: 'f_u_3',
        name: 'username',
        type: 'String',
        validation: { required: true },
      },
      {
        id: 'f_u_4',
        name: 'createdAt',
        type: 'Date',
        validation: { defaultVal: 'Date.now' },
      },
    ],
  },
  {
    id: 'col_posts',
    name: 'Posts',
    icon: 'Posts',
    colorTag: '#4ae176',
    position: { x: 500, y: 300 },
    fields: [
      {
        id: 'f_p_1',
        name: '_id',
        type: 'ObjectId',
        isPrimaryKey: true,
        validation: { required: true },
      },
      {
        id: 'f_p_2',
        name: 'authorId',
        type: 'ObjectId',
        isForeignKey: true,
        foreignKeyRef: {
          targetCollectionId: 'col_users',
          targetFieldId: 'f_u_1',
        },
        validation: { required: true },
      },
      {
        id: 'f_p_3',
        name: 'title',
        type: 'String',
        validation: { required: true },
      },
      {
        id: 'f_p_4',
        name: 'content',
        type: 'String',
        validation: { required: false },
      },
    ],
  },
  {
    id: 'col_comments',
    name: 'Comments',
    icon: 'Comments',
    colorTag: '#d0bcff',
    position: { x: 900, y: 100 },
    fields: [
      {
        id: 'f_c_1',
        name: '_id',
        type: 'ObjectId',
        isPrimaryKey: true,
        validation: { required: true },
      },
      {
        id: 'f_c_2',
        name: 'postId',
        type: 'ObjectId',
        isForeignKey: true,
        foreignKeyRef: {
          targetCollectionId: 'col_posts',
          targetFieldId: 'f_p_1',
        },
        validation: { required: true },
      },
      {
        id: 'f_c_3',
        name: 'text',
        type: 'String',
        validation: { required: true },
      },
    ],
  },
];

export default function App() {
  const [collections, setCollections] = useState<CollectionNode[]>(INITIAL_COLLECTIONS);
  const [framework, setFramework] = useState<TargetFramework>('mongoose');
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>('col_users');
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>('f_u_2'); // Default selected to 'email' per screenshot!

  const [searchQuery, setSearchQuery] = useState('');
  const [zoom, setZoom] = useState(1.0);
  const [activeTab, setActiveTab] = useState<'collections' | 'relationships' | 'ai' | 'docs'>('collections');

  // Modals
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [isNewCollectionOpen, setIsNewCollectionOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isDocsOpen, setIsDocsOpen] = useState(false);

  // Undo / Redo History
  const [history, setHistory] = useState<CollectionNode[][]>([INITIAL_COLLECTIONS]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const pushHistory = (newCols: CollectionNode[]) => {
    const newHist = history.slice(0, historyIndex + 1);
    newHist.push(newCols);
    setHistory(newHist);
    setHistoryIndex(newHist.length - 1);
    setCollections(newCols);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setCollections(history[historyIndex - 1]);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setCollections(history[historyIndex + 1]);
    }
  };

  const handleSelectField = (colId: string, fieldId: string) => {
    setSelectedCollectionId(colId);
    setSelectedFieldId(fieldId);
  };

  const handleSelectCollection = (colId: string) => {
    setSelectedCollectionId(colId);
    const col = collections.find((c) => c.id === colId);
    if (col && col.fields.length > 0 && (!selectedFieldId || !col.fields.some((f) => f.id === selectedFieldId))) {
      setSelectedFieldId(col.fields[0].id);
    }
  };

  const handleUpdateCollectionPosition = (id: string, pos: { x: number; y: number }) => {
    const updated = collections.map((col) => (col.id === id ? { ...col, position: pos } : col));
    setCollections(updated);
  };

  const handleUpdateField = (colId: string, fieldId: string, updatedProps: Partial<SchemaField>) => {
    const updated = collections.map((col) => {
      if (col.id !== colId) return col;
      return {
        ...col,
        fields: col.fields.map((field) => (field.id === fieldId ? { ...field, ...updatedProps } : field)),
      };
    });
    pushHistory(updated);
  };

  const handleAddField = (colId: string) => {
    const newFieldId = `f_${Date.now()}`;
    const newField: SchemaField = {
      id: newFieldId,
      name: 'newField',
      type: 'String',
      validation: { required: false },
    };

    const updated = collections.map((col) => {
      if (col.id !== colId) return col;
      return {
        ...col,
        fields: [...col.fields, newField],
      };
    });

    pushHistory(updated);
    setSelectedCollectionId(colId);
    setSelectedFieldId(newFieldId);
  };

  const handleDeleteField = (colId: string, fieldId: string) => {
    const updated = collections.map((col) => {
      if (col.id !== colId) return col;
      return {
        ...col,
        fields: col.fields.filter((f) => f.id !== fieldId),
      };
    });

    pushHistory(updated);

    if (selectedFieldId === fieldId) {
      const col = updated.find((c) => c.id === colId);
      setSelectedFieldId(col?.fields[0]?.id || null);
    }
  };

  const handleDeleteCollection = (colId: string) => {
    const updated = collections.filter((c) => c.id !== colId);
    pushHistory(updated);
    if (selectedCollectionId === colId) {
      setSelectedCollectionId(updated[0]?.id || null);
      setSelectedFieldId(updated[0]?.fields[0]?.id || null);
    }
  };

  const handleCreateCollection = (newCol: CollectionNode) => {
    const updated = [...collections, newCol];
    pushHistory(updated);
    setSelectedCollectionId(newCol.id);
    setSelectedFieldId(newCol.fields[0]?.id || null);
  };

  const handleApplyAiSchema = (newCols: CollectionNode[]) => {
    pushHistory(newCols);
    if (newCols.length > 0) {
      setSelectedCollectionId(newCols[0].id);
      setSelectedFieldId(newCols[0].fields[0]?.id || null);
    }
  };

  const handleResetCanvas = () => {
    setZoom(1.0);
  };

  return (
    <div className="w-screen h-screen bg-[#090B10] text-[#e0e3e5] font-sans overflow-hidden flex flex-col">
      {/* Top Navigation Bar */}
      <Header
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < history.length - 1}
        onOpenExport={() => setIsExportOpen(true)}
        onOpenAiGenerator={() => setIsAiModalOpen(true)}
        zoom={zoom}
        setZoom={setZoom}
        onResetCanvas={handleResetCanvas}
      />

      {/* Main Container */}
      <div className="flex-1 relative flex">
        {/* Left Side Navigation */}
        <SideNav
          framework={framework}
          setFramework={setFramework}
          activeTab={activeTab}
          setActiveTab={(tab) => {
            setActiveTab(tab);
            if (tab === 'ai') setIsAiModalOpen(true);
            if (tab === 'docs') setIsDocsOpen(true);
          }}
          onNewSchema={() => setIsNewCollectionOpen(true)}
          onOpenDocs={() => setIsDocsOpen(true)}
          collectionsCount={collections.length}
        />

        {/* Central Visual Canvas */}
        <Canvas
          collections={collections}
          selectedCollectionId={selectedCollectionId}
          selectedFieldId={selectedFieldId}
          onSelectField={handleSelectField}
          onSelectCollection={handleSelectCollection}
          onUpdateCollectionPosition={handleUpdateCollectionPosition}
          onAddField={handleAddField}
          onDeleteCollection={handleDeleteCollection}
          zoom={zoom}
          searchQuery={searchQuery}
        />

        {/* Right Property / Field Inspector */}
        <FieldInspector
          collections={collections}
          selectedCollectionId={selectedCollectionId}
          selectedFieldId={selectedFieldId}
          onUpdateField={handleUpdateField}
          onDeleteField={handleDeleteField}
          onClose={() => setSelectedFieldId(null)}
        />

        {/* Bottom Code Generator Drawer */}
        <CodeDrawer collections={collections} framework={framework} setFramework={setFramework} />
      </div>

      {/* Modals */}
      <AiGeneratorModal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        onApplySchema={handleApplyAiSchema}
        framework={framework}
      />

      <NewCollectionModal
        isOpen={isNewCollectionOpen}
        onClose={() => setIsNewCollectionOpen(false)}
        onCreateCollection={handleCreateCollection}
      />

      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        collections={collections}
        framework={framework}
      />

      <DocsModal isOpen={isDocsOpen} onClose={() => setIsDocsOpen(false)} />
    </div>
  );
}
