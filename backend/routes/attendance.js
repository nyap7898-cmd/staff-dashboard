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
        if (!n) return null;
        return allStaff.find(s => {
          const sn = s.name.toLowerCase().trim();
          if (!sn) return false; // skip staff records with empty names
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

  // Fuzzy match a raw name string to a staff record
  function matchStaffByName(rawName, allStaff) {
    const n = rawName.toLowerCase().trim();
    if (!n) return null;
    return allStaff.find(s => {
      const sn = s.name.toLowerCase().trim();
      if (!sn) return false; // skip staff records with empty names
      const parts = sn.split(' ');
      return sn === n || sn.includes(n) || n.includes(sn) ||
        parts.some(p => p.length >= 2 && (p === n || p.startsWith(n) || n.startsWith(p)));
    });
  }

  // Extract check-in/check-out times from the Logs sheet (block format)
  // Returns { "yap": { check_in: "08:28", check_out: "16:23" }, ... }
  function extractTimesFromLogSheet(wb) {
    const logName = wb.SheetNames.find(n => /log|detail/i.test(n));
    if (!logName) return {};
    const sheet = wb.Sheets[logName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    const timesMap = {};

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || [];
      // Look for a row that has a cell containing "Name" (marks a staff block header)
      const nameIdx = row.findIndex(c => /^Name\s*[:：]?$/.test(String(c).trim()));
      if (nameIdx < 0) continue;

      // Name is in the next non-empty cell(s)
      let rawName = '';
      for (let ci = nameIdx + 1; ci < row.length; ci++) {
        const val = String(row[ci]).trim();
        if (val && val !== ':') { rawName = val; break; }
      }
      if (!rawName) continue;

      // Scan the next few rows for time patterns HH:MM
      let check_in = null, check_out = null;
      for (let j = i + 1; j < Math.min(i + 6, rows.length); j++) {
        const tsRow = rows[j] || [];
        const allTimes = [];
        for (const cell of tsRow) {
          const s = String(cell || '').trim();
          // Each cell may contain multiple times separated by newlines
          const found = s.split(/[\n\r,\s]+/).filter(t => /^\d{1,2}:\d{2}(:\d{2})?$/.test(t));
          allTimes.push(...found);
        }
        if (allTimes.length > 0) {
          check_in  = allTimes[0].substring(0, 5).padStart(5, '0');
          check_out = allTimes.length > 1 ? allTimes[allTimes.length - 1].substring(0, 5).padStart(5, '0') : null;
          break;
        }
      }
      timesMap[rawName.toLowerCase()] = { check_in, check_out };
    }
    return timesMap;
  }

  // Parse the Summary sheet (tabular format)
  // Row 0: "Summary of Attendance"
  // Row 1: ["Date: ", "2026/02/27 ~ ...", ...]
  // Row 2-3: headers
  // Row 4+: [No, Name, Dept, Scheduled, Actual_hrs, ..., AB]
  function parseSummarySheet(wb, sheetName, allStaff) {
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (rows.length < 5) return null;

    // Extract date from first 5 rows
    let date = null;
    for (let r = 0; r < Math.min(5, rows.length); r++) {
      const rowStr = (rows[r] || []).map(c => String(c)).join(' ');
      const m = rowStr.match(/(\d{4})\/(\d{2})\/(\d{2})/);
      if (m) { date = `${m[1]}-${m[2]}-${m[3]}`; break; }
    }
    if (!date) return null;

    // Find header row (contains "Name" and "No")
    let headerRowIdx = -1;
    let nameCol = 1, actualCol = 4, abCol = -1;
    for (let r = 0; r < Math.min(8, rows.length); r++) {
      const row = rows[r] || [];
      const lower = row.map(c => String(c).trim().toLowerCase());
      if (lower.includes('name') && (lower.includes('no') || lower.includes('no.'))) {
        headerRowIdx = r;
        nameCol    = lower.indexOf('name');
        // Find actual hours column
        const actualIdx = lower.findIndex(h => h.includes('actual') || h.includes('work hour') || h.includes('real'));
        if (actualIdx >= 0) actualCol = actualIdx;
        // Find AB (absent) column
        const abIdx = row.findIndex(c => String(c).trim().toUpperCase() === 'AB');
        if (abIdx >= 0) abCol = abIdx;
        break;
      }
    }

    const dataStart = headerRowIdx >= 0 ? headerRowIdx + 1 : 4;
    // Get times from Logs sheet if available
    const timesMap = extractTimesFromLogSheet(wb);

    const records = [];
    for (let r = dataStart; r < rows.length; r++) {
      const row = rows[r] || [];
      const noVal   = String(row[0] || '').trim();
      const rawName = String(row[nameCol] || '').trim();

      if (!rawName) continue;
      // Skip if "No" column isn't a valid small integer (e.g. skip total/summary rows)
      const noNum = parseFloat(noVal);
      if (isNaN(noNum) || noNum <= 0 || noNum > 9000) continue;

      const actualHrs = parseFloat(String(row[actualCol] || '0').replace(/[^\d.]/g, '')) || 0;
      // AB column: "1" means absent. Fallback: actualHrs === 0
      const abVal = abCol >= 0 ? String(row[abCol] || '').trim() : '';
      const isAbsent = actualHrs === 0 || abVal === '1';
      const status = isAbsent ? 'absent' : 'present';

      // Get times from Logs sheet
      const times = timesMap[rawName.toLowerCase()];
      const check_in  = isAbsent ? null : (times?.check_in  || null);
      const check_out = isAbsent ? null : (times?.check_out || null);

      const matched = matchStaffByName(rawName, allStaff);
      records.push({ rawName, staffId: matched?.id || null, staffName: matched?.name || null, date, check_in, check_out, status });
    }

    if (records.length === 0) return null;
    return { sheetName, date, records };
  }

  // Main detection: tries Summary sheet first, then falls back to Log/Detail sheet block parsing
  function detectMachineFormat(wb, allStaff) {
    // Strategy 1: Summary sheet (clean tabular data)
    const summaryName = wb.SheetNames.find(n => /summary/i.test(n));
    if (summaryName) {
      const result = parseSummarySheet(wb, summaryName, allStaff);
      if (result) return result;
    }

    // Strategy 2: Try every sheet for summary-style data
    for (const name of wb.SheetNames) {
      if (name === summaryName) continue;
      const result = parseSummarySheet(wb, name, allStaff);
      if (result) return result;
    }

    return null;
  }

  // parseMachineBlocks is now unused but kept for safety
  function parseMachineBlocks(rows, date, allStaff) {
    return [];
  }

  // POST /api/attendance/parse-machine — detect & preview thumbprint machine XLS
  router.post('/parse-machine', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    try {
      const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
      const allStaff = db.prepare('SELECT id, name FROM staff WHERE is_active=1').all();
      const detected = detectMachineFormat(wb, allStaff);
      if (!detected) {
        return res.json({ isMachineFormat: false, sheets: wb.SheetNames });
      }
      res.json({ isMachineFormat: true, date: detected.date, sheet: detected.sheetName, records: detected.records, allStaff });
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
      const allStaff = db.prepare('SELECT id, name FROM staff WHERE is_active=1').all();
      const detected = detectMachineFormat(wb, allStaff);
      if (!detected) return res.status(400).json({ error: 'Not a recognised machine format' });

      const records = detected.records;

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
