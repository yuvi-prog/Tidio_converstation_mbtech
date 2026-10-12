const sgMail = require('@sendgrid/mail');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const RECIPIENTS = [
  'hd@memoryblock.com.au',
  'shay@memoryblock.com.au',
  'yuvi@memoryblock.com.au',
  'love@memoryblock.com.au',
];

function fmt(isoStr) {
  return new Date(isoStr).toLocaleString('en-AU', {
    timeZone: 'Australia/Sydney',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function buildHtml({ contactName, contactEmail, summary, transcriptUrl, messageCount, sessionStart, sessionEnd }) {
  const name = contactName || 'Unknown Visitor';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f0f2f5;margin:0;padding:24px}
  .wrap{max-width:580px;margin:0 auto}
  .card{background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)}
  .hdr{background:#0f172a;color:#fff;padding:24px 28px}
  .hdr h1{margin:0;font-size:18px;font-weight:700;letter-spacing:-.3px}
  .hdr p{margin:5px 0 0;font-size:13px;color:#94a3b8}
  .body{padding:28px}
  .chips{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:22px}
  .chip{background:#f8fafc;border:1px solid #e2e8f0;border-radius:7px;padding:10px 14px;min-width:100px;flex:1}
  .chip-label{font-size:10px;font-weight:700;text-transform:uppercase;color:#64748b;letter-spacing:.6px}
  .chip-value{font-size:14px;font-weight:600;color:#0f172a;margin-top:3px;word-break:break-all}
  .summary{background:#eff6ff;border-left:4px solid #3b82f6;border-radius:0 8px 8px 0;padding:14px 18px;margin-bottom:22px}
  .summary-label{font-size:10px;font-weight:700;text-transform:uppercase;color:#3b82f6;letter-spacing:.6px;margin-bottom:7px}
  .summary p{margin:0;color:#1e3a5f;line-height:1.65;font-size:14px}
  .btn{display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;padding:13px 28px;border-radius:7px;font-weight:700;font-size:14px;letter-spacing:.2px}
  .footer{padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8}
</style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <div class="hdr">
      <h1>Support Chat Summary</h1>
      <p>A conversation went quiet — here's the recap</p>
    </div>
    <div class="body">
      <div class="chips">
        <div class="chip"><div class="chip-label">Visitor</div><div class="chip-value">${name}</div></div>
        ${contactEmail ? `<div class="chip"><div class="chip-label">Email</div><div class="chip-value">${contactEmail}</div></div>` : ''}
        <div class="chip"><div class="chip-label">Messages</div><div class="chip-value">${messageCount}</div></div>
        <div class="chip"><div class="chip-label">Started</div><div class="chip-value">${fmt(sessionStart)}</div></div>
        <div class="chip"><div class="chip-label">Last Message</div><div class="chip-value">${fmt(sessionEnd)}</div></div>
      </div>

      <div class="summary">
        <div class="summary-label">AI Summary</div>
        <p>${summary.replace(/\n/g, '<br>')}</p>
      </div>

      <a href="${transcriptUrl}" class="btn">View Full Transcript &rarr;</a>
    </div>
    <div class="footer">Memory Block Support &middot; Tidio Chat &middot; Sent automatically after inactivity</div>
  </div>
</div>
</body>
</html>`;
}

async function sendConversationEmail(data) {
  const name = data.contactName || 'Unknown Visitor';
  await sgMail.send({
    to: RECIPIENTS,
    isMultiple: true,
    from: { email: process.env.FROM_EMAIL || 'support@memoryblock.com.au', name: 'Memory Block Support' },
    subject: `💬 Chat Summary — ${name}`,
    html: buildHtml(data),
    text: `Support Chat Summary\n\nVisitor: ${name}\nEmail: ${data.contactEmail || 'N/A'}\nMessages: ${data.messageCount}\n\nSummary:\n${data.summary}\n\nFull transcript: ${data.transcriptUrl}`,
  });
}

module.exports = { sendConversationEmail };
