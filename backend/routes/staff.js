const express = require('express');

module.exports = function (db, notify) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const staff = db.prepare('SELECT * FROM staff WHERE is_active = 1 ORDER BY name').all();
    res.json(staff);
  });

  router.get('/:id', (req, res) => {
    const staff = db.prepare('SELECT * FROM staff WHERE id = ?').get(req.params.id);
    if (!staff) return res.status(404).json({ error: 'Not found' });
    res.json(staff);
  });

  // PUT bulk update leave opening balances
  router.put('/leave-opening', (req, res) => {
    const { updates } = req.body; // [{ id, annual_opening_used, mc_opening_used }, ...]
    const role = req.headers['x-user-role'] || 'unknown';
    if (!Array.isArray(updates)) return res.status(400).json({ error: 'Invalid payload' });

    const stmt = db.prepare(`UPDATE staff SET annual_opening_used=?, mc_opening_used=? WHERE id=?`);
    for (const u of updates) {
      stmt.run(u.annual_opening_used ?? 0, u.mc_opening_used ?? 0, u.id);
    }

    db.prepare('INSERT INTO audit_log (role, action, details) VALUES (?,?,?)').run(role, 'Leave Opening Balance Updated', `${updates.length} staff updated`);
    if (role === 'hr') {
      notify(`📊 <b>Leave Opening Balances Updated by HR</b>\n${updates.length} staff records updated`);
    }

    res.json({ success: true });
  });

  router.put('/:id', (req, res) => {
    const { name, ic_number, email, phone, department, job_title, date_joined, annual_entitlement, mc_entitlement } = req.body;
    const role = req.headers['x-user-role'] || 'unknown';

    const before = db.prepare('SELECT name FROM staff WHERE id=?').get(req.params.id);
    db.prepare(`
      UPDATE staff SET name=?, ic_number=?, email=?, phone=?,
        department=?, job_title=?, date_joined=?, annual_entitlement=?, mc_entitlement=?
      WHERE id=?
    `).run(name, ic_number, email, phone, department, job_title, date_joined, annual_entitlement, mc_entitlement, req.params.id);

    const details = `${before ? before.name : `Staff #${req.params.id}`} | ${job_title} | ${department}`;
    db.prepare('INSERT INTO audit_log (role, action, details) VALUES (?,?,?)').run(role, 'Staff Profile Edited', details);

    if (role === 'hr') {
      notify(`✏️ <b>Staff Profile Edited by HR</b>\n👤 ${before ? before.name : `Staff #${req.params.id}`}\n💼 ${job_title} | ${department}`);
    }

    res.json({ success: true });
  });

  return router;
};
