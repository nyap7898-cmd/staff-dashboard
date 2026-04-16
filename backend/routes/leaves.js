const express = require('express');
const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
  destination: path.join(__dirname, '../uploads'),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage });

module.exports = function (db) {
  const router = express.Router();

  // GET leave balances — must come before /:id routes
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

      return {
        ...s,
        annual_used: usage.annual || 0,
        annual_remaining: s.annual_entitlement - (usage.annual || 0),
        mc_used: usage.mc || 0,
        mc_remaining: s.mc_entitlement - (usage.mc || 0),
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
      SELECT * FROM leave_requests WHERE staff_id=? AND substr(start_date,1,4)=? ORDER BY applied_at DESC
    `).all(req.params.id, year);
    res.json(records);
  });

  // GET leave requests — filtered by status
  router.get('/', (req, res) => {
    const { status } = req.query;
    let records;
    if (status) {
      records = db.prepare(`
        SELECT lr.*, s.name, s.department FROM leave_requests lr
        JOIN staff s ON s.id=lr.staff_id WHERE lr.status=? ORDER BY lr.applied_at DESC
      `).all(status);
    } else {
      records = db.prepare(`
        SELECT lr.*, s.name, s.department FROM leave_requests lr
        JOIN staff s ON s.id=lr.staff_id ORDER BY lr.applied_at DESC
      `).all();
    }
    res.json(records);
  });

  // POST submit leave application
  router.post('/', upload.single('document'), (req, res) => {
    const { staff_id, leave_type, start_date, end_date, days, reason } = req.body;
    const document_path = req.file ? req.file.filename : null;
    const now = new Date().toISOString();
    const result = db.prepare(`
      INSERT INTO leave_requests (staff_id, leave_type, start_date, end_date, days, reason, document_path, status, applied_at)
      VALUES (?,?,?,?,?,?,?,'pending',?)
    `).run(staff_id, leave_type, start_date, end_date, days, reason || null, document_path, now);
    res.json({ success: true, id: result.lastInsertRowid });
  });

  // PUT approve
  router.put('/:id/approve', (req, res) => {
    const { director_notes } = req.body || {};
    const now = new Date().toISOString();
    db.prepare(`UPDATE leave_requests SET status='approved', decided_at=?, director_notes=? WHERE id=?`)
      .run(now, director_notes || null, req.params.id);
    res.json({ success: true });
  });

  // PUT reject
  router.put('/:id/reject', (req, res) => {
    const { director_notes } = req.body || {};
    const now = new Date().toISOString();
    db.prepare(`UPDATE leave_requests SET status='rejected', decided_at=?, director_notes=? WHERE id=?`)
      .run(now, director_notes || null, req.params.id);
    res.json({ success: true });
  });

  return router;
};
