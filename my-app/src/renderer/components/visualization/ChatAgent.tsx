import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Send, User, Bot, KeyRound, Settings2, Trash2, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

import {
  ApiKeyStatusByProvider,
  ChatErrorCode,
  ChatProvider,
  LlmModelOption,
  api,
} from '../../services/api';
import { useVizTheme } from '../../theme/ThemeContext';

interface ChatAgentProps {
  datasetPath: string;
  selectedCluster: string | null;
  selectedCells?: string[];
  onOpenSettings?: () => void;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const PROVIDER_LABELS: Record<ChatProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
};

const FALLBACK_MODELS: Record<ChatProvider, LlmModelOption[]> = {
  openai: [
    { id: 'gpt-4o', label: 'GPT-4o (Best Overall)' },
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini (Fastest)' },
  ],
  anthropic: [
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (Fastest)' },
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (Balanced)' },
  ],
};

const STORAGE_KEYS = {
  provider: 'cellpilot.chat.provider',
  model: 'cellpilot.chat.model',
};

const HISTORY_PREFIX = 'cellpilot.chat.history:';
const HISTORY_MAX_MESSAGES = 200;

const INITIAL_MESSAGE: Message = {
  role: 'assistant',
  content:
    'Hi — I can help interpret clusters, lasso selections, or your dataset overall. Pick a cluster on the UMAP or lasso a region, then ask a question.',
};

function historyKey(datasetPath: string): string {
  return `${HISTORY_PREFIX}${datasetPath}`;
}

function readPersistedHistory(datasetPath: string): Message[] {
  if (!datasetPath) return [INITIAL_MESSAGE];
  try {
    const raw = sessionStorage.getItem(historyKey(datasetPath));
    if (!raw) return [INITIAL_MESSAGE];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return [INITIAL_MESSAGE];
    return parsed.filter(
      (m): m is Message => !!m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string',
    );
  } catch {
    return [INITIAL_MESSAGE];
  }
}

function writePersistedHistory(datasetPath: string, messages: Message[]): void {
  if (!datasetPath) return;
  try {
    const trimmed = messages.length > HISTORY_MAX_MESSAGES
      ? messages.slice(messages.length - HISTORY_MAX_MESSAGES)
      : messages;
    sessionStorage.setItem(historyKey(datasetPath), JSON.stringify(trimmed));
  } catch {
    // sessionStorage full or unavailable — non-fatal
  }
}

function readPersistedProvider(): ChatProvider {
  const stored = localStorage.getItem(STORAGE_KEYS.provider);
  return stored === 'anthropic' ? 'anthropic' : 'openai';
}

function readPersistedModel(provider: ChatProvider, models: LlmModelOption[]): string {
  const stored = localStorage.getItem(STORAGE_KEYS.model);
  if (stored && models.some((m) => m.id === stored)) return stored;
  return models[0]?.id ?? '';
}

