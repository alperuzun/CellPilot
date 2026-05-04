import React, { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, KeyRound, Loader2, RefreshCw, Trash2 } from 'lucide-react';

import { ApiKeyStatus, ApiKeyStatusByProvider, ChatProvider, api } from '../services/api';
import { useTheme } from '../theme/ThemeContext';

const PROVIDERS: { id: ChatProvider; label: string; placeholder: string; helpUrl: string }[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    placeholder: 'sk-...',
    helpUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    placeholder: 'sk-ant-...',
    helpUrl: 'https://console.anthropic.com/settings/keys',
  },
];

type RowAction = 'idle' | 'saving' | 'validating' | 'deleting';

interface RowState {
  action: RowAction;
  draft: string;
  showDraft: boolean;
  editing: boolean;
}

const INITIAL_ROW: RowState = { action: 'idle', draft: '', showDraft: false, editing: false };

function statusPill(status: ApiKeyStatus | undefined, accent: { ok: string; warn: string; bad: string; muted: string }) {
  if (!status || !status.configured) {
    return { label: 'Not configured', color: accent.muted };
  }
  if (status.valid === true) {
    return { label: 'Valid', color: accent.ok };
  }
  if (status.valid === false) {
    return { label: status.error ? `Invalid: ${status.error}` : 'Invalid', color: accent.bad };
  }
  return { label: 'Configured (untested)', color: accent.warn };
}

