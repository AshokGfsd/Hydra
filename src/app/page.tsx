'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { MODELS } from '@/types';
import { marked } from 'marked';
import MarkdownViewer from '@/components/preview/MarkdownViewer';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  reasoning?: string;
}

interface Chat {
  id: string;
  title: string;
  model: string;
  messages: Message[];
  updated_at?: number;
}

interface ChatParams {
  stream: boolean;
  temperature: number;
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
  maxTokens: number;
  stop: string;
  seed: number;
  enableReasoning: boolean;
  reasoningBudget: number;
}

export default function Home() {
  const [chat, setChat] = useState<HTMLDivElement | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sendBtnRef = useRef<HTMLButtonElement>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [mode, setMode] = useState<'local' | 'online'>('local');
  const [isStreaming, setIsStreaming] = useState(false);
  const [model, setModel] = useState(MODELS[0]);
  const [chatList, setChatList] = useState<Chat[]>([]);
  const [lastGeneratedHTML, setLastGeneratedHTML] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [lastGeneratedMD, setLastGeneratedMD] = useState('');
  const [mdPreviewOpen, setMdPreviewOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chatSettingsOpen, setChatSettingsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingText, setLoadingText] = useState('Establishing connection...');
  const [loadingPct, setLoadingPct] = useState(0);
  const [apiKey, setApiKey] = useState('');
  const [showThinking, setShowThinking] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [crtEnabled, setCrtEnabled] = useState(true);
  const [particlesEnabled, setParticlesEnabled] = useState(true);
  const [fontSize, setFontSize] = useState(14);
  const [headerCollapsed, setHeaderCollapsed] = useState(true);
  const [statusText, setStatusText] = useState('// LOCAL_MODE');
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [connectionText, setConnectionText] = useState('Local');
  const [msgCount, setMsgCount] = useState(0);
  const [tokenCount, setTokenCount] = useState('');
  const [chatParams, setChatParams] = useState<ChatParams>({
    stream: true,
    temperature: 0,
    topP: 1,
    frequencyPenalty: 0,
    presencePenalty: 0,
    maxTokens: 65536,
    stop: '',
    seed: 0,
    enableReasoning: false,
    reasoningBudget: 1024,
  });
  const [cmdFilter, setCmdFilter] = useState('');
  const [cmdIndex, setCmdIndex] = useState(0);
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; type: string }>>([]);
  const [confirmState, setConfirmState] = useState<{
    title: string;
    message: string;
    resolve: (v: boolean) => void;
  } | null>(null);

  const toastIdRef = useRef(0);
  const particlesCanvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<any[]>([]);
  const mouseRef = useRef({ x: 0, y: 0 });

  const showToast = useCallback((message: string, type = 'info', duration = 3000) => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), duration);
  }, []);

  const customConfirm = useCallback(
    (title: string, message: string): Promise<boolean> => {
      return new Promise((resolve) => setConfirmState({ title, message, resolve }));
    },
    []
  );

  const updateMsgCount = useCallback((msgs: Message[]) => {
    setMsgCount(msgs.length);
    const approx = Math.round(msgs.reduce((sum, m) => sum + m.content.length / 4, 0));
    setTokenCount(`~${approx} tokens`);
  }, []);

  const fetchApi = useCallback(async (url: string, options?: RequestInit, timeout = 5000) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(url, { ...options, signal: ctrl.signal });
      clearTimeout(t);
      return res;
    } catch {
      clearTimeout(t);
      throw new Error('Request timed out');
    }
  }, []);

  const loadChatList = useCallback(async () => {
    try {
      const res = await fetchApi('/api/chats');
      const data = await res.json();
      setChatList(data.chats || []);
    } catch {
      setChatList([]);
    }
  }, [fetchApi]);

  const openChat = useCallback(
    async (id: string) => {
      setCurrentChatId(id);
      setPreviewOpen(false);
      setLastGeneratedHTML('');
      if (chatRef.current) chatRef.current.innerHTML = '';
      try {
        const res = await fetch(`/api/chats/${id}`);
        const data = await res.json();
        const c = data.chat;
        setMessages(c.messages || []);
        setModel(c.model || MODELS[0]);
        renderMessages(c.messages || []);
      } catch {
        setMessages([]);
      }
      await loadChatList();
      setSidebarOpen(false);
    },
    [loadChatList]
  );

  const newChat = useCallback(async () => {
    try {
      const res = await fetchApi('/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
      });
      const data = await res.json();
      setCurrentChatId(data.chat.id);
      setMessages([]);
      setPreviewOpen(false);
      if (chatRef.current) chatRef.current.innerHTML = '';
      await loadChatList();
      setSidebarOpen(false);
      showToast('New session created', 'success');
    } catch {
      setCurrentChatId(`local-${Date.now()}`);
      setMessages([]);
      if (chatRef.current) chatRef.current.innerHTML = '';
      await loadChatList();
      setSidebarOpen(false);
      showToast('Offline session started', 'info');
    }
  }, [model, fetchApi, loadChatList, showToast]);

  const persistMessage = useCallback(
    async (role: string, content: string) => {
      if (!currentChatId || String(currentChatId).startsWith('local-')) return;
      try {
        await fetchApi(`/api/chats/${currentChatId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role, content }),
        });
        await loadChatList();
      } catch { }
    },
    [currentChatId, fetchApi, loadChatList]
  );

  const enhanceCodeBlocks = useCallback(
    (container: HTMLElement) => {
      container.querySelectorAll('pre code').forEach((block) => {
        const pre = block.parentElement;
        if (!pre || (pre.parentElement && pre.parentElement.classList.contains('code-block'))) return;

        const wrapper = document.createElement('div');
        wrapper.className = 'code-block my-3';
        const header = document.createElement('div');
        header.className = 'code-header';

        let lang = 'text';
        if (block.className) {
          const m = block.className.match(/language-(\w+)/);
          if (m) lang = m[1];
        }
        if (typeof (window as any).Prism !== 'undefined') {
          try {
            (window as any).Prism.highlightElement(block);
          } catch { }
        }
        header.innerHTML = `<span>${lang}</span>`;

        const btnGroup = document.createElement('div');
        btnGroup.className = 'flex items-center gap-2';
        if (lang === 'html') {
          const previewBtn = document.createElement('button');
          previewBtn.textContent = 'Preview';
          previewBtn.onclick = () => {
            setLastGeneratedHTML(block.textContent || '');
            setPreviewOpen(true);
            showToast('HTML preview loaded', 'success');
          };
          btnGroup.appendChild(previewBtn);
        }
        if (lang === 'markdown' || lang === 'md') {
          const mdPreviewBtn = document.createElement('button');
          mdPreviewBtn.textContent = 'Preview MD';
          mdPreviewBtn.onclick = () => {
            setLastGeneratedMD(block.textContent || '');
            setMdPreviewOpen(true);
            showToast('Markdown preview loaded', 'success');
          };
          btnGroup.appendChild(mdPreviewBtn);
        }
        const copyBtn = document.createElement('button');
        copyBtn.textContent = 'Copy';
        copyBtn.onclick = () => {
          navigator.clipboard.writeText(block.textContent || '');
          copyBtn.textContent = 'Copied!';
          setTimeout(() => (copyBtn.textContent = 'Copy'), 1500);
        };
        btnGroup.appendChild(copyBtn);
        header.appendChild(btnGroup);
        pre.parentNode?.insertBefore(wrapper, pre);
        wrapper.appendChild(header);
        wrapper.appendChild(pre);
        (pre as HTMLElement).style.margin = '0';
        (pre as HTMLElement).style.borderRadius = '0 0 8px 8px';
      });
    },
    [showToast]
  );

  const renderMessages = useCallback(
    (msgs: Message[]) => {
      const el = chatRef.current;
      if (!el) return;
      el.innerHTML = '';
      msgs.forEach((m) => {
        addBubbleToDOM(el, m.role, m.content, false);
      });
      updateMsgCount(msgs);
    },
    [updateMsgCount]
  );

  const addBubbleToDOM = useCallback(
    (el: HTMLElement, role: string, text: string, animate: boolean) => {
      const wrapper = document.createElement('div');
      wrapper.className = `flex ${role === 'user' ? 'justify-end' : 'justify-start'} ${animate ? 'animate-slide-up' : ''
        }`;
      const container = document.createElement('div');
      container.className = `max-w-[90%] sm:max-w-[80%] lg:max-w-[70%] ${role === 'user' ? 'ml-auto' : ''
        }`;
      const header = document.createElement('div');
      header.className = 'flex items-center gap-2 mb-1.5';
      if (role === 'user')
        header.innerHTML =
          '<span class="text-[10px] text-terminal-accent font-mono ml-auto">YOU</span>';
      else if (role === 'assistant')
        header.innerHTML =
          '<div class="w-5 h-5 rounded bg-gradient-to-br from-terminal-accent2/30 to-terminal-accent/30 flex items-center justify-center"><span class="text-[8px] text-terminal-accent2 font-bold">AI</span></div><span class="text-[10px] text-terminal-accent2 font-mono">ASSISTANT</span>';
      else
        header.innerHTML =
          '<span class="text-[10px] text-terminal-accent3 font-mono">SYSTEM</span>';
      const bubble = document.createElement('div');
      bubble.className = `rounded-xl px-4 py-3 text-sm leading-relaxed ${role === 'user' ? 'msg-user' : role === 'system' ? 'msg-system' : 'msg-ai'
        }`;
      if (role === 'user') bubble.textContent = text;
      else if (role === 'system')
        bubble.innerHTML = `<span class="text-terminal-accent3 font-mono text-xs">&gt; ${text}</span>`;
      else {
        const mdDiv = document.createElement('div');
        mdDiv.className = 'md-content';
        mdDiv.innerHTML = (marked.parse(text || '') as string) || text;
        bubble.appendChild(mdDiv);
      }
      container.appendChild(header);
      container.appendChild(bubble);
      wrapper.appendChild(container);
      el.appendChild(wrapper);
      if (autoScroll) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      enhanceCodeBlocks(el);
      updateMsgCount(messages);
    },
    [autoScroll, enhanceCodeBlocks, messages, updateMsgCount]
  );

  const renderAssistant = useCallback(
    (bubble: HTMLElement, full: string, reasoning: string) => {
      let out = '';
      if (reasoning && showThinking) {
        out += `<div class="thinking-block"><div class="flex items-center gap-2 mb-1"><span style="font-size:0.75em">🧠</span><span class="text-[10px] text-terminal-accent3 font-mono uppercase">Reasoning</span></div>${(marked.parseInline(reasoning) as string) || reasoning
          }</div>`;
      }
      out += (marked.parse(full || '') as string) || full;
      bubble.innerHTML = `<div class="md-content">${out}</div>`;
      enhanceCodeBlocks(bubble);
      if (autoScroll && chatRef.current)
        chatRef.current.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' });
    },
    [showThinking, autoScroll, enhanceCodeBlocks]
  );

  const addSystemNote = useCallback((text: string): HTMLElement => {
    const el = chatRef.current;
    if (!el) return document.createElement('div');
    const note = document.createElement('div');
    note.className = 'flex justify-center animate-fade-in';
    note.innerHTML = `<div class="flex items-center gap-2 px-4 py-2 rounded-full bg-terminal-elevated border border-terminal-border"><div class="typing-dots"><span></span><span></span><span></span></div><span class="text-[10px] text-terminal-muted font-mono">${text}</span></div>`;
    el.appendChild(note);
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    return note;
  }, []);

  const handleStreamResponse = useCallback(
    async (res: Response, aiBubble: HTMLElement, isOnline = false) => {
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let full = '';
      let reasoning = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = isOnline ? buffer.split('\n') : buffer.split('\n\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const data = trimmed.slice(5).trim();
          if (data === '[DONE]') continue;
          try {
            const json = JSON.parse(data);
            if (json.error) {
              aiBubble.innerHTML = `<div class="md-content"><div class="text-red-400 font-mono text-xs">&gt; ERROR: ${json.error}</div></div>`;
              continue;
            }
            const delta = json.choices?.[0]?.delta || {};
            if (delta.reasoning_content) reasoning += delta.reasoning_content;
            if (delta.content) full += delta.content;
            if (json.text) full += json.text;
            if (json.reasoning) reasoning += json.reasoning;
            if (json.done) continue;
            renderAssistant(aiBubble, full, reasoning);
          } catch { }
        }
      }
      return full;
    },
    [renderAssistant]
  );

  const streamChatLocal = useCallback(async () => {
    setIsStreaming(true);
    const el = chatRef.current;
    if (!el) return;
    const aiBubble = document.createElement('div');
    aiBubble.className = 'flex justify-start animate-slide-up';
    aiBubble.innerHTML = `<div class="max-w-[90%] sm:max-w-[80%] lg:max-w-[70%]"><div class="flex items-center gap-2 mb-1.5"><div class="w-5 h-5 rounded bg-gradient-to-br from-terminal-accent2/30 to-terminal-accent/30 flex items-center justify-center"><span class="text-[8px] text-terminal-accent2 font-bold">AI</span></div><span class="text-[10px] text-terminal-accent2 font-mono">ASSISTANT</span></div><div class="rounded-xl px-4 py-3 text-sm leading-relaxed msg-ai"><div class="md-content"></div></div></div>`;
    el.appendChild(aiBubble);
    const bubbleContent = aiBubble.querySelector('.md-content') as HTMLElement;
    let full = '';
    try {
      const body: Record<string, any> = {
        messages,
        temperature: chatParams.temperature,
        top_p: chatParams.topP,
        frequency_penalty: chatParams.frequencyPenalty,
        presence_penalty: chatParams.presencePenalty,
        max_tokens: chatParams.maxTokens,
        seed: chatParams.seed || undefined,
        stream: chatParams.stream,
      };
      if (chatParams.stop)
        body.stop = chatParams.stop
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean);
      if (chatParams.enableReasoning && chatParams.reasoningBudget > 0) {
        body.reasoning_budget = chatParams.reasoningBudget;
      }
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!chatParams.stream) {
        const data = await res.json();
        full = data.choices?.[0]?.message?.content || '';
        if (bubbleContent)
          bubbleContent.innerHTML = (marked.parse(full) as string) || full;
        enhanceCodeBlocks(aiBubble);
      } else if (res.body) {
        full = await handleStreamResponse(res, aiBubble);
      }
      setMessages((prev) => [...prev, { role: 'assistant', content: full }]);
      if (currentChatId) await persistMessage('assistant', full);
      showToast('Response complete', 'success', 2000);
    } catch (err: any) {
      if (bubbleContent)
        bubbleContent.innerHTML = `<div class="text-red-400 font-mono text-xs">&gt; NETWORK_ERROR: ${err.message}</div>`;
      showToast('Connection failed', 'error');
    }
    setIsStreaming(false);
  }, [messages, chatParams, currentChatId, persistMessage, handleStreamResponse, showToast, enhanceCodeBlocks]);

  const handleSend = useCallback(async () => {
    const text = inputRef.current?.value.trim();
    if (!text || isStreaming) return;
    if (!currentChatId) await newChat();
    if (inputRef.current) {
      inputRef.current.value = '';
      inputRef.current.style.height = 'auto';
    }
    const el = chatRef.current;
    if (el) {
      addBubbleToDOM(el, 'user', text, true);
    }
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    if (currentChatId) await persistMessage('user', text);
    if (mode === 'local') {
      const note = addSystemNote('Analyzing intent...');
      try {
        const intentRes = await fetch('/api/intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: text }),
        });
        const intent = await intentRes.json();
        note.remove();
        if (intent.type === 'create_file') {
          const genNote = addSystemNote('Generating page...');
          const genRes = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: text }),
          });
          const { html } = await genRes.json();
          genNote.remove();
          setLastGeneratedHTML(html);
          setPreviewOpen(true);
          if (el)
            addBubbleToDOM(
              el,
              'assistant',
              'Generated a landing page — preview below. Click **Save** to download or **Copy** to clipboard.',
              true
            );
          showToast('Page generated successfully', 'success');
          return;
        }
      } catch {
        note.remove();
      }
      await streamChatLocal();
    } else {
      setIsStreaming(true);
      const aiBubble = document.createElement('div');
      aiBubble.className = 'flex justify-start animate-slide-up';
      aiBubble.innerHTML = `<div class="max-w-[90%] sm:max-w-[80%] lg:max-w-[70%]"><div class="flex items-center gap-2 mb-1.5"><div class="w-5 h-5 rounded bg-gradient-to-br from-terminal-accent2/30 to-terminal-accent/30 flex items-center justify-center"><span class="text-[8px] text-terminal-accent2 font-bold">AI</span></div><span class="text-[10px] text-terminal-accent2 font-mono">ASSISTANT</span></div><div class="rounded-xl px-4 py-3 text-sm leading-relaxed msg-ai"><div class="md-content"></div></div></div>`;
      el?.appendChild(aiBubble);
      let full = '';
      try {
        const res = await fetch('/api/chat/online-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: [...messages, { role: 'user', content: text }],
            apiKey,
          }),
        });
        if (!res.ok || !res.body) {
          showToast('Online stream failed', 'error');
          setIsStreaming(false);
          return;
        }
        full = await handleStreamResponse(res, aiBubble, true);
        setMessages((prev) => [...prev, { role: 'assistant', content: full }]);
        if (currentChatId) await persistMessage('assistant', full);
        showToast('Response complete', 'success', 2000);
      } catch {
        showToast('Connection failed', 'error');
      }
      setIsStreaming(false);
    }
  }, [isStreaming, currentChatId, newChat, messages, mode, persistMessage, addSystemNote, streamChatLocal, model, apiKey, handleStreamResponse, showToast, addBubbleToDOM]);

  const commands = [
    { name: 'New Chat', shortcut: 'Ctrl+N', action: () => newChat() },
    {
      name: 'Clear Chat',
      shortcut: 'Ctrl+Shift+C',
      action: async () => {
        if (await customConfirm('Clear Session', 'Clear all messages?')) {
          if (currentChatId && !String(currentChatId).startsWith('local-'))
            await fetch(`/api/chats/${currentChatId}`, { method: 'DELETE' });
          await newChat();
          showToast('Session cleared', 'info');
        }
      },
    },
    {
      name: 'Toggle Mode',
      shortcut: 'Ctrl+M',
      action: () => setMode(mode === 'local' ? 'online' : 'local'),
    },
    {
      name: 'Toggle Sidebar',
      shortcut: 'Ctrl+B',
      action: () => setSidebarOpen((v) => !v),
    },
    {
      name: 'Focus Input',
      shortcut: 'Ctrl+/',
      action: () => inputRef.current?.focus(),
    },
    {
      name: 'Open Settings',
      shortcut: 'Ctrl+,',
      action: () => setSettingsOpen((v) => !v),
    },
    {
      name: 'Export Chat',
      shortcut: 'Ctrl+E',
      action: () => exportChat(),
    },
    {
      name: 'Toggle Preview',
      shortcut: 'Ctrl+P',
      action: () => setPreviewOpen((v) => !v),
    },
  ];

  function exportChat() {
    if (!messages.length) return showToast('No messages to export', 'info');
    const data = { title: 'Chat Export', model, exported: new Date().toISOString(), messages };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Chat exported', 'success');
  }

  const filteredCommands = commands.filter((c) =>
    c.name.toLowerCase().includes(cmdFilter.toLowerCase())
  );

  // Init particles
  useEffect(() => {
    const canvas = particlesCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let animId: number;
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);
    class Particle {
      x!: number;
      y!: number;
      size!: number;
      speedX!: number;
      speedY!: number;
      opacity!: number;
      color!: string;
      constructor() {
        this.reset();
      }
      reset() {
        this.x = Math.random() * canvas!.width;
        this.y = Math.random() * canvas!.height;
        this.size = Math.random() * 2 + 0.5;
        this.speedX = (Math.random() - 0.5) * 0.3;
        this.speedY = (Math.random() - 0.5) * 0.3;
        this.opacity = Math.random() * 0.5 + 0.1;
        this.color = Math.random() > 0.5 ? '#00f0ff' : '#ff00a0';
      }
      update() {
        this.x += this.speedX;
        this.y += this.speedY;
        const dx = mouseRef.current.x - this.x;
        const dy = mouseRef.current.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 150) {
          this.x -= dx * 0.01;
          this.y -= dy * 0.01;
        }
        if (this.x < 0 || this.x > canvas!.width || this.y < 0 || this.y > canvas!.height)
          this.reset();
      }
      draw() {
        if (!particlesEnabled) return;
        ctx!.beginPath();
        ctx!.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx!.fillStyle = this.color;
        ctx!.globalAlpha = this.opacity;
        ctx!.fill();
      }
    }
    const particles = Array.from({ length: 60 }, () => new Particle());
    particlesRef.current = particles;
    function animate() {
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);
      particles.forEach((p) => {
        p.update();
        p.draw();
      });
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx!.beginPath();
            ctx!.moveTo(particles[i].x, particles[i].y);
            ctx!.lineTo(particles[j].x, particles[j].y);
            ctx!.strokeStyle = particles[i].color;
            ctx!.globalAlpha = (1 - dist / 120) * 0.08;
            ctx!.lineWidth = 0.5;
            ctx!.stroke();
          }
        }
      }
      ctx!.globalAlpha = 1;
      animId = requestAnimationFrame(animate);
    }
    animate();
    const onMouse = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    document.addEventListener('mousemove', onMouse);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
      document.removeEventListener('mousemove', onMouse);
    };
  }, [particlesEnabled]);

  // Loading sequence
  useEffect(() => {
    const stages = [
      { pct: 25, text: 'Loading modules...' },
      { pct: 50, text: 'Connecting to neural network...' },
      { pct: 75, text: 'Initializing interface...' },
      { pct: 100, text: 'Ready' },
    ];
    let i = 0;
    const run = async () => {
      for (const stage of stages) {
        await new Promise((r) => setTimeout(r, 400));
        setLoadingPct(stage.pct);
        setLoadingText(stage.text);
      }
      await new Promise((r) => setTimeout(r, 300));
      setLoading(false);
    };
    run();
  }, []);

  // Init
  useEffect(() => {
    if (loading) return;
    const init = async () => {
      try {
        const res = await fetchApi('/api/chats');
        const data = await res.json();
        if (data.chats?.length) await openChat(data.chats[0].id);
        else await newChat();
      } catch {
        setCurrentChatId(`local-${Date.now()}`);
        showToast('Running in offline mode', 'info');
        await loadChatList();
      }
    };
    init();
  }, [loading]);

  useEffect(() => {
    updateMsgCount(messages);
  }, [messages, updateMsgCount]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setCmdPaletteOpen((v) => !v);
      }
      if (e.key === 'Escape') {
        setCmdPaletteOpen(false);
        setSettingsOpen(false);
        setChatSettingsOpen(false);
        setConfirmState(null);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        newChat();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
        e.preventDefault();
        exportChat();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        setSidebarOpen((v) => !v);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        setSettingsOpen((v) => !v);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [newChat]);

  // Sync mode with status
  useEffect(() => {
    if (mode === 'online') {
      setStatusText('// ONLINE_MODE');
      setConnectionStatus('online');
      setConnectionText('Online');
    } else {
      setStatusText('// LOCAL_MODE');
      setConnectionStatus('connecting');
      setConnectionText('Local');
      fetch('/api/models')
        .then((r) => r.json())
        .then((d) => {
          setModel(d.current || MODELS[0]);
        })
        .catch(() => { });
    }
  }, [mode]);

  const paramSliders = [
    {
      label: 'Temperature',
      key: 'temperature' as const,
      min: 0,
      max: 1,
      step: 0.01,
      info: 'Controls randomness: 0 = deterministic, 1 = creative',
    },
    {
      label: 'Top P',
      key: 'topP' as const,
      min: 0.01,
      max: 1,
      step: 0.01,
      info: 'Nucleus sampling: lower = more focused',
    },
    {
      label: 'Frequency Penalty',
      key: 'frequencyPenalty' as const,
      min: -2,
      max: 2,
      step: 0.1,
      info: 'Reduces repetition of frequent tokens',
    },
    {
      label: 'Presence Penalty',
      key: 'presencePenalty' as const,
      min: -2,
      max: 2,
      step: 0.1,
      info: 'Encourages new topics',
    },
  ];

  return (
    <>
      <style jsx global>{`
        :root {
          font-family: 'Inter', sans-serif;
        }
        * {
          scrollbar-width: thin;
          scrollbar-color: #1a1a2e transparent;
        }
        *::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        *::-webkit-scrollbar-track {
          background: transparent;
        }
        *::-webkit-scrollbar-thumb {
          background: #1a1a2e;
          border-radius: 3px;
        }
        *::-webkit-scrollbar-thumb:hover {
          background: #2a2a3e;
        }
        body {
          background: #0a0a0f;
          color: #e0e0e8;
          overflow: hidden;
        }
        .crt-overlay {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 9999;
          background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.1) 50%);
          background-size: 100% 4px;
          opacity: 0.15;
        }
        .scanline {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          height: 4px;
          background: rgba(0, 240, 255, 0.03);
          pointer-events: none;
          z-index: 9998;
          animation: scanline 8s linear infinite;
        }
        @keyframes scanline {
          0% {
            transform: translateY(-100%);
          }
          100% {
            transform: translateY(100vh);
          }
        }
        .glow-text {
          text-shadow: 0 0 10px rgba(0, 240, 255, 0.5), 0 0 20px rgba(0, 240, 255, 0.3);
        }
        .glow-text-pink {
          text-shadow: 0 0 10px rgba(255, 0, 160, 0.5), 0 0 20px rgba(255, 0, 160, 0.3);
        }
        .glow-text-green {
          text-shadow: 0 0 10px rgba(57, 255, 20, 0.5), 0 0 20px rgba(57, 255, 20, 0.3);
        }
        .neon-border {
          border: 1px solid rgba(0, 240, 255, 0.2);
          box-shadow: inset 0 0 20px rgba(0, 240, 255, 0.03), 0 0 20px rgba(0, 240, 255, 0.05);
          transition: all 0.3s ease;
        }
        .neon-border:hover {
          border-color: rgba(0, 240, 255, 0.4);
          box-shadow: inset 0 0 30px rgba(0, 240, 255, 0.05), 0 0 30px rgba(0, 240, 255, 0.1);
        }
        .glass {
          background: rgba(15, 15, 26, 0.7);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }
        .gradient-border {
          position: relative;
          background: #0f0f1a;
          border-radius: 8px;
        }
        .gradient-border::before {
          content: '';
          position: absolute;
          inset: -1px;
          border-radius: 9px;
          padding: 1px;
          background: linear-gradient(135deg, #00f0ff, #ff00a0, #39ff14, #00f0ff);
          background-size: 300% 300%;
          animation: gradientShift 4s ease infinite;
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          pointer-events: none;
          opacity: 0.3;
        }
        @keyframes gradientShift {
          0% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
          100% {
            background-position: 0% 50%;
          }
        }
        .loader-cube {
          width: 40px;
          height: 40px;
          position: relative;
          transform-style: preserve-3d;
          animation: rotateCube 2s infinite linear;
        }
        .loader-cube div {
          position: absolute;
          width: 100%;
          height: 100%;
          border: 2px solid rgba(0, 240, 255, 0.3);
          background: rgba(0, 240, 255, 0.05);
        }
        .loader-cube div:nth-child(1) {
          transform: translateZ(20px);
        }
        .loader-cube div:nth-child(2) {
          transform: rotateY(90deg) translateZ(20px);
        }
        .loader-cube div:nth-child(3) {
          transform: rotateY(180deg) translateZ(20px);
        }
        .loader-cube div:nth-child(4) {
          transform: rotateY(-90deg) translateZ(20px);
        }
        .loader-cube div:nth-child(5) {
          transform: rotateX(90deg) translateZ(20px);
        }
        .loader-cube div:nth-child(6) {
          transform: rotateX(-90deg) translateZ(20px);
        }
        @keyframes rotateCube {
          0% {
            transform: rotateX(0deg) rotateY(0deg);
          }
          100% {
            transform: rotateX(360deg) rotateY(360deg);
          }
        }
        .typing-dots {
          display: flex;
          gap: 4px;
          align-items: center;
        }
        .typing-dots span {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #00f0ff;
          animation: typingDot 1.4s ease-in-out infinite;
        }
        .typing-dots span:nth-child(2) {
          animation-delay: 0.2s;
        }
        .typing-dots span:nth-child(3) {
          animation-delay: 0.4s;
        }
        @keyframes typingDot {
          0%,
          60%,
          100% {
            transform: translateY(0);
            opacity: 0.4;
          }
          30% {
            transform: translateY(-8px);
            opacity: 1;
          }
        }
        .msg-user {
          background: linear-gradient(135deg, rgba(0, 240, 255, 0.15), rgba(0, 240, 255, 0.05));
          border: 1px solid rgba(0, 240, 255, 0.2);
          box-shadow: 0 0 20px rgba(0, 240, 255, 0.05);
        }
        .msg-ai {
          background: linear-gradient(135deg, rgba(255, 0, 160, 0.08), rgba(255, 0, 160, 0.02));
          border: 1px solid rgba(255, 0, 160, 0.15);
        }
        .msg-system {
          background: linear-gradient(135deg, rgba(57, 255, 20, 0.1), rgba(57, 255, 20, 0.02));
          border: 1px solid rgba(57, 255, 20, 0.15);
        }
        .code-block {
          background: #0d0d15;
          border: 1px solid #1a1a2e;
          border-radius: 8px;
          overflow: hidden;
        }
        .code-header {
          background: #13131f;
          border-bottom: 1px solid #1a1a2e;
          padding: 8px 12px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .code-header span {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.75rem;
          color: #6b7280;
        }
        .code-header button {
          padding: 4px 8px;
          font-size: 0.7rem;
          border-radius: 4px;
          background: rgba(0, 240, 255, 0.1);
          color: #00f0ff;
          border: 1px solid rgba(0, 240, 255, 0.2);
          cursor: pointer;
          transition: all 0.2s;
        }
        .code-header button:hover {
          background: rgba(0, 240, 255, 0.2);
        }
        .chat-item {
          transition: all 0.2s ease;
          border-left: 2px solid transparent;
        }
        .chat-item:hover {
          background: rgba(0, 240, 255, 0.03);
          border-left-color: rgba(0, 240, 255, 0.3);
        }
        .chat-item.active {
          background: rgba(0, 240, 255, 0.06);
          border-left-color: #00f0ff;
        }
        .input-glow:focus {
          outline: none;
          border-color: rgba(0, 240, 255, 0.5);
          box-shadow: 0 0 0 3px rgba(0, 240, 255, 0.1), 0 0 20px rgba(0, 240, 255, 0.1);
        }
        .mode-btn {
          position: relative;
          overflow: hidden;
          transition: all 0.3s ease;
        }
        .mode-btn::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(0, 240, 255, 0.2), rgba(255, 0, 160, 0.2));
          opacity: 0;
          transition: opacity 0.3s;
        }
        .mode-btn.active::before {
          opacity: 1;
        }
        .mode-btn.active {
          color: #fff;
          text-shadow: 0 0 10px rgba(255, 255, 255, 0.5);
        }
        #particleCanvas {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
          z-index: 0;
          opacity: 0.4;
        }
        .md-content h1,
        .md-content h2,
        .md-content h3 {
          font-weight: 700;
          margin: 1em 0 0.5em;
          color: #fff;
        }
        .md-content h1 {
          font-size: 1.4em;
          border-bottom: 1px solid #1a1a2e;
          padding-bottom: 0.3em;
        }
        .md-content h2 {
          font-size: 1.2em;
        }
        .md-content h3 {
          font-size: 1.1em;
        }
        .md-content p {
          margin: 0.6em 0;
          line-height: 1.7;
        }
        .md-content ul,
        .md-content ol {
          margin: 0.6em 0 0.6em 1.5em;
        }
        .md-content ul {
          list-style: none;
        }
        .md-content ul li::before {
          content: '>';
          color: #00f0ff;
          margin-right: 0.5em;
          font-weight: bold;
        }
        .md-content ol {
          list-style: decimal;
        }
        .md-content li {
          margin: 0.3em 0;
        }
        .md-content strong {
          color: #fff;
          font-weight: 600;
        }
        .md-content code {
          font-family: 'JetBrains Mono', monospace;
          background: rgba(0, 240, 255, 0.08);
          color: #00f0ff;
          padding: 0.15em 0.4em;
          border-radius: 4px;
          font-size: 0.9em;
        }
        .md-content pre {
          margin: 1em 0;
          border-radius: 8px;
          overflow: hidden;
        }
        .md-content pre code {
          background: none;
          color: inherit;
          padding: 0;
        }
        .md-content a {
          color: #00f0ff;
          text-decoration: none;
          border-bottom: 1px solid rgba(0, 240, 255, 0.3);
          transition: all 0.2s;
        }
        .md-content a:hover {
          border-bottom-color: #00f0ff;
          text-shadow: 0 0 10px rgba(0, 240, 255, 0.3);
        }
        .md-content blockquote {
          border-left: 3px solid #ff00a0;
          padding-left: 1em;
          margin: 1em 0;
          color: #9ca3af;
          font-style: italic;
          background: rgba(255, 0, 160, 0.03);
          padding: 0.8em 1em;
          border-radius: 0 8px 8px 0;
        }
        .md-content hr {
          border: none;
          height: 1px;
          background: linear-gradient(90deg, transparent, #1a1a2e, transparent);
          margin: 1.5em 0;
        }
        .md-content table {
          width: 100%;
          border-collapse: collapse;
          margin: 1em 0;
          font-size: 0.9em;
        }
        .md-content th,
        .md-content td {
          border: 1px solid #1a1a2e;
          padding: 0.6em 0.8em;
          text-align: left;
        }
        .md-content th {
          background: rgba(0, 240, 255, 0.05);
          font-weight: 600;
          color: #00f0ff;
        }
        .md-content tr:nth-child(even) {
          background: rgba(255, 255, 255, 0.02);
        }
        .thinking-block {
          background: linear-gradient(135deg, rgba(57, 255, 20, 0.05), rgba(57, 255, 20, 0.01));
          border: 1px solid rgba(57, 255, 20, 0.15);
          border-radius: 8px;
          padding: 0.8em 1em;
          margin: 0.5em 0;
          font-style: italic;
          color: #9ca3af;
          position: relative;
          overflow: hidden;
        }
        .thinking-block::before {
          content: '';
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 3px;
          background: linear-gradient(180deg, #39ff14, transparent);
        }
        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          display: inline-block;
          animation: pulse 2s infinite;
        }
        .status-dot.online {
          background: #39ff14;
          box-shadow: 0 0 8px #39ff14;
        }
        .status-dot.offline {
          background: #ef4444;
          box-shadow: 0 0 8px #ef4444;
        }
        .status-dot.connecting {
          background: #f59e0b;
          box-shadow: 0 0 8px #f59e0b;
        }
        @keyframes pulse {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
        .toast-container {
          position: fixed;
          top: 20px;
          right: 20px;
          z-index: 10000;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .toast {
          background: rgba(15, 15, 26, 0.95);
          backdrop-filter: blur(10px);
          border: 1px solid;
          border-radius: 8px;
          padding: 12px 16px;
          display: flex;
          align-items: center;
          gap: 10px;
          animation: slideInRight 0.3s ease-out;
          max-width: 320px;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
        }
        .toast.success {
          border-color: rgba(57, 255, 20, 0.3);
        }
        .toast.error {
          border-color: rgba(239, 68, 68, 0.3);
        }
        .toast.info {
          border-color: rgba(0, 240, 255, 0.3);
        }
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        [data-tooltip] {
          position: relative;
        }
        [data-tooltip]::after {
          content: attr(data-tooltip);
          position: absolute;
          bottom: calc(100% + 8px);
          left: 50%;
          transform: translateX(-50%) scale(0.9);
          background: rgba(15, 15, 26, 0.95);
          border: 1px solid #1a1a2e;
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 0.75rem;
          white-space: nowrap;
          opacity: 0;
          pointer-events: none;
          transition: all 0.2s;
          z-index: 100;
        }
        [data-tooltip]:hover::after {
          opacity: 1;
          transform: translateX(-50%) scale(1);
        }
        @media (max-width: 768px) {
          #sidebar {
            position: fixed;
            top: 0;
            left: 0;
            height: 100%;
            z-index: 40;
            transform: translateX(-100%);
            transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          }
          #sidebar.open {
            transform: translateX(0);
          }
          #sidebarOverlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.7);
            backdrop-filter: blur(4px);
            z-index: 30;
            display: none;
            opacity: 0;
            transition: opacity 0.3s;
          }
          #sidebarOverlay.show {
            display: block;
            opacity: 1;
          }
        }
        ::selection {
          background: rgba(0, 240, 255, 0.2);
          color: #fff;
        }
        .cyber-checkbox {
          appearance: none;
          width: 18px;
          height: 18px;
          border: 2px solid #1a1a2e;
          border-radius: 4px;
          background: #0d0d15;
          cursor: pointer;
          position: relative;
          transition: all 0.2s;
        }
        .cyber-checkbox:checked {
          background: rgba(0, 240, 255, 0.2);
          border-color: #00f0ff;
        }
        .cyber-checkbox:checked::after {
          content: '✓';
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          color: #00f0ff;
          font-size: 12px;
          font-weight: bold;
        }
        .stream-progress {
          height: 2px;
          background: linear-gradient(90deg, #00f0ff, #ff00a0);
          background-size: 200% 100%;
          animation: shimmer 1.5s linear infinite;
          border-radius: 1px;
          margin-top: 4px;
        }
        @keyframes shimmer {
          0% {
            background-position: -200% 0;
          }
          100% {
            background-position: 200% 0;
          }
        }
        .cmd-palette {
          position: fixed;
          top: 20%;
          left: 50%;
          transform: translateX(-50%) scale(0.95);
          width: 90%;
          max-width: 600px;
          background: rgba(15, 15, 26, 0.98);
          border: 1px solid #1a1a2e;
          border-radius: 12px;
          box-shadow: 0 25px 50px rgba(0, 0, 0, 0.8);
          z-index: 1000;
          opacity: 0;
          pointer-events: none;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .cmd-palette.open {
          opacity: 1;
          pointer-events: all;
          transform: translateX(-50%) scale(1);
        }
        .cmd-palette input {
          width: 100%;
          background: transparent;
          border: none;
          border-bottom: 1px solid #1a1a2e;
          padding: 16px 20px;
          color: #e0e0e8;
          font-size: 1rem;
          outline: none;
        }
        .cmd-palette input::placeholder {
          color: #6b7280;
        }
        .cmd-item {
          padding: 12px 20px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 12px;
          transition: all 0.15s;
          border-left: 2px solid transparent;
        }
        .cmd-item:hover,
        .cmd-item.selected {
          background: rgba(0, 240, 255, 0.05);
          border-left-color: #00f0ff;
        }
        .cmd-item kbd {
          margin-left: auto;
          background: #1a1a2e;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 0.7rem;
          color: #6b7280;
          font-family: 'JetBrains Mono', monospace;
        }
        .settings-panel {
          position: fixed;
          top: 0;
          right: 0;
          width: 320px;
          max-width: 85vw;
          height: 100vh;
          background: rgba(10, 10, 15, 0.98);
          backdrop-filter: blur(20px);
          border-left: 1px solid #1a1a2e;
          z-index: 250;
          transform: translateX(100%);
          transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .settings-panel.open {
          transform: translateX(0);
        }
        .settings-panel-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          backdrop-filter: blur(2px);
          z-index: 240;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.3s;
        }
        .settings-panel-overlay.open {
          opacity: 1;
          pointer-events: all;
        }
        .param-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 4px;
          border-radius: 2px;
          background: #1a1a2e;
          outline: none;
          transition: background 0.2s;
        }
        .param-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #00f0ff;
          border: 2px solid #0a0a0f;
          box-shadow: 0 0 8px rgba(0, 240, 255, 0.4);
          cursor: pointer;
          transition: all 0.2s;
        }
        .param-slider::-webkit-slider-thumb:hover {
          transform: scale(1.2);
          box-shadow: 0 0 12px rgba(0, 240, 255, 0.6);
        }
        .param-slider::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #00f0ff;
          border: 2px solid #0a0a0f;
          box-shadow: 0 0 8px rgba(0, 240, 255, 0.4);
          cursor: pointer;
        }
        .param-input {
          background: #0d0d15;
          border: 1px solid #1a1a2e;
          border-radius: 6px;
          padding: 6px 10px;
          color: #e0e0e8;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.8rem;
          width: 64px;
          text-align: center;
          transition: all 0.2s;
        }
        .param-input:focus {
          outline: none;
          border-color: rgba(0, 240, 255, 0.5);
          box-shadow: 0 0 0 2px rgba(0, 240, 255, 0.1);
        }
        .toggle-switch {
          position: relative;
          width: 40px;
          height: 22px;
          border-radius: 11px;
          background: #1a1a2e;
          cursor: pointer;
          transition: background 0.3s;
          flex-shrink: 0;
        }
        .toggle-switch.active {
          background: rgba(57, 255, 20, 0.3);
        }
        .toggle-switch .toggle-knob {
          position: absolute;
          top: 2px;
          left: 2px;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #6b7280;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .toggle-switch.active .toggle-knob {
          transform: translateX(18px);
          background: #39ff14;
          box-shadow: 0 0 8px rgba(57, 255, 20, 0.5);
        }
        .mobile-header-collapsed .header-controls {
          display: none !important;
        }
        @media (min-width: 640px) {
          .mobile-header-collapsed .header-controls {
            display: flex !important;
          }
        }
        .header-toggle-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border-radius: 6px;
          background: rgba(0, 240, 255, 0.05);
          border: 1px solid rgba(0, 240, 255, 0.15);
          color: #00f0ff;
          cursor: pointer;
          transition: all 0.2s;
          flex-shrink: 0;
        }
        .header-toggle-btn:hover {
          background: rgba(0, 240, 255, 0.15);
          border-color: rgba(0, 240, 255, 0.3);
        }
        @media (min-width: 640px) {
          .header-toggle-btn {
            display: none;
          }
        }
        @keyframes animate-slide-up {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-slide-up {
          animation: animate-slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes animate-fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        .animate-fade-in {
          animation: animate-fade-in 0.3s ease-out;
        }
        @keyframes animate-scale-in {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        .animate-scale-in {
          animation: animate-scale-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
      `}</style>

      <div className="crt-overlay" style={{ opacity: crtEnabled ? 0.15 : 0 }}></div>
      <div className="scanline" style={{ display: crtEnabled ? 'block' : 'none' }}></div>
      <canvas ref={particlesCanvasRef} id="particleCanvas" style={{ opacity: particlesEnabled ? 0.4 : 0 }}></canvas>

      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            <span
              style={{
                color: t.type === 'success' ? '#39ff14' : t.type === 'error' ? '#ef4444' : '#00f0ff',
                fontSize: '1.2em',
              }}
            >
              {t.type === 'success' ? '✓' : t.type === 'error' ? '✗' : 'ℹ'}
            </span>
            <span className="text-xs text-terminal-text">{t.message}</span>
          </div>
        ))}
      </div>

      <div className={`cmd-palette ${cmdPaletteOpen ? 'open' : ''}`}>
        <input
          type="text"
          placeholder="Type a command or search..."
          autoComplete="off"
          value={cmdFilter}
          onChange={(e) => {
            setCmdFilter(e.target.value);
            setCmdIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setCmdPaletteOpen(false);
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setCmdIndex((i) => Math.min(i + 1, filteredCommands.length - 1));
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setCmdIndex((i) => Math.max(i - 1, 0));
            }
            if (e.key === 'Enter' && filteredCommands[cmdIndex]) {
              filteredCommands[cmdIndex].action();
              setCmdPaletteOpen(false);
            }
          }}
          autoFocus
        />
        <div id="cmdList">
          {filteredCommands.map((cmd, i) => (
            <div
              key={cmd.name}
              className={`cmd-item ${i === cmdIndex ? 'selected' : ''}`}
              onClick={() => {
                cmd.action();
                setCmdPaletteOpen(false);
              }}
            >
              <span style={{ color: '#00f0ff' }}>&gt;</span>
              <span className="text-sm text-terminal-text">{cmd.name}</span>
              <kbd>{cmd.shortcut}</kbd>
            </div>
          ))}
        </div>
      </div>

      <div
        className={`settings-panel-overlay ${chatSettingsOpen ? 'open' : ''}`}
        onClick={() => setChatSettingsOpen(false)}
      />

      <aside id="chatSettingsPanel" className={`settings-panel ${chatSettingsOpen ? 'open' : ''}`}>
        <div className="flex items-center justify-between p-4 border-b border-terminal-border shrink-0">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <svg className="w-4 h-4 text-terminal-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
              />
            </svg>
            Parameters
          </h2>
          <button
            onClick={() => setChatSettingsOpen(false)}
            className="text-terminal-muted hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-terminal-accent3 animate-pulse"></div>
              <span className="text-xs text-terminal-text font-medium">Stream</span>
              <span className="text-[10px] text-terminal-muted cursor-help" title="Stream responses in real-time">
                ℹ
              </span>
            </div>
            <div
              className={`toggle-switch ${chatParams.stream ? 'active' : ''}`}
              onClick={() => setChatParams((p) => ({ ...p, stream: !p.stream }))}
            >
              <div className="toggle-knob"></div>
            </div>
          </div>

          {paramSliders.map((p) => (
            <div key={p.key}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-terminal-text font-medium">{p.label}</span>
                  <span className="text-[10px] text-terminal-muted cursor-help" title={p.info}>
                    ℹ
                  </span>
                </div>
                <input
                  type="number"
                  className="param-input"
                  value={chatParams[p.key]}
                  min={p.min}
                  max={p.max}
                  step={p.step}
                  onChange={(e) => {
                    let val = parseFloat(e.target.value);
                    val = Math.max(p.min, Math.min(p.max, val));
                    setChatParams((prev) => ({ ...prev, [p.key]: val }));
                  }}
                />
              </div>
              <div className="relative">
                <input
                  type="range"
                  className="param-slider"
                  min={p.min}
                  max={p.max}
                  step={p.step}
                  value={chatParams[p.key]}
                  onChange={(e) =>
                    setChatParams((prev) => ({ ...prev, [p.key]: parseFloat(e.target.value) }))
                  }
                />
              </div>
            </div>
          ))}

          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-terminal-text font-medium">Max Tokens</span>
                <span className="text-[10px] text-terminal-muted cursor-help" title="Maximum response length">
                  ℹ
                </span>
              </div>
            </div>
            <input
              type="number"
              className="w-full param-input !w-full !text-left"
              value={chatParams.maxTokens}
              min={1}
              max={131072}
              onChange={(e) => setChatParams((p) => ({ ...p, maxTokens: parseInt(e.target.value) || 65536 }))}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-terminal-text font-medium">Stop</span>
                <span className="text-[10px] text-terminal-muted cursor-help" title="Stop sequences to end generation">
                  ℹ
                </span>
              </div>
            </div>
            <input
              type="text"
              placeholder="Enter stop sequences..."
              className="w-full bg-terminal-elevated border border-terminal-border rounded-lg px-3 py-2 text-xs text-terminal-text placeholder-terminal-muted focus:outline-none focus:border-terminal-accent/50 transition-colors font-mono"
              value={chatParams.stop}
              onChange={(e) => setChatParams((p) => ({ ...p, stop: e.target.value }))}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-terminal-text font-medium">Seed</span>
                <span className="text-[10px] text-terminal-muted cursor-help" title="For reproducible outputs">
                  ℹ
                </span>
              </div>
            </div>
            <input
              type="number"
              className="w-full param-input !w-full !text-left"
              value={chatParams.seed}
              min={0}
              onChange={(e) => setChatParams((p) => ({ ...p, seed: parseInt(e.target.value) || 0 }))}
            />
          </div>

          <div className="border-t border-terminal-border pt-4 mt-2">
            <h3 className="text-[10px] text-terminal-muted font-mono uppercase tracking-wider mb-3">Reasoning</h3>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-terminal-text font-medium">Enable Thinking</span>
                <span className="text-[10px] text-terminal-muted cursor-help" title="Show model reasoning process">
                  ℹ
                </span>
              </div>
              <div
                className={`toggle-switch ${chatParams.enableReasoning ? 'active' : ''}`}
                onClick={() => setChatParams((p) => ({ ...p, enableReasoning: !p.enableReasoning }))}
              >
                <div className="toggle-knob"></div>
              </div>
            </div>
            <div
              style={{
                opacity: chatParams.enableReasoning ? 1 : 0.5,
                pointerEvents: chatParams.enableReasoning ? ('all' as const) : ('none' as const),
              }}
              className="transition-opacity duration-200"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-terminal-text font-medium">Reasoning Budget</span>
                  <span className="text-[10px] text-terminal-muted cursor-help" title="Max tokens for reasoning phase">
                    ℹ
                  </span>
                </div>
                <input
                  type="number"
                  className="param-input"
                  value={chatParams.reasoningBudget}
                  min={0}
                  max={16384}
                  step={256}
                  onChange={(e) =>
                    setChatParams((p) => ({ ...p, reasoningBudget: parseInt(e.target.value) || 0 }))
                  }
                />
              </div>
              <input
                type="range"
                className="param-slider"
                min={0}
                max={16384}
                step={256}
                value={chatParams.reasoningBudget}
                onChange={(e) =>
                  setChatParams((p) => ({ ...p, reasoningBudget: parseInt(e.target.value) }))
                }
              />
            </div>
          </div>
        </div>
      </aside>

      {loading && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-terminal-bg">
          <div className="loader-cube mb-8">
            <div></div>
            <div></div>
            <div></div>
            <div></div>
            <div></div>
            <div></div>
          </div>
          <p className="text-terminal-accent font-mono text-sm tracking-[0.3em] uppercase glow-text">
            Initializing Neural Link
          </p>
          <p className="text-terminal-muted text-xs mt-2 font-mono">{loadingText}</p>
          <div className="mt-6 w-48 h-0.5 bg-terminal-border rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-terminal-accent to-terminal-accent2 animate-shimmer"
              style={{ backgroundSize: '200% 100%', width: `${loadingPct}%`, transition: 'width 0.5s ease' }}
            ></div>
          </div>
        </div>
      )}

      <div id="sidebarOverlay" className={sidebarOpen ? 'show' : ''} onClick={() => setSidebarOpen(false)} />

      <aside
        id="sidebar"
        className={`w-72 bg-terminal-surface/90 backdrop-blur-xl border-r border-terminal-border flex flex-col shrink-0 z-20 relative ${sidebarOpen ? 'open' : ''
          }`}
      >
        <div className="p-4 border-b border-terminal-border">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-terminal-accent to-terminal-accent2 flex items-center justify-center">
              <span className="text-white font-bold text-sm">AI</span>
            </div>
            <div>
              <h1 className="text-sm font-bold text-white tracking-wide">
                TERMINAL<span className="text-terminal-accent">.STREAM</span>
              </h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`status-dot ${connectionStatus}`}></span>
                <span className="text-[10px] text-terminal-muted font-mono uppercase">{connectionText}</span>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="md:hidden text-terminal-muted hover:text-white ml-auto text-lg"
            >
              x
            </button>
          </div>
          <button
            onClick={newChat}
            className="w-full group relative overflow-hidden rounded-lg px-4 py-2.5 text-sm font-semibold transition-all duration-300"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-terminal-accent/20 to-terminal-accent2/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="absolute inset-0 border border-terminal-accent/30 rounded-lg group-hover:border-terminal-accent/60 transition-colors"></div>
            <span className="relative flex items-center justify-center gap-2 text-terminal-accent">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              New Session
            </span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {chatList.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-xs text-terminal-muted font-mono">No sessions</p>
              <p className="text-[10px] text-terminal-dim mt-1">Create a new chat</p>
            </div>
          ) : (
            chatList.map((c) => (
              <div
                key={c.id}
                className={`chat-item group flex items-center gap-3 px-4 py-3 cursor-pointer text-sm ${c.id === currentChatId ? 'active' : ''
                  }`}
                onClick={() => openChat(c.id)}
              >
                <div className="w-8 h-8 rounded-lg bg-terminal-elevated border border-terminal-border flex items-center justify-center shrink-0">
                  <span className="text-terminal-accent text-xs font-mono">#</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="truncate text-xs text-terminal-text font-medium">
                    {c.title || 'New Session'}
                  </div>
                  <div className="text-[10px] text-terminal-dim font-mono mt-0.5">
                    {c.updated_at ? new Date(c.updated_at).toLocaleDateString() : ''}
                  </div>
                </div>
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (!(await customConfirm('Delete Session', 'Delete this session permanently?'))) return;
                    await fetch(`/api/chats/${c.id}`, { method: 'DELETE' });
                    if (c.id === currentChatId) {
                      setCurrentChatId(null);
                      setMessages([]);
                      if (chatRef.current) chatRef.current.innerHTML = '';
                    }
                    await loadChatList();
                    if (!currentChatId || c.id === currentChatId) {
                      try {
                        const res = await fetch('/api/chats');
                        const data = await res.json();
                        if (data.chats?.length) await openChat(data.chats[0].id);
                        else await newChat();
                      } catch {
                        await newChat();
                      }
                    }
                  }}
                  className="text-terminal-dim hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all p-1 rounded hover:bg-red-400/5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>
        <div className="p-3 border-t border-terminal-border">
          <div className="flex items-center justify-between text-[10px] text-terminal-muted font-mono">
            <span>v2.1.0</span>
            <span>{msgCount} msgs</span>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        <header
          id="mainHeader"
          className={`glass border-b border-terminal-border ${headerCollapsed ? 'mobile-header-collapsed' : ''}`}
        >
          <div className="px-3 sm:px-4 py-2.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <button
                onClick={() => setSidebarOpen((v) => !v)}
                className="md:hidden text-terminal-muted hover:text-white text-xl p-1 shrink-0"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              </button>
              <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-terminal-muted shrink-0">
                <span className="text-terminal-accent">&gt;</span>
                <span className="truncate max-w-[200px]">{model}</span>
              </div>
              <div className="sm:hidden text-[10px] font-mono text-terminal-muted truncate">
                <span className="text-terminal-accent">&gt;</span>
                <span className="truncate">{model}</span>
              </div>
            </div>
            <button
              onClick={() => setHeaderCollapsed((v) => !v)}
              className="header-toggle-btn sm:hidden"
              title="Toggle controls"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d={headerCollapsed ? 'M19 9l-7 7-7-7' : 'M5 15l7-7 7 7'}
                />
              </svg>
            </button>
            <div className="header-controls hidden sm:flex items-center gap-2">
              <div className="flex bg-terminal-elevated rounded-lg overflow-hidden border border-terminal-border p-0.5 text-xs font-mono">
                <button
                  className={`mode-btn px-3 py-1.5 rounded-md relative z-10 ${mode === 'local' ? 'active' : 'text-terminal-muted'
                    }`}
                  onClick={() => setMode('local')}
                >
                  <span className="relative z-10 flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"
                      />
                    </svg>
                    Local
                  </span>
                </button>
                <button
                  className={`mode-btn px-3 py-1.5 rounded-md relative z-10 ${mode === 'online' ? 'active' : 'text-terminal-muted'
                    }`}
                  onClick={() => setMode('online')}
                >
                  <span className="relative z-10 flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                      />
                    </svg>
                    Online
                  </span>
                </button>
              </div>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="bg-terminal-elevated text-xs rounded-lg px-3 py-1.5 border border-terminal-border text-terminal-text focus:outline-none focus:border-terminal-accent/50 max-w-[120px] lg:max-w-[280px] font-mono cursor-pointer hover:border-terminal-accent/30 transition-colors"
              >
                {MODELS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setChatSettingsOpen(true)}
                className="p-2 rounded-lg text-terminal-muted hover:text-terminal-accent hover:bg-terminal-accent/5 transition-all"
                data-tooltip="Chat Parameters"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
                  />
                </svg>
              </button>
              <button
                onClick={() => setSettingsOpen(true)}
                className="p-2 rounded-lg text-terminal-muted hover:text-terminal-accent hover:bg-terminal-accent/5 transition-all"
                data-tooltip="Settings (Ctrl+,)"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </button>
            </div>
          </div>
          <div className="header-controls px-3 pb-2.5 flex sm:hidden flex-wrap items-center gap-2">
            <div className="flex bg-terminal-elevated rounded-lg overflow-hidden border border-terminal-border p-0.5 text-xs font-mono">
              <button
                className={`mode-btn px-3 py-1.5 rounded-md relative z-10 ${mode === 'local' ? 'active' : 'text-terminal-muted'
                  }`}
                onClick={() => setMode('local')}
              >
                <span className="relative z-10 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"
                    />
                  </svg>
                  Local
                </span>
              </button>
              <button
                className={`mode-btn px-3 py-1.5 rounded-md relative z-10 ${mode === 'online' ? 'active' : 'text-terminal-muted'
                  }`}
                onClick={() => setMode('online')}
              >
                <span className="relative z-10 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                    />
                  </svg>
                  Online
                </span>
              </button>
            </div>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="bg-terminal-elevated text-xs rounded-lg px-3 py-1.5 border border-terminal-border text-terminal-text focus:outline-none focus:border-terminal-accent/50 flex-1 min-w-[140px] font-mono cursor-pointer hover:border-terminal-accent/30 transition-colors"
            >
              {MODELS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <button
              onClick={() => setChatSettingsOpen(true)}
              className="p-2 rounded-lg text-terminal-muted hover:text-terminal-accent hover:bg-terminal-accent/5 transition-all"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
                />
              </svg>
            </button>
            <button
              onClick={() => setSettingsOpen(true)}
              className="p-2 rounded-lg text-terminal-muted hover:text-terminal-accent hover:bg-terminal-accent/5 transition-all"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </button>
          </div>
        </header>

        {mode === 'online' && (
          <div className="border-b border-terminal-border bg-terminal-surface/50 px-4 py-2.5 flex flex-wrap items-center gap-3 text-xs font-mono">
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <span className="text-terminal-muted">API_KEY:</span>
              <input
                type="password"
                placeholder="nvapi-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="flex-1 min-w-[140px] bg-terminal-elevated border border-terminal-border rounded-lg px-3 py-1.5 text-terminal-text focus:outline-none focus:border-terminal-accent/50 transition-colors"
              />
            </div>
            <label className="flex items-center gap-2 text-terminal-muted cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showThinking}
                onChange={(e) => setShowThinking(e.target.checked)}
                className="cyber-checkbox"
              />
              <span>show_reasoning</span>
            </label>
            <label className="flex items-center gap-2 text-terminal-muted cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="cyber-checkbox"
              />
              <span>auto_scroll</span>
            </label>
          </div>
        )}

        <main ref={chatRef} id="chat" className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-5 scroll-smooth"></main>

        {previewOpen && lastGeneratedHTML && (
          <div className="border-t border-terminal-border bg-terminal-surface/80 backdrop-blur-sm">
            <div className="flex items-center justify-between px-4 py-3 border-b border-terminal-border">
              <div className="flex items-center gap-2">
                <span className="text-terminal-accent2 text-lg">◆</span>
                <span className="text-sm font-semibold text-terminal-accent2 font-mono">
                  generated_preview.html
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(lastGeneratedHTML);
                    showToast('HTML copied to clipboard', 'success');
                  }}
                  className="text-xs px-3 py-1.5 rounded-md bg-terminal-elevated border border-terminal-border text-terminal-muted hover:text-terminal-accent hover:border-terminal-accent/30 transition-all font-mono"
                  data-tooltip="Copy HTML"
                >
                  Copy
                </button>
                <button
                  onClick={() => {
                    const blob = new Blob([lastGeneratedHTML], { type: 'text/html' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `page-${Date.now()}.html`;
                    a.click();
                    URL.revokeObjectURL(url);
                    showToast('File downloaded', 'success');
                  }}
                  className="text-xs px-3 py-1.5 rounded-md bg-terminal-accent/10 border border-terminal-accent/30 text-terminal-accent hover:bg-terminal-accent/20 transition-all font-mono"
                >
                  Save
                </button>
                <button
                  onClick={() => setPreviewOpen(false)}
                  className="text-xs px-3 py-1.5 rounded-md bg-terminal-elevated border border-terminal-border text-terminal-muted hover:text-white hover:border-red-500/30 transition-all font-mono"
                >
                  Close
                </button>
              </div>
            </div>
            <iframe srcDoc={lastGeneratedHTML} className="w-full h-72 bg-white rounded-none" title="Preview" />
          </div>
        )}

        {mdPreviewOpen && lastGeneratedMD && (
          <div className="border-t border-terminal-border bg-terminal-surface/80 backdrop-blur-sm">
            <div className="flex items-center justify-between px-4 py-3 border-b border-terminal-border">
              <div className="flex items-center gap-2">
                <span className="text-terminal-accent3 text-lg">≡</span>
                <span className="text-sm font-semibold text-terminal-accent3 font-mono">
                  rendered_markdown.md
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(lastGeneratedMD);
                    showToast('Markdown copied to clipboard', 'success');
                  }}
                  className="text-xs px-3 py-1.5 rounded-md bg-terminal-elevated border border-terminal-border text-terminal-muted hover:text-terminal-accent hover:border-terminal-accent/30 transition-all font-mono"
                  data-tooltip="Copy Markdown"
                >
                  Copy MD
                </button>
                <button
                  onClick={() => {
                    const blob = new Blob([lastGeneratedMD], { type: 'text/markdown' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `doc-${Date.now()}.md`;
                    a.click();
                    URL.revokeObjectURL(url);
                    showToast('File downloaded', 'success');
                  }}
                  className="text-xs px-3 py-1.5 rounded-md bg-terminal-accent3/10 border border-terminal-accent3/30 text-terminal-accent3 hover:bg-terminal-accent3/20 transition-all font-mono"
                >
                  Save
                </button>
                <button
                  onClick={() => setMdPreviewOpen(false)}
                  className="text-xs px-3 py-1.5 rounded-md bg-terminal-elevated border border-terminal-border text-terminal-muted hover:text-white hover:border-red-500/30 transition-all font-mono"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="p-4 max-h-96 overflow-y-auto">
              <MarkdownViewer content={lastGeneratedMD} />
            </div>
          </div>
        )}

        <footer className="glass border-t border-terminal-border p-3 sm:p-4">
          <div className="max-w-4xl mx-auto">
            <div className="relative flex items-end gap-2 bg-terminal-elevated rounded-xl border border-terminal-border p-2 focus-within:border-terminal-accent/40 focus-within:shadow-[0_0_20px_rgba(0,240,255,0.05)] transition-all">
              <textarea
                ref={inputRef}
                rows={1}
                placeholder="Enter command or query..."
                className="flex-1 bg-transparent border-none px-3 py-2 text-sm text-terminal-text placeholder-terminal-muted resize-none focus:outline-none max-h-32 font-mono"
                style={{ minHeight: '40px' }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                onInput={(e) => {
                  const el = e.currentTarget;
                  el.style.height = 'auto';
                  el.style.height = Math.min(el.scrollHeight, 128) + 'px';
                }}
              />
              <div className="flex items-center gap-1 pb-1 pr-1">
                <button
                  onClick={async () => {
                    if (!currentChatId) return;
                    if (!(await customConfirm('Clear Session', 'Clear all messages in this session?'))) return;
                    if (currentChatId && !String(currentChatId).startsWith('local-'))
                      await fetch(`/api/chats/${currentChatId}`, { method: 'DELETE' });
                    await newChat();
                    showToast('Session cleared', 'info');
                  }}
                  className="p-2 rounded-lg text-terminal-muted hover:text-red-400 hover:bg-red-400/5 transition-all"
                  data-tooltip="Clear chat (Ctrl+Shift+C)"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
                <button
                  ref={sendBtnRef}
                  onClick={handleSend}
                  className="p-2.5 rounded-lg bg-gradient-to-r from-terminal-accent/20 to-terminal-accent2/20 border border-terminal-accent/30 text-terminal-accent hover:from-terminal-accent/30 hover:to-terminal-accent2/30 transition-all glow-text"
                >
                  {isStreaming ? (
                    <svg
                      className="w-4 h-4 animate-spin"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      ></path>
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between mt-2 px-1">
              <p className="text-[10px] text-terminal-muted font-mono truncate flex-1">{statusText}</p>
              <div className="flex items-center gap-3 text-[10px] text-terminal-muted font-mono">
                <span className="hidden sm:inline">Ctrl+K: Command</span>
                <span className="hidden sm:inline">Shift+Enter: New line</span>
                <span className="text-terminal-accent/60">{tokenCount}</span>
              </div>
            </div>
          </div>
        </footer>
      </div>

      {settingsOpen && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSettingsOpen(false);
          }}
        >
          <div className="bg-terminal-surface border border-terminal-border rounded-xl w-full max-w-md mx-4 shadow-2xl animate-scale-in">
            <div className="flex items-center justify-between p-4 border-b border-terminal-border">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <svg className="w-4 h-4 text-terminal-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                Settings
              </h2>
              <button onClick={() => setSettingsOpen(false)} className="text-terminal-muted hover:text-white">
                x
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="text-xs text-terminal-muted font-mono mb-2 block">THEME</label>
                <div className="flex gap-2">
                  <button className="flex-1 py-2 rounded-lg border border-terminal-accent/50 bg-terminal-accent/10 text-terminal-accent text-xs font-mono">
                    Cyberpunk
                  </button>
                  <button className="flex-1 py-2 rounded-lg border border-terminal-border text-terminal-muted text-xs font-mono hover:border-terminal-accent/30">
                    Midnight
                  </button>
                  <button className="flex-1 py-2 rounded-lg border border-terminal-border text-terminal-muted text-xs font-mono hover:border-terminal-accent/30">
                    Matrix
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs text-terminal-muted font-mono mb-2 block">FONT SIZE</label>
                <input
                  type="range"
                  min={12}
                  max={18}
                  value={fontSize}
                  onChange={(e) => {
                    setFontSize(parseInt(e.target.value));
                    document.documentElement.style.fontSize = e.target.value + 'px';
                  }}
                  className="w-full accent-terminal-accent"
                />
                <div className="flex justify-between text-[10px] text-terminal-muted mt-1 font-mono">
                  <span>12px</span>
                  <span>{fontSize}px</span>
                  <span>18px</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-terminal-text">CRT Effect</span>
                <div
                  className={`w-10 h-5 rounded-full relative transition-colors cursor-pointer ${crtEnabled ? 'bg-terminal-accent/30' : 'bg-terminal-border'
                    }`}
                  onClick={() => setCrtEnabled((v) => !v)}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-terminal-accent absolute top-0.5 transition-transform ${crtEnabled ? 'left-0.5' : 'left-5'
                      }`}
                  ></div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-terminal-text">Particles</span>
                <div
                  className={`w-10 h-5 rounded-full relative transition-colors cursor-pointer ${particlesEnabled ? 'bg-terminal-accent/30' : 'bg-terminal-border'
                    }`}
                  onClick={() => setParticlesEnabled((v) => !v)}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-terminal-accent absolute top-0.5 transition-transform ${particlesEnabled ? 'left-0.5' : 'left-5'
                      }`}
                  ></div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-terminal-text">Sound Effects</span>
                <div className="w-10 h-5 rounded-full bg-terminal-border relative transition-colors cursor-pointer">
                  <div className="w-4 h-4 rounded-full bg-terminal-muted absolute top-0.5 left-5"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmState && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-terminal-surface border border-terminal-border rounded-xl w-full max-w-sm mx-4 shadow-2xl animate-scale-in p-6">
            <h3 className="text-sm font-bold text-white mb-2 font-mono">{confirmState.title}</h3>
            <p className="text-xs text-terminal-muted mb-6">{confirmState.message}</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  confirmState.resolve(false);
                  setConfirmState(null);
                }}
                className="px-4 py-2 rounded-lg border border-terminal-border text-xs text-terminal-muted hover:text-white hover:border-terminal-accent/30 transition-all font-mono"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  confirmState.resolve(true);
                  setConfirmState(null);
                }}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-terminal-accent/20 to-terminal-accent2/20 border border-terminal-accent/30 text-terminal-accent text-xs hover:from-terminal-accent/30 hover:to-terminal-accent2/30 transition-all font-mono"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}