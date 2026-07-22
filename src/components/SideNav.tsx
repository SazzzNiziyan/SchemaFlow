import React from 'react';
import { Table, Network, Sparkles, Plus, Settings, BookOpen, Layers, Database } from 'lucide-react';
import { TargetFramework } from '../types';

interface SideNavProps {
  framework: TargetFramework;
  setFramework: (framework: TargetFramework) => void;
  activeTab: 'collections' | 'relationships' | 'ai' | 'docs';
  setActiveTab: (tab: 'collections' | 'relationships' | 'ai' | 'docs') => void;
  onNewSchema: () => void;
  onImportMongoDB: () => void;
  onOpenDocs: () => void;
  collectionsCount: number;
}

export const SideNav: React.FC<SideNavProps> = ({
  framework,
  setFramework,
  activeTab,
  setActiveTab,
  onNewSchema,
  onImportMongoDB,
  onOpenDocs,
  collectionsCount,
}) => {
  return (
    <nav className="fixed left-0 top-16 h-[calc(100vh-64px)] w-[280px] flex flex-col z-40 bg-[#0a0a0a] border-r border-neutral-800 shadow-xl">
      {/* Workspace Header */}
      <div className="p-6 flex flex-col items-center border-b border-neutral-800">
        <div className="w-16 h-16 rounded-2xl bg-[#000000] flex items-center justify-center mb-3 p-2 shadow-md border border-neutral-800 relative">
          <Layers className="w-8 h-8 text-indigo-400" />
        </div>
        <h2 className="font-bold text-lg text-white tracking-tight">Project Alpha</h2>

        {/* Framework Selector Dropdown */}
        <div className="mt-3 relative w-full">
          <select
            value={framework}
            onChange={(e) => setFramework(e.target.value as TargetFramework)}
            className="w-full bg-[#000000] text-xs font-mono text-indigo-300 border border-neutral-800 rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="mongoose">Mongoose v7.0 (MongoDB)</option>
            <option value="prisma">Prisma ORM (PostgreSQL)</option>
            <option value="postgres">PostgreSQL / SQL DDL</option>
            <option value="drizzle">Drizzle ORM (TypeScript)</option>
            <option value="typescript">TypeScript Interfaces</option>
            <option value="jsonSchema">JSON Schema Draft-07</option>
          </select>
        </div>

        {/* New Schema / Collection Button */}
        <button
          onClick={onNewSchema}
          className="mt-5 w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs tracking-wider uppercase rounded-full shadow-[0_0_20px_rgba(99,102,241,0.3)] transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>New Collection</span>
        </button>

        <button
          onClick={onImportMongoDB}
          className="mt-3 w-full py-2.5 px-4 bg-[#000000] hover:bg-neutral-800 border border-neutral-800 text-neutral-300 hover:text-white font-bold text-xs tracking-wider uppercase rounded-full transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
        >
          <Database className="w-4 h-4 text-emerald-400" />
          <span>Import MongoDB</span>
        </button>
      </div>

      {/* Main Navigation */}
      <div className="flex-1 py-4 overflow-y-auto">
        <ul className="space-y-1.5 px-3">
          <li>
            <button
              onClick={() => setActiveTab('collections')}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl font-semibold text-xs tracking-wider uppercase transition-all ${
                activeTab === 'collections'
                  ? 'text-white bg-indigo-600/20 border border-indigo-500/40'
                  : 'text-neutral-400 hover:text-white hover:bg-[#000000]'
              }`}
            >
              <div className="flex items-center gap-3">
                <Table className="w-4 h-4 text-indigo-400" />
                <span>Collections</span>
              </div>
              <span className="bg-neutral-800 text-indigo-300 font-mono text-[10px] px-2 py-0.5 rounded-full font-bold">
                {collectionsCount}
              </span>
            </button>
          </li>

          <li>
            <button
              onClick={() => setActiveTab('relationships')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-semibold text-xs tracking-wider uppercase transition-all ${
                activeTab === 'relationships'
                  ? 'text-white bg-indigo-600/20 border border-indigo-500/40'
                  : 'text-neutral-400 hover:text-white hover:bg-[#000000]'
              }`}
            >
              <Network className="w-4 h-4 text-emerald-400" />
              <span>Relationships</span>
            </button>
          </li>

          <li>
            <button
              onClick={() => setActiveTab('ai')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-semibold text-xs tracking-wider uppercase transition-all ${
                activeTab === 'ai'
                  ? 'text-white bg-indigo-600/20 border border-indigo-500/40'
                  : 'text-neutral-400 hover:text-white hover:bg-[#000000]'
              }`}
            >
              <Sparkles className="w-4 h-4 text-indigo-300" />
              <span>AI Generator</span>
            </button>
          </li>
        </ul>
      </div>

      {/* Footer Navigation */}
      <div className="p-4 border-t border-neutral-800">
        <ul className="space-y-1">
          <li>
            <button
              onClick={onOpenDocs}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-neutral-400 hover:text-white hover:bg-[#000000] transition-colors font-medium text-xs tracking-wider uppercase"
            >
              <BookOpen className="w-4 h-4 text-neutral-400" />
              <span>Docs & Cheat Sheet</span>
            </button>
          </li>
          <li>
            <button
              onClick={onOpenDocs}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-neutral-400 hover:text-white hover:bg-[#000000] transition-colors font-medium text-xs tracking-wider uppercase"
            >
              <Settings className="w-4 h-4 text-neutral-400" />
              <span>Settings</span>
            </button>
          </li>
        </ul>
      </div>
    </nav>
  );
};
