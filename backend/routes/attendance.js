const express = require('express');

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
      db.prepare(`
        UPDATE attendance SET check_in=?, check_out=?, status=?, notes=? WHERE id=?
      `).run(check_in || null, check_out || null, status, notes || null, existing.id);
    } else {
      db.prepare(`
        INSERT INTO attendance (staff_id, date, check_in, check_out, status, notes) VALUES (?,?,?,?,?,?)
      `).run(staff_id, date, check_in || null, check_out || null, status, notes || null);
    }

    // Get staff name for logging
    const staffRow = db.prepare('SELECT name FROM staff WHERE id=?').get(staff_id);
    const staffName = staffRow ? staffRow.name : `Staff #${staff_id}`;
    const details = `${staffName} | ${date} | ${status}${check_in ? ` | In: ${check_in}` : ''}${check_out ? ` | Out: ${check_out}` : ''}`;

    db.prepare('INSERT INTO audit_log (role, action, details) VALUES (?,?,?)').run(role, 'Attendance Edit', details);

    if (role === 'hr') {
      notify(`⚠️ <b>Attendance Modified by HR</b>\n👤 ${staffName}\n📅 ${date}\n📌 Status: ${status}${check_in ? `\n🕘 In: ${check_in}` : ''}${check_out ? ` | Out: ${check_out}` : ''}`);
    }

    res.json({ success: true });
  });

  return router;
};
