# Hava

npm install ve npm start ile çalışır. Node 24 önerilir.

## E-posta ayarları
.env içinde SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS ve MAIL_FROM değerlerini sağlayıcına göre doldur. Port 465 için SMTP_SECURE=true, 587 için false kullan. MAIL_FROM sağlayıcının izin verdiği gönderen adresi olmalıdır. SMTP parolanı paylaşma. Ayarları değiştirdikten sonra sunucuyu yeniden başlat.

SMTP ayarlanmadan kayıt işlemi 503 döner; sahte kod veya doğrulamayı atlama yoktur. SMTP gönderimi başarısız olduktan sonra kayıt oluşmuşsa /verify sayfasından yeni kod istenebilir.

Kodlar 10 dakika geçerli, en fazla 5 deneme ve 60 saniye tekrar gönderim aralığı vardır. Kodun kendisi veritabanında tutulmaz; HMAC özeti saklanır. Şifreler bcrypt ile hashlenir. Doğrulanmamış hesaplar giriş yapamaz; mevcut hesaplar da doğrulama sayfasından kod istemelidir.

SQLite data.db dosyasında kullanıcılar ve favoriler kalıcıdır. Şema mevcut kayıtları silmeden güncellenir. .env ve veritabanını kaynak kontrolüne ekleme.

Hava verisi için ayrıca .env içindeki OWM_KEY doldurulmalıdır.

## Yeni panel özellikleri

- Logo, SVG favicon ve çizgi ikonları.
- Türkiye ve dünya seçkisindeki 12 şehri sıcaklığa göre sıralayan skor tablosu. Tüm dünyanın uç noktaları değildir. Sonuçlar 10 dakika önbellekte tutulur; eksik veri varsa şehir sayısı gösterilir.
- Güneş doğumu/batımı, gündüz süresi, görüş ve basınç.
- 48 saat için sıcaklık, yağış ihtimali ve rüzgâr grafikleri; saat seçerek ayrıntı.
- Yürüyüş, bisiklet ve piknik için tahmine dayalı saat önerisi, ICS takvim dosyası.
- OpenWeather 1–5 ölçeğinde hava kalitesi ve PM2.5, PM10, O3 bileşenleri.
- İki şehir karşılaştırması; cihazda hatırlanan derece birimi ve aktivite tercihi.

## GitHub'a hazırlık

.env, veritabanı dosyaları, node_modules ve yerel çalışma dosyaları .gitignore kapsamındadır. Yalnızca boş örnek ayarlar içeren .env.example paylaşılır. SMTP ve hava anahtarları tarayıcıya gönderilmez.

Paylaşmadan önce git status --short ve git diff --cached ile dosyaları gözden geçir. Önceden Git'e eklenmiş dosyaları .gitignore geçmişten kaldırmaz. Anahtar bir commit'e girdiyse anahtarı değiştir ve geçmişi temizle.

Klonlayan kişi npm install çalıştırır, .env.example dosyasını .env olarak kopyalar, kendi SMTP/OWM/JWT değerlerini ekler ve npm start çalıştırır. Gmail adresi de yalnızca özel .env dosyasında tutulur. Kullanıcı hesapları veya parolalar kaynak kodla paylaşılmaz.

## Ücretsiz bulut sürümü

GitHub Pages, docs/ dizinindeki statik ön yüzü yayınlar. Bu sürüm Supabase Auth ve Postgres kullanır; yerel Node.js/SQLite sürümü ayrı çalışmaya devam eder. Mevcut SQLite hesapları buluta aktarılmamıştır.

- cloud-config.json yalnızca proje adresi ve tarayıcı için tasarlanmış publishable key içerir.
- cloud-browser.js Supabase oturumlarını ve kullanıcıya özel favori erişimini sağlar.
- cloud-schema.sql yeni proje için tek seferlik kurulumdur; mevcut veritabanında tekrar çalıştırmayın.
- cloud-api.ts Supabase hava-api fonksiyonunun kaynağıdır. Kullanıcı oturumu sunucuda doğrulanır, kullanıcı ve ortak API limitleri uygulanır, sonuçlar 10 dakika saklanır. Legacy JWT kontrolü yerine fonksiyon içinde Auth user doğrulaması kullanılır.
- OWM_KEY yalnızca Edge Function secret ayarına; SMTP bilgileri yalnızca Authentication SMTP ayarlarına girilir.
- npm ci ardından npm run build:pages ile docs/ yeniden oluşturulur. GitHub Pages yayın kaynağı main /docs seçilir.
- Ücretsiz Supabase projesi hareketsizlikte duraklatılabilir; kota sınırlıdır.
