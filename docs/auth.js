/*
  Oturum yardımcısı. Gerçek doğrulamayı server.js yapar (şifre veritabanında hash'lenir,
  oturum httpOnly çerezde tutulur). Bu dosya sadece sunucuyla konuşur.

  Dışarıdan aktardığın login.html ve signup.html sayfalarına şunları ekle:

    <script src="config.js"></script>
    <script src="auth.js"></script>

  Giriş formunun submit olayında:

    const r = await Auth.login(email, password);
    if (!r.ok) hataGoster(r.error);          // başarılıysa otomatik yönlendirir

  Kayıt formunun submit olayında:

    const r = await Auth.signup(name, email, password);
    if (!r.ok) hataGoster(r.error);

  Başarılı olunca kullanıcı ?next= adresine (yoksa HOME_PAGE'e) yönlendirilir.
*/
const Auth = {
  KEY: "hava-user", // sadece menüyü hızlı çizmek için önbellek, güvenlik kaynağı değil

  user() {
    try { return JSON.parse(localStorage.getItem(this.KEY)); } catch (_) { return null; }
  },
  cache(u) {
    try { u ? localStorage.setItem(this.KEY, JSON.stringify(u)) : localStorage.removeItem(this.KEY); } catch (_) {}
  },

  async api(path, method = "GET", body) {
    try {
      const r = await fetch("/api" + path, {
        method,
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined
      });
      let data = {};
      try { data = await r.json(); } catch (_) {}
      return { ok: r.ok, status: r.status, data };
    } catch (_) {
      return { ok: false, status: 0, data: { error: "Sunucuya ulaşılamadı. İnternet bağlantını kontrol et." } };
    }
  },

  async login(email, password) {
    const r = await this.api("/login", "POST", { email, password });
    if (!r.ok) return { ok: false, error: r.data.error || "Giriş yapılamadı." };
    this.cache(r.data.user); this.goNext();
    return { ok: true, user: r.data.user };
  },

  async signup(name, email, password) {
    const r = await this.api("/signup", "POST", { name, email, password });
    if (!r.ok) return { ok: false, error: r.data.error || "Kayıt oluşturulamadı." };
    if(r.data.verificationRequired){location.href='/hava-durumu/verify.html?email='+encodeURIComponent(r.data.email);return {ok:true};}
    this.cache(r.data.user); this.goNext();
    return { ok: true, user: r.data.user };
  },

  async logout() {
    await this.api("/logout", "POST");
    this.cache(null);
    location.href = APP_CONFIG.LOGIN_PAGE;
  },

  // Sunucudan oturumun hâlâ geçerli olup olmadığını sorar
  async refresh() {
    const r = await this.api("/me");
    if (r.ok) { this.cache(r.data.user); return r.data.user; }
    if (r.status === 401) this.cache(null);
    return this.user();
  },

  // ?next=sayfa.html varsa oraya, yoksa ana sayfaya git (başka siteye yönlendirmeyi engeller)
  goNext() {
    const n = new URLSearchParams(location.search).get("next");
    const safe = n && /^[\w\-./]+$/.test(n) && !n.startsWith("/hava-durumu/") && !n.includes("..");
    location.href = safe ? n : APP_CONFIG.HOME_PAGE;
  },

  // Giriş zorunlu sayfalarda çağır
  async requireLogin() {
    await this.refresh();
    if (this.user()) return;
    const here = location.pathname.split("/hava-durumu/").pop() || APP_CONFIG.HOME_PAGE;
    location.replace(APP_CONFIG.LOGIN_PAGE + "?next=" + encodeURIComponent(here));
  },

  // Sağ üstteki giriş/kayıt/çıkış alanını doldurur
  renderNav(el) {
    el.textContent = "";
    const u = this.user();
    if (u) {
      const hi = document.createElement("span");
      hi.className = "hello";
      hi.textContent = "Merhaba, " + (u.name || u.email);
      const out = document.createElement("button");
      out.className = "btn"; out.type = "button"; out.textContent = "Çıkış";
      out.addEventListener("click", () => this.logout());
      el.append(hi, out);
    } else {
      for (const [text, href] of [["Giriş yap", APP_CONFIG.LOGIN_PAGE], ["Kayıt ol", APP_CONFIG.SIGNUP_PAGE]]) {
        const a = document.createElement("a");
        a.className = "btn"; a.textContent = text; a.href = href;
        el.append(a);
      }
    }
  }
};
