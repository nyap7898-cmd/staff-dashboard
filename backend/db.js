const { Pool } = require('pg');

let pool;

// Convert SQLite-style SQL to PostgreSQL
function toPostgres(sql) {
  let i = 0;
  // Replace ? placeholders with $1, $2, ...
  sql = sql.replace(/\?/g, () => `$${++i}`);
  // Convert substr(col, 1, 4) to LEFT(col, 4)
  sql = sql.replace(/\bsubstr\(([^,]+),\s*1,\s*4\)/gi, 'LEFT($1, 4)');
  return sql;
}

class Statement {
  constructor(pool, sql) {
    this._pool = pool;
    this._sql = sql;
  }

  _params(args) {
    if (args.length === 0) return [];
    if (args.length === 1 && Array.isArray(args[0])) return args[0];
    return args;
  }

  async run(...args) {
    const p = this._params(args);
    const wasIgnore = /INSERT\s+OR\s+IGNORE/i.test(this._sql);
    let sql = this._sql.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, 'INSERT INTO');
    sql = toPostgres(sql);
    if (/^\s*INSERT/i.test(sql)) {
      sql += wasIgnore ? ' ON CONFLICT DO NOTHING RETURNING id' : ' RETURNING id';
    }
    try {
      const result = await this._pool.query(sql, p);
      return { lastInsertRowid: result.rows[0]?.id || null };
    } catch (e) {
      if (e.code === '23505') return { lastInsertRowid: null }; // unique violation
      throw e;
    }
  }

  async get(...args) {
    const p = this._params(args);
    const sql = toPostgres(this._sql);
    const result = await this._pool.query(sql, p);
    return result.rows[0];
  }

  async all(...args) {
    const p = this._params(args);
    const sql = toPostgres(this._sql);
    const result = await this._pool.query(sql, p);
    return result.rows;
  }
}

class DBWrapper {
  constructor(pool) {
    this._pool = pool;
  }

  prepare(sql) {
    return new Statement(this._pool, sql);
  }

  async exec(sql) {
    await this._pool.query(sql);
  }

  // Convenience shortcuts: db.all(sql, ...params), db.get(sql, ...params), db.run(sql, ...params)
  async all(sql, ...args) { return this.prepare(sql).all(...args); }
  async get(sql, ...args) { return this.prepare(sql).get(...args); }
  async run(sql, ...args) { return this.prepare(sql).run(...args); }
}

