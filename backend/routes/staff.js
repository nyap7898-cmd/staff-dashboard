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
