require("dotenv").config();
const path = require("path");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("./db");
const mailer = require('./mailer');
const crypto = require('node:crypto');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
const OWM_KEY = process.env.OWM_KEY;
const IS_PROD = process.env.NODE_ENV === "production";

if (!JWT_SECRET || JWT_SECRET.length < 16) {
  console.error(".env içinde en az 16 karakterlik bir JWT_SECRET tanımlamalısın (bkz. .env.example).");
  process.exit(1);
}

const app = express();
app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      connectSrc: ["'self'", "https://api.openweathermap.org"],
      imgSrc: ["'self'", "data:"],
      upgradeInsecureRequests: null // localhost http üzerinde çalışabilsin
    }
  }
}));
app.use(express.json({ limit: "10kb" }));
app.use(cookieParser());

/* ---------- Yardımcılar ---------- */
const h = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next); // async hataları yakala
const publicUser = u => ({ id: u.id, name: u.name, email: u.email });
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function setSession(res, user) {
  const token = jwt.sign({ uid: user.id }, JWT_SECRET, { expiresIn: "7d" });
  res.cookie("token", token, {
    httpOnly: true,          // JavaScript okuyamaz
    sameSite: "lax",
    secure: IS_PROD,         // canlıda sadece https
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

const auth = h(async (req, res, next) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: "Giriş yapmalısın." });
  let uid;
  try { uid = jwt.verify(token, JWT_SECRET).uid; }
  catch (_) { return res.status(401).json({ error: "Oturumun geçersiz ya da süresi dolmuş." }); }
  const user = await db.findUserById(uid);
  if (!user || !user.email_verified) return res.status(401).json({ error: "Giriş yap ve e-postanı doğrula." });
  req.user = user;
  next();
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false,
  message: { error: "Çok fazla deneme yaptın. Birkaç dakika sonra tekrar dene." }
});
const owmLimiter = rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false });

/* ---------- Hesap ---------- */
app.post("/api/signup", authLimiter, h(async (req, res) => {
  if (!mailer.configured()) return res.status(503).json({error:'E-posta gönderimi henüz yapılandırılmadı. Site yöneticisi SMTP ayarlarını tamamlamalı.'});
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  if (!name || name.length > 60) return res.status(400).json({ error: "İsim 1-60 karakter olmalı." });
  if (!EMAIL_RE.test(email) || email.length > 254) return res.status(400).json({ error: "Geçerli bir e-posta gir." });
  if (password.length < 8 || password.length > 72) return res.status(400).json({ error: "Şifre 8-72 karakter olmalı." });

  if (await db.findUserByEmail(email)) return res.status(409).json({ error: "Bu e-posta ile zaten bir hesap var." });

  const passwordHash = await bcrypt.hash(password, 12);
  let user;
  try { user = await db.createUser({ name, email, passwordHash }); }
  catch (e) {
    if (String(e.code).startsWith("SQLITE_CONSTRAINT")) return res.status(409).json({ error: "Bu e-posta ile zaten bir hesap var." });
    throw e;
  }
  await mailer.sendCode(user);
  res.status(201).json({ verificationRequired:true, email:user.email });
}));

app.post("/api/login", authLimiter, h(async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const user = await db.findUserByEmail(email);
  const ok = user && await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "E-posta ya da şifre hatalı." });
  if (!user.email_verified) return res.status(403).json({error:'Önce e-posta adresini doğrula.', verificationRequired:true, email:user.email});
  setSession(res, user);
  res.json({ user: publicUser(user) });
}));

app.post("/api/logout", (req, res) => {
  res.clearCookie("token", { httpOnly: true, sameSite: "lax", secure: IS_PROD });
  res.json({ ok: true });
});

app.post('/api/verify-email', authLimiter, h(async (req,res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const code = String(req.body.code || '');
  const user = db.findUserByEmail(email);
  const record = user && db.getCode(user.id);
  if (!/^\d{6}$/.test(code) || !record || record.expires_at < Date.now() || record.attempts >= 5)
    return res.status(400).json({error:'Kod geçersiz veya süresi dolmuş. Yeni kod iste.'});
  db.attemptCode(user.id);
  if (!crypto.timingSafeEqual(Buffer.from(record.code_hash), Buffer.from(mailer.hashCode(user.id,code))))
    return res.status(400).json({error:'Kod hatalı. En fazla 5 deneme yapabilirsin.'});
  db.verifyEmail(user.id);
  setSession(res,user);
  res.json({user:publicUser(user)});
}));
app.post('/api/resend-code', authLimiter, h(async (req,res) => {
  const user = db.findUserByEmail(String(req.body.email || '').trim().toLowerCase());
  if (user && !user.email_verified) await mailer.sendCode(user);
  res.json({message:'Doğrulanmamış bir hesabın varsa kod gönderildi.'});
}));

app.get("/api/me", auth, (req, res) => res.json({ user: publicUser(req.user) }));

/* ---------- Favori şehirler (kullanıcıya özel) ---------- */
app.get("/api/favorites", auth, h(async (req, res) => {
  res.json({ favorites: await db.listFavorites(req.user.id) });
}));

app.post("/api/favorites", auth, h(async (req, res) => {
  const name = String(req.body.name || "").trim();
  const country = String(req.body.country || "").trim().slice(0, 60);
  const lat = Number(req.body.lat), lon = Number(req.body.lon);
  if (!name || name.length > 80) return res.status(400).json({ error: "Şehir adı geçersiz." });
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180)
    return res.status(400).json({ error: "Koordinat geçersiz." });
  const fav = await db.addFavorite(req.user.id, { name, country, lat, lon });
  res.status(201).json({ favorite: fav });
}));

