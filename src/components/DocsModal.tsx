import React from 'react';
import { BookOpen, X, Code, Database, Key, ShieldCheck, Sparkles } from 'lucide-react';

interface DocsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DocsModal: React.FC<DocsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="w-full max-w-2xl bg-[#141414] border border-neutral-800 rounded-[2rem] shadow-2xl overflow-hidden flex flex-col h-[550px]">
        {/* Header */}
        <div className="p-5 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-indigo-400" />
            </div>
            <h3 className="text-base font-bold text-white">SchemaForge Documentation & Cheat Sheet</h3>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-white p-1.5 rounded-full transition-colors cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs text-neutral-300 leading-relaxed">
          {/* Section 1 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-bold text-indigo-300">
              <Database className="w-4 h-4 text-indigo-400" />
              <span>1. Visual Schema Canvas & Drag Modeling</span>
            </div>
            <p className="text-neutral-400">
              SchemaForge allows you to visually design and model MongoDB collections, PostgreSQL tables, and Prisma ORM schemas.
              Drag collection cards anywhere on the canvas, add custom fields, set data types (String, Number, Date, Boolean, ObjectId, UUID, JSON), and configure validation constraints.
            </p>
          </div>

          {/* Section 2 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-bold text-indigo-300">
              <Key className="w-4 h-4 text-emerald-400" />
              <span>2. Foreign Keys & Relationship Mapping</span>
            </div>
            <p className="text-neutral-400">
              Select any field in the Right Field Inspector, check <span className="font-mono text-indigo-400">Foreign Key Relation</span>, and select a target collection & field.
              SchemaForge will render smooth, animated Bezier connection paths connecting references (e.g. <span className="font-mono text-indigo-300">Users._id</span> → <span className="font-mono text-indigo-300">Posts.authorId</span>).
            </p>
          </div>

          {/* Section 3 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-bold text-indigo-300">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <span>3. AI Generator via Gemini API</span>
            </div>
            <p className="text-neutral-400">
              Click the <span className="font-mono text-indigo-300">AI Generator</span> button in the top bar or left navigation. Enter any plain English description (e.g. "Hospital EHR system with Patients, Doctors, Prescriptions, and Invoices") or pick an industry template. Gemini constructs complete collections, typed fields, and foreign keys automatically.
            </p>
          </div>

          {/* Section 4 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-bold text-indigo-300">
              <Code className="w-4 h-4 text-indigo-400" />
              <span>4. Multi-Framework Code Exporter</span>
            </div>
            <p className="text-neutral-400">
              As you modify your visual canvas, the bottom Code Drawer generates real-time, syntax-valid code for:
            </p>
            <ul className="list-disc list-inside text-neutral-400 space-y-1 font-mono pl-2">
              <li>Mongoose v7 schemas & models</li>
              <li>Prisma Client schema (.prisma)</li>
              <li>PostgreSQL ANSI SQL CREATE TABLE DDL</li>
              <li>Drizzle ORM TypeScript table definitions</li>
              <li>TypeScript interfaces</li>
              <li>JSON Schema draft-07</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-neutral-800 bg-[#141414] flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-full transition-colors cursor-pointer shadow-[0_0_15px_rgba(99,102,241,0.3)]"
          >
            Got It
          </button>
        </div>
      </div>
    </div>
  );
};
