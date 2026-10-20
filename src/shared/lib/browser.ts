// Tiện ích trình duyệt: tải file, copy, đọc file, định dạng ngày.

const pad = (n: number) => String(n).padStart(2, '0')

export const stamp = () => {
  const d = new Date()
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
}
export const fmtShort = (t: number) => {
  const d = new Date(t)
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`
}

export function download(name: string, data: BlobPart, mime?: string) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'text/plain;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

export function copyText(t: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(t)
  const ta = document.createElement('textarea')
  ta.value = t
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  let ok = false
  try { ok = document.execCommand('copy') } catch (e) { /* bỏ qua */ }
  ta.remove()
  return ok ? Promise.resolve() : Promise.reject(new Error('copy'))
}

export const readTextFile = (file: File) => file.text()

// Tên file xuất luôn có đuôi .txt
export const withTxt = (custom: string, fallback: string) => {
  const name = custom.trim() || fallback
  return name.toLowerCase().endsWith('.txt') ? name : name + '.txt'
}