app.delete("/api/favorites/:id", auth, h(async (req, res) => {
  const removed = await db.removeFavorite(req.user.id, Number(req.params.id));
  if (!removed) return res.status(404).json({ error: "Favori bulunamadı." });
  res.json({ ok: true });
}));

/* ---------- OpenWeatherMap vekili: API anahtarı sunucuda kalır, tarayıcıya hiç gitmez ---------- */
const ALLOWED = new Set(["geo/1.0/direct", "geo/1.0/reverse", "data/2.5/air_pollution", "data/2.5/weather", "data/2.5/forecast", "data/3.0/onecall"]);
const cache = new Map();
const TTL = 10 * 60 * 1000; // aynı sorgu 10 dk önbellekte kalır, kota tasarrufu

app.get("/api/owm/*", auth, owmLimiter, h(async (req, res) => {
  const p = req.params[0];
  if (!ALLOWED.has(p)) return res.status(404).json({ error: "Bulunamadı." });
  if (!OWM_KEY) return res.status(503).json({ error: "Hava durumu servisi henüz hazır değil. Lütfen daha sonra tekrar dene." });

  const url = new URL("https://api.openweathermap.org/" + p);
  for (const [k, v] of Object.entries(req.query))
    if (k !== "appid" && typeof v === "string") url.searchParams.set(k, v);

  const cacheKey = url.toString();             // anahtar eklenmeden önce, önbellekte anahtar durmaz
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.t < TTL) return res.status(hit.status).json(hit.body);

  url.searchParams.set("appid", OWM_KEY);
  const r = await fetch(url, {signal:AbortSignal.timeout(15000)});
  const body = await r.json().catch(() => ({}));
  if (r.ok) {
    cache.set(cacheKey, { t: Date.now(), status: r.status, body });
    if (cache.size > 500) cache.delete(cache.keys().next().value);
  }
  res.status(r.status).json(body);
}));

const scoreboardCities = [
 {name:'İstanbul',country:'TR',lat:41.0082,lon:28.9784},{name:'Ankara',country:'TR',lat:39.9334,lon:32.8597},
 {name:'İzmir',country:'TR',lat:38.4237,lon:27.1428},{name:'Antalya',country:'TR',lat:36.8969,lon:30.7133},
 {name:'Erzurum',country:'TR',lat:39.9043,lon:41.2679},{name:'Kars',country:'TR',lat:40.6013,lon:43.0975},
 {name:'Reykjavik',country:'IS',lat:64.1466,lon:-21.9426},{name:'Dubai',country:'AE',lat:25.2048,lon:55.2708},
 {name:'Singapur',country:'SG',lat:1.3521,lon:103.8198},{name:'Londra',country:'GB',lat:51.5072,lon:-.1276},
 {name:'New York',country:'US',lat:40.7128,lon:-74.006},{name:'Tokyo',country:'JP',lat:35.6762,lon:139.6503}
];
let scoreboardCache=null,scoreboardPending=null;
async function getScoreboard(){
 if(scoreboardCache && Date.now()-scoreboardCache.fetchedAt<600000)return scoreboardCache;
 if(scoreboardPending)return scoreboardPending;
 scoreboardPending=(async()=>{const results=await Promise.allSettled(scoreboardCities.map(async city=>{
  const url=new URL('https://api.openweathermap.org/data/2.5/weather');for(const [key,value] of Object.entries({lat:city.lat,lon:city.lon,units:'metric',appid:OWM_KEY}))url.searchParams.set(key,value);
  const response=await fetch(url,{signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('Weather unavailable');const data=await response.json();
  return {...city,temp:data.main.temp,id:data.weather[0].id,observedAt:data.dt};
 }));const cities=results.filter(r=>r.status==='fulfilled').map(r=>r.value);if(!cities.length)throw Error('Scoreboard unavailable');scoreboardCache={cities,fetchedAt:Date.now(),total:scoreboardCities.length};return scoreboardCache;})();
 try{return await scoreboardPending}finally{scoreboardPending=null}
}
app.get('/api/scoreboard',auth,owmLimiter,h(async(req,res)=>{if(!OWM_KEY)return res.status(503).json({error:'Hava servisi henüz hazır değil.'});res.json(await getScoreboard())}));

/* ---------- Statik dosyalar (sadece public/ klasörü açılır) ---------- */
app.use("/api", (req, res) => res.status(404).json({ error: "Bulunamadı." }));
app.get('/', (req,res) => res.sendFile(path.join(__dirname,'public','home.html')));
app.get('/dashboard', h(async (req,res) => {
  let user;
  try { const payload=jwt.verify(req.cookies.token || '',JWT_SECRET); user=await db.findUserById(payload.uid); } catch {}
  if(!user || !user.email_verified) return res.redirect('/login');
  res.set('Cache-Control','no-store');
  res.sendFile(path.join(__dirname,'index.html'));
}));
app.get('/index.html', (req,res) => res.redirect('/'));
app.get(['/config.js','/auth.js'], (req,res) => res.sendFile(path.join(__dirname, path.basename(req.path))));
for (const page of ['login','signup','verify']) {
  app.get(['/'+page, '/'+page+'.html'], (req,res) => res.sendFile(path.join(__dirname,'public',page+'.html')));
}
app.use(express.static(path.join(__dirname, "public")));
app.use((req,res) => res.status(404).sendFile(path.join(__dirname,'public','404.html')));

app.use((err, req, res, next) => {
  console.error('İstek başarısız:', err.code || err.name);
  res.status(err.status || 500).json({ error: err.status ? err.message : "İşlem tamamlanamadı. Daha sonra tekrar dene; kayıt oluşturduysan doğrulama sayfasından yeni kod iste." });
});

app.listen(PORT, () => console.log(`Sunucu hazır: http://localhost:${PORT}`));