export default function Settings() {
  const { colors } = useTheme();
  const [statuses, setStatuses] = useState<ApiKeyStatusByProvider | null>(null);
  const [rowState, setRowState] = useState<Record<ChatProvider, RowState>>({
    openai: { ...INITIAL_ROW },
    anthropic: { ...INITIAL_ROW },
  });
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const accent = useMemo(
    () => ({ ok: colors.success, warn: colors.accent, bad: colors.danger, muted: colors.textMuted }),
    [colors],
  );

  const refresh = async () => {
    try {
      const res = await api.getApiKeyStatus();
      setStatuses(res);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Failed to load API key status');
    }
  };

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  const updateRow = (provider: ChatProvider, patch: Partial<RowState>) =>
    setRowState((prev) => ({ ...prev, [provider]: { ...prev[provider], ...patch } }));

  const handleSave = async (provider: ChatProvider) => {
    const draft = rowState[provider].draft.trim();
    if (!draft) return;
    setGlobalError(null);
    updateRow(provider, { action: 'saving' });
    try {
      const next = await api.setApiKey(provider, draft);
      setStatuses((prev) => ({ ...(prev ?? ({} as ApiKeyStatusByProvider)), [provider]: next }));
      updateRow(provider, { action: 'idle', draft: '', editing: false, showDraft: false });
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : `Failed to save ${provider} key`);
      updateRow(provider, { action: 'idle' });
    }
  };

  const handleValidate = async (provider: ChatProvider) => {
    setGlobalError(null);
    updateRow(provider, { action: 'validating' });
    try {
      const next = await api.validateApiKey(provider);
      setStatuses((prev) => ({ ...(prev ?? ({} as ApiKeyStatusByProvider)), [provider]: next }));
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : `Failed to validate ${provider} key`);
    } finally {
      updateRow(provider, { action: 'idle' });
    }
  };

  const handleDelete = async (provider: ChatProvider) => {
    setGlobalError(null);
    updateRow(provider, { action: 'deleting' });
    try {
      const next = await api.deleteApiKey(provider);
      setStatuses((prev) => ({ ...(prev ?? ({} as ApiKeyStatusByProvider)), [provider]: next }));
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : `Failed to delete ${provider} key`);
    } finally {
      updateRow(provider, { action: 'idle' });
    }
  };

  return (
    <div className="p-8 max-w-3xl mx-auto" style={{ color: colors.textPrimary }}>
      <div className="flex items-center gap-2 mb-1">
        <KeyRound size={20} />
        <h2 className="text-2xl font-bold">Settings</h2>
      </div>
      <p className="text-sm mb-8" style={{ color: colors.textSecondary }}>
        Manage your LLM provider API keys. Keys are stored on this machine in <code>backend/.env</code>.
      </p>

      {globalError && (
        <div
          className="mb-6 px-4 py-3 rounded text-sm"
          style={{ background: 'rgba(220, 38, 38, 0.1)', border: `1px solid ${colors.danger}`, color: colors.danger }}
        >
          {globalError}
        </div>
      )}

      <section
        className="rounded-lg overflow-hidden"
        style={{ background: colors.bgSecondary, border: `1px solid ${colors.borderPrimary}` }}
      >
        <div
          className="px-5 py-3 flex items-center justify-between"
          style={{ background: colors.bgTertiary, borderBottom: `1px solid ${colors.borderPrimary}` }}
        >
          <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: colors.textSecondary }}>
            LLM Providers
          </h3>
          <button
            onClick={() => refresh()}
            className="text-xs flex items-center gap-1.5 px-2 py-1 rounded transition-colors"
            style={{ color: colors.textMuted }}
            disabled={loading}
            title="Reload status"
          >
            <RefreshCw size={12} />
            Reload
          </button>
        </div>

        {PROVIDERS.map(({ id, label, placeholder, helpUrl }, idx) => {
          const status = statuses?.[id];
          const row = rowState[id];
          const pill = statusPill(status, accent);
          return (
            <div
              key={id}
              className="px-5 py-4"
              style={{
                borderBottom: idx === PROVIDERS.length - 1 ? 'none' : `1px solid ${colors.borderPrimary}`,
              }}
            >
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-base">{label}</span>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ color: pill.color, border: `1px solid ${pill.color}` }}
                  >
                    {pill.label}
                  </span>
                  {status?.last_validated && (
                    <span className="text-[11px]" style={{ color: colors.textMuted }}>
                      checked {new Date(status.last_validated).toLocaleString()}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {status?.configured && !row.editing && (
                    <button
                      onClick={() => handleValidate(id)}
                      disabled={row.action !== 'idle'}
                      className="text-xs px-3 py-1.5 rounded font-medium transition-colors disabled:opacity-60"
                      style={{ background: colors.bgTertiary, color: colors.textPrimary, border: `1px solid ${colors.borderPrimary}` }}
                    >
                      {row.action === 'validating' ? <Loader2 size={12} className="animate-spin inline" /> : 'Test'}
                    </button>
                  )}
                  <button
                    onClick={() => updateRow(id, { editing: true, draft: '' })}
                    disabled={row.action !== 'idle'}
                    className="text-xs px-3 py-1.5 rounded font-medium transition-colors disabled:opacity-60"
                    style={{ background: colors.accent, color: '#fff' }}
                  >
                    {status?.configured ? 'Replace' : 'Add key'}
                  </button>
                  {status?.configured && (
                    <button
                      onClick={() => handleDelete(id)}
                      disabled={row.action !== 'idle'}
                      className="p-1.5 rounded transition-colors disabled:opacity-60"
                      style={{ color: colors.danger }}
                      title="Remove key"
                    >
                      {row.action === 'deleting' ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                    </button>
                  )}
                </div>
              </div>

              {row.editing && (
                <div className="mt-3 flex items-center gap-2">
                  <div className="flex-1 relative">
                    <input
                      type={row.showDraft ? 'text' : 'password'}
                      value={row.draft}
                      onChange={(e) => updateRow(id, { draft: e.target.value })}
                      placeholder={placeholder}
                      className="w-full px-3 py-1.5 pr-9 rounded text-sm font-mono outline-none"
                      style={{
                        background: colors.bgTertiary,
                        border: `1px solid ${colors.borderPrimary}`,
                        color: colors.textPrimary,
                      }}
                      autoFocus
                    />
                    <button
                      onClick={() => updateRow(id, { showDraft: !row.showDraft })}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded"
                      style={{ color: colors.textMuted }}
                      tabIndex={-1}
                    >
                      {row.showDraft ? <EyeOff size={12} /> : <Eye size={12} />}
                    </button>
                  </div>
                  <button
                    onClick={() => handleSave(id)}
                    disabled={row.action !== 'idle' || !row.draft.trim()}
                    className="text-xs px-3 py-1.5 rounded font-medium disabled:opacity-60"
                    style={{ background: colors.success, color: '#fff' }}
                  >
                    {row.action === 'saving' ? <Loader2 size={12} className="animate-spin inline" /> : 'Save & test'}
                  </button>
                  <button
                    onClick={() => updateRow(id, { editing: false, draft: '', showDraft: false })}
                    disabled={row.action !== 'idle'}
                    className="text-xs px-3 py-1.5 rounded font-medium"
                    style={{ background: colors.bgTertiary, color: colors.textPrimary, border: `1px solid ${colors.borderPrimary}` }}
                  >
                    Cancel
                  </button>
                </div>
              )}

              {!row.editing && !status?.configured && (
                <p className="mt-2 text-xs" style={{ color: colors.textMuted }}>
                  Get a key from{' '}
                  <a href={helpUrl} target="_blank" rel="noreferrer" style={{ color: colors.accent }}>
                    {helpUrl.replace('https://', '')}
                  </a>
                  .
                </p>
              )}
            </div>
          );
        })}
      </section>

      <p className="text-xs mt-4" style={{ color: colors.textMuted }}>
        Keys are written to <code>backend/.env</code> on save and are never sent back to the frontend.
      </p>
    </div>
  );
}
