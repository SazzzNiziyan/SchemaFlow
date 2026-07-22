import React, { memo, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { CollectionNode as CollectionNodeType } from '../types';
import { Key, Link, MoreVertical, Plus, Trash2, Table, Copy, Edit2, Palette } from 'lucide-react';

const COLORS = ['#000000', '#1e1b4b', '#064e3b', '#450a0a', '#4a044e', '#0f172a'];

interface CollectionNodeProps {
  data: {
    collection: CollectionNodeType;
    selectedCollectionId: string | null;
    selectedFieldId: string | null;
    searchQuery: string;
    onSelectField: (colId: string, fieldId: string) => void;
    onSelectCollection: (colId: string) => void;
    onAddField: (colId: string) => void;
    onDeleteCollection: (colId: string) => void;
    onRenameCollection: (colId: string, newName: string) => void;
    onDuplicateCollection: (colId: string) => void;
    onChangeColor: (colId: string, color: string) => void;
    menuOpenColId: string | null;
    setMenuOpenColId: (id: string | null) => void;
  };
}

export const CollectionNode = memo(({ data }: CollectionNodeProps) => {
  const {
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
    setMenuOpenColId
  } = data;

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(col.name);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const isColSelected = selectedCollectionId === col.id;
  const matchesSearch =
    !searchQuery ||
    col.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    col.fields.some((f) => f.name.toLowerCase().includes(searchQuery.toLowerCase()));

  // Add a listener to close context menu on click outside
  React.useEffect(() => {
    const handleGlobalClick = () => setContextMenu(null);
    if (contextMenu) {
      window.addEventListener('click', handleGlobalClick);
    }
    return () => window.removeEventListener('click', handleGlobalClick);
  }, [contextMenu]);

  return (
    <div
      onClick={() => onSelectCollection(col.id)}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        
        // Use standard react state, but position relative to viewport
        // Wait, React Flow node transforms break fixed positioning. 
        // We will just use top/left relative to the node.
        const rect = e.currentTarget.getBoundingClientRect();
        setContextMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }}
      style={{ backgroundColor: '#111111' }}
      className={`w-72 backdrop-blur-md rounded-[2rem] border transition-all node-card flex flex-col z-10 group p-4 ${
        isColSelected
          ? 'border-[#6C5CE7] ring-2 ring-[#6C5CE7]/30 shadow-[0_0_30px_rgba(108,92,231,0.35)]'
          : 'border-[#2A2A2A] hover:border-[#6C5CE7]'
      } ${!matchesSearch ? 'opacity-30' : 'opacity-100'}`}
    >
      {/* Context Menu */}
      {contextMenu && (
        <div 
          className="absolute bg-[#1a1a1a] border border-neutral-800 rounded-2xl shadow-2xl z-50 py-1.5 text-xs w-48"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              onDuplicateCollection(col.id);
              setContextMenu(null);
            }}
            className="w-full text-left px-3.5 py-2 hover:bg-neutral-800 text-white flex items-center gap-2 font-medium cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Duplicate</span>
          </button>
          
          <button
            onClick={() => {
              setIsEditing(true);
              setContextMenu(null);
            }}
            className="w-full text-left px-3.5 py-2 hover:bg-neutral-800 text-white flex items-center gap-2 font-medium cursor-pointer"
          >
            <Edit2 className="w-3.5 h-3.5" />
            <span>Rename</span>
          </button>

          <div className="px-3.5 py-2 border-t border-neutral-800">
            <div className="flex items-center gap-2 text-white mb-2 font-medium">
              <Palette className="w-3.5 h-3.5" />
              <span>Change Color</span>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => {
                    onChangeColor(col.id, c);
                    setContextMenu(null);
                  }}
                  className="w-5 h-5 rounded-full border border-white/20 hover:scale-110 transition-transform"
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <button
            onClick={() => {
              onDeleteCollection(col.id);
              setContextMenu(null);
            }}
            className="w-full text-left px-3.5 py-2 hover:bg-red-500/10 text-red-400 flex items-center gap-2 border-t border-neutral-800 font-medium cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete</span>
          </button>
        </div>
      )}

      {/* Node Card Header */}
      <div className="bg-[#0A0A0A] -mx-4 -mt-4 px-4 py-3 mb-2 border-b border-[#2A2A2A] rounded-t-[2rem] flex items-center justify-between drag-handle cursor-move">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-black/20 border border-white/10 flex items-center justify-center">
            <Table className="w-4 h-4 text-white/70" />
          </div>
          <div onDoubleClick={(e) => { e.stopPropagation(); setIsEditing(true); }}>
            {isEditing ? (
              <input 
                autoFocus
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onBlur={() => {
                  setIsEditing(false);
                  onRenameCollection(col.id, editName);
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    setIsEditing(false);
                    onRenameCollection(col.id, editName);
                  }
                  if (e.key === 'Escape') {
                    setIsEditing(false);
                    setEditName(col.name);
                  }
                }}
                className="bg-black/50 rounded px-1 text-base font-bold text-white border-b border-[#6C5CE7] outline-none w-full"
              />
            ) : (
              <span className="font-bold text-base text-white">{col.name}</span>
            )}
            <p className="text-[10px] text-white/50 uppercase tracking-widest font-mono">Collection</p>
          </div>
        </div>
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpenColId(menuOpenColId === col.id ? null : col.id);
            }}
            className="p-1.5 hover:bg-black/20 rounded-full text-white/50 hover:text-white transition-colors"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {/* Collection Actions Menu (Standard) */}
          {menuOpenColId === col.id && (
            <div className="absolute right-0 top-8 w-40 bg-[#1a1a1a] border border-neutral-800 rounded-2xl shadow-2xl z-50 py-1.5 text-xs">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAddField(col.id);
                  setMenuOpenColId(null);
                }}
                className="w-full text-left px-3.5 py-2 hover:bg-neutral-800 text-white flex items-center gap-2 font-medium cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-[#6C5CE7]" />
                <span>Add Field</span>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteCollection(col.id);
                  setMenuOpenColId(null);
                }}
                className="w-full text-left px-3.5 py-2 hover:bg-red-500/10 text-red-400 flex items-center gap-2 border-t border-neutral-800 font-medium cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Collection</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Fields List */}
      <div className="space-y-1.5 relative">
        {col.fields.map((field, index) => {
          const isSelected = selectedCollectionId === col.id && selectedFieldId === field.id;
          const isFieldMatch = searchQuery && field.name.toLowerCase().includes(searchQuery.toLowerCase());

          return (
            <div
              key={field.id}
              onClick={(e) => {
                e.stopPropagation();
                onSelectField(col.id, field.id);
              }}
              className={`relative flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all ${
                isSelected
                  ? 'bg-[#6C5CE7]/20 border border-[#6C5CE7]/50 shadow-[0_0_12px_rgba(108,92,231,0.2)]'
                  : isFieldMatch
                  ? 'bg-[#6C5CE7]/10 border border-[#6C5CE7]/30'
                  : 'bg-transparent hover:bg-[#6C5CE7]/10 border border-transparent'
              }`}
            >
              {/* React Flow Handles - Parent Output (Source) on Right, Child Input (Target) on Left */}
              <Handle
                type="target"
                position={Position.Left}
                id={`target-${field.id}`}
                style={{ top: '50%', left: -16, width: 8, height: 8, background: '#6C5CE7', border: 'none' }}
              />
              <Handle
                type="source"
                position={Position.Right}
                id={`source-${field.id}`}
                style={{ top: '50%', right: -16, width: 8, height: 8, background: '#6C5CE7', border: 'none' }}
              />
              <div className="flex items-center gap-2">
                {field.isPrimaryKey ? (
                  <Key className="w-3.5 h-3.5 text-[#6C5CE7]" />
                ) : field.isForeignKey ? (
                  <Link className="w-3.5 h-3.5 text-[#6C5CE7]" />
                ) : field.validation.required ? (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-neutral-600" />
                )}
                <span
                  className={`text-xs font-mono ${
                    isSelected ? 'text-[#6C5CE7] font-bold' : 'text-neutral-200'
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
          onClick={(e) => {
            e.stopPropagation();
            onAddField(col.id);
          }}
          className="w-full mt-2 py-2 border border-dashed border-[#2A2A2A] hover:border-[#6C5CE7]/60 rounded-xl text-center text-xs text-neutral-400 hover:text-white transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5 text-[#6C5CE7]" />
          <span>Add Field</span>
        </button>
      </div>
    </div>
  );
});
