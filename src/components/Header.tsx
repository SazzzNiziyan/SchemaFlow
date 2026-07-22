import React from 'react';
import { Undo, Redo, Search, Bell, Download, ZoomIn, ZoomOut, Maximize2, Sparkles } from 'lucide-react';

interface HeaderProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onOpenExport: () => void;
  onOpenAiGenerator: () => void;
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  onResetCanvas: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  searchQuery,
  setSearchQuery,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onOpenExport,
  onOpenAiGenerator,
  zoom,
  setZoom,
  onResetCanvas,
}) => {
  return (
    <header className="flex justify-between items-center px-6 h-16 w-full fixed top-0 z-50 bg-[#0a0a0a]/90 backdrop-blur-xl border-b border-neutral-800 shadow-sm">
      {/* Brand Logo */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white shadow-[0_0_15px_rgba(99,102,241,0.4)]">
          SF
        </div>
        <span className="font-bold text-xl tracking-tight text-white">
          SCHEMA<span className="text-indigo-400">FLOW</span>
        </span>
      </div>

      {/* Search Bar */}
      <div className="flex-1 flex justify-start pl-12 max-w-xl">
        <div className="relative w-72">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400 w-4 h-4" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search collections or fields..."
            className="w-full bg-[#141414] border border-neutral-800 rounded-full py-1.5 pl-10 pr-4 text-xs text-white placeholder:text-neutral-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
          />
        </div>
      </div>

      {/* Top Right Action Tools */}
      <div className="flex items-center gap-2">
        {/* Zoom Controls */}
        <div className="flex items-center gap-1 bg-[#141414] border border-neutral-800 rounded-full px-2 py-1 mr-2 text-xs text-neutral-300">
          <button
            onClick={() => setZoom((z) => Math.max(0.4, z - 0.1))}
            className="p-1 hover:text-white transition-colors rounded-full"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="font-mono text-[11px] w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => setZoom((z) => Math.min(2.0, z + 0.1))}
            className="p-1 hover:text-white transition-colors rounded-full"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onResetCanvas}
            className="p-1 hover:text-white transition-colors rounded-full ml-0.5 border-l border-neutral-800 pl-1.5"
            title="Reset Canvas View"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* AI Quick Button */}
        <button
          onClick={onOpenAiGenerator}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 text-xs font-semibold transition-all shadow-[0_0_15px_rgba(99,102,241,0.2)] mr-2 cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          <span>AI Generator</span>
        </button>

        {/* Undo / Redo */}
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className={`p-2 transition-colors rounded-full ${
            canUndo ? 'text-neutral-300 hover:bg-neutral-800 hover:text-white' : 'text-neutral-600 cursor-not-allowed'
          }`}
          title="Undo (Ctrl+Z)"
        >
          <Undo className="w-4 h-4" />
        </button>

        <button
          onClick={onRedo}
          disabled={!canRedo}
          className={`p-2 transition-colors rounded-full ${
            canRedo ? 'text-neutral-300 hover:bg-neutral-800 hover:text-white' : 'text-neutral-600 cursor-not-allowed'
          }`}
          title="Redo (Ctrl+Y)"
        >
          <Redo className="w-4 h-4" />
        </button>

        {/* Export Code */}
        <button
          onClick={onOpenExport}
          className="p-2 text-neutral-300 hover:text-white hover:bg-neutral-800 transition-colors rounded-full"
          title="Export Schema Code"
        >
          <Download className="w-4 h-4" />
        </button>

        <button
          className="p-2 text-neutral-300 hover:text-white hover:bg-neutral-800 transition-colors rounded-full"
          title="Notifications"
        >
          <Bell className="w-4 h-4" />
        </button>

        {/* User Avatar */}
        <div className="h-8 w-8 rounded-full bg-neutral-800 border border-neutral-700 cursor-pointer ml-2 flex items-center justify-center font-bold text-xs text-white">
          PA
        </div>
      </div>
    </header>
  );
};
