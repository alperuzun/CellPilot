import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../services/api';
import { Send, User, Bot, AlertCircle, Settings2, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface ChatAgentProps {
  datasetPath: string;
  selectedCluster: string | null;
  selectedCells?: string[]; // IDs of currently selected cells
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function ChatAgent({ datasetPath, selectedCluster, selectedCells = [] }: ChatAgentProps) {
  const [messages, setMessages] = useState<Message[]>([
    { 
      role: 'assistant', 
      content: 'Hello! I am your AI helper. Select a cluster or use the Lasso tool to analyze specific regions.' 
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [model, setModel] = useState<string>('gpt-4o');
  const [hideLabels, setHideLabels] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Determine current context mode
  const getContextMode = () => {
    if (selectedCluster) return 'cluster';
    if (selectedCells.length > 0) return 'selection';
    return 'global';
  };

  const currentMode = getContextMode();

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Notify when context changes (debounced)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
        if (currentMode === 'cluster') {
            setMessages(prev => [...prev, { role: 'assistant', content: `Context switched to **Cluster ${selectedCluster}**.` }]);
        } else if (currentMode === 'selection') {
            setMessages(prev => [...prev, { role: 'assistant', content: `Context switched to **Custom Selection** (${selectedCells.length} cells).` }]);
        } else {
            // Only show global context message if we haven't just initialized
            if (messages.length > 1) {
                setMessages(prev => [...prev, { role: 'assistant', content: `Context switched to **Global Dataset**.` }]);
            }
        }
    }, 500); // 500ms debounce

    return () => clearTimeout(timeoutId);
  }, [selectedCluster, selectedCells.length, currentMode]); // Depend on length to avoid spam on every selection change

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setLoading(true);

    // Optimistic update
    const newMessages = [
        ...messages,
        { role: 'user' as const, content: userMessage }
    ];
    setMessages(newMessages);

    try {
      const response = await api.chat({
        message: userMessage,
        selection_id: selectedCluster || 'all',
        input_path: datasetPath,
        history: newMessages.slice(-10), // Send last 10 messages for context
        model: model,
        mode: currentMode,
        cell_ids: currentMode === 'selection' ? selectedCells : undefined,
        hide_labels: hideLabels
      });

      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: response.response }
      ]);
    } catch (error) {
      console.error("Chat error:", error);
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: "I encountered an error processing your request. Please try again." }
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

  return (
    <div className="flex flex-col h-full bg-neutral-900 text-gray-100 rounded-lg overflow-hidden relative">
      
      {/* Header / Settings Bar */}
      <div className="flex justify-between items-center p-2 border-b border-neutral-700 bg-neutral-800/50">
        <div className="flex items-center gap-2 text-xs text-gray-400">
            <span className={`w-2 h-2 rounded-full ${
                currentMode === 'global' ? 'bg-blue-500' :
                currentMode === 'cluster' ? 'bg-green-500' : 'bg-purple-500'
            }`}></span>
            <span className="uppercase font-semibold">{currentMode} Context</span>
        </div>
        <button 
            onClick={() => setShowSettings(!showSettings)}
            className="p-1 hover:bg-neutral-700 rounded text-gray-400 hover:text-white transition-colors"
        >
            <Settings2 size={14} />
        </button>
      </div>

      {/* Settings Panel Overlay */}
      {showSettings && (
        <div className="absolute top-10 right-2 z-10 w-48 bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl p-3 animate-in fade-in slide-in-from-top-2">
            <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-semibold text-gray-300">Chat Settings</span>
                <button onClick={() => setShowSettings(false)} className="text-gray-500 hover:text-white">
                    <X size={12} />
                </button>
            </div>
            <div className="space-y-4">
                <div>
                    <label className="block text-xs text-gray-400 mb-1">Model</label>
                    <select 
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs text-white focus:border-blue-500 outline-none"
                    >
                        <option value="gpt-4o">GPT-4o (Best Overall)</option>
                        <option value="gpt-4o-mini">GPT-4o Mini (Fastest)</option>
                        <option value="o1-preview">o1-preview (Reasoning)</option>
                        <option value="o1-mini">o1-mini (Fast Reasoning)</option>
                        <option value="gpt-4-turbo">GPT-4 Turbo (Legacy)</option>
                    </select>
                </div>
                
                <div className="flex items-center gap-2">
                    <input 
                        type="checkbox" 
                        id="hideLabels"
                        checked={hideLabels}
                        onChange={(e) => setHideLabels(e.target.checked)}
                        className="w-3 h-3 rounded bg-neutral-900 border-neutral-700 text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor="hideLabels" className="text-xs text-gray-300 select-none cursor-pointer">
                        Hide Existing Labels (Blind Mode)
                    </label>
                </div>
            </div>
        </div>
      )}

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {messages.map((msg, idx) => (
          <div 
            key={idx} 
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div 
              className={`max-w-[85%] rounded-lg p-3 ${
                msg.role === 'user' 
                  ? 'bg-blue-600 text-white rounded-br-none' 
                  : 'bg-neutral-800 text-gray-200 rounded-bl-none border border-neutral-700'
              }`}
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
                        // Style basic elements to look good in chat
                        p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />,
                        ul: ({node, ...props}) => <ul className="list-disc pl-4 mb-2 space-y-1" {...props} />,
                        ol: ({node, ...props}) => <ol className="list-decimal pl-4 mb-2 space-y-1" {...props} />,
                        li: ({node, ...props}) => <li className="pl-1" {...props} />,
                        h1: ({node, ...props}) => <h1 className="text-lg font-bold mb-2 mt-1" {...props} />,
                        h2: ({node, ...props}) => <h2 className="text-base font-bold mb-2 mt-1" {...props} />,
                        h3: ({node, ...props}) => <h3 className="text-sm font-bold mb-1 mt-1" {...props} />,
                        blockquote: ({node, ...props}) => <blockquote className="border-l-2 border-gray-500 pl-2 italic my-2" {...props} />,
                        code: ({node, ...props}) => <code className="bg-black/30 rounded px-1 py-0.5 text-xs font-mono" {...props} />,
                        pre: ({node, ...props}) => <pre className="bg-black/30 rounded p-2 overflow-x-auto text-xs font-mono my-2" {...props} />,
                        strong: ({node, ...props}) => <strong className="font-bold text-blue-200" {...props} />,
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
            <div className="bg-neutral-800 rounded-lg p-3 rounded-bl-none border border-neutral-700">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-3 bg-neutral-800 border-t border-neutral-700">
        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
                currentMode === 'cluster' ? `Ask about Cluster ${selectedCluster}...` : 
                currentMode === 'selection' ? `Analyze selection (${selectedCells.length} cells)...` :
                "Ask about the global dataset..."
            }
            className="w-full bg-neutral-900 border border-neutral-700 rounded-lg pl-3 pr-10 py-2 text-sm text-white focus:outline-none focus:border-blue-500 resize-none max-h-32 min-h-[44px]"
            rows={1}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="absolute right-2 bottom-2 p-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
