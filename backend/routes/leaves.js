const express = require('express');
const multer = require('multer');

// Store files in memory — we save them to the SQLite DB (persistent volume), not disk
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

module.exports = function (db, notify) {
  const router = express.Router();

  // GET leave balances
  router.get('/balance', (req, res) => {
    const year = String(new Date().getFullYear());
    const staff = db.prepare('SELECT * FROM staff WHERE is_active = 1 ORDER BY name').all();

    const balances = staff.map(s => {
      const approved = db.prepare(`
        SELECT leave_type, SUM(days) as used
        FROM leave_requests
        WHERE staff_id=? AND status='approved' AND substr(start_date,1,4)=?
        GROUP BY leave_type
      `).all(s.id, year);

      const usage = {};
      for (const r of approved) usage[r.leave_type] = r.used;

      const annualUsed = (usage.annual || 0) + (s.annual_opening_used || 0);
      const mcUsed = (usage.mc || 0) + (s.mc_opening_used || 0);
      return {
        ...s,
        annual_used: annualUsed,
        annual_remaining: s.annual_entitlement - annualUsed,
        mc_used: mcUsed,
        mc_remaining: s.mc_entitlement - mcUsed,
        emergency_used: usage.emergency || 0,
        unpaid_used: usage.unpaid || 0,
      };
    });

    res.json(balances);
  });

  // GET leave history for a single staff member
  router.get('/staff/:id', (req, res) => {
    const year = String(new Date().getFullYear());
    const records = db.prepare(`
      SELECT id, staff_id, leave_type, start_date, end_date, days, reason,
             document_name, status, applied_at, decided_at, director_notes
      FROM leave_requests WHERE staff_id=? AND substr(start_date,1,4)=? ORDER BY applied_at DESC
    `).all(req.params.id, year);
    res.json(records);
  });

  // PUT edit a leave record (director/hr only)
  router.put('/:id', (req, res) => {
    const { leave_type, start_date, end_date, days, reason, status } = req.body;
    const role = req.headers['x-user-role'] || 'unknown';
    const lr = db.prepare('SELECT * FROM leave_requests WHERE id=?').get(req.params.id);
    if (!lr) return res.status(404).json({ error: 'Not found' });
    db.prepare(`
      UPDATE leave_requests SET leave_type=?, start_date=?, end_date=?, days=?, reason=?, status=? WHERE id=?
    `).run(leave_type, start_date, end_date, parseFloat(days), reason || null, status, req.params.id);
    const staffRow = db.prepare('SELECT name FROM staff WHERE id=?').get(lr.staff_id);
    db.prepare('INSERT INTO audit_log (role, action, details) VALUES (?,?,?)').run(role, 'Leave Record Edited', `${staffRow?.name} | ${leave_type} | ${start_date}~${end_date}`);
    res.json({ success: true });
  });

  // DELETE a leave record (director/hr only)
  router.delete('/:id', (req, res) => {
    const role = req.headers['x-user-role'] || 'unknown';
    const lr = db.prepare('SELECT * FROM leave_requests WHERE id=?').get(req.params.id);
    if (!lr) return res.status(404).json({ error: 'Not found' });
    db.prepare('DELETE FROM leave_requests WHERE id=?').run(req.params.id);
    const staffRow = db.prepare('SELECT name FROM staff WHERE id=?').get(lr.staff_id);
    db.prepare('INSERT INTO audit_log (role, action, details) VALUES (?,?,?)').run(role, 'Leave Record Deleted', `${staffRow?.name} | ${lr.leave_type} | ${lr.start_date}~${lr.end_date}`);
    res.json({ success: true });
  });

  // GET leave requests — filtered by status
  router.get('/', (req, res) => {
    const { status } = req.query;
    // Exclude document_data (large base64) — use /api/leaves/:id/document to fetch the file
    const cols = `lr.id, lr.staff_id, lr.leave_type, lr.start_date, lr.end_date, lr.days,
      lr.reason, lr.document_name, lr.half_day_period, lr.status, lr.applied_at, lr.decided_at, lr.director_notes,
      s.name, s.department`;
    let records;
    if (status) {
      records = db.prepare(`
        SELECT ${cols} FROM leave_requests lr
        JOIN staff s ON s.id=lr.staff_id WHERE lr.status=? ORDER BY lr.applied_at DESC
      `).all(status);
    } else {
      records = db.prepare(`
        SELECT ${cols} FROM leave_requests lr
        JOIN staff s ON s.id=lr.staff_id ORDER BY lr.applied_at DESC
      `).all();
    }
    res.json(records);
  });

  // GET document for a leave request
  router.get('/:id/document', (req, res) => {
    const lr = db.prepare('SELECT document_data, document_mime, document_name FROM leave_requests WHERE id=?').get(req.params.id);
    if (!lr || !lr.document_data) return res.status(404).json({ error: 'No document found' });
    const buf = Buffer.from(lr.document_data, 'base64');
    res.setHeader('Content-Type', lr.document_mime || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${lr.document_name || 'document'}"`);
    res.send(buf);
  });

  // POST submit leave application
  router.post('/', upload.single('document'), (req, res) => {
    const { staff_id, leave_type, start_date, end_date, days, reason } = req.body;
    const role = req.headers['x-user-role'] || 'unknown';
    // Store file as base64 in DB (survives Railway deploys)
    const document_data = req.file ? req.file.buffer.toString('base64') : null;
    const document_mime = req.file ? req.file.mimetype : null;
    const document_name = req.file ? req.file.originalname : null;
    const half_day_period = req.body.half_day_period || null; // 'morning' | 'afternoon' | null
    const now = new Date().toISOString();
    const result = db.prepare(`
      INSERT INTO leave_requests (staff_id, leave_type, start_date, end_date, days, reason, document_data, document_mime, document_name, half_day_period, status, applied_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,'pending',?)
    `).run(staff_id, leave_type, start_date, end_date, days, reason || null, document_data, document_mime, document_name, half_day_period, now);

    const staffRow = db.prepare('SELECT name FROM staff WHERE id=?').get(staff_id);
    const staffName = staffRow ? staffRow.name : `Staff #${staff_id}`;
    const details = `${staffName} | ${leave_type} | ${start_date} to ${end_date} (${days} day(s))`;

    db.prepare('INSERT INTO audit_log (role, action, details) VALUES (?,?,?)').run(role, 'Leave Applied', details);

    if (role === 'hr') {
      notify(`📋 <b>Leave Application Submitted by HR</b>\n👤 ${staffName}\n🏷️ Type: ${leave_type}\n📅 ${start_date} → ${end_date} (${days} day(s))\n📝 ${reason || 'No reason given'}`);
    }

    res.json({ success: true, id: result.lastInsertRowid });
  });

  // PUT approve
  router.put('/:id/approve', (req, res) => {
    const { director_notes } = req.body || {};
    const role = req.headers['x-user-role'] || 'unknown';
    const now = new Date().toISOString();
    db.prepare(`UPDATE leave_requests SET status='approved', decided_at=?, director_notes=? WHERE id=?`)
      .run(now, director_notes || null, req.params.id);

    const lr = db.prepare(`SELECT lr.*, s.name FROM leave_requests lr JOIN staff s ON s.id=lr.staff_id WHERE lr.id=?`).get(req.params.id);
    const details = lr ? `${lr.name} | ${lr.leave_type} | ${lr.start_date} to ${lr.end_date}` : `Leave #${req.params.id}`;
    db.prepare('INSERT INTO audit_log (role, action, details) VALUES (?,?,?)').run(role, 'Leave Approved', details);

    res.json({ success: true });
  });

  // PUT reject
  router.put('/:id/reject', (req, res) => {
    const { director_notes } = req.body || {};
    const role = req.headers['x-user-role'] || 'unknown';
    const now = new Date().toISOString();
    db.prepare(`UPDATE leave_requests SET status='rejected', decided_at=?, director_notes=? WHERE id=?`)
      .run(now, director_notes || null, req.params.id);

    const lr = db.prepare(`SELECT lr.*, s.name FROM leave_requests lr JOIN staff s ON s.id=lr.staff_id WHERE lr.id=?`).get(req.params.id);
    const details = lr ? `${lr.name} | ${lr.leave_type} | ${lr.start_date} to ${lr.end_date}` : `Leave #${req.params.id}`;
    db.prepare('INSERT INTO audit_log (role, action, details) VALUES (?,?,?)').run(role, 'Leave Rejected', details);

    res.json({ success: true });
  });

  return router;
};
