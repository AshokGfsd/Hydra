import { Chat, Message, MODELS } from '@/types';

const chats = new Map<string, Chat>();

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function listChats(): Omit<Chat, 'messages'>[] {
  return Array.from(chats.values())
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(({ messages, ...chat }) => chat);
}

export function createChat(title: string = 'New Chat', model: string = MODELS[0]): Chat {
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
  return chat;
}

export function getChat(id: string): Chat | undefined {
  return chats.get(id);
}

export function renameChat(id: string, title: string): boolean {
  const chat = chats.get(id);
  if (!chat) return false;
  chat.title = title;
  chat.updatedAt = Date.now();
  return true;
}

export function setChatModel(id: string, model: string): boolean {
  const chat = chats.get(id);
  if (!chat || !MODELS.includes(model)) return false;
  chat.model = model;
  chat.updatedAt = Date.now();
  return true;
}

export function deleteChat(id: string): boolean {
  return chats.delete(id);
}

export function addMessage(id: string, role: Message['role'], content: string, reasoning?: string): Chat | undefined {
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
  
  return chat;
}

export function getMessages(id: string): Message[] {
  const chat = chats.get(id);
  return chat?.messages || [];
}

export function clearMessages(id: string): boolean {
  const chat = chats.get(id);
  if (!chat) return false;
  chat.messages = [];
  chat.updatedAt = Date.now();
  return true;
}