const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

// In production (Railway), DB_PATH env var points to the persistent volume
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'staff.db');

// Statement wrapper — gives better-sqlite3-like .run() / .get() / .all()
class Statement {
  constructor(sqlDb, sql, dbWrapper) {
    this._sqlDb = sqlDb;
    this._sql = sql;
    this._dbWrapper = dbWrapper;
  }

  _params(args) {
    if (args.length === 0) return [];
    if (args.length === 1 && Array.isArray(args[0])) return args[0];
    return args;
  }

  run(...args) {
    const p = this._params(args);
    this._sqlDb.run(this._sql, p);
    let lastInsertRowid = null;
    try {
      const res = this._sqlDb.exec('SELECT last_insert_rowid()');
      if (res.length) lastInsertRowid = res[0].values[0][0];
    } catch {}
    this._dbWrapper._save();
    return { lastInsertRowid };
  }

  get(...args) {
    const p = this._params(args);
    const stmt = this._sqlDb.prepare(this._sql);
    try {
      stmt.bind(p);
      return stmt.step() ? stmt.getAsObject() : undefined;
    } finally {
      stmt.free();
    }
  }

  all(...args) {
    const p = this._params(args);
    const stmt = this._sqlDb.prepare(this._sql);
    try {
      stmt.bind(p);
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      return rows;
    } finally {
      stmt.free();
    }
  }
}

// DB wrapper — thin layer over sql.js Database
class DBWrapper {
  constructor(sqlDb) {
    this._db = sqlDb;
  }

  exec(sql) {
    this._db.exec(sql);
    this._save();
    return this;
  }

  prepare(sql) {
    return new Statement(this._db, sql, this);
  }

  _save() {
    try {
      const data = this._db.export();
      fs.writeFileSync(DB_PATH, Buffer.from(data));
    } catch (e) {
      console.error('DB save error:', e.message);
    }
  }
}

async function init() {
  const SQL = await initSqlJs();

  let sqlDb;
  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    sqlDb = new SQL.Database(buf);
  } else {
    sqlDb = new SQL.Database();
  }

  const db = new DBWrapper(sqlDb);
  createTables(db);

  // Seed if empty
  const count = db.prepare('SELECT COUNT(*) as c FROM staff').get();
  if (count.c === 0) seedData(db);

  return db;
}

function createTables(db) {
  db._db.exec(`
    CREATE TABLE IF NOT EXISTS staff (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      ic_number TEXT,
      email TEXT,
      phone TEXT,
      department TEXT,
      job_title TEXT,
      date_joined TEXT,
      annual_entitlement INTEGER DEFAULT 15,
      mc_entitlement INTEGER DEFAULT 14,
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      staff_id INTEGER REFERENCES staff(id),
      date TEXT NOT NULL,
      check_in TEXT,
      check_out TEXT,
      status TEXT CHECK(status IN ('present','absent','on_leave','half_day')),
      notes TEXT,
      UNIQUE(staff_id, date)
    );

    CREATE TABLE IF NOT EXISTS leave_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      staff_id INTEGER REFERENCES staff(id),
      leave_type TEXT CHECK(leave_type IN ('annual','mc','emergency','unpaid','maternity','paternity')),
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      days INTEGER NOT NULL,
      reason TEXT,
      document_path TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
      applied_at TEXT DEFAULT CURRENT_TIMESTAMP,
      decided_at TEXT,
      director_notes TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
      role TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT
    );
  `);
  db._save();
}

function seedData(db) {
  const ins = db.prepare(`
    INSERT INTO staff (name, ic_number, email, phone, department, job_title, date_joined, annual_entitlement, mc_entitlement)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

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
    const r = ins.run(...s);
    ids.push(r.lastInsertRowid);
  }

  const insAtt = db.prepare(`
    INSERT OR IGNORE INTO attendance (staff_id, date, check_in, check_out, status, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
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
        insAtt.run(sid, dateStr, null, null, 'absent', 'No reason given');
      } else if (rand === 1 && d > 1) {
        insAtt.run(sid, dateStr, null, null, 'on_leave', 'Annual leave');
      } else {
        const ci = `0${8 + (rand % 2)}:${rand % 2 === 0 ? '55' : '10'}`;
        const co = '17:' + (rand % 2 === 0 ? '30' : '45');
        insAtt.run(sid, dateStr, ci, co, 'present', null);
      }
    }
  }

  const insLeave = db.prepare(`
    INSERT INTO leave_requests (staff_id, leave_type, start_date, end_date, days, reason, status, applied_at, decided_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const todayStr = today.toISOString().split('T')[0];
  insLeave.run(ids[0], 'annual', '2026-03-10', '2026-03-12', 3, 'Family vacation', 'approved', '2026-03-01', '2026-03-02');
  insLeave.run(ids[2], 'mc', '2026-04-05', '2026-04-06', 2, 'Fever and flu', 'approved', '2026-04-05', '2026-04-05');
  insLeave.run(ids[4], 'annual', '2026-04-01', '2026-04-03', 3, 'Personal matters', 'approved', '2026-03-25', '2026-03-26');
  insLeave.run(ids[1], 'annual', '2026-04-20', '2026-04-22', 3, 'Wedding ceremony', 'pending', todayStr, null);
  insLeave.run(ids[5], 'emergency', '2026-04-17', '2026-04-17', 1, 'Family emergency', 'pending', todayStr, null);
}

module.exports = { init };
