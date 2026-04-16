const express = require('express');

module.exports = function (db) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    // Get all active staff, left-join attendance for the date
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
    // Check if record exists
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
    res.json({ success: true });
  });

  return router;
};
