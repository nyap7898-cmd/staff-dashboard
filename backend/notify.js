const https = require('https');

function notify(message) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  const path = `/bot${token}/sendMessage?chat_id=${chatId}&text=${encodeURIComponent(message)}&parse_mode=HTML`;
  const req = https.request({ hostname: 'api.telegram.org', path, method: 'GET' }, () => {});
  req.on('error', () => {});
  req.end();
}

module.exports = { notify };
