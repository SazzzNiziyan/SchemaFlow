import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { CollectionNode, RelationshipType, SchemaField } from '../types';
import { Network, X, Trash2 } from 'lucide-react';
import { useSchemaStore } from '../store/useSchemaStore';
import { useModal } from '../store/useUIStore';
import { relationshipIdForField } from '../utils/schemaOps';

/** UI option -> stored cardinality. Many-to-one is one-to-many seen from the child side. */
const REL_TYPE_FROM_OPTION: Record<string, RelationshipType> = {
  'one-to-one': 'one-to-one',
  'one-to-many': 'one-to-many',
  'many-to-one': 'one-to-many',
  'many-to-many': 'many-to-many',
};

export const RelationshipModal: React.FC = () => {
  const { isOpen, close: onClose } = useModal('relationships');
  if (!isOpen) return null;
  return <RelationshipModalContent onClose={onClose} />;
};

const RelationshipModalContent: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const collections = useSchemaStore((s) => s.collections);
  const addRelationship = useSchemaStore((s) => s.addRelationship);
  const deleteRelationship = useSchemaStore((s) => s.deleteRelationship);
  const [sourceColId, setSourceColId] = useState('');
  const [sourceFieldId, setSourceFieldId] = useState('');
  const [targetColId, setTargetColId] = useState('');
  const [targetFieldId, setTargetFieldId] = useState('');
  const [relType, setRelType] = useState('one-to-many');

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

    addRelationship({
      sourceCollectionId: sourceColId,
      sourceFieldId,
      targetCollectionId: targetColId,
      targetFieldId,
      type: REL_TYPE_FROM_OPTION[relType],
    });
    
    setSourceColId('');
    setSourceFieldId('');
    setTargetColId('');
    setTargetFieldId('');
  };

  const handleDelete = (_colId: string, fieldId: string) => {
    deleteRelationship(relationshipIdForField(fieldId));
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Relationship Editor"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 glass-backdrop animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl glass-panel rounded-panel overflow-hidden flex flex-col h-[600px]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-[var(--glass-border)] flex items-center justify-between bg-[var(--glass-surface-elevated)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-card bg-[var(--glass-hover)] border border-[var(--glass-border)] flex items-center justify-center">
              <Network className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[var(--glass-text-primary)]">Relationship Editor</h3>
              <p className="text-xs text-[var(--glass-text-secondary)]">Manage foreign keys and connections between collections.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)] p-1.5 rounded-control transition-colors cursor-pointer hover:bg-[var(--glass-hover)]"
            aria-label="Close relationship editor"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          
          {/* Create New Relationship */}
          <div className="bg-[var(--glass-surface-elevated)] border border-[var(--glass-border)] rounded-card p-5">
            <h4 className="text-sm font-bold text-[var(--glass-text-primary)] mb-4">Create New Relationship</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-wider text-[var(--glass-text-secondary)] font-bold">Source Collection</label>
                <select
                  value={sourceColId}
                  onChange={e => setSourceColId(e.target.value)}
                  className="w-full glass-input rounded-control px-3 py-2 text-xs text-[var(--glass-text-primary)]"
                >
                  <option value="">Select...</option>
                  {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-wider text-[var(--glass-text-secondary)] font-bold">Source Field</label>
                <select
                  value={sourceFieldId}
                  onChange={e => setSourceFieldId(e.target.value)}
                  disabled={!sourceColId}
                  className="w-full glass-input rounded-control px-3 py-2 text-xs text-[var(--glass-text-primary)]"
                >
                  <option value="">Select...</option>
                  {collections.find(c => c.id === sourceColId)?.fields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-wider text-[var(--glass-text-secondary)] font-bold">Target Collection</label>
                <select
                  value={targetColId}
                  onChange={e => setTargetColId(e.target.value)}
                  className="w-full glass-input rounded-control px-3 py-2 text-xs text-[var(--glass-text-primary)]"
                >
                  <option value="">Select...</option>
                  {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-wider text-[var(--glass-text-secondary)] font-bold">Target Field</label>
                <select
                  value={targetFieldId}
                  onChange={e => setTargetFieldId(e.target.value)}
                  disabled={!targetColId}
                  className="w-full glass-input rounded-control px-3 py-2 text-xs text-[var(--glass-text-primary)]"
                >
                  <option value="">Select...</option>
                  {collections.find(c => c.id === targetColId)?.fields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
              <div className="space-y-2 col-span-2">
                <label className="text-[10px] uppercase tracking-wider text-[var(--glass-text-secondary)] font-bold">Relationship Type</label>
                <select
                  value={relType}
                  onChange={e => setRelType(e.target.value)}
                  className="w-full glass-input rounded-control px-3 py-2 text-xs text-[var(--glass-text-primary)]"
                >
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
              className="mt-5 w-full btn btn-primary text-xs"
            >
              Add Relationship
            </button>
          </div>

          {/* Existing Relationships */}
          <div>
            <h4 className="text-sm font-bold text-[var(--glass-text-primary)] mb-4">Existing Relationships</h4>
            <div className="space-y-3">
              {existingRels.length === 0 ? (
                <div className="text-xs text-[var(--glass-text-secondary)] italic">No relationships found.</div>
              ) : (
                existingRels.map((rel, i) => (
                  <div key={i} className="flex items-center justify-between bg-[var(--glass-surface-elevated)] border border-[var(--glass-border)] rounded-control p-3">
                    <div className="flex items-center gap-3 text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-accent">{rel.sourceCol.name}</span>
                        <span className="text-[var(--glass-text-secondary)]">.</span>
                        <span className="font-mono text-[var(--glass-text-primary)]">{rel.sourceField.name}</span>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-[var(--glass-text-secondary)]" />
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-accent">{rel.targetCol.name}</span>
                        <span className="text-[var(--glass-text-secondary)]">.</span>
                        <span className="font-mono text-[var(--glass-text-primary)]">{rel.targetField.name}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(rel.sourceCol.id, rel.sourceField.id)}
                      className="p-1.5 text-[var(--glass-text-secondary)] hover:text-danger hover:bg-danger-soft rounded-control transition-colors"
                      aria-label="Delete relationship"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

const ArrowRight = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
  </svg>
);