async function createTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS staff (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      ic_number TEXT,
      email TEXT,
      phone TEXT,
      department TEXT,
      job_title TEXT,
      date_joined TEXT,
      annual_entitlement INTEGER DEFAULT 15,
      mc_entitlement INTEGER DEFAULT 14,
      annual_opening_used INTEGER DEFAULT 0,
      mc_opening_used INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      staff_pin TEXT
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id SERIAL PRIMARY KEY,
      staff_id INTEGER REFERENCES staff(id),
      date TEXT NOT NULL,
      check_in TEXT,
      lunch_out TEXT,
      lunch_in TEXT,
      check_out TEXT,
      status TEXT CHECK(status IN ('present','absent','on_leave','half_day')),
      notes TEXT,
      UNIQUE(staff_id, date)
    );

    CREATE TABLE IF NOT EXISTS leave_requests (
      id SERIAL PRIMARY KEY,
      staff_id INTEGER REFERENCES staff(id),
      leave_type TEXT CHECK(leave_type IN ('annual','mc','emergency','unpaid','maternity','paternity')),
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      days REAL NOT NULL,
      reason TEXT,
      document_path TEXT,
      document_data TEXT,
      document_mime TEXT,
      document_name TEXT,
      half_day_period TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
      applied_at TEXT,
      decided_at TEXT,
      director_notes TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id SERIAL PRIMARY KEY,
      timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      role TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT
    );
  `);
}

async function seedData(pool) {
  const staffList = [
    ['Ahmad Nizam', '880512-14-5678', 'ahmad.nizam@moonface.com', '0112-3456789', 'Administration', 'Admin Executive', '2020-03-15', 15, 14],
    ['Siti Rahimah', '910823-10-2345', 'siti.rahimah@moonface.com', '0123-4567890', 'Human Resources', 'HR Officer', '2019-07-01', 15, 14],
    ['Kumar Vijay', '870305-07-8901', 'kumar.vijay@moonface.com', '0134-5678901', 'IT', 'IT Support', '2021-01-10', 15, 14],
    ['Nur Farah', '950618-05-3456', 'nur.farah@moonface.com', '0145-6789012', 'Finance', 'Finance Executive', '2022-04-20', 15, 14],
    ['Rajan Arumugam', '850129-08-7890', 'rajan.arumugam@moonface.com', '0156-7890123', 'Operations', 'Operations Executive', '2018-11-05', 18, 14],
    ['Zainab Hamid', '930714-11-4567', 'zainab.hamid@moonface.com', '0167-8901234', 'Administration', 'Receptionist', '2023-02-14', 15, 14],
    ['Chen Li Ying', '920401-06-9012', 'chen.liying@moonface.com', '0178-9012345', 'Marketing', 'Marketing Executive', '2021-08-30', 15, 14],
  ];

  const ids = [];
  for (const s of staffList) {
    const r = await pool.query(
      `INSERT INTO staff (name,ic_number,email,phone,department,job_title,date_joined,annual_entitlement,mc_entitlement)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`, s
    );
    ids.push(r.rows[0].id);
  }

  const today = new Date();
  for (let d = 6; d >= 0; d--) {
    const date = new Date(today);
    date.setDate(today.getDate() - d);
    const dateStr = date.toISOString().split('T')[0];
    if (date.getDay() === 0 || date.getDay() === 6) continue;
    for (let i = 0; i < ids.length; i++) {
      const sid = ids[i];
      const rand = (sid + d) % 10;
      if (rand === 0 && d > 0) {
        await pool.query(`INSERT INTO attendance (staff_id,date,status,notes) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [sid, dateStr, 'absent', 'No reason given']);
      } else if (rand === 1 && d > 1) {
        await pool.query(`INSERT INTO attendance (staff_id,date,status,notes) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [sid, dateStr, 'on_leave', 'Annual leave']);
      } else {
        const ci = `0${8 + (rand % 2)}:${rand % 2 === 0 ? '55' : '10'}`;
        const co = '17:' + (rand % 2 === 0 ? '30' : '45');
        await pool.query(`INSERT INTO attendance (staff_id,date,check_in,check_out,status) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`, [sid, dateStr, ci, co, 'present']);
      }
    }
  }

  const todayStr = today.toISOString().split('T')[0];
  const leaves = [
    [ids[0], 'annual', '2026-03-10', '2026-03-12', 3, 'Family vacation', 'approved', '2026-03-01', '2026-03-02'],
    [ids[2], 'mc', '2026-04-05', '2026-04-06', 2, 'Fever and flu', 'approved', '2026-04-05', '2026-04-05'],
    [ids[4], 'annual', '2026-04-01', '2026-04-03', 3, 'Personal matters', 'approved', '2026-03-25', '2026-03-26'],
    [ids[1], 'annual', '2026-04-20', '2026-04-22', 3, 'Wedding ceremony', 'pending', todayStr, null],
    [ids[5], 'emergency', '2026-04-17', '2026-04-17', 1, 'Family emergency', 'pending', todayStr, null],
  ];
  for (const l of leaves) {
    await pool.query(
      `INSERT INTO leave_requests (staff_id,leave_type,start_date,end_date,days,reason,status,applied_at,decided_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, l
    );
  }
}

async function init() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL environment variable is required');

  pool = new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  await createTables(pool);

  const count = await pool.query('SELECT COUNT(*)::int as c FROM staff');
  if (count.rows[0].c === 0) {
    await seedData(pool);
    console.log('Database seeded with initial data');
  }

  const db = new DBWrapper(pool);
  console.log('PostgreSQL database connected');
  return db;
}

module.exports = { init };
