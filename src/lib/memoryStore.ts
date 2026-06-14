import fs from 'fs';
import path from 'path';
import { Memory } from '@/types';

const DATA_FILE = path.join(process.cwd(), '.memory.json');

function load(): Memory[] {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch {}
  return [];
}

function save(memories: Memory[]): void {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(memories, null, 2), 'utf-8');
  } catch {}
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function listMemories(): Memory[] {
  return load().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function createMemory(key: string, content: string, type: Memory['type'] = 'fact'): Memory {
  const memories = load();
  const now = Date.now();
  const existing = memories.findIndex((m) => m.key.toLowerCase() === key.toLowerCase());
  if (existing !== -1) {
    memories[existing].content = content;
    memories[existing].type = type;
    memories[existing].updatedAt = now;
    save(memories);
    return memories[existing];
  }
  const memory: Memory = {
    id: generateId(),
    key,
    content,
    type,
    createdAt: now,
    updatedAt: now,
  };
  memories.push(memory);
  save(memories);
  return memory;
}

export function deleteMemory(id: string): boolean {
  const memories = load();
  const idx = memories.findIndex((m) => m.id === id);
  if (idx === -1) return false;
  memories.splice(idx, 1);
  save(memories);
  return true;
}

export function getMemoriesByType(type: Memory['type']): Memory[] {
  return load().filter((m) => m.type === type);
}

export function searchMemories(query: string): Memory[] {
  const q = query.toLowerCase();
  return load().filter(
    (m) => m.key.toLowerCase().includes(q) || m.content.toLowerCase().includes(q)
  );
}
