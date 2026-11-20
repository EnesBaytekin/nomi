// Para ve tarih biçimlendirme (format.ts'nin birebir karşılığı).

const tryFormatter = new Intl.NumberFormat('tr-TR', {
  style: 'currency',
  currency: 'TRY',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Kuruş → "₺1.234,50" */
export function fmtTRY(kurus) {
  return tryFormatter.format(kurus / 100);
}

/** Kuruş → "1.234,50" (sembolsüz) */
export function fmtAmount(kurus) {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    kurus / 100,
  );
}

/** Tuş takımı dizgisini ("1234,5") kuruşa çevirir */
export function parseKeypadAmount(s) {
  if (!s) return 0;
  const n = Number.parseFloat(s.replace(',', '.'));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

const dayNames = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const monthNames = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

export function monthName(m) {
  return monthNames[m] ?? '';
}

/** ts → "12 Kas" */
export function fmtDayShort(ts) {
  const d = new Date(ts);
  return `${d.getDate()} ${monthNames[d.getMonth()].slice(0, 3)}`;
}

/** ts → "12 Kasım 2026 Çarşamba" */
export function fmtDayLong(ts) {
  const d = new Date(ts);
  return `${d.getDate()} ${monthNames[d.getMonth()]} ${d.getFullYear()} ${dayNames[d.getDay()]}`;
}

/** ts → "14:32" */
export function fmtTime(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Yerel saat diliminde gün anahtarı: "2026-11-12" */
export function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function ymOf(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** "2026-11" → "Kasım 2026" */
export function fmtMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return `${monthNames[m - 1]} ${y}`;
}

export function addMonths(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  return ymOf(new Date(y, m - 1 + delta, 1));
}

/** Ayın yerel başlangıç/bitişi (epoch ms) */
export function monthRange(ym) {
  const [y, m] = ym.split('-').map(Number);
  const from = new Date(y, m - 1, 1, 0, 0, 0, 0).getTime();
  const to = new Date(y, m, 1, 0, 0, 0, 0).getTime() - 1;
  return { from, to };
}

/** datetime-local girişi için "2026-11-12T14:32" */
export function toLocalInput(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function fromLocalInput(v) {
  return new Date(v).getTime();
}

export function currentYm() {
  return ymOf(new Date());
}

/** İstemcinin saat dilimi ofseti (sunucu gruplaması için) */
export function tzOffset() {
  return new Date().getTimezoneOffset();
}

/** Yüzde değişim: (yeni - eski) / eski → "%+12" */
export function fmtDeltaPct(current, previous) {
  if (previous === 0) return current === 0 ? '%0' : '%+100';
  const pct = ((current - previous) / previous) * 100;
  const sign = pct > 0 ? '+' : '';
  return `%${sign}${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(pct)}`;
}
