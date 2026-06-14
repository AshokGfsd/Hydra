'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Memory } from '@/types';

interface MemoryPanelProps {
  open: boolean;
  onClose: () => void;
}

export default function MemoryPanel({ open, onClose }: MemoryPanelProps) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [key, setKey] = useState('');
  const [content, setContent] = useState('');
  const [type, setType] = useState<Memory['type']>('fact');
  const [loading, setLoading] = useState(false);

  const loadMemories = useCallback(async () => {
    try {
      const res = await fetch('/api/memory');
      const data = await res.json();
      setMemories(data.memories || []);
    } catch {}
  }, []);

  useEffect(() => {
    if (open) loadMemories();
  }, [open, loadMemories]);

  const addMemory = async () => {
    if (!key.trim() || !content.trim()) return;
    setLoading(true);
    try {
      await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: key.trim(), content: content.trim(), type }),
      });
      setKey('');
      setContent('');
      await loadMemories();
    } catch {}
    setLoading(false);
  };

  const deleteMemory = async (id: string) => {
    try {
      await fetch(`/api/memory/${id}`, { method: 'DELETE' });
      await loadMemories();
    } catch {}
  };

  if (!open) return null;

  const typeColors: Record<string, string> = {
    task: 'border-l-terminal-accent2',
    fact: 'border-l-terminal-accent',
    preference: 'border-l-terminal-accent3',
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-terminal-surface border border-terminal-border rounded-xl w-full max-w-2xl mx-4 shadow-2xl animate-scale-in flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between p-4 border-b border-terminal-border shrink-0">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <svg className="w-4 h-4 text-terminal-accent3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Memory
          </h2>
          <button onClick={onClose} className="text-terminal-muted hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 border-b border-terminal-border space-y-3 shrink-0">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Key (e.g., user_name, task_format)"
              className="flex-1 bg-terminal-elevated border border-terminal-border rounded-lg px-3 py-2 text-xs text-terminal-text placeholder-terminal-muted focus:outline-none focus:border-terminal-accent/50 font-mono"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
            <select
              value={type}
              onChange={(e) => setType(e.target.value as Memory['type'])}
              className="bg-terminal-elevated border border-terminal-border rounded-lg px-3 py-2 text-xs text-terminal-text focus:outline-none focus:border-terminal-accent/50 font-mono"
            >
              <option value="fact">Fact</option>
              <option value="task">Task</option>
              <option value="preference">Preference</option>
            </select>
          </div>
          <div className="flex gap-2">
            <textarea
              placeholder="Content (what to remember)"
              className="flex-1 bg-terminal-elevated border border-terminal-border rounded-lg px-3 py-2 text-xs text-terminal-text placeholder-terminal-muted focus:outline-none focus:border-terminal-accent/50 font-mono resize-none"
              rows={2}
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
            <button
              onClick={addMemory}
              disabled={loading || !key.trim() || !content.trim()}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-terminal-accent/20 to-terminal-accent3/20 border border-terminal-accent/30 text-terminal-accent text-xs hover:from-terminal-accent/30 hover:to-terminal-accent3/30 transition-all font-mono disabled:opacity-40 shrink-0"
            >
              Save
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {memories.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-xs text-terminal-muted font-mono">No memories yet</p>
              <p className="text-[10px] text-terminal-dim mt-1">Add a fact, task pattern, or preference above</p>
            </div>
          ) : (
            memories.map((m) => (
              <div
                key={m.id}
                className={`flex items-start gap-3 p-3 rounded-lg bg-terminal-elevated border border-terminal-border border-l-2 ${typeColors[m.type] || 'border-l-terminal-accent'}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-mono text-terminal-accent font-bold uppercase">{m.key}</span>
                    <span className="text-[9px] font-mono text-terminal-muted uppercase px-1.5 py-0.5 rounded bg-terminal-border">{m.type}</span>
                  </div>
                  <p className="text-xs text-terminal-text">{m.content}</p>
                </div>
                <button
                  onClick={() => deleteMemory(m.id)}
                  className="text-terminal-dim hover:text-red-400 transition-colors p-1 shrink-0"
                  title="Delete memory"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>

        <div className="p-3 border-t border-terminal-border text-[10px] text-terminal-muted font-mono text-center shrink-0">
          {memories.length} memory {memories.length === 1 ? 'entry' : 'entries'} — injected as context in all chats
        </div>
      </div>
    </div>
  );
}
