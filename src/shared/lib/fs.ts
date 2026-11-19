// Ghi file trực tiếp vào thư mục người dùng chọn qua File System Access API.
// Chỉ Chrome/Edge (Chromium) hỗ trợ; Firefox/Safari không có showDirectoryPicker.

export interface OutFile { path: string; text: string } // path dùng '/' cho thư mục con, vd "manage-account/farm/x[1].txt"

type AnyWin = Window & { showDirectoryPicker?: (opts?: unknown) => Promise<FileSystemDirectoryHandle> }

export const fsSupported = () => typeof (window as AnyWin).showDirectoryPicker === 'function'

// Mở hộp chọn thư mục. Trả null nếu user bấm Huỷ.
export async function pickDir(): Promise<FileSystemDirectoryHandle | null> {
  const w = window as AnyWin
  if (!w.showDirectoryPicker) return null
  try {
    return await w.showDirectoryPicker({ mode: 'readwrite' })
  } catch (e) {
    return null // AbortError khi user huỷ
  }
}

async function ensureDir(root: FileSystemDirectoryHandle, parts: string[]) {
  let dir = root
  for (const p of parts) dir = await dir.getDirectoryHandle(p, { create: true })
  return dir
}

// Ghi toàn bộ file (tự tạo thư mục con theo path). Trả về số file đã ghi. Ném lỗi nếu mất quyền ghi.
export async function writeFiles(root: FileSystemDirectoryHandle, files: OutFile[]): Promise<number> {
  let n = 0
  for (const f of files) {
    const segs = f.path.split('/').filter(Boolean)
    const fname = segs.pop()
    if (!fname) continue
    const dir = await ensureDir(root, segs)
    const fh = await dir.getFileHandle(fname, { create: true })
    const w = await fh.createWritable()
    await w.write(f.text)
    await w.close()
    n++
  }
  return n
}
