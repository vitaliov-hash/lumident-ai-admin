import { Pool } from 'pg';

export const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5, connectionTimeoutMillis: 5000 });
export const query = (sql, values = []) => pool.query(sql, values);

export async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`CREATE TABLE IF NOT EXISTS users (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'client' CHECK (role IN ('client', 'admin')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS services (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      price_from INTEGER CHECK (price_from IS NULL OR price_from >= 0),
      position INTEGER NOT NULL DEFAULT 0
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS conversations (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT 'Новый разговор',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS messages (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    await client.query('CREATE INDEX IF NOT EXISTS conversations_owner_idx ON conversations(user_id, updated_at DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages(conversation_id, id)');
    const seeds = [
      ['Консультация', 'Знакомство с врачом и план лечения.', 1500],
      ['Профессиональная гигиена', 'Профессиональная чистка зубов.', 5500],
      ['Лечение кариеса', 'Лечение кариеса после осмотра.', 7000],
      ['Лечение одного канала', 'Эндодонтическое лечение.', 9000],
      ['Винир', 'Эстетическое восстановление зуба.', 35000],
      ['Коронка из диоксида циркония', 'Ортопедическое восстановление.', 45000],
      ['Имплантация одного зуба', 'Имплантация после диагностики.', 85000],
      ['Удаление зуба', 'Удаление по показаниям врача.', 4000],
      ['Отбеливание', 'Профессиональное отбеливание.', 18000]
    ];
    const seeded = await client.query("SELECT 1 FROM settings WHERE key='seeded'");
    if (!seeded.rowCount) {
      for (let i = 0; i < seeds.length; i++) {
        const [name, description, price] = seeds[i];
        await client.query('INSERT INTO services(name, description, price_from, position) VALUES($1,$2,$3,$4) ON CONFLICT(name) DO NOTHING', [name, description, price, i]);
      }
      await client.query("INSERT INTO settings(key,value) VALUES('hours','Ежедневно, 09:00–21:00') ON CONFLICT(key) DO NOTHING");
      await client.query("INSERT INTO settings(key,value) VALUES('seeded','1')");
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
