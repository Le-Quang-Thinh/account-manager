export interface ZipFile { name: string; text: string }

export function crc32(b: Uint8Array) {
  let c = 0xFFFFFFFF
  for (let i = 0; i < b.length; i++) { c ^= b[i]; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)) }
  return (c ^ 0xFFFFFFFF) >>> 0
}

// Zip không nén (store), đủ cho file .txt và không cần thư viện ngoài.
export function makeZip(files: ZipFile[]) {
  const enc = new TextEncoder(), chunks: Uint8Array[] = [], cen: Uint8Array[] = []
  let off = 0
  const d = new Date()
  const dt = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)
  const dd = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  for (const f of files) {
    const name = enc.encode(f.name), data = enc.encode(f.text), crc = crc32(data)
    const lh = new DataView(new ArrayBuffer(30))
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true)
    lh.setUint16(10, dt, true); lh.setUint16(12, dd, true); lh.setUint32(14, crc, true)
    lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true)
    chunks.push(new Uint8Array(lh.buffer), name, data)
    const ch = new DataView(new ArrayBuffer(46))
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true)
    ch.setUint16(12, dt, true); ch.setUint16(14, dd, true); ch.setUint32(16, crc, true)
    ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true)
    ch.setUint32(42, off, true)
    cen.push(new Uint8Array(ch.buffer), name)
    off += 30 + name.length + data.length
  }
  let cs = 0
  cen.forEach(c => { cs += c.length })
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true)
  end.setUint32(12, cs, true); end.setUint32(16, off, true)
  return new Blob([...chunks, ...cen, new Uint8Array(end.buffer)] as BlobPart[], { type: 'application/zip' })
}
