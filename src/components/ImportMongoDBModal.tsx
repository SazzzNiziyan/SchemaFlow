import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Database, X, Loader2, ArrowRight, ArrowLeft, Check } from 'lucide-react';
import { CollectionNode } from '../types';
import { useModal } from '../store/useUIStore';
import { useCanvasCommands } from '../hooks/useCanvasCommands';

export const ImportMongoDBModal: React.FC = () => {
  const { isOpen, close: onClose } = useModal('importMongo');
  const { mergeImportedSchema } = useCanvasCommands();
  const onImport = (cols: CollectionNode[]) => void mergeImportedSchema(cols);
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

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Import from MongoDB"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 glass-backdrop animate-in fade-in"
      onClick={handleReset}
    >
      <div
        className="w-full max-w-lg glass-panel rounded-panel overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-[var(--glass-border)] flex items-center justify-between bg-[var(--glass-surface-elevated)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-card bg-[var(--glass-hover)] border border-[var(--glass-border)] flex items-center justify-center">
              <Database className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[var(--glass-text-primary)]">Import from MongoDB</h3>
              <p className="text-xs text-[var(--glass-text-secondary)]">
                Step {step} of 3
              </p>
            </div>
          </div>
          <button
            onClick={handleReset}
            className="text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)] p-1.5 rounded-control transition-colors cursor-pointer hover:bg-[var(--glass-hover)]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="w-full h-1 bg-[var(--glass-surface-elevated)]">
          <div 
            className="h-full bg-accent transition-all duration-300" 
            style={{ width: `${(step / 3) * 100}%` }}
          />
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {error && (
            <div className="p-3.5 bg-danger-soft border border-danger/30 rounded-control text-xs text-danger font-medium">
              {error}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-mono text-[var(--glass-text-secondary)] uppercase tracking-wider block mb-2 font-semibold">
                  MongoDB Connection URI
                </label>
                <input
                  type="text"
                  value={uri}
                  onChange={(e) => setUri(e.target.value)}
                  placeholder="mongodb+srv://user:pass@cluster.mongodb.net"
                  className="glass-input w-full rounded-card p-4 text-sm text-[var(--glass-text-primary)] placeholder:text-[var(--glass-text-placeholder)] caret-[var(--accent-primary)] focus:outline-none font-mono"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleReset}
                  className="w-1/3 py-3 bg-[var(--glass-surface-elevated)] hover:bg-[var(--glass-hover)] text-[var(--glass-text-primary)] font-semibold text-[13px] rounded-control transition-all flex items-center justify-center cursor-pointer border border-[var(--glass-border)]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConnect}
                  disabled={!uri.trim() || loading}
                  className="w-2/3 py-3 bg-accent hover:bg-accent-hover text-on-accent font-semibold text-[13px] rounded-control transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
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
                <label className="text-xs font-mono text-[var(--glass-text-secondary)] uppercase tracking-wider block mb-2 font-semibold">
                  Select Database
                </label>
                {loading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-8 h-8 text-accent animate-spin" />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-2">
                    {databases.map(db => (
                      <button
                        key={db}
                        onClick={() => setSelectedDb(db)}
                        className={`p-3 rounded-control border text-sm font-medium text-left transition-all cursor-pointer ${
                          selectedDb === db
                            ? 'bg-accent/15 border-accent text-accent font-semibold'
                            : 'bg-[var(--glass-surface-elevated)] border-[var(--glass-border)] text-[var(--glass-text-primary)] hover:bg-[var(--glass-hover)]'
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
                  className="w-1/3 py-3 bg-[var(--glass-surface-elevated)] hover:bg-[var(--glass-hover)] text-[var(--glass-text-primary)] font-semibold text-[13px] rounded-control transition-all flex items-center justify-center gap-2 cursor-pointer border border-[var(--glass-border)]"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>
                <button
                  onClick={handleSelectDb}
                  disabled={!selectedDb || loading}
                  className="w-2/3 py-3 bg-accent hover:bg-accent-hover text-on-accent font-semibold text-[13px] rounded-control transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
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
                  <label className="text-xs font-mono text-[var(--glass-text-secondary)] uppercase tracking-wider font-semibold">
                    Select Collections
                  </label>
                  <span className="text-xs text-[var(--glass-text-secondary)] font-mono">{selectedCollections.length} selected</span>
                </div>
                {loading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-8 h-8 text-accent animate-spin" />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-2">
                    {collections.map(col => (
                      <button
                        key={col}
                        onClick={() => toggleCollection(col)}
                        className={`p-3 rounded-control border text-sm font-medium flex items-center justify-between transition-all cursor-pointer ${
                          selectedCollections.includes(col)
                            ? 'bg-accent/15 border-accent text-[var(--glass-text-primary)] font-semibold'
                            : 'bg-[var(--glass-surface-elevated)] border-[var(--glass-border)] text-[var(--glass-text-secondary)] hover:bg-[var(--glass-hover)] hover:text-[var(--glass-text-primary)]'
                        }`}
                      >
                        <span>{col}</span>
                        {selectedCollections.includes(col) && <Check className="w-4 h-4 text-accent" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setStep(2)}
                  className="w-1/3 py-3 bg-[var(--glass-surface-elevated)] hover:bg-[var(--glass-hover)] text-[var(--glass-text-primary)] font-semibold text-[13px] rounded-control transition-all flex items-center justify-center gap-2 cursor-pointer border border-[var(--glass-border)]"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>
                <button
                  onClick={handleImport}
                  disabled={selectedCollections.length === 0 || loading}
                  className="w-2/3 py-3 bg-accent hover:bg-accent-hover text-on-accent font-semibold text-[13px] rounded-control transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                  <span>Import</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
