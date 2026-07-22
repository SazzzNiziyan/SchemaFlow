import React, { useMemo, useState, useCallback, useEffect } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  BackgroundVariant,
  NodeChange,
  EdgeChange,
  applyNodeChanges,
  applyEdgeChanges
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { CollectionNode as CollectionNodeType } from '../types';
import { CollectionNode } from './CollectionNode';
import { CustomEdge } from './CustomEdge';

interface CanvasProps {
  collections: CollectionNodeType[];
  selectedCollectionId: string | null;
  selectedFieldId: string | null;
  onSelectField: (colId: string, fieldId: string) => void;
  onSelectCollection: (colId: string) => void;
  onUpdateCollectionPosition: (id: string, pos: { x: number; y: number }) => void;
  onAddField: (colId: string) => void;
  onDeleteCollection: (colId: string) => void;
  onRenameCollection: (colId: string, newName: string) => void;
  onDuplicateCollection: (colId: string) => void;
  onChangeColor: (colId: string, color: string) => void;
  onAddRelationship: (sourceColId: string, sourceFieldId: string, targetColId: string, targetFieldId: string) => void;
  onRemoveRelationship: (sourceColId: string, sourceFieldId: string) => void;
  searchQuery: string;
  isCodeDrawerExpanded: boolean;
}

const nodeTypes = {
  collectionNode: CollectionNode,
};

const edgeTypes = {
  customEdge: CustomEdge,
};

export const Canvas: React.FC<CanvasProps> = ({
  collections,
  selectedCollectionId,
  selectedFieldId,
  onSelectField,
  onSelectCollection,
  onUpdateCollectionPosition,
  onAddField,
  onDeleteCollection,
  onRenameCollection,
  onDuplicateCollection,
  onChangeColor,
  onAddRelationship,
  onRemoveRelationship,
  searchQuery,
  isCodeDrawerExpanded,
}) => {
  const [menuOpenColId, setMenuOpenColId] = useState<string | null>(null);

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  // Sync state from props
  useEffect(() => {
    setNodes((nds) => {
      return collections.map((col) => {
        const existingNode = nds.find((n) => n.id === col.id);
        return {
          id: col.id,
          type: 'collectionNode',
          position: col.position,
          data: {
            collection: col,
            selectedCollectionId,
            selectedFieldId,
            searchQuery,
            onSelectField,
            onSelectCollection,
            onAddField,
            onDeleteCollection,
            onRenameCollection,
            onDuplicateCollection,
            onChangeColor,
            menuOpenColId,
            setMenuOpenColId,
          },
          dragHandle: '.drag-handle',
        };
      });
    });

    const newEdges: Edge[] = [];
    collections.forEach((col) => {
      col.fields.forEach((field) => {
        if (field.isForeignKey && field.foreignKeyRef?.targetCollectionId) {
          const childColId = col.id;
          const childFieldId = field.id;
          const parentColId = field.foreignKeyRef.targetCollectionId;
          const parentFieldId = field.foreignKeyRef.targetFieldId;
          
          // Parent is Source (Right side), Child is Target (Left side)
          newEdges.push({
            id: `e-${childColId}-${childFieldId}-${parentColId}-${parentFieldId}`,
            source: parentColId,
            sourceHandle: `source-${parentFieldId}`,
            target: childColId,
            targetHandle: `target-${childFieldId}`,
            type: 'customEdge',
            animated: true,
            style: { stroke: '#6366f1', strokeWidth: 2 },
            data: { 
              relType: '1:N',
              onDelete: () => {
                onRemoveRelationship(childColId, childFieldId);
              }
            },
          });
        }
      });
    });
    setEdges(newEdges);
  }, [
    collections,
    selectedCollectionId,
    selectedFieldId,
    searchQuery,
    menuOpenColId,
    onSelectField,
    onSelectCollection,
    onAddField,
    onDeleteCollection,
    onRenameCollection,
    onDuplicateCollection,
    onChangeColor,
    onRemoveRelationship
  ]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target || !params.sourceHandle || !params.targetHandle) return;
      // Visual Source is Parent, Visual Target is Child.
      // App logic expects sourceColId=Child, targetColId=Parent.
      const parentColId = params.source;
      const childColId = params.target;
      const parentFieldId = params.sourceHandle.replace('source-', '');
      const childFieldId = params.targetHandle.replace('target-', '');
      
      onAddRelationship(childColId, childFieldId, parentColId, parentFieldId);
    },
    [onAddRelationship]
  );

  const onNodesDelete = useCallback(
    (deleted: Node[]) => {
      deleted.forEach((node) => {
        onDeleteCollection(node.id);
      });
    },
    [onDeleteCollection]
  );

  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      deleted.forEach((edge) => {
        // Child is the target of the visual edge
        const childFieldId = edge.targetHandle?.replace('target-', '');
        if (edge.target && childFieldId) {
          onRemoveRelationship(edge.target, childFieldId);
        }
      });
    },
    [onRemoveRelationship]
  );

  const onNodeDragStop = useCallback(
    (event: React.MouseEvent, node: Node) => {
      onUpdateCollectionPosition(node.id, { x: node.position.x, y: node.position.y });
    },
    [onUpdateCollectionPosition]
  );

  return (
    <div 
      className="fixed inset-0 pl-[280px] pt-16 flex flex-col bg-[#0a0a0a] overflow-hidden select-none transition-all duration-300" 
      onClick={() => setMenuOpenColId(null)}
      style={{ paddingBottom: isCodeDrawerExpanded ? '13rem' : '2.5rem' }}
    >
      <div className="flex-1 relative w-full h-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodesDelete={onNodesDelete}
          onEdgesDelete={onEdgesDelete}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodeDragStop={onNodeDragStop}
          onPaneClick={() => onSelectCollection('')}
          fitView
          minZoom={0.1}
          maxZoom={2}
          defaultEdgeOptions={{ type: 'customEdge' }}
          snapToGrid={true}
          snapGrid={[10, 10]}
        >
          <Background color="#1d1d1d" variant={BackgroundVariant.Dots} gap={24} size={2} />
          <MiniMap 
            className="!bg-[#000000] !border-neutral-800" 
            nodeColor="#3730a3" 
            maskColor="rgba(0, 0, 0, 0.5)" 
          />
        </ReactFlow>
      </div>
    </div>
  );
};

