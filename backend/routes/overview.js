const express = require('express');

module.exports = function (db) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    try {
      const today = new Date().toISOString().split('T')[0];

      const totalStaff = parseInt((await db.prepare('SELECT COUNT(*)::int as c FROM staff WHERE is_active=1').get()).c);
      const presentToday = parseInt((await db.prepare("SELECT COUNT(*)::int as c FROM attendance WHERE date=? AND status='present'").get(today)).c);
      const onLeaveToday = parseInt((await db.prepare("SELECT COUNT(*)::int as c FROM attendance WHERE date=? AND status='on_leave'").get(today)).c);
      const absentToday = parseInt((await db.prepare("SELECT COUNT(*)::int as c FROM attendance WHERE date=? AND status='absent'").get(today)).c);
      const pendingLeaves = parseInt((await db.prepare("SELECT COUNT(*)::int as c FROM leave_requests WHERE status='pending'").get()).c);

      res.json({
        totalStaff,
        presentToday,
        onLeaveToday,
        absentToday,
        pendingLeaves,
        notMarked: totalStaff - presentToday - onLeaveToday - absentToday,
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};