export default function ChatAgent({
  datasetPath,
  selectedCluster,
  selectedCells = [],
  onOpenSettings,
}: ChatAgentProps) {
  const { v, isDark, colors } = useVizTheme();

  const [messages, setMessages] = useState<Message[]>(() => readPersistedHistory(datasetPath));
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [hideLabels, setHideLabels] = useState(false);
  const [keyStatus, setKeyStatus] = useState<ApiKeyStatusByProvider | null>(null);
  const [models, setModels] = useState<Record<ChatProvider, LlmModelOption[]>>(FALLBACK_MODELS);
  const [provider, setProvider] = useState<ChatProvider>(readPersistedProvider);
  const [model, setModel] = useState<string>('');
  const [missingKeyBanner, setMissingKeyBanner] = useState<{ provider: ChatProvider; code: ChatErrorCode; reason?: string } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const currentMode = useMemo<'global' | 'cluster' | 'selection'>(() => {
    if (selectedCluster) return 'cluster';
    if (selectedCells.length > 0) return 'selection';
    return 'global';
  }, [selectedCluster, selectedCells.length]);

  useEffect(() => {
    let cancelled = false;
    api.getLlmModels()
      .then((res) => {
        if (cancelled) return;
        setModels({
          openai: res.openai?.length ? res.openai : FALLBACK_MODELS.openai,
          anthropic: res.anthropic?.length ? res.anthropic : FALLBACK_MODELS.anthropic,
        });
      })
      .catch(() => undefined);
    api.getApiKeyStatus()
      .then((res) => { if (!cancelled) setKeyStatus(res); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const list = models[provider];
    setModel(readPersistedModel(provider, list));
  }, [provider, models]);

  useEffect(() => {
    if (model) localStorage.setItem(STORAGE_KEYS.model, model);
  }, [model]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.provider, provider);
    setMissingKeyBanner(null);
  }, [provider]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Reload history when the active dataset changes (different h5ad → different chat).
  useEffect(() => {
    setMessages(readPersistedHistory(datasetPath));
  }, [datasetPath]);

  // Persist on every change so a tab switch / reload keeps the conversation.
  useEffect(() => {
    writePersistedHistory(datasetPath, messages);
  }, [datasetPath, messages]);

  const clearHistory = () => {
    setMessages([INITIAL_MESSAGE]);
    if (datasetPath) {
      try { sessionStorage.removeItem(historyKey(datasetPath)); } catch { /* ignore */ }
    }
  };

  const refreshKeyStatus = async () => {
    try {
      const res = await api.getApiKeyStatus();
      setKeyStatus(res);
    } catch {
      // surfaced via the chat error path if relevant
    }
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setLoading(true);
    setMissingKeyBanner(null);

    const newMessages: Message[] = [...messages, { role: 'user', content: userMessage }];
    setMessages(newMessages);

    try {
      const res = await api.chat({
        message: userMessage,
        selection_id: selectedCluster || 'all',
        input_path: datasetPath,
        history: newMessages.slice(-10),
        model,
        provider,
        mode: currentMode,
        cell_ids: currentMode === 'selection' ? selectedCells : undefined,
        hide_labels: hideLabels,
      });

      if ('error' in res) {
        setMissingKeyBanner({ provider: res.provider, code: res.error, reason: res.reason });
        await refreshKeyStatus();
      } else {
        setMessages((prev) => [...prev, { role: 'assistant', content: res.response }]);
      }
    } catch (error) {
      console.error('Chat error', error);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Something went wrong while contacting the AI service. Try again, or check the backend logs.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const providerStatus = keyStatus?.[provider];
  const providerStatusLabel = !providerStatus
    ? 'Loading status…'
    : !providerStatus.configured
      ? 'Not configured'
      : providerStatus.valid === true
        ? 'Connected'
        : providerStatus.valid === false
          ? `Invalid: ${providerStatus.error ?? 'unknown'}`
          : 'Configured (untested)';

  const providerStatusColor = !providerStatus?.configured
    ? v.textMuted
    : providerStatus?.valid === true
      ? colors.green
      : providerStatus?.valid === false
        ? colors.red
        : colors.blue;

  const modelLabel = useMemo(() => {
    const list = models[provider] ?? [];
    return list.find((m) => m.id === model)?.label ?? model;
  }, [models, provider, model]);

  const providerForModel = (modelId: string): ChatProvider | null => {
    for (const p of Object.keys(models) as ChatProvider[]) {
      if (models[p]?.some((m) => m.id === modelId)) return p;
    }
    const lower = modelId.toLowerCase();
    if (lower.startsWith('claude')) return 'anthropic';
    if (lower.startsWith('gpt-') || lower.startsWith('o1') || lower.startsWith('o3') || lower.startsWith('o4') || lower.startsWith('o5') || lower.startsWith('chatgpt-')) {
      return 'openai';
    }
    return null;
  };

  const handleModelSelect = (value: string) => {
    if (value === '__custom__') {
      const entered = window.prompt('Enter a model ID (e.g. gpt-5.3-preview, claude-opus-5):');
      if (!entered) return;
      const trimmed = entered.trim();
      if (!trimmed) return;
      const inferred = providerForModel(trimmed);
      if (!inferred) {
        window.alert(`Could not infer a provider for "${trimmed}". Use a model id starting with gpt-/o3-/claude-.`);
        return;
      }
      setProvider(inferred);
      setModel(trimmed);
      return;
    }
    const inferred = providerForModel(value);
    if (inferred && inferred !== provider) setProvider(inferred);
    setModel(value);
  };

  const isCustomModel = !(models[provider] ?? []).some((m) => m.id === model);

  return (
    <div className="flex flex-col h-full overflow-hidden relative" style={{ backgroundColor: v.panelBg, color: v.textBody }}>
      <div className="flex justify-between items-center p-2" style={{ borderBottom: `1px solid ${v.panelBorder}`, backgroundColor: v.panelBgSecondary }}>
        <div className="flex items-center gap-3 text-xs flex-wrap">
          <div className="flex items-center gap-1.5" style={{ color: v.textMuted }}>
            <span
              className="w-2 h-2 rounded-full"
              style={{
                backgroundColor:
                  currentMode === 'global' ? colors.blue : currentMode === 'cluster' ? colors.green : colors.purple,
              }}
            />
            <span className="uppercase font-semibold tracking-wider">{currentMode} Context</span>
          </div>
          <span style={{ color: v.textFaint }}>·</span>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: providerStatusColor }} />
            <span style={{ color: v.textFaint }}>{providerStatusLabel}</span>
          </div>
          <span style={{ color: v.textFaint }}>·</span>
          <select
            value={isCustomModel ? '__custom_active__' : model}
            onChange={(e) => handleModelSelect(e.target.value)}
            className="px-1.5 py-0.5 rounded text-[10px] font-mono outline-none cursor-pointer max-w-[260px]"
            style={{ backgroundColor: v.panelBg, color: v.textBody, border: `1px solid ${v.panelBorder}` }}
            title={`Model: ${modelLabel} (${PROVIDER_LABELS[provider]})`}
          >
            {(Object.keys(models) as ChatProvider[]).map((p) => (
              <optgroup key={p} label={PROVIDER_LABELS[p]}>
                {(models[p] ?? []).map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </optgroup>
            ))}
            {isCustomModel && (
              <option value="__custom_active__">{model} (custom)</option>
            )}
            <option value="__custom__">Custom model id…</option>
          </select>
        </div>
        <button
          onClick={() => setShowSettings((v) => !v)}
          className="p-1 rounded transition-colors"
          style={{ color: v.textMuted }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = v.panelBg; e.currentTarget.style.color = v.textHeading; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = v.textMuted; }}
          title="Chat settings"
        >
          <Settings2 size={14} />
        </button>
      </div>

      {showSettings && (
        <div className="absolute top-10 right-2 z-10 w-64 rounded-lg shadow-xl p-3" style={{ backgroundColor: v.panelBgSecondary, border: `1px solid ${v.panelBorder}` }}>
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-semibold" style={{ color: v.textLabel }}>Chat Settings</span>
            <button onClick={() => setShowSettings(false)} style={{ color: v.textFaint }}>
              <X size={12} />
            </button>
          </div>
          <div className="space-y-3">
            <p className="text-[10px]" style={{ color: v.textFaint }}>
              Switch model or provider from the dropdown in the header. Pick &quot;Custom model id…&quot; to use a model not in the list.
            </p>

            <label className="flex items-center gap-2 select-none cursor-pointer">
              <input
                type="checkbox"
                checked={hideLabels}
                onChange={(e) => setHideLabels(e.target.checked)}
                className="w-3 h-3"
              />
              <span className="text-[11px]" style={{ color: v.textLabel }}>Hide existing labels (blind mode)</span>
            </label>

            <button
              onClick={() => {
                if (window.confirm('Clear chat history for this dataset?')) {
                  clearHistory();
                  setShowSettings(false);
                }
              }}
              disabled={messages.length <= 1}
              className="w-full flex items-center justify-center gap-1.5 rounded px-2 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: v.inputBg, color: v.textBody, border: `1px solid ${v.inputBorder}` }}
              onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = v.panelBg; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = v.inputBg; }}
            >
              <Trash2 size={11} />
              Clear chat history
            </button>

            {onOpenSettings && (
              <button
                onClick={() => { setShowSettings(false); onOpenSettings(); }}
                className="w-full flex items-center justify-center gap-1.5 rounded px-2 py-1.5 text-[11px] font-medium transition-colors"
                style={{ backgroundColor: v.inputBg, color: v.textBody, border: `1px solid ${v.inputBorder}` }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = v.panelBg; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = v.inputBg; }}
              >
                <KeyRound size={11} />
                Manage API keys
              </button>
            )}
          </div>
        </div>
      )}

      {missingKeyBanner && (
        <div
          className="px-3 py-2 flex items-center gap-3 text-xs"
          style={{ backgroundColor: v.badgeYellow.bg, color: v.badgeYellow.text, borderBottom: `1px solid ${v.panelBorder}` }}
        >
          <KeyRound size={14} />
          <span className="flex-1">
            Your <strong>{PROVIDER_LABELS[missingKeyBanner.provider]}</strong> key is{' '}
            {missingKeyBanner.code === 'missing_api_key' ? 'not set' : 'invalid'}
            {missingKeyBanner.reason ? ` (${missingKeyBanner.reason})` : ''}.
          </span>
          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="px-2 py-0.5 rounded font-semibold"
              style={{ backgroundColor: v.buttonPrimaryBg, color: v.buttonPrimaryText }}
            >
              Set API key
            </button>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-lg p-3 ${msg.role === 'user' ? 'rounded-br-none' : 'rounded-bl-none'}`}
              style={msg.role === 'user'
                ? { backgroundColor: v.buttonPrimaryBg, color: v.buttonPrimaryText }
                : { backgroundColor: v.panelBgSecondary, color: v.textBody, border: `1px solid ${v.panelBorder}` }}
            >
              <div className="flex items-center gap-2 mb-1 opacity-70 text-xs">
                {msg.role === 'user' ? <User size={12} /> : <Bot size={12} />}
                <span className="uppercase font-semibold tracking-wider">
                  {msg.role === 'user' ? 'You' : 'CellPilot AI'}
                </span>
              </div>
              <div className="text-sm leading-relaxed overflow-hidden">
                <ReactMarkdown
                  components={{
                    p: ({ node, ...props }) => <p className="mb-2 last:mb-0" {...props} />,
                    ul: ({ node, ...props }) => <ul className="list-disc pl-4 mb-2 space-y-1" {...props} />,
                    ol: ({ node, ...props }) => <ol className="list-decimal pl-4 mb-2 space-y-1" {...props} />,
                    li: ({ node, ...props }) => <li className="pl-1" {...props} />,
                    h1: ({ node, ...props }) => <h1 className="text-lg font-bold mb-2 mt-1" {...props} />,
                    h2: ({ node, ...props }) => <h2 className="text-base font-bold mb-2 mt-1" {...props} />,
                    h3: ({ node, ...props }) => <h3 className="text-sm font-bold mb-1 mt-1" {...props} />,
                    blockquote: ({ node, ...props }) => <blockquote className="pl-2 italic my-2" style={{ borderLeft: `2px solid ${v.textFaint}` }} {...props} />,
                    code: ({ node, ...props }) => <code className="rounded px-1 py-0.5 text-xs font-mono" style={{ backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.06)' }} {...props} />,
                    pre: ({ node, ...props }) => <pre className="rounded p-2 overflow-x-auto text-xs font-mono my-2" style={{ backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.06)' }} {...props} />,
                    strong: ({ node, ...props }) => <strong className="font-bold" style={{ color: v.badgeBlue.text }} {...props} />,
                  }}
                >
                  {msg.content}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-lg p-3 rounded-bl-none" style={{ backgroundColor: v.panelBgSecondary, border: `1px solid ${v.panelBorder}` }}>
              <div className="flex gap-1">
                <div className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: v.textFaint, animationDelay: '0ms' }} />
                <div className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: v.textFaint, animationDelay: '150ms' }} />
                <div className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: v.textFaint, animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-3" style={{ backgroundColor: v.panelBgSecondary, borderTop: `1px solid ${v.panelBorder}` }}>
        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              currentMode === 'cluster'
                ? `Ask about Cluster ${selectedCluster}...`
                : currentMode === 'selection'
                  ? `Analyze selection (${selectedCells.length} cells)...`
                  : 'Ask about the global dataset...'
            }
            className="w-full rounded-lg pl-3 pr-10 py-2 text-sm focus:outline-none resize-none max-h-32 min-h-[44px]"
            style={{ backgroundColor: v.inputBg, border: `1px solid ${v.inputBorder}`, color: v.inputText }}
            onFocus={(e) => { e.currentTarget.style.borderColor = v.inputFocusBorder; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = v.inputBorder; }}
            rows={1}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="absolute right-2 bottom-2 p-1.5 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            style={{ backgroundColor: v.buttonPrimaryBg, color: v.buttonPrimaryText }}
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
