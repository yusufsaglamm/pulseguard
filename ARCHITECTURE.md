# PulseGuard — Mimari Dokümanı (`ARCHITECTURE.md`)

## 1. Genel Bakış & Teknoloji Yığını

PulseGuard, tek sunucuda (self-hosted) çalışan, tek yönetici (single-admin) modeline sahip bir **Uptime & Incident Monitor** uygulamasıdır.

- **Çalışma Zamanı:** Node.js v24+ (geliştirme ortamı v26.13.0)
- **Mimari:** Tek süreçli TypeScript Monorepo (`server/` + `web/`)
- **Backend API:** Hono (`@hono/node-server`), strict ESM + TypeScript
- **Veritabanı:** Node.js yerleşik `node:sqlite` (`DatabaseSync`), WAL (Write-Ahead Logging) modu
- **Doğrulama:** Zod (tüm API girişleri ve ortam değişkenleri)
- **Zamanlayıcı & Probe Motoru:** Dahili `MonitorScheduler` (`fetch` HTTP/API + `node:net` TCP port kontrolü)
- **Frontend:** React 19, Vite, Tailwind CSS v4, Recharts, `@phosphor-icons/react`, React Router

---

## 2. Klasör Yapısı

```text
pulseguard/
├── ARCHITECTURE.md
├── DESIGN.md
├── Dockerfile
├── docker-compose.yml
├── package.json
├── .env.example
├── .gitignore
├── docs/superpowers/plans/
│   └── 2026-11-25-pulseguard.md
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   ├── src/
│   │   ├── index.ts              # Giriş noktası, DB & scheduler başlatma, graceful shutdown
│   │   ├── app.ts                # Hono app fabrikası + statik SPA servisi
│   │   ├── config.ts             # Zod ile doğrulanmış env yapılandırması
│   │   ├── auth/
│   │   │   ├── password.ts       # scrypt + per-user salt + timingSafeEqual
│   │   │   ├── session.ts        # SHA-256 hash'li oturum token yönetimi
│   │   │   ├── rate-limit.ts     # Kayan pencereli login rate limiter
│   │   │   └── middleware.ts     # requireAdmin cookie doğrulaması
│   │   ├── db/
│   │   │   ├── connection.ts     # WAL, foreign_keys=ON, busy_timeout=5000
│   │   │   ├── migrations.ts     # İdempotent şema oluşturma
│   │   │   └── seed.ts           # Varsayılan site ayarları & ilk admin seed
│   │   ├── monitoring/
│   │   │   ├── prober.ts         # HTTP, API ve TCP port probe'ları
│   │   │   ├── state-machine.ts  # 3 ardışık hata -> DOWN, iyileşme -> tekil UP
│   │   │   └── scheduler.ts      # Çakışma korumalı zamanlayıcı & bakım senkronu
│   │   ├── notifications/
│   │   │   ├── types.ts
│   │   │   ├── telegram.ts       # Telegram Bot API
│   │   │   ├── discord.ts        # Discord Webhook Embed
│   │   │   ├── webhook.ts        # Generic JSON Webhook + opsiyonel HMAC-SHA256
│   │   │   └── dispatcher.ts     # Promise.allSettled dağıtıcı & test gönderimi
│   │   ├── routes/
│   │   │   ├── auth.ts
│   │   │   ├── public.ts
│   │   │   ├── monitors.ts
│   │   │   ├── incidents.ts
│   │   │   ├── maintenances.ts
│   │   │   ├── channels.ts
│   │   │   └── settings.ts
│   │   └── schemas/
│   │       └── validation.ts     # Tüm Zod doğrulama şemaları
│   └── tests/
│       ├── db.test.ts
│       ├── auth.test.ts
│       ├── prober.test.ts
│       ├── state-machine.test.ts
│       ├── notifications.test.ts
│       └── api.test.ts
└── web/
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    ├── index.html
    └── src/
        ├── index.css             # DESIGN.md CSS token'ları (Dark varsayılan + Light)
        ├── main.tsx
        ├── App.tsx
        ├── api/client.ts
        ├── components/
        │   ├── StatusBadge.tsx
        │   ├── UptimeBar90.tsx
        │   ├── LatencyChart.tsx
        │   ├── ThemeToggle.tsx
        │   └── Modal.tsx
        └── pages/
            ├── StatusPage.tsx
            ├── LoginPage.tsx
            └── admin/
                ├── AdminLayout.tsx
                ├── MonitorsView.tsx
                ├── IncidentsView.tsx
                ├── MaintenancesView.tsx
                ├── ChannelsView.tsx
                └── SettingsView.tsx
```

---

## 3. Veritabanı Şeması ve Veri Yaşam Döngüsü

