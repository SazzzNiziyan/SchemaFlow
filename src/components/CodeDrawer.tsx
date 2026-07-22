import React, { useState } from 'react';
import { Code, Copy, Check, ChevronUp, ChevronDown, Download } from 'lucide-react';
import { CollectionNode, TargetFramework } from '../types';
import { generateCode } from '../utils/codeGenerators';

interface CodeDrawerProps {
  collections: CollectionNode[];
  framework: TargetFramework;
  setFramework: (framework: TargetFramework) => void;
}

export const CodeDrawer: React.FC<CodeDrawerProps> = ({ collections, framework, setFramework }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [copied, setCopied] = useState(false);

  const codeOutput = generateCode(collections, framework);

  const handleCopy = () => {
    navigator.clipboard.writeText(codeOutput);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    let extension = 'ts';
    if (framework === 'prisma') extension = 'prisma';
    if (framework === 'postgres') extension = 'sql';
    if (framework === 'jsonSchema') extension = 'json';

    const blob = new Blob([codeOutput], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `schema.${extension}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getFrameworkLabel = (fw: TargetFramework) => {
    switch (fw) {
      case 'mongoose':
        return 'Mongoose Output';
      case 'prisma':
        return 'Prisma Schema';
      case 'postgres':
        return 'PostgreSQL DDL';
      case 'drizzle':
        return 'Drizzle ORM';
      case 'typescript':
        return 'TypeScript Types';
      case 'jsonSchema':
        return 'JSON Schema';
    }
  };

  return (
    <div
      className={`fixed bottom-0 left-70 right-[320px] bg-[#0a0a0a] border-t border-neutral-800 z-20 transition-all duration-300 flex flex-col shadow-[0_-10px_30px_rgba(0,0,0,0.6)] ${
        isExpanded ? 'h-52' : 'h-10'
      }`}
    >
      {/* Drawer Handle / Header */}
      <div className="h-10 px-4 flex items-center justify-between border-b border-neutral-800 bg-[#141414]/90 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-neutral-300 hover:text-white p-1 rounded transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            <Code className="w-4 h-4 text-indigo-400" />
            <span className="font-mono text-xs text-white font-bold">
              {getFrameworkLabel(framework)}
            </span>
          </button>

          {/* Quick Format Switcher Tabs */}
          <div className="hidden sm:flex items-center gap-1 ml-4 bg-[#0a0a0a] rounded-full p-1 border border-neutral-800 text-[11px]">
            {(['mongoose', 'prisma', 'postgres', 'drizzle', 'typescript'] as TargetFramework[]).map(
              (fw) => (
                <button
                  key={fw}
                  onClick={() => setFramework(fw)}
                  className={`px-3 py-0.5 rounded-full font-mono uppercase transition-colors cursor-pointer ${
                    framework === fw
                      ? 'bg-indigo-600 text-white font-bold shadow-[0_0_10px_rgba(99,102,241,0.4)]'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  {fw}
                </button>
              )
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1 text-xs font-mono text-neutral-300 hover:text-white hover:bg-neutral-800 rounded-full transition-colors cursor-pointer"
            title="Copy to Clipboard"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400 font-bold">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>

          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-3 py-1 text-xs font-mono text-neutral-300 hover:text-white hover:bg-neutral-800 rounded-full transition-colors cursor-pointer"
            title="Download File"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download</span>
          </button>
        </div>
      </div>

      {/* Code Content View */}
      {isExpanded && (
        <div className="flex-1 p-4 overflow-y-auto font-mono text-xs text-neutral-200 bg-[#0a0a0a]">
          <pre className="leading-relaxed">
            <code>{codeOutput}</code>
          </pre>
        </div>
      )}
    </div>
  );
};
