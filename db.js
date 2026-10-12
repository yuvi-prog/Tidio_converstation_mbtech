const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, 'tidio.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS emailed_threads (
    thread_id     TEXT PRIMARY KEY,
    visitor_id    TEXT,
    contact_name  TEXT,
    contact_email TEXT,
    transcript_id TEXT UNIQUE,
    session_start TEXT,
    session_end   TEXT,
    message_count INTEGER,
    emailed_at    TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS transcripts (
    id            TEXT PRIMARY KEY,
    thread_id     TEXT,
    contact_name  TEXT,
    contact_email TEXT,
    messages      TEXT,
    summary       TEXT,
    created_at    TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS chat_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    visitor_id  TEXT NOT NULL,
    actor       TEXT NOT NULL,
    message     TEXT NOT NULL,
    received_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_chat_events_visitor ON chat_events(visitor_id, received_at);
`);

const queries = {
  threadEmailed: db.prepare('SELECT emailed_at FROM emailed_threads WHERE thread_id = ?'),

  insertEmailedThread: db.prepare(`
    INSERT OR IGNORE INTO emailed_threads
      (thread_id, visitor_id, contact_name, contact_email, transcript_id, session_start, session_end, message_count)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?)
  `),

  insertTranscript: db.prepare(`
    INSERT INTO transcripts (id, thread_id, contact_name, contact_email, messages, summary)
    VALUES (?, ?, ?, ?, ?, ?)
  `),

  getTranscript: db.prepare('SELECT * FROM transcripts WHERE id = ?'),

  insertChatEvent: db.prepare(
    'INSERT INTO chat_events (visitor_id, actor, message, received_at) VALUES (?, ?, ?, ?)'
  ),

  // Sessions active within the last 3 hours but with last message older than inactivity cutoff
  getInactiveSessions: db.prepare(`
    SELECT visitor_id, MAX(received_at) as last_at, MIN(received_at) as first_at, COUNT(*) as msg_count
    FROM chat_events
    WHERE received_at > ?
    GROUP BY visitor_id
    HAVING last_at <= ?
  `),

  getSessionMessages: db.prepare(
    'SELECT * FROM chat_events WHERE visitor_id = ? AND received_at > ? ORDER BY received_at ASC'
  ),
};

module.exports = { db, queries };
