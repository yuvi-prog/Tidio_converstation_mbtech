const { Router } = require('express');
const { queries } = require('./db');

const router = Router();

function fmt(isoStr) {
  return new Date(isoStr).toLocaleString('en-AU', {
    timeZone: 'Australia/Sydney',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function actorLabel(actor) {
  return actor === 'visitor' ? 'Customer' : 'James (bot)';
}

function bubbleClass(actor) {
  return actor === 'visitor' ? 'bubble visitor' : 'bubble agent';
}

router.get('/transcript/:id', (req, res) => {
  const row = queries.getTranscript.get(req.params.id);
  if (!row) return res.status(404).send('Transcript not found.');

  const messages = JSON.parse(row.messages);
  const name = esc(row.contact_name || 'Website Visitor');
  const email = row.contact_email ? esc(row.contact_email) : '';

  const bubbles = messages.map(m => `
    <div class="${bubbleClass(m.actor)}">
      <div class="meta">${actorLabel(m.actor)} · ${fmt(m.time_sent)}</div>
      <div class="text">${esc(m.message_content)}</div>
    </div>
  `).join('');

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Transcript — ${name}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f0f2f5;margin:0;padding:0;color:#0f172a}
  .top{background:#0f172a;color:#fff;padding:20px 28px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px}
  .top h1{margin:0;font-size:17px;font-weight:700}
  .top .sub{font-size:13px;color:#94a3b8;margin-top:3px}
  .tidio-link{color:#60a5fa;font-size:13px;text-decoration:none;font-weight:600}
  .tidio-link:hover{text-decoration:underline}
  .summary-bar{background:#eff6ff;border-bottom:1px solid #bfdbfe;padding:16px 28px}
  .summary-bar h2{margin:0 0 6px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#3b82f6}
  .summary-bar p{margin:0;color:#1e3a5f;font-size:14px;line-height:1.6}
  .feed{max-width:720px;margin:0 auto;padding:24px 20px}
  .bubble{max-width:78%;margin-bottom:14px;padding:12px 15px;border-radius:12px;line-height:1.55;font-size:14px}
  .bubble.visitor{background:#fff;border:1px solid #e2e8f0;align-self:flex-start;border-bottom-left-radius:3px;margin-right:auto}
  .bubble.agent{background:#3b82f6;color:#fff;align-self:flex-end;border-bottom-right-radius:3px;margin-left:auto}
  .meta{font-size:11px;font-weight:700;opacity:.65;margin-bottom:5px;text-transform:uppercase;letter-spacing:.4px}
  .text{white-space:pre-wrap;word-break:break-word}
  .feed{display:flex;flex-direction:column}
</style>
</head>
<body>
  <div class="top">
    <div>
      <h1>${name}${email ? ` &lt;${email}&gt;` : ''}</h1>
      <div class="sub">${messages.length} messages &middot; ${fmt(messages[0].time_sent)} – ${fmt(messages[messages.length - 1].time_sent)}</div>
    </div>
  </div>

  <div class="summary-bar">
    <h2>AI Summary</h2>
    <p>${esc(row.summary).replace(/\n/g, '<br>')}</p>
  </div>

  <div class="feed">
    ${bubbles}
  </div>
</body>
</html>`);
});

module.exports = router;
