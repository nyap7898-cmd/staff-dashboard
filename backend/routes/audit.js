const express = require('express');

module.exports = function (db) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const limit = parseInt(req.query.limit) || 200;
    const logs = db.prepare('SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT ?').all(limit);
    res.json(logs);
  });

  return router;
};
