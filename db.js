/*
  Veritabanı katmanı. Varsayılan: SQLite (kurulum gerektirmez, tek dosya: data.db).

  Başka bir veritabanına (PostgreSQL, MySQL, MongoDB...) geçmek için sadece bu dosyayı değiştir:
  aşağıdaki fonksiyonların adlarını ve döndürdüğü şekli koru, server.js'e dokunmana gerek kalmaz.
  server.js bu fonksiyonları zaten `await` ile çağırıyor, yani async sürücüler de çalışır.
*/
const path = require("path");
const Database = require("better-sqlite3");

const db = new Database(process.env.DB_FILE || path.join(__dirname, "data.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS favorites (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    country    TEXT NOT NULL DEFAULT '',
    lat        REAL NOT NULL,
    lon        REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, lat, lon)
  );
`);

if (!db.prepare('PRAGMA table_info(users)').all().some(c => c.name === 'email_verified')) {
  db.exec('ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0');
}
db.exec(`CREATE TABLE IF NOT EXISTS email_codes (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL, expires_at INTEGER NOT NULL,
  sent_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0
);`);

const q = {
  insertUser:   db.prepare("INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)"),
  userByEmail:  db.prepare("SELECT * FROM users WHERE email = ?"),
  userById:     db.prepare("SELECT * FROM users WHERE id = ?"),
  favList:      db.prepare("SELECT id, name, country, lat, lon FROM favorites WHERE user_id = ? ORDER BY id DESC"),
  favInsert:    db.prepare("INSERT OR IGNORE INTO favorites (user_id, name, country, lat, lon) VALUES (?, ?, ?, ?, ?)"),
  favByCoords:  db.prepare("SELECT id, name, country, lat, lon FROM favorites WHERE user_id = ? AND lat = ? AND lon = ?"),
  favDelete:    db.prepare("DELETE FROM favorites WHERE id = ? AND user_id = ?")
};

module.exports = {
  saveCode: (id, hash) => db.prepare(`INSERT INTO email_codes(user_id,code_hash,expires_at,sent_at,attempts)
    VALUES(?,?,?,?,0) ON CONFLICT(user_id) DO UPDATE SET code_hash=excluded.code_hash,
    expires_at=excluded.expires_at,sent_at=excluded.sent_at,attempts=0`).run(id, hash, Date.now()+600000, Date.now()),
  getCode: id => db.prepare('SELECT * FROM email_codes WHERE user_id=?').get(id),
  attemptCode: id => db.prepare('UPDATE email_codes SET attempts=attempts+1 WHERE user_id=?').run(id),
  verifyEmail: db.transaction(id => {
    db.prepare('UPDATE users SET email_verified=1 WHERE id=?').run(id);
    db.prepare('DELETE FROM email_codes WHERE user_id=?').run(id);
  }),
  createUser: ({ name, email, passwordHash }) => {
    const r = q.insertUser.run(name, email, passwordHash);
    return q.userById.get(r.lastInsertRowid);
  },
  findUserByEmail: email => q.userByEmail.get(email),
  findUserById: id => q.userById.get(id),

  listFavorites: userId => q.favList.all(userId),
  addFavorite: (userId, f) => {
    q.favInsert.run(userId, f.name, f.country, f.lat, f.lon);
    return q.favByCoords.get(userId, f.lat, f.lon);
  },
  removeFavorite: (userId, id) => q.favDelete.run(id, userId).changes > 0
};
