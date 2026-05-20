const express = require('express');

module.exports = function (db) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 200;
      const logs = await db.prepare('SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT ?').all(limit);
      res.json(logs);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};
