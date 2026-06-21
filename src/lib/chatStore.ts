import { Collection } from 'mongodb';
import { Chat, Message, MODELS } from '@/types';
import { getDb } from './mongodb';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

async function getCollection(): Promise<Collection<Chat>> {
  const db = await getDb();
  const col = db.collection<Chat>('chats');
  await col.createIndex({ id: 1 }, { unique: true });
  await col.createIndex({ updatedAt: -1 });
  return col;
}

export async function listChats(): Promise<Omit<Chat, 'messages'>[]> {
  const col = await getCollection();
  const chats = await col.find({}, { projection: { messages: 0 } })
    .sort({ updatedAt: -1 })
    .toArray();
  return chats.map(({ _id, ...chat }) => chat);
}

export async function createChat(title: string = 'New Chat', model: string = MODELS[0]): Promise<Chat> {
  const col = await getCollection();
  const id = generateId();
  const now = Date.now();
  const chat: Chat = { id, title, model, messages: [], createdAt: now, updatedAt: now };
  await col.insertOne(chat as any);
  return chat;
}

export async function getChat(id: string): Promise<Chat | null> {
  const col = await getCollection();
  const chat = await col.findOne({ id });
  if (!chat) return null;
  const { _id, ...rest } = chat;
  return rest;
}

export async function renameChat(id: string, title: string): Promise<boolean> {
  const col = await getCollection();
  const result = await col.updateOne({ id }, { $set: { title, updatedAt: Date.now() } });
  return result.matchedCount > 0;
}

export async function setChatModel(id: string, model: string): Promise<boolean> {
  const col = await getCollection();
  if (!MODELS.includes(model)) return false;
  const result = await col.updateOne({ id }, { $set: { model, updatedAt: Date.now() } });
  return result.matchedCount > 0;
}

export async function deleteChat(id: string): Promise<boolean> {
  const col = await getCollection();
  const result = await col.deleteOne({ id });
  return result.deletedCount > 0;
}

export async function addMessage(id: string, role: Message['role'], content: string, reasoning?: string): Promise<Chat | null> {
  const col = await getCollection();
  const message: Message = { role, content, reasoning, timestamp: Date.now() };

  const chat = await col.findOneAndUpdate(
    { id },
    {
      $push: { messages: message },
      $set: { updatedAt: Date.now() },
      $setOnInsert: { title: content.slice(0, 40) + (content.length > 40 ? '…' : '') },
    },
    { returnDocument: 'after' }
  );
  if (!chat) return null;

  if (chat.title === 'New Chat' && role === 'user') {
    const newTitle = content.slice(0, 40) + (content.length > 40 ? '…' : '');
    await col.updateOne({ id }, { $set: { title: newTitle } });
    chat.title = newTitle;
  }

  const { _id, ...rest } = chat;
  return rest;
}

export async function getMessages(id: string): Promise<Message[]> {
  const col = await getCollection();
  const chat = await col.findOne({ id }, { projection: { messages: 1, _id: 0 } });
  return chat?.messages || [];
}

export async function clearMessages(id: string): Promise<boolean> {
  const col = await getCollection();
  const result = await col.updateOne({ id }, { $set: { messages: [], updatedAt: Date.now() } });
  return result.matchedCount > 0;
}
