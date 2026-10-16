const nodemailer = require('nodemailer');
const crypto = require('node:crypto');
const db = require('./db');
const configured = () => !!(process.env.SMTP_HOST && process.env.MAIL_FROM);
const hashCode = (id, code) => crypto.createHmac('sha256', process.env.JWT_SECRET).update(`${id}:${code}`).digest('hex');
async function sendCode(user) {
  if (!configured()) {
    const error = new Error('E-posta gönderimi henüz yapılandırılmadı. Site yöneticisi SMTP ayarlarını tamamlamalı.');
    error.status = 503; throw error;
  }
  const old = db.getCode(user.id);
  if (old && Date.now()-old.sent_at < 60000) {
    const error = new Error('Yeni kod için 60 saniye bekle.'); error.status=429; throw error;
  }
  const code = String(crypto.randomInt(100000, 1000000));
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? {user:process.env.SMTP_USER, pass:process.env.SMTP_PASS} : undefined,
    connectionTimeout:10000, socketTimeout:15000
  });
  await transport.sendMail({from:process.env.MAIL_FROM, to:user.email,
    subject:'Hava — e-posta doğrulama kodun',
    text:`Hava hesabını doğrulamak için kodun: ${code}\nKod 10 dakika geçerlidir. Bu işlemi sen başlatmadıysan e-postayı yok say.`});
  db.saveCode(user.id, hashCode(user.id, code));
}
module.exports = {sendCode, hashCode, configured};
