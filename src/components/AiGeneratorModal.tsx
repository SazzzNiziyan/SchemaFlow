import React, { useState } from 'react';
import { Sparkles, X, Loader2, ArrowRight, Database, Check } from 'lucide-react';
import { CollectionNode, TargetFramework } from '../types';

interface AiGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplySchema: (newCollections: CollectionNode[]) => void;
  framework: TargetFramework;
}

export const AiGeneratorModal: React.FC<AiGeneratorModalProps> = ({
  isOpen,
  onClose,
  onApplySchema,
  framework,
}) => {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const quickTemplates = [
    {
      title: 'E-Commerce Store',
      prompt:
        'E-Commerce store with Users, Products, Categories, Orders, OrderItems, Cart, and ProductReviews.',
    },
    {
      title: 'SaaS Multi-Tenant',
      prompt:
        'SaaS platform with Organizations, Users, Roles, Subscriptions, Invoices, Projects, and AuditLogs.',
    },
    {
      title: 'Social Network',
      prompt:
        'Social media app with Users, Posts, Comments, PostLikes, FollowerLinks, DirectMessages, and Notifications.',
    },
    {
      title: 'LMS Learning Portal',
      prompt:
        'Online learning portal with Instructors, Students, Courses, Modules, Lessons, EnrolledCourses, and Certificates.',
    },
    {
      title: 'Healthcare System',
      prompt:
        'Healthcare clinic database with Patients, Doctors, Appointments, MedicalRecords, Prescriptions, and BillingInvoices.',
    },
  ];

  const handleGenerate = async (selectedPrompt?: string) => {
    const finalPrompt = selectedPrompt || prompt;
    if (!finalPrompt.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/generate-schema', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: finalPrompt,
          framework,
        }),
      });

      const json = await response.json();

      if (!response.ok || !json.success) {
        throw new Error(json.error || 'Failed to generate schema');
      }

      if (json.data && Array.isArray(json.data.collections)) {
        onApplySchema(json.data.collections);
        onClose();
        setPrompt('');
      } else {
        throw new Error('Invalid schema structure received');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred while generating schema.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="w-full max-w-2xl bg-[#000000] border border-neutral-800 rounded-[2rem] shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="p-6 border-b border-neutral-800 flex items-center justify-between bg-indigo-950/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-300">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">AI Schema Generator</h3>
              <p className="text-xs text-neutral-400">
                Describe your application idea, and Gemini will generate complete collections, fields, & foreign key relationships.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white p-1.5 rounded-full transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6">
          {/* Preset Template Chips */}
          <div>
            <label className="text-xs font-mono text-neutral-400 uppercase tracking-wider block mb-2 font-semibold">
              Quick Industry Templates
            </label>
            <div className="flex flex-wrap gap-2">
              {quickTemplates.map((item) => (
                <button
                  key={item.title}
                  disabled={loading}
                  onClick={() => {
                    setPrompt(item.prompt);
                    handleGenerate(item.prompt);
                  }}
                  className="px-3.5 py-1.5 rounded-full bg-[#0a0a0a] hover:bg-neutral-800 border border-neutral-800 text-xs text-indigo-300 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 font-medium"
                >
                  <Database className="w-3.5 h-3.5 text-indigo-400" />
                  <span>{item.title}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Custom Prompt Textarea */}
          <div className="space-y-2">
            <label className="text-xs font-mono text-neutral-400 uppercase tracking-wider block font-semibold">
              Custom Prompt
            </label>
            <textarea
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. Build a fitness tracking database with Users, Workouts, Exercises, Logs, Goals, and WorkoutStreak history with validation..."
              disabled={loading}
              className="w-full bg-[#0a0a0a] border border-neutral-800 rounded-2xl p-4 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-sans"
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 font-medium">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-800">
            <button
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-xs font-semibold text-neutral-400 hover:text-white transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              onClick={() => handleGenerate()}
              disabled={loading || !prompt.trim()}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs tracking-wider uppercase rounded-full shadow-[0_0_20px_rgba(99,102,241,0.3)] transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 active:scale-95"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Generating Schema...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Generate Schema</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
