// Bộ icon nét mảnh dùng chung, thay cho ký tự emoji. Chỉ vẽ đường, màu theo currentColor.

const PATHS = {
  copy: 'M9 9h10v10H9zM5 15V5h10',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  download: 'M12 4v11m-4.5-4.5L12 15l4.5-4.5M5 19h14',
  upload: 'M12 16V5m-4.5 4.5L12 5l4.5 4.5M5 19h14',
  warn: 'M12 4l9 16H3zM12 10v4.5M12 17.2v.1',
  close: 'M6 6l12 12M18 6L6 18',
  star: 'M12 4l2.4 5 5.4.7-4 3.8 1 5.4L12 16.3 7.2 18.9l1-5.4-4-3.8L9.6 9z',
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  )
}
