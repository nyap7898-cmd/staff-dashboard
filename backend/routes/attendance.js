const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');

const upload = multer({ storage: multer.memoryStorage() });

module.exports = function (db, notify) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const staff = db.prepare('SELECT * FROM staff WHERE is_active = 1 ORDER BY name').all();
    const attRows = db.prepare('SELECT * FROM attendance WHERE date = ?').all(date);
    const attMap = {};
    for (const r of attRows) attMap[r.staff_id] = r;

    const records = staff.map(s => ({
      id: attMap[s.id]?.id || null,
      staff_id: s.id,
      name: s.name,
      department: s.department,
      date,
      check_in: attMap[s.id]?.check_in || null,
      check_out: attMap[s.id]?.check_out || null,
      status: attMap[s.id]?.status || null,
      notes: attMap[s.id]?.notes || null,
    }));

    res.json(records);
  });

  router.post('/', (req, res) => {
    const { staff_id, date, check_in, check_out, status, notes } = req.body;
    const role = req.headers['x-user-role'] || 'unknown';

    const existing = db.prepare('SELECT id FROM attendance WHERE staff_id=? AND date=?').get(staff_id, date);
    if (existing) {
      db.prepare(`UPDATE attendance SET check_in=?, check_out=?, status=?, notes=? WHERE id=?`)
        .run(check_in || null, check_out || null, status, notes || null, existing.id);
    } else {
      db.prepare(`INSERT INTO attendance (staff_id, date, check_in, check_out, status, notes) VALUES (?,?,?,?,?,?)`)
        .run(staff_id, date, check_in || null, check_out || null, status, notes || null);
    }

    const staffRow = db.prepare('SELECT name FROM staff WHERE id=?').get(staff_id);
    const staffName = staffRow ? staffRow.name : `Staff #${staff_id}`;
    const details = `${staffName} | ${date} | ${status}${check_in ? ` | In: ${check_in}` : ''}${check_out ? ` | Out: ${check_out}` : ''}`;

    db.prepare('INSERT INTO audit_log (role, action, details) VALUES (?,?,?)').run(role, 'Attendance Edit', details);

    if (role === 'hr') {
      notify(`⚠️ <b>Attendance Modified by HR</b>\n👤 ${staffName}\n📅 ${date}\n📌 Status: ${status}${check_in ? `\n🕘 In: ${check_in}` : ''}${check_out ? ` | Out: ${check_out}` : ''}`);
    }

    res.json({ success: true });
  });

  // POST /api/attendance/parse-file — parse uploaded file, return rows + columns
  router.post('/parse-file', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    try {
      const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

      if (rows.length < 2) return res.status(400).json({ error: 'File appears to be empty' });

      // First non-empty row is headers
      let headerIdx = 0;
      for (let i = 0; i < Math.min(5, rows.length); i++) {
        if (rows[i].some(c => String(c).trim() !== '')) { headerIdx = i; break; }
      }

      const headers = rows[headerIdx].map(h => String(h).trim());
      const dataRows = rows.slice(headerIdx + 1)
        .filter(r => r.some(c => String(c).trim() !== ''))
        .slice(0, 200)
        .map(r => headers.map((_, i) => String(r[i] ?? '').trim()));

      // Auto-detect columns
      const lower = headers.map(h => h.toLowerCase());
      function detect(keywords) {
        const idx = lower.findIndex(h => keywords.some(k => h.includes(k)));
        return idx >= 0 ? idx : null;
      }

      const suggested = {
        nameCol:    detect(['name', 'staff', 'employee', 'emp']),
        dateCol:    detect(['date', 'day']),
        checkInCol: detect(['check in', 'checkin', 'in time', 'clock in', 'time in', 'in']),
        checkOutCol: detect(['check out', 'checkout', 'out time', 'clock out', 'time out', 'out']),
      };

      res.json({ headers, rows: dataRows.slice(0, 10), totalRows: dataRows.length, suggested });
    } catch (e) {
      res.status(400).json({ error: 'Could not read file: ' + e.message });
    }
  });

  // POST /api/attendance/import — import mapped data
  router.post('/import', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const { nameCol, dateCol, checkInCol, checkOutCol } = req.body;
    const role = req.headers['x-user-role'] || 'unknown';

    const nc = parseInt(nameCol), dc = parseInt(dateCol);
    const ic = checkInCol !== '' ? parseInt(checkInCol) : null;
    const oc = checkOutCol !== '' ? parseInt(checkOutCol) : null;

    try {
      const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

      let headerIdx = 0;
      for (let i = 0; i < Math.min(5, rows.length); i++) {
        if (rows[i].some(c => String(c).trim() !== '')) { headerIdx = i; break; }
      }

      const dataRows = rows.slice(headerIdx + 1).filter(r => r.some(c => String(c).trim() !== ''));
      const allStaff = db.prepare('SELECT id, name FROM staff WHERE is_active=1').all();

      // Fuzzy name match
      function matchStaff(nameStr) {
        const n = nameStr.toLowerCase().trim();
        return allStaff.find(s => {
          const sn = s.name.toLowerCase();
          return sn === n || sn.includes(n) || n.includes(sn) ||
            s.name.split(' ').some(part => part.toLowerCase() === n.split(' ')[0]);
        });
      }

      function parseTime(val) {
        if (!val) return null;
        const s = String(val).trim();
        if (!s) return null;
        // HH:MM or HH:MM:SS
        const m = s.match(/(\d{1,2}):(\d{2})/);
        if (m) return `${m[1].padStart(2,'0')}:${m[2]}`;
        // Excel time as decimal (0.375 = 09:00)
        const n = parseFloat(s);
        if (!isNaN(n) && n < 1) {
          const totalMin = Math.round(n * 24 * 60);
          return `${String(Math.floor(totalMin/60)).padStart(2,'0')}:${String(totalMin%60).padStart(2,'0')}`;
        }
        return null;
      }

      function parseDate(val) {
        if (!val) return null;
        const s = String(val).trim();
        // Already YYYY-MM-DD
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        // DD/MM/YYYY
        const m1 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
        if (m1) return `${m1[3]}-${m1[2].padStart(2,'0')}-${m1[1].padStart(2,'0')}`;
        // MM/DD/YYYY
        const m2 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
        if (m2) {
          const yr = m2[3].length === 2 ? '20' + m2[3] : m2[3];
          return `${yr}-${m2[1].padStart(2,'0')}-${m2[2].padStart(2,'0')}`;
        }
        // Excel serial date number
        const n = parseInt(s);
        if (!isNaN(n) && n > 40000) {
          const d = XLSX.SSF.parse_date_code(n);
          if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
        }
        // Try JS Date
        const dt = new Date(s);
        if (!isNaN(dt)) return dt.toISOString().split('T')[0];
        return null;
      }

      let imported = 0, skipped = 0, noMatch = 0;
      const unmatched = new Set();

      for (const row of dataRows) {
        const rawName = String(row[nc] ?? '').trim();
        const rawDate = String(row[dc] ?? '').trim();
        if (!rawName || !rawDate) { skipped++; continue; }

        const date = parseDate(rawDate);
        if (!date) { skipped++; continue; }

        const staff = matchStaff(rawName);
        if (!staff) { noMatch++; unmatched.add(rawName); continue; }

        const check_in = ic !== null ? parseTime(row[ic]) : null;
        const check_out = oc !== null ? parseTime(row[oc]) : null;
        const status = check_in ? 'present' : 'absent';

        const existing = db.prepare('SELECT id FROM attendance WHERE staff_id=? AND date=?').get(staff.id, date);
        if (existing) {
          db.prepare(`UPDATE attendance SET check_in=?, check_out=?, status=?, notes=? WHERE id=?`)
            .run(check_in, check_out, status, 'Imported from file', existing.id);
        } else {
          db.prepare(`INSERT INTO attendance (staff_id, date, check_in, check_out, status, notes) VALUES (?,?,?,?,?,?)`)
            .run(staff.id, date, check_in, check_out, status, 'Imported from file');
        }
        imported++;
      }

      const details = `File import: ${imported} records imported, ${skipped} skipped, ${noMatch} unmatched`;
      db.prepare('INSERT INTO audit_log (role, action, details) VALUES (?,?,?)').run(role, 'Attendance File Import', details);

      if (role === 'hr') {
        notify(`📂 <b>Attendance File Imported by HR</b>\n✅ ${imported} records imported\n⚠️ ${noMatch} names not matched\n🗂️ ${[...unmatched].slice(0,3).join(', ')}${unmatched.size > 3 ? '...' : ''}`);
      }

      res.json({ imported, skipped, noMatch, unmatched: [...unmatched] });
    } catch (e) {
      res.status(400).json({ error: 'Import failed: ' + e.message });
    }
  });

  // ─── Thumbprint machine format helpers ───────────────────────────────────────

  function detectMachineFormat(wb) {
    // Try sheets named Log/Detail first, then try ALL sheets
    const preferred = wb.SheetNames.find(n => /log|detail/i.test(n));
    const sheetsToTry = preferred
      ? [preferred, ...wb.SheetNames.filter(n => n !== preferred)]
      : wb.SheetNames;

    for (const sheetName of sheetsToTry) {
      const sheet = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      if (rows.length < 4) continue;

      // Scan first 10 rows for a date pattern like 2026/02/27
      let date = null;
      for (let r = 0; r < Math.min(10, rows.length); r++) {
        const rowStr = (rows[r] || []).map(c => String(c)).join(' ');
        const m = rowStr.match(/(\d{4})\/(\d{2})\/(\d{2})/);
        if (m) { date = `${m[1]}-${m[2]}-${m[3]}`; break; }
      }
      if (!date) continue;

      // Confirm it has the block structure: look for a row containing "Name :" pattern
      const hasNameRow = rows.some(row =>
        (row || []).some(c => String(c).includes('Name'))
      );
      if (!hasNameRow) continue;

      return { logName: sheetName, rows, date };
    }
    return null;
  }

  function parseMachineBlocks(rows, date, allStaff) {
    const results = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || [];
      const rowStr = row.map(c => String(c)).join(' ');

      // Find rows that contain "Name :" — this marks a staff block
      if (!rowStr.includes('Name')) continue;

      // Extract name: look for non-empty cell after "Name :" pattern
      // Standard format: [..., "Name :", "", "yap", ...]
      // Find index of the cell containing "Name"
      let rawName = '';
      for (let col = 0; col < row.length; col++) {
        if (String(row[col]).includes('Name')) {
          // Name value is usually 2 cells after "Name :"
          rawName = String(row[col + 2] || row[col + 1] || '').trim();
          if (rawName && rawName !== ':') break;
        }
      }
      if (!rawName || rawName === ':') continue;

      // Timestamp row is the next row
      const tsRow = rows[i + 1] || [];
      const tsCell = String(tsRow[0] || '').trim();
      const times = tsCell
        .split(/[\n\r]+/)
        .map(t => t.trim())
        .filter(t => /^\d{1,2}:\d{2}$/.test(t));

      const check_in  = times.length > 0 ? times[0].padStart(5, '0') : null;
      const check_out = times.length > 1 ? times[times.length - 1].padStart(5, '0') : null;
      const status    = check_in ? 'present' : 'absent';

      // Fuzzy match to staff
      const n = rawName.toLowerCase();
      const matched = allStaff.find(s => {
        const sn = s.name.toLowerCase();
        const parts = sn.split(' ');
        return sn === n || sn.includes(n) || n.includes(sn) ||
          parts.some(p => p === n || p.startsWith(n) || n.startsWith(p));
      });

      results.push({ rawName, staffId: matched?.id || null, staffName: matched?.name || null, date, check_in, check_out, status });
    }
    return results;
  }

  // POST /api/attendance/parse-machine — detect & preview thumbprint machine XLS
  router.post('/parse-machine', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    try {
      const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
      const detected = detectMachineFormat(wb);
      if (!detected) {
        // Return sheet names so frontend can show debug info
        return res.json({ isMachineFormat: false, sheets: wb.SheetNames });
      }

      const allStaff = db.prepare('SELECT id, name FROM staff WHERE is_active=1').all();
      const records  = parseMachineBlocks(detected.rows, detected.date, allStaff);

      res.json({ isMachineFormat: true, date: detected.date, sheet: detected.logName, records, allStaff });
    } catch (e) {
      res.status(400).json({ error: 'Could not read file: ' + e.message });
    }
  });

  // POST /api/attendance/import-machine — import thumbprint machine XLS
  router.post('/import-machine', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const role = req.headers['x-user-role'] || 'unknown';
    try {
      const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
      const detected = detectMachineFormat(wb);
      if (!detected) return res.status(400).json({ error: 'Not a recognised machine format' });

      const allStaff = db.prepare('SELECT id, name FROM staff WHERE is_active=1').all();
      const records  = parseMachineBlocks(detected.rows, detected.date, allStaff);

      // Manual overrides: { "yap": "5", "ming": "3", ... } rawName → staffId
      let overrides = {};
      try { overrides = JSON.parse(req.body.overrides || '{}'); } catch {}

      let imported = 0, skipped = 0;
      const unmatched = [];

      for (const rec of records) {
        // Apply manual override if provided
        if (!rec.staffId && overrides[rec.rawName]) {
          rec.staffId = parseInt(overrides[rec.rawName]);
          const s = allStaff.find(x => x.id === rec.staffId);
          rec.staffName = s ? s.name : null;
        }
        if (!rec.staffId) { unmatched.push(rec.rawName); skipped++; continue; }

        const existing = db.prepare('SELECT id FROM attendance WHERE staff_id=? AND date=?').get(rec.staffId, rec.date);
        if (existing) {
          db.prepare(`UPDATE attendance SET check_in=?, check_out=?, status=?, notes=? WHERE id=?`)
            .run(rec.check_in, rec.check_out, rec.status, 'Thumbprint machine', existing.id);
        } else {
          db.prepare(`INSERT INTO attendance (staff_id, date, check_in, check_out, status, notes) VALUES (?,?,?,?,?,?)`)
            .run(rec.staffId, rec.date, rec.check_in, rec.check_out, rec.status, 'Thumbprint machine');
        }
        imported++;
      }

      db.prepare('INSERT INTO audit_log (role, action, details) VALUES (?,?,?)').run(role, 'Attendance Machine Import', `${detected.date}: ${imported} imported, ${skipped} unmatched`);
      if (role === 'hr') {
        notify(`📂 <b>Attendance Imported (Machine) by HR</b>\n📅 ${detected.date}\n✅ ${imported} records\n⚠️ Unmatched: ${unmatched.join(', ') || 'none'}`);
      }

      res.json({ imported, skipped, unmatched, date: detected.date });
    } catch (e) {
      res.status(400).json({ error: 'Import failed: ' + e.message });
    }
  });

  return router;
};
