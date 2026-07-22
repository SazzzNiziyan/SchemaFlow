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
import { ImportMongoDBModal } from './components/ImportMongoDBModal';
import { RelationshipModal } from './components/RelationshipModal';
import { ClearCanvasModal } from './components/ClearCanvasModal';
import { ReactFlowProvider, useReactFlow } from '@xyflow/react';

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

function SchemaForgeApp() {
  const [collections, setCollections] = useState<CollectionNode[]>(INITIAL_COLLECTIONS);
  const [framework, setFramework] = useState<TargetFramework>('mongoose');
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>('col_users');
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>('f_u_2');

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'collections' | 'relationships' | 'ai' | 'docs'>('collections');

  // Modals
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [isNewCollectionOpen, setIsNewCollectionOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isDocsOpen, setIsDocsOpen] = useState(false);
  const [isImportMongoDBOpen, setIsImportMongoDBOpen] = useState(false);
  const [isRelationshipModalOpen, setIsRelationshipModalOpen] = useState(false);
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [isCodeDrawerExpanded, setIsCodeDrawerExpanded] = useState(true);

  // Undo / Redo History
  const [history, setHistory] = useState<CollectionNode[][]>([INITIAL_COLLECTIONS]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const { fitView, setViewport } = useReactFlow();

  const applyLayout = async (cols: CollectionNode[]) => {
    const dagre = await import('dagre');
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: 'LR', nodesep: 100, ranksep: 250 });
    g.setDefaultEdgeLabel(() => ({}));

    cols.forEach((col) => {
      // Approximate height of CollectionNode: header (80px) + padding + fields (50px each)
      const height = 100 + col.fields.length * 50;
      g.setNode(col.id, { width: 320, height });
    });

    cols.forEach((col) => {
      col.fields.forEach((field) => {
        if (field.isForeignKey && field.foreignKeyRef) {
          g.setEdge(field.foreignKeyRef.targetCollectionId, col.id);
        }
      });
    });

    dagre.layout(g);

    return cols.map((col) => {
      const nodeWithPosition = g.node(col.id);
      const height = 100 + col.fields.length * 50;
      return {
        ...col,
        position: {
          x: nodeWithPosition.x - 160,
          y: nodeWithPosition.y - height / 2,
        },
      };
    });
  };

  const pushHistory = (newCols: CollectionNode[]) => {
    const newHist = history.slice(0, historyIndex + 1);
    newHist.push(newCols);
    setHistory(newHist);
    setHistoryIndex(newHist.length - 1);
    setCollections(newCols);
  };

  const handleUndo = React.useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setCollections(history[historyIndex - 1]);
    }
  }, [historyIndex, history]);

  const handleRedo = React.useCallback(() => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setCollections(history[historyIndex + 1]);
    }
  }, [historyIndex, history]);

  const clipboardRef = React.useRef<CollectionNode[]>([]);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Avoid triggering when user is typing in inputs
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }
      
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      const key = e.key.toLowerCase();
      
      // Undo: Ctrl+Z or Cmd+Z
      if (cmdOrCtrl && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      // Redo: Ctrl+Shift+Z or Cmd+Shift+Z
      if (cmdOrCtrl && key === 'z' && e.shiftKey) {
        e.preventDefault();
        handleRedo();
      }
      // Redo: Ctrl+Y or Cmd+Y
      if (cmdOrCtrl && key === 'y') {
        e.preventDefault();
        handleRedo();
      }
      
      // Select All is handled by ReactFlow natively!
      
      // Ctrl+C
      if (cmdOrCtrl && key === 'c') {
        const selectedCols = collections.filter(c => c.id === selectedCollectionId);
        if (selectedCols.length > 0) {
          clipboardRef.current = selectedCols;
        }
      }

      // Ctrl+V
      if (cmdOrCtrl && key === 'v') {
        if (clipboardRef.current.length > 0) {
          const newCols = clipboardRef.current.map((col, idx) => ({
            ...col,
            id: `col_${Date.now()}_${idx}`,
            name: `${col.name} Copy`,
            position: { x: col.position.x + 50, y: col.position.y + 50 },
            fields: col.fields.map(f => ({
              ...f,
              id: `f_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              // Remove FK relationships for duplicated fields to avoid bugs
              isForeignKey: false,
              foreignKeyRef: undefined
            })),
          }));
          
          setCollections(prev => {
            const updated = [...prev, ...newCols];
            // pushHistory logic manually to avoid dependency cycle
            const newHist = history.slice(0, historyIndex + 1);
            newHist.push(updated);
            setHistory(newHist);
            setHistoryIndex(newHist.length - 1);
            return updated;
          });
          setSelectedCollectionId(newCols[0].id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo, collections, selectedCollectionId, history, historyIndex]);

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

  const handleAddRelationship = (sourceColId: string, sourceFieldId: string, targetColId: string, targetFieldId: string) => {
    const updated = collections.map((col) => {
      if (col.id !== sourceColId) return col;
      return {
        ...col,
        fields: col.fields.map((field) => 
          field.id === sourceFieldId 
            ? { ...field, isForeignKey: true, foreignKeyRef: { targetCollectionId: targetColId, targetFieldId: targetFieldId } } 
            : field
        ),
      };
    });
    pushHistory(updated);
  };

  const handleRemoveRelationship = (sourceColId: string, sourceFieldId: string) => {
    const updated = collections.map((col) => {
      if (col.id !== sourceColId) return col;
      return {
        ...col,
        fields: col.fields.map((field) => 
          field.id === sourceFieldId 
            ? { ...field, isForeignKey: false, foreignKeyRef: undefined } 
            : field
        ),
      };
    });
    pushHistory(updated);
  };

  const handleAutoArrange = async () => {
    const updated = await applyLayout(collections);
    pushHistory(updated);
    setTimeout(() => {
      fitView({ duration: 800, padding: 0.2 });
    }, 100);
  };

  const handleClearCanvas = () => {
    setIsClearModalOpen(true);
  };

  const executeClearCanvas = () => {
    pushHistory([]);
    setSelectedCollectionId(null);
    setSelectedFieldId(null);
    setTimeout(() => {
      setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 800 });
    }, 100);
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
    const updated = collections.filter((c) => c.id !== colId).map(col => ({
      ...col,
      fields: col.fields.map(f => {
        if (f.isForeignKey && f.foreignKeyRef?.targetCollectionId === colId) {
          return { ...f, isForeignKey: false, foreignKeyRef: undefined };
        }
        return f;
      })
    }));
    pushHistory(updated);
    if (selectedCollectionId === colId) {
      setSelectedCollectionId(updated[0]?.id || null);
      setSelectedFieldId(updated[0]?.fields[0]?.id || null);
    }
  };
  
  const handleRenameCollection = (colId: string, newName: string) => {
    if (!newName.trim()) return;
    const updated = collections.map(c => c.id === colId ? { ...c, name: newName.trim() } : c);
    pushHistory(updated);
  };

  const handleDuplicateCollection = (colId: string) => {
    const colToDuplicate = collections.find((c) => c.id === colId);
    if (!colToDuplicate) return;

    // generate a new ID
    const newColId = `col_${Date.now()}`;
    
    // Create new collection
    const duplicatedCol: CollectionNode = {
      ...colToDuplicate,
      id: newColId,
      name: `${colToDuplicate.name} Copy`,
      position: {
        x: colToDuplicate.position.x + 350,
        y: colToDuplicate.position.y,
      },
      fields: colToDuplicate.fields.map(f => ({
        ...f,
        id: `f_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      })),
    };

    const updated = [...collections, duplicatedCol];
    pushHistory(updated);
    setSelectedCollectionId(newColId);
    setSelectedFieldId(duplicatedCol.fields[0]?.id || null);
  };

  const handleChangeColor = (colId: string, color: string) => {
    const updated = collections.map(c => c.id === colId ? { ...c, colorTag: color } : c);
    pushHistory(updated);
  };

  const handleCreateCollection = (newCol: CollectionNode) => {
    let maxY = -Infinity;
    let avgX = 0;
    if (collections.length > 0) {
      collections.forEach(c => {
         const height = 100 + c.fields.length * 50;
         if (c.position.y + height > maxY) maxY = c.position.y + height;
         avgX += c.position.x;
      });
      avgX /= collections.length;
      newCol.position = { x: avgX, y: maxY + 50 };
    } else {
      newCol.position = { x: 0, y: 0 };
    }
    const updated = [...collections, newCol];
    pushHistory(updated);
    setSelectedCollectionId(newCol.id);
    setSelectedFieldId(newCol.fields[0]?.id || null);
  };

  const handleApplyAiSchema = async (newCols: CollectionNode[]) => {
    const arranged = await applyLayout(newCols);
    pushHistory(arranged);
    if (newCols.length > 0) {
      setSelectedCollectionId(newCols[0].id);
      setSelectedFieldId(newCols[0].fields[0]?.id || null);
    }
    setTimeout(() => {
      fitView({ duration: 800, padding: 0.2 });
    }, 100);
  };

  const handleImportMongoSchema = async (newCols: CollectionNode[]) => {
    const combined = [...collections, ...newCols];
    const arranged = await applyLayout(combined);
    pushHistory(arranged);
    if (newCols.length > 0) {
      setSelectedCollectionId(newCols[0].id);
      setSelectedFieldId(newCols[0].fields[0]?.id || null);
    }
    setTimeout(() => {
      fitView({ duration: 800, padding: 0.2 });
    }, 100);
  };

  return (
    <div className="w-screen h-screen bg-[#090B10] text-[#e0e3e5] font-sans overflow-hidden flex flex-col">
      <Header
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < history.length - 1}
        onOpenExport={() => setIsExportOpen(true)}
        onOpenAiGenerator={() => setIsAiModalOpen(true)}
        onAutoArrange={handleAutoArrange}
        onClearCanvas={handleClearCanvas}
      />

      <div className="flex-1 relative flex">
        <SideNav
          framework={framework}
          setFramework={setFramework}
          activeTab={activeTab}
          setActiveTab={(tab) => {
            setActiveTab(tab);
            if (tab === 'ai') setIsAiModalOpen(true);
            if (tab === 'docs') setIsDocsOpen(true);
            if (tab === 'relationships') setIsRelationshipModalOpen(true);
          }}
          onNewSchema={() => setIsNewCollectionOpen(true)}
          onImportMongoDB={() => setIsImportMongoDBOpen(true)}
          onOpenDocs={() => setIsDocsOpen(true)}
          collectionsCount={collections.length}
        />

        <Canvas
          collections={collections}
          selectedCollectionId={selectedCollectionId}
          selectedFieldId={selectedFieldId}
          onSelectField={handleSelectField}
          onSelectCollection={handleSelectCollection}
          onUpdateCollectionPosition={handleUpdateCollectionPosition}
          onAddField={handleAddField}
          onDeleteCollection={handleDeleteCollection}
          onRenameCollection={handleRenameCollection}
          onDuplicateCollection={handleDuplicateCollection}
          onChangeColor={handleChangeColor}
          onAddRelationship={handleAddRelationship}
          onRemoveRelationship={handleRemoveRelationship}
          searchQuery={searchQuery}
          isCodeDrawerExpanded={isCodeDrawerExpanded}
        />

        <FieldInspector
          collections={collections}
          selectedCollectionId={selectedCollectionId}
          selectedFieldId={selectedFieldId}
          onUpdateField={handleUpdateField}
          onDeleteField={handleDeleteField}
          onClose={() => setSelectedFieldId(null)}
        />

        <CodeDrawer 
          collections={collections} 
          framework={framework} 
          setFramework={setFramework}
          isExpanded={isCodeDrawerExpanded}
          setIsExpanded={setIsCodeDrawerExpanded}
          hasSelection={!!(selectedCollectionId || selectedFieldId)}
        />
      </div>

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

      <ImportMongoDBModal
        isOpen={isImportMongoDBOpen}
        onClose={() => setIsImportMongoDBOpen(false)}
        onImport={handleImportMongoSchema}
      />

      <RelationshipModal
        isOpen={isRelationshipModalOpen}
        onClose={() => setIsRelationshipModalOpen(false)}
        collections={collections}
        onUpdateField={handleUpdateField}
      />

      <DocsModal isOpen={isDocsOpen} onClose={() => setIsDocsOpen(false)} />

      <ClearCanvasModal
        isOpen={isClearModalOpen}
        onClose={() => setIsClearModalOpen(false)}
        onConfirm={executeClearCanvas}
      />
    </div>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <SchemaForgeApp />
    </ReactFlowProvider>
  );
}
