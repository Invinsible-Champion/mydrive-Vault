import { Pool } from '@neondatabase/serverless';

const globalForDb = globalThis as unknown as {
  pool: Pool | undefined;
};

export const pool =
  globalForDb.pool ??
  new Pool({ 
    connectionString: process.env.DATABASE_URL,
    max: 10, 
    idleTimeoutMillis: 30000, 
  });

if (process.env.NODE_ENV !== 'production') globalForDb.pool = pool;

export async function query(text: string, params?: any[]) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release(); 
  }
}