SQLite üzerinde 10 tablo bulunur (`PRAGMA foreign_keys = ON`):
1. `admin_users`: Tek yönetici hesabı (`id`, `email`, `password_hash`, `created_at`).
2. `sessions`: Oturum token özetleri (`id`, `user_id`, `token_hash`, `expires_at`, `created_at`).
3. `settings`: Anahtar-değer site ayarları (`site_title`, `site_description`).
4. `monitors`: İzlenen servisler (`http` / `api` / `tcp`), hedef, metot, header JSON, beklenen status/keyword, aralık, zaman aşımı, hata eşiği (varsayılan `3`), görünürlük, anlık durum ve ardışık hata sayacı.
5. `check_results`: Ham kontrol kayıtları (`(monitor_id, checked_at DESC)` indeksli). Otomatik temizlik ile son `CHECK_RETENTION_DAYS` (varsayılan 30 gün) saklanır.
6. `daily_stats`: `(monitor_id, day)` birincil anahtarlı günlük özetler (`total_checks`, `up_checks`, `down_checks`, `avg_latency_ms`, `max_latency_ms`, `downtime_incidents`). Public Status Page son 90 günlük çubukları doğrudan bu tablodan <5ms içinde okur.
7. `incidents`: Otomatik (`source='auto'`) ve manuel (`source='manual'`) olay kayıtları (`investigating` | `identified` | `monitoring` | `resolved`).
8. `incident_updates`: Her olayın kronolojik durum güncellemeleri.
9. `maintenances`: Planlı bakım pencereleri (`scheduled` | `in_progress` | `completed`), etkilenen monitörler ve `suppress_alerts` bayrağı.
10. `notification_channels`: Telegram, Discord ve Generic Webhook kanalları.

---

## 4. Girdi Doğrulama (Validation) Kuralları

- Her `POST` ve `PUT` endpoint'i istek gövdesini `schemas/validation.ts` içindeki Zod şemalarıyla doğrular; geçersiz istekler `400 Bad Request` ve alan bazlı hata mesajı döner.
- `http` ve `api` monitör hedefleri yalnızca `http://` veya `https://` protokollerini kabul eder.
- `tcp` monitör hedefleri `host:port` (veya IPv6 `[host]:port`) formatını ve `1–65535` port aralığını zorunlu kılar.
- `ALLOW_PRIVATE_TARGETS=false` ayarlandığında loopback, link-local ve RFC1918 özel IP hedefleri API katmanında reddedilir (self-hosted iç ağ izleme için varsayılan `true`).
- Bakım pencerelerinde `ends_at > starts_at` kuralı şema düzeyinde doğrulanır.

---

## 5. Yetkilendirme ve Kimlik Doğrulama (Auth)

- **Tek Yönetici Modeli:** Karmaşık rol/ekip yapısı yoktur. Sistem ilk açılışta `ADMIN_EMAIL` / `ADMIN_PASSWORD` ile seed edilebilir veya `/admin/login` üzerinden tek seferlik `/api/auth/setup` akışıyla ilk yönetici oluşturulabilir (`admin_users` sayısı `0` iken aktiftir).
- **Parola Güvenliği:** `crypto.scryptSync` + 16 byte rastgele salt; doğrulamada `crypto.timingSafeEqual` kullanılır.
- **Oturum Yönetimi:** 32 byte kriptografik rastgele token üretilir, veritabanında yalnızca `SHA-256` özeti saklanır. İstemciye `HttpOnly; SameSite=Lax; Path=/` cookie (`pulseguard_session`) olarak verilir (`COOKIE_SECURE=true` ise `Secure` eklenir).
- **Brute-Force Koruması:** `LoginRateLimiter` IP/anahtar başına 15 dakikalık pencerede en fazla 10 başarısız denemeye izin verir; başarılı girişte sayacı sıfırlar.
- **Sınır Ayrımı:** `/api/health`, `/api/public/status` ve `/api/auth/{me,login,setup,logout}` dışındaki tüm `/api/admin/*` uçları `requireAdmin` ara katmanı ile korunur.

---

## 6. Parametreli SQL Sorgusu Kuralı

- Tüm veritabanı işlemleri `DatabaseSync.prepare(...)` ve `?` konum tutucuları (bound parameters) ile yürütülür.
- SQL dizgisi birleştirme (string concatenation / template interpolation ile değer gömme) kesinlikle yasaktır.
- Dinamik `IN (...)` listelerinde yalnızca sabit soru işaretleri (`?, ?, ?`) üretilir ve değerler parametre olarak bağlanır.

---

## 7. `.env` ve Gizli Bilgi (Secret) Güvenliği

- `.env`, `data/`, `*.db*` dosyaları `.gitignore` içindedir ve repoya dahil edilmez. Şablon olarak `.env.example` tutulur.
- `notification_channels` tablosundaki `botToken`, `webhookUrl` ve Webhook `secret` alanları:
  - Public API (`/api/public/status`) yanıtlarına **asla** dahil edilmez.
  - Admin `GET /api/admin/channels` yanıtında maskelenerek (redacted) döndürülür (`***...son4`).
  - Güncelleme (`PUT`) sırasında maskeli değer veya boş gizli alan gönderilirse mevcut gizli değer korunur.
  - Hata loglarına gizli token veya webhook URL'leri yazılmaz.
