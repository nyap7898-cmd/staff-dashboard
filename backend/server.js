require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');
const { init } = require('./db');
const { notify } = require('./notify');

async function main() {
  const db = await init();
  console.log('Database ready');

  const app = express();
  const PORT = process.env.PORT || 3001;

  app.use(cors());
  app.use(express.json());
  app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

  // Serve built React frontend in production
  if (process.env.NODE_ENV === 'production') {
    const frontendDist = path.join(__dirname, '../frontend/dist');
    app.use(express.static(frontendDist));
  }

  app.use('/api/staff', require('./routes/staff')(db, notify));
  app.use('/api/attendance', require('./routes/attendance')(db, notify));
  app.use('/api/leaves', require('./routes/leaves')(db, notify));
  app.use('/api/overview', require('./routes/overview')(db));
  app.use('/api/audit', require('./routes/audit')(db));

  app.post('/api/auth/login', (req, res) => {
    const { pin } = req.body;
    if (pin === process.env.DIRECTOR_PIN) {
      res.json({ success: true, role: 'director', name: 'Director' });
    } else if (pin === process.env.HR_PIN) {
      res.json({ success: true, role: 'hr', name: 'HR Manager' });
    } else {
      res.status(401).json({ success: false, message: 'Invalid PIN' });
    }
  });

  // Catch-all: send React app for any non-API route
  if (process.env.NODE_ENV === 'production') {
    const frontendDist = path.join(__dirname, '../frontend/dist');
    app.get('*', (req, res) => {
      res.sendFile(path.join(frontendDist, 'index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
  });
}

main().catch(err => {
  console.error('Server failed to start:', err);
  process.exit(1);
});
