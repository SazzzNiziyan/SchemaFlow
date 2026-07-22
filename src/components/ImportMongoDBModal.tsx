import React, { useState } from 'react';
import { Database, X, Loader2, ArrowRight, ArrowLeft, Check } from 'lucide-react';
import { CollectionNode } from '../types';

interface ImportMongoDBModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (collections: CollectionNode[]) => void;
}

export const ImportMongoDBModal: React.FC<ImportMongoDBModalProps> = ({
  isOpen,
  onClose,
  onImport,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [uri, setUri] = useState('');
  const [databases, setDatabases] = useState<string[]>([]);
  const [selectedDb, setSelectedDb] = useState('');
  const [collections, setCollections] = useState<string[]>([]);
  const [selectedCollections, setSelectedCollections] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleConnect = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/mongodb/databases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uri }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      
      setDatabases(data.databases);
      setStep(2);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectDb = async () => {
    if (!selectedDb) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/mongodb/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uri, dbName: selectedDb }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      
      setCollections(data.collections);
      setSelectedCollections(data.collections); // Select all by default
      setStep(3);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (selectedCollections.length === 0) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/mongodb/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uri, dbName: selectedDb, collectionNames: selectedCollections }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      
      onImport(data.collections);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleCollection = (col: string) => {
    setSelectedCollections(prev => 
      prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]
    );
  };

  const handleReset = () => {
    setStep(1);
    setDatabases([]);
    setSelectedDb('');
    setCollections([]);
    setSelectedCollections([]);
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="w-full max-w-lg bg-[#000000] border border-neutral-800 rounded-[2rem] shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center">
              <Database className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Import from MongoDB</h3>
              <p className="text-xs text-neutral-400">
                Step {step} of 3
              </p>
            </div>
          </div>
          <button
            onClick={handleReset}
            className="text-neutral-400 hover:text-white p-1.5 rounded-full transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="w-full h-1 bg-[#0a0a0a]">
          <div 
            className="h-full bg-emerald-500 transition-all duration-300" 
            style={{ width: `${(step / 3) * 100}%` }}
          />
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {error && (
            <div className="p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 font-medium">
              {error}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-mono text-neutral-400 uppercase tracking-wider block mb-2 font-semibold">
                  MongoDB Connection URI
                </label>
                <input
                  type="text"
                  value={uri}
                  onChange={(e) => setUri(e.target.value)}
                  placeholder="mongodb+srv://user:pass@cluster.mongodb.net"
                  className="w-full bg-[#0a0a0a] border border-neutral-800 rounded-2xl p-4 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500 transition-all font-mono"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleReset}
                  className="w-1/3 py-3 bg-[#0a0a0a] hover:bg-neutral-800 text-neutral-300 font-bold text-xs tracking-wider uppercase rounded-full transition-all flex items-center justify-center cursor-pointer border border-neutral-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConnect}
                  disabled={!uri.trim() || loading}
                  className="w-2/3 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs tracking-wider uppercase rounded-full transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                  <span>Connect</span>
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-mono text-neutral-400 uppercase tracking-wider block mb-2 font-semibold">
                  Select Database
                </label>
                {loading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-2">
                    {databases.map(db => (
                      <button
                        key={db}
                        onClick={() => setSelectedDb(db)}
                        className={`p-3 rounded-xl border text-sm font-medium text-left transition-all cursor-pointer ${
                          selectedDb === db
                            ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
                            : 'bg-[#0a0a0a] border-neutral-800 text-neutral-300 hover:border-neutral-600'
                        }`}
                      >
                        {db}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="w-1/3 py-3 bg-[#0a0a0a] hover:bg-neutral-800 text-neutral-300 font-bold text-xs tracking-wider uppercase rounded-full transition-all flex items-center justify-center gap-2 cursor-pointer border border-neutral-800"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>
                <button
                  onClick={handleSelectDb}
                  disabled={!selectedDb || loading}
                  className="w-2/3 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs tracking-wider uppercase rounded-full transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                  <span>Next</span>
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-mono text-neutral-400 uppercase tracking-wider font-semibold">
                    Select Collections
                  </label>
                  <span className="text-xs text-neutral-500">{selectedCollections.length} selected</span>
                </div>
                {loading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-2">
                    {collections.map(col => (
                      <button
                        key={col}
                        onClick={() => toggleCollection(col)}
                        className={`p-3 rounded-xl border text-sm font-medium flex items-center justify-between transition-all cursor-pointer ${
                          selectedCollections.includes(col)
                            ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
                            : 'bg-[#0a0a0a] border-neutral-800 text-neutral-400 hover:border-neutral-600'
                        }`}
                      >
                        <span>{col}</span>
                        {selectedCollections.includes(col) && <Check className="w-4 h-4 text-emerald-400" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setStep(2)}
                  className="w-1/3 py-3 bg-[#0a0a0a] hover:bg-neutral-800 text-neutral-300 font-bold text-xs tracking-wider uppercase rounded-full transition-all flex items-center justify-center gap-2 cursor-pointer border border-neutral-800"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>
                <button
                  onClick={handleImport}
                  disabled={selectedCollections.length === 0 || loading}
                  className="w-2/3 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs tracking-wider uppercase rounded-full transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shadow-[0_0_20px_rgba(16,185,129,0.3)]"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                  <span>Import</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
