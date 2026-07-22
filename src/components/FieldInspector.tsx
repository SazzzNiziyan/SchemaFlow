import React from 'react';
import { X, Trash2, ChevronDown, Check } from 'lucide-react';
import { CollectionNode, SchemaField, FieldType } from '../types';

interface FieldInspectorProps {
  collections: CollectionNode[];
  selectedCollectionId: string | null;
  selectedFieldId: string | null;
  onUpdateField: (colId: string, fieldId: string, updated: Partial<SchemaField>) => void;
  onDeleteField: (colId: string, fieldId: string) => void;
  onClose: () => void;
}

export const FieldInspector: React.FC<FieldInspectorProps> = ({
  collections,
  selectedCollectionId,
  selectedFieldId,
  onUpdateField,
  onDeleteField,
  onClose,
}) => {
  if (!selectedCollectionId || !selectedFieldId) return null;

  const currentCollection = collections.find((c) => c.id === selectedCollectionId);
  const currentField = currentCollection?.fields.find((f) => f.id === selectedFieldId);

  if (!currentCollection || !currentField) return null;

  const dataTypes: FieldType[] = [
    'String',
    'Number',
    'Boolean',
    'Date',
    'ObjectId',
    'Array',
    'JSON',
    'Decimal',
    'UUID',
  ];

  return (
    <aside className="absolute right-0 top-16 h-[calc(100vh-64px)] w-[320px] bg-[#0a0a0a] border-l border-neutral-800 z-30 flex flex-col shadow-[-10px_0_30px_rgba(0,0,0,0.5)]">
      {/* Header */}
      <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
        <span className="font-bold text-xs tracking-wider uppercase text-neutral-200">Field Inspector</span>
        <button
          onClick={onClose}
          className="text-neutral-400 hover:text-white p-1 rounded-full transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body Content */}
      <div className="p-6 flex-1 overflow-y-auto space-y-6">
        {/* Field Name & Collection */}
        <div>
          <label className="text-[11px] font-mono text-neutral-400 uppercase tracking-wider block mb-1.5 font-semibold">
            Field Name
          </label>
          <input
            type="text"
            value={currentField.name}
            onChange={(e) =>
              onUpdateField(selectedCollectionId, selectedFieldId, { name: e.target.value })
            }
            className="w-full bg-[#141414] border border-neutral-800 rounded-xl px-3 py-2 text-sm text-indigo-300 font-mono font-semibold focus:outline-none focus:border-indigo-500 transition-all"
          />
          <p className="text-xs text-neutral-500 font-mono mt-1.5">
            Belongs to: <span className="text-neutral-200 font-semibold">{currentCollection.name} Collection</span>
          </p>
        </div>

        {/* Data Type Dropdown */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-mono text-neutral-400 uppercase tracking-wider block font-semibold">
            Data Type
          </label>
          <div className="relative">
            <select
              value={currentField.type}
              onChange={(e) =>
                onUpdateField(selectedCollectionId, selectedFieldId, {
                  type: e.target.value as FieldType,
                })
              }
              className="w-full bg-[#141414] border border-neutral-800 rounded-xl p-2.5 text-sm text-white font-mono appearance-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none cursor-pointer"
            >
              {dataTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
          </div>
        </div>

        {/* Foreign Key Relation Config */}
        <div className="space-y-3 pt-3 border-t border-neutral-800">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-mono text-neutral-400 uppercase tracking-wider font-semibold">
              Foreign Key Relation
            </label>
            <input
              type="checkbox"
              checked={!!currentField.isForeignKey}
              onChange={(e) => {
                const checked = e.target.checked;
                onUpdateField(selectedCollectionId, selectedFieldId, {
                  isForeignKey: checked,
                  foreignKeyRef: checked
                    ? currentField.foreignKeyRef || {
                        targetCollectionId: collections[0]?.id || '',
                        targetFieldId: collections[0]?.fields[0]?.id || '',
                      }
                    : undefined,
                });
              }}
              className="w-4 h-4 rounded bg-[#141414] border-neutral-700 text-indigo-600 focus:ring-indigo-500"
            />
          </div>

          {currentField.isForeignKey && (
            <div className="space-y-2 bg-[#141414] p-3.5 rounded-2xl border border-neutral-800">
              <label className="text-xs text-neutral-400 block font-medium">Target Collection</label>
              <select
                value={currentField.foreignKeyRef?.targetCollectionId || ''}
                onChange={(e) => {
                  const targetColId = e.target.value;
                  const targetCol = collections.find((c) => c.id === targetColId);
                  const firstFieldId = targetCol?.fields[0]?.id || '';
                  onUpdateField(selectedCollectionId, selectedFieldId, {
                    foreignKeyRef: {
                      targetCollectionId: targetColId,
                      targetFieldId: firstFieldId,
                    },
                  });
                }}
                className="w-full bg-[#1a1a1a] text-xs text-white border border-neutral-800 rounded-lg p-2 focus:outline-none focus:border-indigo-500"
              >
                {collections.map((col) => (
                  <option key={col.id} value={col.id}>
                    {col.name}
                  </option>
                ))}
              </select>

              <label className="text-xs text-neutral-400 block mt-2 font-medium">Target Field</label>
              <select
                value={currentField.foreignKeyRef?.targetFieldId || ''}
                onChange={(e) => {
                  onUpdateField(selectedCollectionId, selectedFieldId, {
                    foreignKeyRef: {
                      targetCollectionId: currentField.foreignKeyRef?.targetCollectionId || '',
                      targetFieldId: e.target.value,
                    },
                  });
                }}
                className="w-full bg-[#1a1a1a] text-xs text-white border border-neutral-800 rounded-lg p-2 focus:outline-none focus:border-indigo-500"
              >
                {collections
                  .find((c) => c.id === currentField.foreignKeyRef?.targetCollectionId)
                  ?.fields.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.type})
                    </option>
                  ))}
              </select>
            </div>
          )}
        </div>

        {/* Validation Rules */}
        <div className="space-y-4 pt-3 border-t border-neutral-800">
          <label className="text-[11px] font-mono text-neutral-400 uppercase tracking-wider block font-semibold">
            Validation Rules
          </label>

          {/* Required Switch */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-neutral-200">Required</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={!!currentField.validation.required}
                onChange={(e) =>
                  onUpdateField(selectedCollectionId, selectedFieldId, {
                    validation: {
                      ...currentField.validation,
                      required: e.target.checked,
                    },
                  })
                }
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-neutral-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600" />
            </label>
          </div>

          {/* Unique Switch */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-neutral-200">Unique</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={!!currentField.validation.unique}
                onChange={(e) =>
                  onUpdateField(selectedCollectionId, selectedFieldId, {
                    validation: {
                      ...currentField.validation,
                      unique: e.target.checked,
                    },
                  })
                }
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-neutral-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600" />
            </label>
          </div>

          {/* Match Regex */}
          <div className="space-y-1">
            <span className="text-xs text-neutral-400 font-medium">Match (Regex Pattern)</span>
            <input
              type="text"
              value={currentField.validation.match || ''}
              onChange={(e) =>
                onUpdateField(selectedCollectionId, selectedFieldId, {
                  validation: {
                    ...currentField.validation,
                    match: e.target.value,
                  },
                })
              }
              placeholder="/^\S+@\S+\.\S+$/"
              className="w-full bg-[#141414] border border-neutral-800 rounded-xl px-3 py-2 text-sm font-mono text-white focus:border-indigo-500 focus:outline-none transition-colors"
            />
          </div>

          {/* Default Value */}
          <div className="space-y-1">
            <label className="text-xs text-neutral-400 font-medium">Default Value</label>
            <input
              type="text"
              value={currentField.validation.defaultVal || ''}
              onChange={(e) =>
                onUpdateField(selectedCollectionId, selectedFieldId, {
                  validation: {
                    ...currentField.validation,
                    defaultVal: e.target.value,
                  },
                })
              }
              placeholder="e.g. 'user@example.com' or Date.now"
              className="w-full bg-[#141414] border border-neutral-800 rounded-xl p-2.5 text-sm text-white font-mono focus:ring-1 focus:ring-indigo-500 focus:outline-none placeholder:text-neutral-600"
            />
          </div>
        </div>

        {/* Delete Field Action */}
        <div className="pt-6 border-t border-neutral-800">
          <button
            onClick={() => onDeleteField(selectedCollectionId, selectedFieldId)}
            className="w-full py-2.5 text-xs font-semibold text-red-400 hover:bg-red-500/10 border border-red-500/20 hover:border-red-500/40 rounded-full transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <Trash2 className="w-4 h-4" /> Delete Field
          </button>
        </div>
      </div>
    </aside>
  );
};
