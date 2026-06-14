import fs from 'fs';
import path from 'path';
import { Chat, Message, MODELS } from '@/types';

const DATA_FILE = path.join(process.cwd(), '.chats.json');

const chats = new Map<string, Chat>();

function load(): void {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const arr: Chat[] = JSON.parse(raw);
      chats.clear();
      for (const c of arr) chats.set(c.id, c);
    }
  } catch {}
}

function save(): void {
  try {
    const arr = Array.from(chats.values());
    fs.writeFileSync(DATA_FILE, JSON.stringify(arr, null, 2), 'utf-8');
  } catch {}
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function listChats(): Omit<Chat, 'messages'>[] {
  load();
  return Array.from(chats.values())
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(({ messages, ...chat }) => chat);
}

export function createChat(title: string = 'New Chat', model: string = MODELS[0]): Chat {
  load();
  const id = generateId();
  const now = Date.now();
  const chat: Chat = {
    id,
    title,
    model,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
  chats.set(id, chat);
  save();
  return chat;
}

export function getChat(id: string): Chat | undefined {
  load();
  return chats.get(id);
}

export function renameChat(id: string, title: string): boolean {
  load();
  const chat = chats.get(id);
  if (!chat) return false;
  chat.title = title;
  chat.updatedAt = Date.now();
  save();
  return true;
}

export function setChatModel(id: string, model: string): boolean {
  load();
  const chat = chats.get(id);
  if (!chat || !MODELS.includes(model)) return false;
  chat.model = model;
  chat.updatedAt = Date.now();
  save();
  return true;
}

export function deleteChat(id: string): boolean {
  load();
  const r = chats.delete(id);
  if (r) save();
  return r;
}

export function addMessage(id: string, role: Message['role'], content: string, reasoning?: string): Chat | undefined {
  load();
  const chat = chats.get(id);
  if (!chat) return undefined;
  
  const message: Message = {
    role,
    content,
    reasoning,
    timestamp: Date.now(),
  };
  
  chat.messages.push(message);
  chat.updatedAt = Date.now();
  
  if (chat.title === 'New Chat' && role === 'user') {
    chat.title = content.slice(0, 40) + (content.length > 40 ? '…' : '');
  }
  
  save();
  return chat;
}

export function getMessages(id: string): Message[] {
  load();
  const chat = chats.get(id);
  return chat?.messages || [];
}

export function clearMessages(id: string): boolean {
  load();
  const chat = chats.get(id);
  if (!chat) return false;
  chat.messages = [];
  chat.updatedAt = Date.now();
  save();
  return true;
}