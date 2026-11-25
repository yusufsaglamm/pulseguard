# PulseGuard — Tasarım Sistemi (`DESIGN.md`)

## 1. Yüzey Modu ve Görsel İlke

- **Mod:** **Operate** — Operasyonel netlik, yüksek okunabilirlik, sıfır görsel gürültü.
- **Hedef:** Sistem durumunu tek bakışta (2 saniye içinde) anlaşılır kılmak; 90 günlük çalışma geçmişini, aktif kesintileri ve planlı bakımları net hiyerarşiyle sunmak.
- **Dil:** Doğal, teknik ve sade Türkçe arayüz.

---

## 2. Renk Paleti ve CSS Değişkenleri

Varsayılan tema **Dark Mode (OLED/Slate)** olarak tanımlanır; `[data-theme="light"]` ile yüksek kontrastlı açık tema desteklenir.

### Karanlık Tema (`:root`, Varsayılan)
| Token | Değer | Kullanım |
|---|---|---|
| `--color-background` | `#0F172A` | Ana sayfa zemini |
| `--color-card` | `#111827` | Kartlar, paneller, modallar |
| `--color-muted` | `#1E293B` | İkincil yüzeyler, tablo başlıkları, hover zeminleri |
| `--color-border` | `#334155` | İnce 1px ayraç ve çerçeveler |
| `--color-foreground` | `#F8FAFC` | Ana metin (>= 4.5:1 kontrast) |
| `--color-muted-foreground` | `#CBD5E1` | İkincil metin, zaman damgaları |
| `--color-primary` | `#16A34A` | Çalışıyor (Operational) ana vurgu |
| `--color-secondary` | `#22C55E` | Çalışıyor çubuğu / parlak yeşil gösterge |
| `--color-destructive` | `#DC2626` | Kesinti (Down / Critical) |
| `--color-warning` | `#D97706` | Kısmi Kesinti / Bakım / Uyarı |
| `--color-info` | `#3B82F6` | Bilgilendirme / Planlı bakım aksiyonu |
| `--color-no-data` | `#334155` | Veri olmayan gün çubuğu |
| `--color-ring` | `#22C55E` | Klavye odak halkası |

### Açık Tema (`[data-theme="light"]`)
| Token | Değer |
|---|---|
| `--color-background` | `#F8FAFC` |
| `--color-card` | `#FFFFFF` |
| `--color-muted` | `#F1F5F9` |
| `--color-border` | `#CBD5E1` |
| `--color-foreground` | `#0F172A` |
| `--color-muted-foreground` | `#475569` |
| `--color-primary` | `#15803D` |
| `--color-secondary` | `#16A34A` |
| `--color-destructive` | `#B91C1C` |
| `--color-warning` | `#B45309` |
| `--color-info` | `#1D4ED8` |
| `--color-no-data` | `#CBD5E1` |

---

## 3. Tipografi

- **Gövde & Başlık:** `"IBM Plex Sans", system-ui, -apple-system, sans-serif`
- **Veri & Kod (`tabular-nums`):** `"JetBrains Mono", ui-monospace, monospace`
  - Latency değerleri (`24 ms`), uptime yüzdeleri (`99.98%`), portlar, URL'ler, ISO/yerel zaman damgaları ve HTTP durum kodları mutlaka `JetBrains Mono` ve `font-variant-numeric: tabular-nums` ile render edilir.
- **Ölçek:**
  - Sayfa başlığı: `1.5rem` (`24px`), `font-semibold`, `tracking-tight`
  - Bölüm başlığı: `1.125rem` (`18px`), `font-semibold`
  - Kart başlığı / servis adı: `0.9375rem` (`15px`), `font-medium`
  - Gövde: `0.875rem` (`14px`)
  - Mikro etiket / zaman: `0.75rem` (`12px`)

---

## 4. Boşluk Ritmi ve Yerleşim

- **4 / 8 px Ritmi:** `--space-xs: 4px`, `--space-sm: 8px`, `--space-md: 16px`, `--space-lg: 24px`, `--space-xl: 32px`, `--space-2xl: 48px`.
- **Public Status Page:** Maksimum `960px` ortalanmış tek kolon akış; mobilde (`375px`) `16px` yatay boşluk, masaüstünde (`1440px`) rahat nefes alan kart boşlukları.
- **Admin Paneli:** Masaüstünde sabit `240px` sol menü + esnek içerik alanı (`max-w-6xl`), mobilde üst açılır navigasyon.

---

## 5. İkonografi ve Erişilebilirlik Kuralları

- **İkon Kütüphanesi:** Yalnızca `@phosphor-icons/react` vektör ikonları kullanılır. Yapısal ikon olarak emoji kesinlikle kullanılmaz.
- **Dekoratif İkonlar:** Görünür metinle yan yana duran ikonlara `aria-hidden="true"` eklenir.
- **Renk Tek Başına Bilgi Taşımaz:** Her durum rozeti (`Çalışıyor`, `Kesinti`, `Kısmi Kesinti`, `Planlı Bakım`, `Bilinmiyor`) renk ile birlikte mutlaka uygun bir Phosphor ikonu (`CheckCircle`, `XCircle`, `Warning`, `Wrench`, `Question`) ve açık metin etiketi taşır.
- **90 Günlük Uptime Çubuğu (`UptimeBar90`):**
  - 90 gün soldan sağa (en eski → bugün) eşit genişlikli esnek çubuklar halinde dizilir; `375px` mobilde yatay taşma oluşturmaz.
  - Her gün çubuğu hem fare hover'ında hem klavye odağında (`tabIndex={0}`, `aria-label`) tarih, uptime %, ortalama latency ve kesinti sayısını gösteren bir bilgi baloncuğu açar.
- **Hareket Tercihi:** `@media (prefers-reduced-motion: reduce)` altında tüm nabız (pulse) ve geçiş animasyonları devre dışı bırakılır.
- **Odak & Kontrast:** Tüm etkileşimli öğelerde görünür odak halkası (`outline: 2px solid var(--color-ring); outline-offset: 2px`) ve `cursor: pointer` bulunur.
