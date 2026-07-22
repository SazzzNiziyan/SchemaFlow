import React, { useState, useRef, useEffect } from 'react';
import { Key, Link, MoreVertical, Plus, Trash2, Layers, Table } from 'lucide-react';
import { CollectionNode, SchemaField } from '../types';

interface CanvasProps {
  collections: CollectionNode[];
  selectedCollectionId: string | null;
  selectedFieldId: string | null;
  onSelectField: (colId: string, fieldId: string) => void;
  onSelectCollection: (colId: string) => void;
  onUpdateCollectionPosition: (id: string, pos: { x: number; y: number }) => void;
  onAddField: (colId: string) => void;
  onDeleteCollection: (colId: string) => void;
  zoom: number;
  searchQuery: string;
}

export const Canvas: React.FC<CanvasProps> = ({
  collections,
  selectedCollectionId,
  selectedFieldId,
  onSelectField,
  onSelectCollection,
  onUpdateCollectionPosition,
  onAddField,
  onDeleteCollection,
  zoom,
  searchQuery,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [menuOpenColId, setMenuOpenColId] = useState<string | null>(null);

  // Handle Card Drag Start
  const handleCardMouseDown = (e: React.MouseEvent, col: CollectionNode) => {
    e.stopPropagation();
    onSelectCollection(col.id);
    setDraggingId(col.id);
    setDragOffset({
      x: e.clientX / zoom - col.position.x,
      y: e.clientY / zoom - col.position.y,
    });
  };

  // Handle Canvas Pan Start
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.target === containerRef.current || (e.target as HTMLElement).id === 'pan-area') {
      setIsPanning(true);
      setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
    }
  };

  // Handle Mouse Move for Card Drag or Canvas Pan
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (draggingId) {
        const newX = e.clientX / zoom - dragOffset.x;
        const newY = e.clientY / zoom - dragOffset.y;
        onUpdateCollectionPosition(draggingId, {
          x: Math.max(10, newX),
          y: Math.max(10, newY),
        });
      } else if (isPanning) {
        setPanOffset({
          x: e.clientX - panStart.x,
          y: e.clientY - panStart.y,
        });
      }
    };

    const handleMouseUp = () => {
      setDraggingId(null);
      setIsPanning(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingId, dragOffset, isPanning, panStart, zoom, onUpdateCollectionPosition]);

  // Calculate SVG Relationship Lines
  const renderRelationshipLines = () => {
    const lines: React.ReactNode[] = [];

    collections.forEach((sourceCol) => {
      sourceCol.fields.forEach((field) => {
        if (field.isForeignKey && field.foreignKeyRef) {
          const targetCol = collections.find((c) => c.id === field.foreignKeyRef?.targetCollectionId);
          if (targetCol) {
            // Source Field Position Estimate
            const sourceIndex = sourceCol.fields.findIndex((f) => f.id === field.id);
            const targetIndex = targetCol.fields.findIndex((f) => f.id === field.foreignKeyRef?.targetFieldId);

            const x1 = sourceCol.position.x + 256; // Width of card is 256px
            const y1 = sourceCol.position.y + 48 + sourceIndex * 36 + 18;

            const x2 = targetCol.position.x;
            const y2 = targetCol.position.y + 48 + (targetIndex >= 0 ? targetIndex : 0) * 36 + 18;

            const dx = Math.abs(x2 - x1) * 0.5;
            const pathD = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

            lines.push(
              <g key={`rel-${sourceCol.id}-${field.id}-${targetCol.id}`}>
                <path
                  d={pathD}
                  fill="none"
                  stroke="url(#line-grad-1)"
                  strokeWidth="2.5"
                  className="path-line drop-shadow-[0_0_8px_rgba(82,141,255,0.4)]"
                />
                <circle cx={x1} cy={y1} r="4" fill="#528dff" />
                <circle cx={x2} cy={y2} r="4" fill="#4ae176" />
              </g>
            );
          }
        }
      });
    });

    return lines;
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleCanvasMouseDown}
      className="fixed inset-0 pl-[280px] pt-16 flex flex-col bg-[#0a0a0a] overflow-hidden select-none"
    >
      {/* Canvas Interactive Area */}
      <div
        id="pan-area"
        className="flex-1 relative overflow-hidden dot-pattern cursor-grab active:cursor-grabbing"
      >
        <div
          style={{
            transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
            transition: draggingId || isPanning ? 'none' : 'transform 0.1s ease-out',
            minWidth: '3000px',
            minHeight: '2000px',
          }}
          className="absolute inset-0"
        >
          {/* SVG Connection Lines Overlay */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
            <defs>
              <linearGradient id="line-grad-1" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#6366f1" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0.9" />
              </linearGradient>
              <linearGradient id="line-grad-2" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#818cf8" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#6366f1" stopOpacity="0.9" />
              </linearGradient>
            </defs>
            {renderRelationshipLines()}
          </svg>

          {/* Node Cards (Bento Style) */}
          {collections.map((col) => {
            const isColSelected = selectedCollectionId === col.id;
            const matchesSearch =
              !searchQuery ||
              col.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
              col.fields.some((f) => f.name.toLowerCase().includes(searchQuery.toLowerCase()));

            return (
              <div
                key={col.id}
                style={{
                  left: `${col.position.x}px`,
                  top: `${col.position.y}px`,
                }}
                className={`absolute w-72 bg-[#141414] backdrop-blur-md rounded-[2rem] border transition-all node-card flex flex-col z-10 group p-4 ${
                  isColSelected
                    ? 'border-indigo-500 ring-2 ring-indigo-500/30 shadow-[0_0_30px_rgba(99,102,241,0.35)]'
                    : 'border-neutral-800 hover:border-neutral-700'
                } ${!matchesSearch ? 'opacity-30' : 'opacity-100'}`}
              >
                {/* Node Card Header */}
                <div
                  onMouseDown={(e) => handleCardMouseDown(e, col)}
                  className="pb-3 mb-2 border-b border-neutral-800 flex items-center justify-between cursor-move"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
                      <Table className="w-4 h-4 text-indigo-400" />
                    </div>
                    <div>
                      <span className="font-bold text-base text-white">{col.name}</span>
                      <p className="text-[10px] text-neutral-500 uppercase tracking-widest font-mono">Collection</p>
                    </div>
                  </div>
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpenColId(menuOpenColId === col.id ? null : col.id);
                      }}
                      className="p-1.5 hover:bg-neutral-800 rounded-full text-neutral-400 hover:text-white transition-colors"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>

                    {/* Collection Actions Menu */}
                    {menuOpenColId === col.id && (
                      <div className="absolute right-0 top-8 w-40 bg-[#1a1a1a] border border-neutral-800 rounded-2xl shadow-2xl z-50 py-1.5 text-xs">
                        <button
                          onClick={() => {
                            onAddField(col.id);
                            setMenuOpenColId(null);
                          }}
                          className="w-full text-left px-3.5 py-2 hover:bg-neutral-800 text-white flex items-center gap-2 font-medium"
                        >
                          <Plus className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Add Field</span>
                        </button>
                        <button
                          onClick={() => {
                            onDeleteCollection(col.id);
                            setMenuOpenColId(null);
                          }}
                          className="w-full text-left px-3.5 py-2 hover:bg-red-500/10 text-red-400 flex items-center gap-2 border-t border-neutral-800 font-medium"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete Collection</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Fields List */}
                <div className="space-y-1.5">
                  {col.fields.map((field) => {
                    const isSelected = selectedCollectionId === col.id && selectedFieldId === field.id;
                    const isFieldMatch =
                      searchQuery && field.name.toLowerCase().includes(searchQuery.toLowerCase());

                    return (
                      <div
                        key={field.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectField(col.id, field.id);
                        }}
                        className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-indigo-600/20 border border-indigo-500/50 shadow-[0_0_12px_rgba(99,102,241,0.2)]'
                            : isFieldMatch
                            ? 'bg-indigo-900/20 border border-indigo-500/30'
                            : 'hover:bg-neutral-800/60 border border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {field.isPrimaryKey ? (
                            <Key className="w-3.5 h-3.5 text-emerald-400" />
                          ) : field.isForeignKey ? (
                            <Link className="w-3.5 h-3.5 text-indigo-400" />
                          ) : field.validation.required ? (
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                          ) : (
                            <span className="w-1.5 h-1.5 rounded-full bg-neutral-600" />
                          )}
                          <span
                            className={`text-xs font-mono ${
                              isSelected ? 'text-indigo-200 font-bold' : 'text-neutral-200'
                            }`}
                          >
                            {field.name}
                          </span>
                        </div>
                        <span className="text-[11px] text-neutral-400 font-mono px-2 py-0.5 rounded-md bg-neutral-900 border border-neutral-800">
                          {field.type}
                        </span>
                      </div>
                    );
                  })}

                  {/* Add Field Button inside Card */}
                  <button
                    onClick={() => onAddField(col.id)}
                    className="w-full mt-2 py-2 border border-dashed border-neutral-800 hover:border-indigo-500/60 rounded-xl text-center text-xs text-neutral-400 hover:text-white transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Add Field</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
