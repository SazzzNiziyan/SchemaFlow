import React, { useState } from 'react';
import { Download, Copy, Check, X, FileCode } from 'lucide-react';
import { CollectionNode, TargetFramework } from '../types';
import { generateCode } from '../utils/codeGenerators';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  collections: CollectionNode[];
  framework: TargetFramework;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  collections,
  framework,
}) => {
  const [activeTab, setActiveTab] = useState<TargetFramework>(framework);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const code = generateCode(collections, activeTab);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    let filename = `schema`;
    let ext = 'ts';
    if (activeTab === 'prisma') ext = 'prisma';
    if (activeTab === 'postgres') ext = 'sql';
    if (activeTab === 'jsonSchema') ext = 'json';

    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="w-full max-w-3xl bg-[#141414] border border-neutral-800 rounded-[2rem] shadow-2xl overflow-hidden flex flex-col h-[600px]">
        {/* Header */}
        <div className="p-5 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
              <FileCode className="w-4 h-4 text-indigo-400" />
            </div>
            <h3 className="text-base font-bold text-white">Export ORM & SQL Code</h3>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-white p-1.5 rounded-full transition-colors cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Format Selector Tabs */}
        <div className="px-5 pt-3 border-b border-neutral-800 flex items-center gap-2 bg-[#0a0a0a] overflow-x-auto">
          {(
            [
              { id: 'mongoose', label: 'Mongoose (JS/TS)' },
              { id: 'prisma', label: 'Prisma Schema' },
              { id: 'postgres', label: 'PostgreSQL DDL' },
              { id: 'drizzle', label: 'Drizzle ORM' },
              { id: 'typescript', label: 'TypeScript Types' },
              { id: 'jsonSchema', label: 'JSON Schema' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TargetFramework)}
              className={`px-3.5 py-2 text-xs font-mono border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-indigo-500 text-indigo-300 font-bold'
                  : 'border-transparent text-neutral-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Code Output Area */}
        <div className="flex-1 p-5 bg-[#0a0a0a] overflow-y-auto font-mono text-xs text-neutral-200">
          <pre className="leading-relaxed">
            <code>{code}</code>
          </pre>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-neutral-800 bg-[#141414] flex items-center justify-between">
          <span className="text-xs text-neutral-400 font-mono">
            {collections.length} Collections / Tables defined
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="px-4 py-2 bg-[#0a0a0a] hover:bg-neutral-800 text-white text-xs font-mono rounded-full border border-neutral-800 transition-colors flex items-center gap-1.5 cursor-pointer font-semibold"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-400 font-bold">Copied to Clipboard!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copy Code</span>
                </>
              )}
            </button>

            <button
              onClick={handleDownload}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-mono font-bold rounded-full transition-colors flex items-center gap-1.5 cursor-pointer shadow-[0_0_15px_rgba(99,102,241,0.3)]"
            >
              <Download className="w-4 h-4" />
              <span>Download File</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
