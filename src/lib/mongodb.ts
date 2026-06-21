import { MongoClient, Db } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hydra';
const MONGODB_DB = process.env.MONGODB_DB || 'hydra';

let client: MongoClient | null = null;
let db: Db | null = null;

export async function getClient(): Promise<MongoClient> {
  if (!client) {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    console.log(`[MongoDB] Connected to ${MONGODB_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`);
  }
  return client;
}

export async function getDb(): Promise<Db> {
  if (!db) {
    const c = await getClient();
    db = c.db(MONGODB_DB);
  }
  return db;
}

export async function closeConnection(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}
