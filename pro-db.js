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
      name_en TEXT NOT NULL DEFAULT '',
      description_en TEXT NOT NULL DEFAULT '',
      price_from INTEGER CHECK (price_from IS NULL OR price_from >= 0),
      position INTEGER NOT NULL DEFAULT 0
    )`);
    await client.query("ALTER TABLE services ADD COLUMN IF NOT EXISTS name_en TEXT NOT NULL DEFAULT ''");
    await client.query("ALTER TABLE services ADD COLUMN IF NOT EXISTS description_en TEXT NOT NULL DEFAULT ''");
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
      ['Консультация', 'Знакомство с врачом и план лечения.', 'Consultation', 'Meet the dentist and discuss a treatment plan.', 1500],
      ['Профессиональная гигиена', 'Профессиональная чистка зубов.', 'Professional cleaning', 'Professional teeth cleaning.', 5500],
      ['Лечение кариеса', 'Лечение кариеса после осмотра.', 'Cavity treatment', 'Cavity treatment after an examination.', 7000],
      ['Лечение одного канала', 'Эндодонтическое лечение.', 'Root canal treatment', 'Endodontic treatment.', 9000],
      ['Винир', 'Эстетическое восстановление зуба.', 'Veneer', 'Aesthetic restoration of a tooth.', 35000],
      ['Коронка из диоксида циркония', 'Ортопедическое восстановление.', 'Zirconia crown', 'Prosthetic restoration.', 45000],
      ['Имплантация одного зуба', 'Имплантация после диагностики.', 'Single-tooth implant', 'Dental implant placement after diagnostics.', 85000],
      ['Удаление зуба', 'Удаление по показаниям врача.', 'Tooth extraction', 'Extraction when clinically indicated.', 4000],
      ['Отбеливание', 'Профессиональное отбеливание.', 'Teeth whitening', 'Professional teeth whitening.', 18000]
    ];
    const seeded = await client.query("SELECT 1 FROM settings WHERE key='seeded'");
    if (!seeded.rowCount) {
      for (let i = 0; i < seeds.length; i++) {
        const [name, description, nameEn, descriptionEn, price] = seeds[i];
        await client.query('INSERT INTO services(name, description, name_en, description_en, price_from, position) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(name) DO NOTHING', [name, description, nameEn, descriptionEn, price, i]);
      }
      await client.query("INSERT INTO settings(key,value) VALUES('hours','Ежедневно, 09:00–21:00') ON CONFLICT(key) DO NOTHING");
      await client.query("INSERT INTO settings(key,value) VALUES('hours_en','Daily, 09:00–21:00') ON CONFLICT(key) DO NOTHING");
      await client.query("INSERT INTO settings(key,value) VALUES('seeded','1')");
    }
    await client.query("INSERT INTO settings(key,value) VALUES('hours_en','Daily, 09:00–21:00') ON CONFLICT(key) DO NOTHING");
    for (const [name, , nameEn, descriptionEn] of seeds) {
      await client.query("UPDATE services SET name_en=COALESCE(NULLIF(name_en,''),$1),description_en=COALESCE(NULLIF(description_en,''),$2) WHERE name=$3", [nameEn, descriptionEn, name]);
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
