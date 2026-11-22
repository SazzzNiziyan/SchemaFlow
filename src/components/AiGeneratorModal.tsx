import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, X, Loader2, Database, Zap, ShieldCheck, ArrowRight } from 'lucide-react';
import { CollectionNode } from '../types';
import { useSchemaStore } from '../store/useSchemaStore';
import { useModal, useUIStore } from '../store/useUIStore';
import { useCanvasCommands } from '../hooks/useCanvasCommands';
import { auditSchema } from '../utils/schemaAuditor';
import { countRelationships } from '../utils/schemaOps';
import { postJson } from '../utils/apiClient';

export const AiGeneratorModal: React.FC = () => {
  const { isOpen, close: onClose } = useModal('ai');
  const framework = useSchemaStore((s) => s.framework);
  const showToast = useUIStore((s) => s.showToast);
  const { applyGeneratedSchema } = useCanvasCommands();

  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const loadingSteps = [
    'Synthesizing domain architecture & models…',
    'Synthesizing relational foreign keys & indexes…',
    'Applying MongoDB anti-pattern safeguards…',
    'Arranging multi-row canvas graph…',
  ];

  useEffect(() => {
    if (!loading) {
      setLoadingStep(0);
      return;
    }
    const interval = setInterval(() => {
      setLoadingStep((s) => (s + 1) % loadingSteps.length);
    }, 1800);
    return () => clearInterval(interval);
  }, [loading]);

  if (!isOpen) return null;

  const quickTemplates = [
    {
      title: 'Fintech Wallet & Ledger',
      prompt:
        'Fintech multi-currency digital wallet with Users, Wallets, LedgerEntries (double-entry accounting), Transactions, PaymentMethods, and FraudAuditLogs.',
    },
    {
      title: 'Food Delivery & Live Riders',
      prompt:
        'On-demand food delivery app with Customers, Restaurants, Menus, MenuItems, Orders, OrderItems, DeliveryRiders, and LiveLocations.',
    },
    {
      title: 'Multi-Tenant SaaS',
      prompt:
        'B2B multi-tenant SaaS platform with Organizations, Users, Roles, Subscriptions, Invoices, Workspaces, and AuditLogs with security indexes.',
    },
    {
      title: 'Healthcare & EHR Clinic',
      prompt:
        'Modern clinic EHR system with Patients, Doctors, Clinics, Appointments, MedicalRecords, Prescriptions, and InsuranceClaims.',
    },
    {
      title: 'Creator & Video Streaming',
      prompt:
        'Video streaming platform with Creators, Channels, Videos, Playlists, Comments, Subscriptions, and AnalyticsEvents.',
    },
  ];

  const handleGenerate = async (selectedPrompt?: string) => {
    const finalPrompt = selectedPrompt || prompt;
    if (!finalPrompt.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const json = await postJson<{ success: boolean; data?: { collections?: CollectionNode[] } }>(
        '/api/generate-schema',
        { prompt: finalPrompt, framework },
      );

      if (json.data && Array.isArray(json.data.collections) && json.data.collections.length > 0) {
        const generatedCols: CollectionNode[] = json.data.collections;

        // Apply generated schema with glide layout animation
        useUIStore.setState({ animateNextLayout: true });
        applyGeneratedSchema(generatedCols);

        // Audit the generated schema for stats toast
        const rels = countRelationships(generatedCols);
        const audit = auditSchema(generatedCols);

        showToast({
          title: '✨ Architecture Generated!',
          description: `Created ${generatedCols.length} collections, ${rels} relationships · Health Score: ${audit.score}/100`,
          type: 'success',
        });

        onClose();
        setPrompt('');
      } else {
        throw new Error('Invalid schema structure received from AI engine.');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred while generating schema.');
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="AI Schema Generator"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 glass-backdrop animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl glass-panel rounded-panel overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-5 border-b border-[var(--glass-border)] flex items-center justify-between bg-[var(--glass-surface-elevated)]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-card bg-[var(--glass-hover)] border border-[var(--glass-border)] flex items-center justify-center text-purple-400">
              <Sparkles className="w-4 h-4 text-purple-400" />
            </div>
            <div>
              <h3 className="text-[15px] font-bold text-[var(--glass-text-primary)]">AI Schema Architect</h3>
              <p className="text-[12px] text-[var(--glass-text-secondary)]">
                Describe your application idea, and Gemini will engineer collections, field validations, and foreign key relations.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)] p-1.5 rounded-control transition hover:bg-[var(--glass-hover)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-5 overflow-y-auto">
          {/* Preset Template Chips */}
          <div>
            <label className="text-[11px] font-mono text-[var(--glass-text-secondary)] uppercase tracking-wider block mb-2 font-semibold">
              Curated Production Prompts
            </label>
            <div className="flex flex-wrap gap-1.5">
              {quickTemplates.map((item) => (
                <button
                  key={item.title}
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    setPrompt(item.prompt);
                    handleGenerate(item.prompt);
                  }}
                  className="px-3 py-1.5 rounded-control bg-[var(--glass-surface-elevated)] hover:bg-[var(--glass-hover)] border border-[var(--glass-border)] text-[11.5px] text-[var(--glass-text-primary)] transition flex items-center gap-1.5 disabled:opacity-50 font-medium"
                >
                  <Zap className="w-3 h-3 text-amber-400" />
                  <span>{item.title}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Custom Prompt Textarea */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-mono text-[var(--glass-text-secondary)] uppercase tracking-wider block font-semibold">
              Or Describe Your Custom Architecture
            </label>
            <textarea
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. Build an IoT fleet telematics database with Vehicles, Drivers, DeviceTelemetry, GeofenceAlerts, and MaintenanceLogs..."
              disabled={loading}
              className="glass-input w-full rounded-card p-3.5 text-[13px] leading-relaxed text-[var(--glass-text-primary)] placeholder:text-[var(--glass-text-placeholder)] caret-[var(--accent-primary)] focus:outline-none font-sans"
            />
          </div>

          {/* Loading status stepper */}
          {loading && (
            <div className="p-3.5 bg-[var(--glass-surface-elevated)] border border-[var(--glass-border)] rounded-control flex items-center gap-3 animate-pulse">
              <Loader2 className="w-4 h-4 text-purple-400 animate-spin shrink-0" />
              <div className="text-[12px] text-[var(--glass-text-primary)] font-medium">
                {loadingSteps[loadingStep]}
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-danger-soft border border-danger/40 rounded-control text-[12px] text-danger font-medium">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-[var(--glass-border)]">
            <div className="flex items-center gap-1.5 text-[11px] text-[var(--glass-text-secondary)]">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Strict BSON types & foreign key resolution</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="btn btn-ghost text-xs text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)] hover:bg-[var(--glass-hover)]"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => handleGenerate()}
                disabled={loading || !prompt.trim()}
                className="btn btn-primary text-xs"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Architecting…</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Generate Schema</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
