export interface City { name: string; country: string; tz: string; lat: number; lng: number }

// 6 thành phố theo dõi chính
export const FOCUS: City[] = [
  { name: 'New York', country: 'Mỹ', tz: 'America/New_York', lat: 40.7128, lng: -74.006 },
  { name: 'Los Angeles', country: 'Mỹ', tz: 'America/Los_Angeles', lat: 34.0522, lng: -118.2437 },
  { name: 'Mexico City', country: 'Mexico', tz: 'America/Mexico_City', lat: 19.4326, lng: -99.1332 },
  { name: 'São Paulo', country: 'Brazil', tz: 'America/Sao_Paulo', lat: -23.5505, lng: -46.6333 },
  { name: 'Tokyo', country: 'Nhật Bản', tz: 'Asia/Tokyo', lat: 35.6762, lng: 139.6503 },
  { name: 'London', country: 'Anh', tz: 'Europe/London', lat: 51.5074, lng: -0.1278 },
]

// Danh sách để tìm theo giờ: phủ gần hết các múi giờ, mỗi múi có ít nhất một thành phố lớn
export const CITIES: City[] = [
  ...FOCUS,
  { name: 'Pago Pago', country: 'Samoa thuộc Mỹ', tz: 'Pacific/Pago_Pago', lat: -14.2756, lng: -170.702 },
  { name: 'Honolulu', country: 'Mỹ (Hawaii)', tz: 'Pacific/Honolulu', lat: 21.3069, lng: -157.8583 },
  { name: 'Anchorage', country: 'Mỹ (Alaska)', tz: 'America/Anchorage', lat: 61.2181, lng: -149.9003 },
  { name: 'San Francisco', country: 'Mỹ', tz: 'America/Los_Angeles', lat: 37.7749, lng: -122.4194 },
  { name: 'Vancouver', country: 'Canada', tz: 'America/Vancouver', lat: 49.2827, lng: -123.1207 },
  { name: 'Phoenix', country: 'Mỹ', tz: 'America/Phoenix', lat: 33.4484, lng: -112.074 },
  { name: 'Denver', country: 'Mỹ', tz: 'America/Denver', lat: 39.7392, lng: -104.9903 },
  { name: 'Chicago', country: 'Mỹ', tz: 'America/Chicago', lat: 41.8781, lng: -87.6298 },
  { name: 'Monterrey', country: 'Mexico', tz: 'America/Monterrey', lat: 25.6866, lng: -100.3161 },
  { name: 'Cancún', country: 'Mexico', tz: 'America/Cancun', lat: 21.1619, lng: -86.8515 },
  { name: 'Bogotá', country: 'Colombia', tz: 'America/Bogota', lat: 4.711, lng: -74.0721 },
  { name: 'Lima', country: 'Peru', tz: 'America/Lima', lat: -12.0464, lng: -77.0428 },
  { name: 'Miami', country: 'Mỹ', tz: 'America/New_York', lat: 25.7617, lng: -80.1918 },
  { name: 'Toronto', country: 'Canada', tz: 'America/Toronto', lat: 43.6532, lng: -79.3832 },
  { name: 'San Juan', country: 'Puerto Rico', tz: 'America/Puerto_Rico', lat: 18.4655, lng: -66.1057 },
  { name: 'Caracas', country: 'Venezuela', tz: 'America/Caracas', lat: 10.4806, lng: -66.9036 },
  { name: 'Santiago', country: 'Chile', tz: 'America/Santiago', lat: -33.4489, lng: -70.6693 },
  { name: 'Halifax', country: 'Canada', tz: 'America/Halifax', lat: 44.6488, lng: -63.5752 },
  { name: "St. John's", country: 'Canada', tz: 'America/St_Johns', lat: 47.5615, lng: -52.7126 },
  { name: 'Rio de Janeiro', country: 'Brazil', tz: 'America/Sao_Paulo', lat: -22.9068, lng: -43.1729 },
  { name: 'Buenos Aires', country: 'Argentina', tz: 'America/Argentina/Buenos_Aires', lat: -34.6037, lng: -58.3816 },
  { name: 'Fernando de Noronha', country: 'Brazil', tz: 'America/Noronha', lat: -3.8547, lng: -32.4245 },
  { name: 'Praia', country: 'Cape Verde', tz: 'Atlantic/Cape_Verde', lat: 14.933, lng: -23.5133 },
  { name: 'Ponta Delgada', country: 'Bồ Đào Nha (Azores)', tz: 'Atlantic/Azores', lat: 37.7412, lng: -25.6756 },
  { name: 'Reykjavík', country: 'Iceland', tz: 'Atlantic/Reykjavik', lat: 64.1466, lng: -21.9426 },
  { name: 'Lisbon', country: 'Bồ Đào Nha', tz: 'Europe/Lisbon', lat: 38.7223, lng: -9.1393 },
  { name: 'Paris', country: 'Pháp', tz: 'Europe/Paris', lat: 48.8566, lng: 2.3522 },
  { name: 'Madrid', country: 'Tây Ban Nha', tz: 'Europe/Madrid', lat: 40.4168, lng: -3.7038 },
  { name: 'Amsterdam', country: 'Hà Lan', tz: 'Europe/Amsterdam', lat: 52.3676, lng: 4.9041 },
  { name: 'Berlin', country: 'Đức', tz: 'Europe/Berlin', lat: 52.52, lng: 13.405 },
  { name: 'Rome', country: 'Ý', tz: 'Europe/Rome', lat: 41.9028, lng: 12.4964 },
  { name: 'Lagos', country: 'Nigeria', tz: 'Africa/Lagos', lat: 6.5244, lng: 3.3792 },
  { name: 'Athens', country: 'Hy Lạp', tz: 'Europe/Athens', lat: 37.9838, lng: 23.7275 },
  { name: 'Cairo', country: 'Ai Cập', tz: 'Africa/Cairo', lat: 30.0444, lng: 31.2357 },
  { name: 'Johannesburg', country: 'Nam Phi', tz: 'Africa/Johannesburg', lat: -26.2041, lng: 28.0473 },
  { name: 'Istanbul', country: 'Thổ Nhĩ Kỳ', tz: 'Europe/Istanbul', lat: 41.0082, lng: 28.9784 },
  { name: 'Moscow', country: 'Nga', tz: 'Europe/Moscow', lat: 55.7558, lng: 37.6173 },
  { name: 'Riyadh', country: 'Ả Rập Xê Út', tz: 'Asia/Riyadh', lat: 24.7136, lng: 46.6753 },
  { name: 'Nairobi', country: 'Kenya', tz: 'Africa/Nairobi', lat: -1.2921, lng: 36.8219 },
  { name: 'Tehran', country: 'Iran', tz: 'Asia/Tehran', lat: 35.6892, lng: 51.389 },
  { name: 'Dubai', country: 'UAE', tz: 'Asia/Dubai', lat: 25.2048, lng: 55.2708 },
  { name: 'Kabul', country: 'Afghanistan', tz: 'Asia/Kabul', lat: 34.5553, lng: 69.2075 },
  { name: 'Karachi', country: 'Pakistan', tz: 'Asia/Karachi', lat: 24.8607, lng: 67.0011 },
  { name: 'Tashkent', country: 'Uzbekistan', tz: 'Asia/Tashkent', lat: 41.2995, lng: 69.2401 },
  { name: 'New Delhi', country: 'Ấn Độ', tz: 'Asia/Kolkata', lat: 28.6139, lng: 77.209 },
  { name: 'Mumbai', country: 'Ấn Độ', tz: 'Asia/Kolkata', lat: 19.076, lng: 72.8777 },
  { name: 'Colombo', country: 'Sri Lanka', tz: 'Asia/Colombo', lat: 6.9271, lng: 79.8612 },
  { name: 'Kathmandu', country: 'Nepal', tz: 'Asia/Kathmandu', lat: 27.7172, lng: 85.324 },
  { name: 'Dhaka', country: 'Bangladesh', tz: 'Asia/Dhaka', lat: 23.8103, lng: 90.4125 },
  { name: 'Yangon', country: 'Myanmar', tz: 'Asia/Yangon', lat: 16.8409, lng: 96.1735 },
  { name: 'Bangkok', country: 'Thái Lan', tz: 'Asia/Bangkok', lat: 13.7563, lng: 100.5018 },
  { name: 'Hồ Chí Minh', country: 'Việt Nam', tz: 'Asia/Ho_Chi_Minh', lat: 10.7769, lng: 106.7009 },
  { name: 'Hà Nội', country: 'Việt Nam', tz: 'Asia/Ho_Chi_Minh', lat: 21.0285, lng: 105.8542 },
  { name: 'Jakarta', country: 'Indonesia', tz: 'Asia/Jakarta', lat: -6.2088, lng: 106.8456 },
  { name: 'Singapore', country: 'Singapore', tz: 'Asia/Singapore', lat: 1.3521, lng: 103.8198 },
  { name: 'Kuala Lumpur', country: 'Malaysia', tz: 'Asia/Kuala_Lumpur', lat: 3.139, lng: 101.6869 },
  { name: 'Manila', country: 'Philippines', tz: 'Asia/Manila', lat: 14.5995, lng: 120.9842 },
  { name: 'Hồng Kông', country: 'Trung Quốc', tz: 'Asia/Hong_Kong', lat: 22.3193, lng: 114.1694 },
  { name: 'Thượng Hải', country: 'Trung Quốc', tz: 'Asia/Shanghai', lat: 31.2304, lng: 121.4737 },
  { name: 'Đài Bắc', country: 'Đài Loan', tz: 'Asia/Taipei', lat: 25.033, lng: 121.5654 },
  { name: 'Perth', country: 'Úc', tz: 'Australia/Perth', lat: -31.9505, lng: 115.8605 },
  { name: 'Seoul', country: 'Hàn Quốc', tz: 'Asia/Seoul', lat: 37.5665, lng: 126.978 },
  { name: 'Osaka', country: 'Nhật Bản', tz: 'Asia/Tokyo', lat: 34.6937, lng: 135.5023 },
  { name: 'Adelaide', country: 'Úc', tz: 'Australia/Adelaide', lat: -34.9285, lng: 138.6007 },
  { name: 'Brisbane', country: 'Úc', tz: 'Australia/Brisbane', lat: -27.4698, lng: 153.0251 },
  { name: 'Sydney', country: 'Úc', tz: 'Australia/Sydney', lat: -33.8688, lng: 151.2093 },
  { name: 'Melbourne', country: 'Úc', tz: 'Australia/Melbourne', lat: -37.8136, lng: 144.9631 },
  { name: 'Vladivostok', country: 'Nga', tz: 'Asia/Vladivostok', lat: 43.1155, lng: 131.8855 },
  { name: 'Guam', country: 'Mỹ (Guam)', tz: 'Pacific/Guam', lat: 13.4443, lng: 144.7937 },
  { name: 'Nouméa', country: 'New Caledonia', tz: 'Pacific/Noumea', lat: -22.2758, lng: 166.458 },
  { name: 'Auckland', country: 'New Zealand', tz: 'Pacific/Auckland', lat: -36.8485, lng: 174.7633 },
  { name: 'Suva', country: 'Fiji', tz: 'Pacific/Fiji', lat: -18.1416, lng: 178.4419 },
  { name: "Nuku'alofa", country: 'Tonga', tz: 'Pacific/Tongatapu', lat: -21.1394, lng: -175.2049 },
  { name: 'Kiritimati', country: 'Kiribati', tz: 'Pacific/Kiritimati', lat: 1.8721, lng: -157.4278 },
]

