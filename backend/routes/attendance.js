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
      check_in:   attMap[s.id]?.check_in   || null,
      lunch_out:  attMap[s.id]?.lunch_out   || null,
      lunch_in:   attMap[s.id]?.lunch_in    || null,
      check_out:  attMap[s.id]?.check_out   || null,
      status: attMap[s.id]?.status || null,
      notes: attMap[s.id]?.notes || null,
    }));

    res.json(records);
  });

  router.post('/', (req, res) => {
    const { staff_id, date, check_in, lunch_out, lunch_in, check_out, status, notes } = req.body;
    const role = req.headers['x-user-role'] || 'unknown';

    const existing = db.prepare('SELECT id FROM attendance WHERE staff_id=? AND date=?').get(staff_id, date);
    if (existing) {
      db.prepare(`UPDATE attendance SET check_in=?, lunch_out=?, lunch_in=?, check_out=?, status=?, notes=? WHERE id=?`)
        .run(check_in || null, lunch_out || null, lunch_in || null, check_out || null, status, notes || null, existing.id);
    } else {
      db.prepare(`INSERT INTO attendance (staff_id, date, check_in, lunch_out, lunch_in, check_out, status, notes) VALUES (?,?,?,?,?,?,?,?)`)
        .run(staff_id, date, check_in || null, lunch_out || null, lunch_in || null, check_out || null, status, notes || null);
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

  // Parse timestamps from a Logs cell value (newline-separated times)
  function parseTimestamps(cellVal) {
    const s = String(cellVal || '').trim();
    const times = s.split(/[\n\r]+/).map(t => t.trim()).filter(t => /^\d{1,2}:\d{2}$/.test(t));
    let check_in = null, lunch_out = null, lunch_in = null, check_out = null;
    if (times.length === 1) {
      check_in  = times[0].padStart(5, '0');
    } else if (times.length === 2) {
      check_in  = times[0].padStart(5, '0');
      check_out = times[1].padStart(5, '0');
    } else if (times.length === 3) {
      check_in  = times[0].padStart(5, '0');
      lunch_out = times[1].padStart(5, '0');
      check_out = times[2].padStart(5, '0');
    } else if (times.length >= 4) {
      check_in  = times[0].padStart(5, '0');
      lunch_out = times[1].padStart(5, '0');
      lunch_in  = times[2].padStart(5, '0');
      check_out = times[3].padStart(5, '0');
    }
    return { check_in, lunch_out, lunch_in, check_out };
  }

  // Extract all times from the Logs sheet, keyed by staffNo → dateStr → times
  // Handles both single-day (1 day column) and multi-day (multiple day columns per row)
  // Returns: { "1": { "2026-01-28": { check_in, ... }, "2026-01-29": {...} }, "2": {...} }
  function extractTimesFromLogsSheet(wb) {
    const result = {}; // { staffNo: { dateStr: { check_in, ... } } }
    const logName = wb.SheetNames.find(n => /^log/i.test(n));
    if (!logName) return result;

    const sheet = wb.Sheets[logName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    // Get year + start month from period header (rows 0-4)
    let year = null, month = null;
    for (let r = 0; r < Math.min(5, rows.length); r++) {
      const rowStr = (rows[r] || []).map(c => String(c)).join(' ');
      const m = rowStr.match(/(\d{4})\/(\d{2})\/(\d{2})/);
      if (m) { year = m[1]; month = m[2]; break; }
    }
    if (!year) return result;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || [];
      if (String(row[0]).trim() !== 'No :') continue;

      const staffNo = String(row[2] || '').trim();
      if (!staffNo || isNaN(Number(staffNo)) || Number(staffNo) > 9000) continue;

      // Day numbers are in the row just before "No :" (look up 1-3 rows back)
      let dayNumRow = [];
      for (let k = i - 1; k >= Math.max(0, i - 3); k--) {
        const prev = rows[k] || [];
        if (prev.some(c => typeof c === 'number' && c >= 1 && c <= 31)) {
          dayNumRow = prev; break;
        }
      }

      // Timestamps row is the row immediately after "No :"
      const tsRow = rows[i + 1] || [];

      if (!result[staffNo]) result[staffNo] = {};

      // Each column = one day
      const numCols = Math.max(dayNumRow.length, tsRow.length);
      for (let col = 0; col < numCols; col++) {
        const dayNum = dayNumRow[col];
        if (typeof dayNum !== 'number' || dayNum < 1 || dayNum > 31) continue;

        const dateStr = `${year}-${month}-${String(dayNum).padStart(2, '0')}`;
        const times = parseTimestamps(tsRow[col]);
        if (times.check_in) result[staffNo][dateStr] = times;
      }
    }
    return result;
  }

  // Detect & parse the machine XLS (Summary + Logs sheets)
  // Returns: { sheetName, dateRange, dates, records[] }
  function detectMachineFormat(wb, allStaff) {
    const summaryName = wb.SheetNames.find(n => /summary/i.test(n));
    if (!summaryName) return null;

    const sheet = wb.Sheets[summaryName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (rows.length < 5) return null;

    // Extract date range from row 1: "2026/01/28 ~ 01/31" or "2026/02/27 ~ 02/27"
    let dateRange = '', year = '', startMonth = '', startDay = '', endDay = '';
    for (let r = 0; r < Math.min(5, rows.length); r++) {
      const rowStr = (rows[r] || []).map(c => String(c)).join(' ');
      // Full pattern: 2026/01/28 ~ 01/31
      const m = rowStr.match(/(\d{4})\/(\d{2})\/(\d{2})\s*~\s*(?:\d{2}\/)?(\d{2})/);
      if (m) {
        year = m[1]; startMonth = m[2]; startDay = m[3]; endDay = m[4];
        const startDate = `${year}-${startMonth}-${startDay.padStart(2, '0')}`;
        const endDate   = `${year}-${startMonth}-${endDay.padStart(2, '0')}`;
        dateRange = startDate === endDate ? startDate : `${startDate} ~ ${endDate}`;
        break;
      }
    }
    if (!year) return null;

    // Find header row (contains "Name" and "No")
    let nameCol = 1;
    for (let r = 0; r < Math.min(8, rows.length); r++) {
      const lower = (rows[r] || []).map(c => String(c).trim().toLowerCase());
      if (lower.includes('name') && (lower.includes('no') || lower.includes('no.'))) {
        nameCol = lower.indexOf('name'); break;
      }
    }
    const dataStart = 4; // rows 0-3 are always headers

    // Build staff list from Summary
    const staffInFile = []; // [{ noVal, rawName, staffId, staffName }]
    for (let r = dataStart; r < rows.length; r++) {
      const row = rows[r] || [];
      const noVal   = String(row[0] || '').trim();
      const rawName = String(row[nameCol] || '').trim();
      if (!rawName) continue;
      const noNum = parseFloat(noVal);
      if (isNaN(noNum) || noNum <= 0 || noNum > 9000) continue;
      const matched = matchStaffByName(rawName, allStaff);
      staffInFile.push({ noVal: String(Math.round(noNum)), rawName, staffId: matched?.id || null, staffName: matched?.name || null });
    }
    if (staffInFile.length === 0) return null;

    // Get all times from Logs sheet: { staffNo: { dateStr: times } }
    let timesMap = {};
    try { timesMap = extractTimesFromLogsSheet(wb); } catch (e) { /* fall through */ }

    // Collect all dates that appear in the Logs (any staff has punches)
    const allDates = new Set();
    for (const staffNo of Object.keys(timesMap)) {
      for (const d of Object.keys(timesMap[staffNo])) allDates.add(d);
    }
    const dates = [...allDates].sort();

    // Build records: one per staff per date (present if has times, absent if date has other staff present)
    const records = [];
    for (const date of dates) {
      for (const { noVal, rawName, staffId, staffName } of staffInFile) {
        const times = timesMap[noVal]?.[date] || null;
        const check_in  = times?.check_in  || null;
        const lunch_out = times?.lunch_out || null;
        const lunch_in  = times?.lunch_in  || null;
        const check_out = times?.check_out || null;
        const status = check_in ? 'present' : 'absent';
        records.push({ rawName, staffId, staffName, date, check_in, lunch_out, lunch_in, check_out, status });
      }
    }

    if (records.length === 0) return null;
    const firstDate = dates[0] || `${year}-${startMonth}-${startDay.padStart(2, '0')}`;
    return { sheetName: summaryName, date: firstDate, dateRange, dates, records };
  }

  // parseMachineBlocks is unused — kept for safety
  function parseMachineBlocks(rows, date, allStaff) { return []; }

  // POST /api/attendance/parse-machine — detect & preview thumbprint machine XLS
  router.post('/parse-machine', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    try {
      const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
      const allStaff = db.prepare('SELECT id, name FROM staff WHERE is_active=1').all();

      // Attempt detection and collect debug info
      let detected = null;
      let debugError = null;
      try {
        detected = detectMachineFormat(wb, allStaff);
      } catch (e) {
        debugError = e.message;
      }

      if (!detected) {
        // Return sheet names + first few rows of each sheet for debugging
        const debugSheets = wb.SheetNames.slice(0, 5).map(name => {
          try {
            const s = wb.Sheets[name];
            const rows = XLSX.utils.sheet_to_json(s, { header: 1, defval: '' });
            return { name, rows: rows.slice(0, 3).map(r => r.slice(0, 6).map(c => String(c).trim())) };
          } catch (e) { return { name, rows: [], error: e.message }; }
        });
        return res.json({ isMachineFormat: false, sheets: wb.SheetNames, debugSheets, debugError });
      }

      res.json({ isMachineFormat: true, date: detected.date, dateRange: detected.dateRange, dates: detected.dates, sheet: detected.sheetName, records: detected.records, allStaff });
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
          db.prepare(`UPDATE attendance SET check_in=?, lunch_out=?, lunch_in=?, check_out=?, status=?, notes=? WHERE id=?`)
            .run(rec.check_in, rec.lunch_out || null, rec.lunch_in || null, rec.check_out, rec.status, 'Thumbprint machine', existing.id);
        } else {
          db.prepare(`INSERT INTO attendance (staff_id, date, check_in, lunch_out, lunch_in, check_out, status, notes) VALUES (?,?,?,?,?,?,?,?)`)
            .run(rec.staffId, rec.date, rec.check_in, rec.lunch_out || null, rec.lunch_in || null, rec.check_out, rec.status, 'Thumbprint machine');
        }
        imported++;
      }

      const rangeLabel = detected.dateRange || detected.date;
      db.prepare('INSERT INTO audit_log (role, action, details) VALUES (?,?,?)').run(role, 'Attendance Machine Import', `${rangeLabel}: ${imported} imported, ${skipped} unmatched`);
      if (role === 'hr') {
        notify(`📂 <b>Attendance Imported (Machine) by HR</b>\n📅 ${rangeLabel}\n✅ ${imported} records\n⚠️ Unmatched: ${unmatched.join(', ') || 'none'}`);
      }

      res.json({ imported, skipped, unmatched, date: detected.date, dateRange: detected.dateRange || detected.date });
    } catch (e) {
      res.status(400).json({ error: 'Import failed: ' + e.message });
    }
  });

  return router;
};
