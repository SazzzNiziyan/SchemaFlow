import React, { useState } from 'react';
import { Plus, X, Table, Key } from 'lucide-react';
import { CollectionNode, SchemaField } from '../types';

interface NewCollectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateCollection: (newCol: CollectionNode) => void;
}

export const NewCollectionModal: React.FC<NewCollectionModalProps> = ({
  isOpen,
  onClose,
  onCreateCollection,
}) => {
  const [name, setName] = useState('');
  const [pkType, setPkType] = useState<'ObjectId' | 'UUID' | 'Number'>('ObjectId');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const formattedName = name.trim().charAt(0).toUpperCase() + name.trim().slice(1);
    const pkName = pkType === 'ObjectId' ? '_id' : 'id';

    const defaultFields: SchemaField[] = [
      {
        id: `f_${Date.now()}_1`,
        name: pkName,
        type: pkType,
        isPrimaryKey: true,
        validation: { required: true },
      },
      {
        id: `f_${Date.now()}_2`,
        name: 'name',
        type: 'String',
        validation: { required: true },
      },
      {
        id: `f_${Date.now()}_3`,
        name: 'createdAt',
        type: 'Date',
        validation: { defaultVal: 'Date.now' },
      },
    ];

    const newCol: CollectionNode = {
      id: `col_${Date.now()}`,
      name: formattedName,
      icon: 'Table',
      colorTag: '#afc6ff',
      position: { x: Math.floor(Math.random() * 200) + 200, y: Math.floor(Math.random() * 200) + 150 },
      fields: defaultFields,
    };

    onCreateCollection(newCol);
    setName('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="w-full max-w-md bg-[#000000] border border-neutral-800 rounded-[2rem] shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
              <Table className="w-4 h-4 text-indigo-400" />
            </div>
            <h3 className="text-base font-bold text-white">New Collection / Table</h3>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-white p-1 rounded-full transition-colors cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="text-xs font-mono text-neutral-400 uppercase tracking-wider block mb-1.5 font-semibold">
              Collection Name
            </label>
            <input
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Products, Categories, Reviews"
              className="w-full bg-[#0a0a0a] border border-neutral-800 rounded-2xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>

          <div>
            <label className="text-xs font-mono text-neutral-400 uppercase tracking-wider block mb-1.5 font-semibold">
              Primary Key Type
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['ObjectId', 'UUID', 'Number'] as const).map((type) => (
                <button
                  type="button"
                  key={type}
                  onClick={() => setPkType(type)}
                  className={`p-2.5 rounded-full border text-xs font-mono text-center transition-all cursor-pointer ${
                    pkType === type
                      ? 'bg-indigo-600 border-indigo-500 text-white font-bold shadow-[0_0_12px_rgba(99,102,241,0.3)]'
                      : 'bg-[#0a0a0a] border-neutral-800 text-neutral-400 hover:text-white'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-3 border-t border-neutral-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-neutral-400 hover:text-white transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={!name.trim()}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-full transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-[0_0_15px_rgba(99,102,241,0.3)]"
            >
              <Plus className="w-4 h-4" />
              <span>Create Collection</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