export const LOCAL_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone

const fmts = new Map<string, Intl.DateTimeFormat>()
const WEEKDAY: Record<string, string> = { Mon: 'T2', Tue: 'T3', Wed: 'T4', Thu: 'T5', Fri: 'T6', Sat: 'T7', Sun: 'CN' }

export interface ZonedTime { y: number; mo: number; d: number; h: number; mi: number; s: number; wd: string }

export function zoned(tz: string, at: Date): ZonedTime {
  let f = fmts.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', weekday: 'short',
      year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
    })
    fmts.set(tz, f)
  }
  const p: Record<string, string> = {}
  for (const x of f.formatToParts(at)) p[x.type] = x.value
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second, wd: WEEKDAY[p.weekday] ?? p.weekday }
}

// Độ lệch so với UTC (phút), đã tính giờ mùa hè
export function offsetMin(tz: string, at: Date): number {
  const z = zoned(tz, at)
  return Math.round((Date.UTC(z.y, z.mo - 1, z.d, z.h, z.mi, z.s) - Math.floor(at.getTime() / 1000) * 1000) / 60000)
}

const pad = (n: number) => String(n).padStart(2, '0')
export const hhmm = (min: number) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`
export const timeText = (z: ZonedTime, sec = false) => `${pad(z.h)}:${pad(z.mi)}${sec ? ':' + pad(z.s) : ''}`
export const dateText = (z: ZonedTime) => `${z.wd}, ${pad(z.d)}/${pad(z.mo)}`

export function utcText(off: number): string {
  const a = Math.abs(off)
  return `UTC${off < 0 ? '−' : '+'}${Math.floor(a / 60)}${a % 60 ? ':' + pad(a % 60) : ''}`
}

// Chênh so với giờ máy, vd. "−12h", "+2h", "cùng giờ"
export function diffText(min: number): string {
  if (!min) return 'cùng giờ'
  const a = Math.abs(min)
  return `${min < 0 ? '−' : '+'}${Math.floor(a / 60)}h${a % 60 ? pad(a % 60) : ''}`
}

export function durText(min: number): string {
  const h = Math.floor(min / 60), m = min % 60
  return h ? `${h}h${m ? pad(m) : ''}` : `${m} phút`
}

// Khoảng cách vòng tròn giữa hai thời điểm trong ngày (phút)
export const circDist = (a: number, b: number) => { const d = Math.abs(a - b) % 1440; return Math.min(d, 1440 - d) }

// ===== coord lưu riêng cho từng thành phố (localStorage), dạng "lat, lng" =====
export const cityKey = (c: City) => `${c.tz}|${c.name}`
export const defaultCoord = (c: City) => `${c.lat}, ${c.lng}`

// Chuẩn hóa "lat, lng" (chấp nhận dấu cách/chấm phẩy làm ngăn cách); null nếu không hợp lệ
export function parseCoord(s: string): string | null {
  const m = s.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,; ]\s*(-?\d+(?:\.\d+)?)$/)
  if (!m) return null
  const lat = +m[1], lng = +m[2]
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? `${lat}, ${lng}` : null
}

const COORD_KEY = 'accmgr_wc_coords'

export function loadCoords(): Record<string, string> {
  try {
    const v = JSON.parse(localStorage.getItem(COORD_KEY) ?? '{}')
    return v && typeof v === 'object' ? v : {}
  } catch (e) { return {} }
}

export function saveCoords(m: Record<string, string>) {
  try { localStorage.setItem(COORD_KEY, JSON.stringify(m)) } catch (e) { /* bỏ qua */ }
}
