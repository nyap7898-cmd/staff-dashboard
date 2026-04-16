const express = require('express');

module.exports = function (db) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const today = new Date().toISOString().split('T')[0];

    const totalStaff = db.prepare('SELECT COUNT(*) as c FROM staff WHERE is_active=1').get().c;
    const presentToday = db.prepare("SELECT COUNT(*) as c FROM attendance WHERE date=? AND status='present'").get(today).c;
    const onLeaveToday = db.prepare("SELECT COUNT(*) as c FROM attendance WHERE date=? AND status='on_leave'").get(today).c;
    const absentToday = db.prepare("SELECT COUNT(*) as c FROM attendance WHERE date=? AND status='absent'").get(today).c;
    const pendingLeaves = db.prepare("SELECT COUNT(*) as c FROM leave_requests WHERE status='pending'").get().c;

    res.json({
      totalStaff,
      presentToday,
      onLeaveToday,
      absentToday,
      pendingLeaves,
      notMarked: totalStaff - presentToday - onLeaveToday - absentToday,
    });
  });

  return router;
};
