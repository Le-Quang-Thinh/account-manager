// localStorage an toàn: chế độ riêng tư hoặc bị chặn thì bỏ qua thay vì làm hỏng giao diện.

export function readStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return (allowed as readonly string[]).includes(v ?? '') ? (v as T) : fallback
  } catch (e) { return fallback }
}

export function writeStored(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch (e) { /* bỏ qua */ }
}
