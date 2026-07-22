import React, { useState } from 'react';
import { CollectionNode, SchemaField, TargetFramework } from '../types';
import { Network, X, Plus, Trash2 } from 'lucide-react';

interface RelationshipModalProps {
  isOpen: boolean;
  onClose: () => void;
  collections: CollectionNode[];
  onUpdateField: (colId: string, fieldId: string, updatedProps: Partial<SchemaField>) => void;
}

export const RelationshipModal: React.FC<RelationshipModalProps> = ({
  isOpen,
  onClose,
  collections,
  onUpdateField,
}) => {
  const [sourceColId, setSourceColId] = useState('');
  const [sourceFieldId, setSourceFieldId] = useState('');
  const [targetColId, setTargetColId] = useState('');
  const [targetFieldId, setTargetFieldId] = useState('');
  const [relType, setRelType] = useState('one-to-many');

  if (!isOpen) return null;

  // Derive existing relationships from foreign keys
  const existingRels: {
    sourceCol: CollectionNode;
    sourceField: SchemaField;
    targetCol: CollectionNode;
    targetField: SchemaField;
  }[] = [];

  collections.forEach((col) => {
    col.fields.forEach((field) => {
      if (field.isForeignKey && field.foreignKeyRef?.targetCollectionId) {
        const targetCol = collections.find((c) => c.id === field.foreignKeyRef!.targetCollectionId);
        if (targetCol) {
          const targetField = targetCol.fields.find((f) => f.id === field.foreignKeyRef!.targetFieldId);
          if (targetField) {
            existingRels.push({
              sourceCol: col,
              sourceField: field,
              targetCol,
              targetField,
            });
          }
        }
      }
    });
  });

  const handleCreate = () => {
    if (!sourceColId || !sourceFieldId || !targetColId || !targetFieldId) return;

    onUpdateField(sourceColId, sourceFieldId, {
      isForeignKey: true,
      foreignKeyRef: {
        targetCollectionId: targetColId,
        targetFieldId: targetFieldId,
      },
      // If we stored relationship type, we'd put it here or somewhere else
      // For now, it's stored conceptually, and we can visualize it if we extend SchemaField
    });
    
    setSourceColId('');
    setSourceFieldId('');
    setTargetColId('');
    setTargetFieldId('');
  };

  const handleDelete = (colId: string, fieldId: string) => {
    onUpdateField(colId, fieldId, {
      isForeignKey: false,
      foreignKeyRef: undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="w-full max-w-3xl bg-[#000000] border border-neutral-800 rounded-[2rem] shadow-2xl overflow-hidden flex flex-col h-[600px]">
        {/* Header */}
        <div className="p-6 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
              <Network className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Relationship Editor</h3>
              <p className="text-xs text-neutral-400">Manage foreign keys and connections between collections.</p>
            </div>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-white p-1.5 rounded-full transition-colors cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          
          {/* Create New Relationship */}
          <div className="bg-[#0a0a0a] border border-neutral-800 rounded-2xl p-5">
            <h4 className="text-sm font-bold text-white mb-4">Create New Relationship</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold">Source Collection</label>
                <select value={sourceColId} onChange={e => setSourceColId(e.target.value)} className="w-full bg-[#000000] border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white">
                  <option value="">Select...</option>
                  {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold">Source Field</label>
                <select value={sourceFieldId} onChange={e => setSourceFieldId(e.target.value)} disabled={!sourceColId} className="w-full bg-[#000000] border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white">
                  <option value="">Select...</option>
                  {collections.find(c => c.id === sourceColId)?.fields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold">Target Collection</label>
                <select value={targetColId} onChange={e => setTargetColId(e.target.value)} className="w-full bg-[#000000] border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white">
                  <option value="">Select...</option>
                  {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold">Target Field</label>
                <select value={targetFieldId} onChange={e => setTargetFieldId(e.target.value)} disabled={!targetColId} className="w-full bg-[#000000] border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white">
                  <option value="">Select...</option>
                  {collections.find(c => c.id === targetColId)?.fields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
              <div className="space-y-2 col-span-2">
                <label className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold">Relationship Type</label>
                <select value={relType} onChange={e => setRelType(e.target.value)} className="w-full bg-[#000000] border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white">
                  <option value="one-to-one">One-to-One</option>
                  <option value="one-to-many">One-to-Many</option>
                  <option value="many-to-one">Many-to-One</option>
                  <option value="many-to-many">Many-to-Many</option>
                </select>
              </div>
            </div>
            <button 
              onClick={handleCreate}
              disabled={!sourceColId || !sourceFieldId || !targetColId || !targetFieldId}
              className="mt-5 w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl disabled:opacity-50 transition-colors"
            >
              Add Relationship
            </button>
          </div>

          {/* Existing Relationships */}
          <div>
            <h4 className="text-sm font-bold text-white mb-4">Existing Relationships</h4>
            <div className="space-y-3">
              {existingRels.length === 0 ? (
                <div className="text-xs text-neutral-500 italic">No relationships found.</div>
              ) : (
                existingRels.map((rel, i) => (
                  <div key={i} className="flex items-center justify-between bg-[#000000] border border-neutral-800 rounded-xl p-3">
                    <div className="flex items-center gap-3 text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-indigo-300">{rel.sourceCol.name}</span>
                        <span className="text-neutral-500">.</span>
                        <span className="font-mono text-neutral-300">{rel.sourceField.name}</span>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-neutral-600" />
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-emerald-400">{rel.targetCol.name}</span>
                        <span className="text-neutral-500">.</span>
                        <span className="font-mono text-neutral-300">{rel.targetField.name}</span>
                      </div>
                    </div>
                    <button onClick={() => handleDelete(rel.sourceCol.id, rel.sourceField.id)} className="p-1.5 text-neutral-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const ArrowRight = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
  </svg>
);
