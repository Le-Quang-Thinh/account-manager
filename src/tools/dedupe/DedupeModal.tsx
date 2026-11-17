import { useEffect, useState } from 'react'
import { DedupePanel } from './DedupePanel'
import { CaseToggle } from '../../shared/components/Layout'
import { Icon } from '../../shared/components/Icon'

// "Lọc trùng" dạng cửa sổ dùng được ở mọi tab. Luôn gắn sẵn (chỉ ẩn/hiện) nên
// nội dung đã dán vẫn còn khi đóng rồi mở lại trong cùng phiên.
export function DedupeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [caseSensitive, setCaseSensitive] = useState(true)
  useEffect(() => {
    if (!open) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [open, onClose])

  return (
    <div className="modal-bg" style={{ display: open ? 'grid' : 'none' }} onClick={onClose}>
      <div className="modal dedupe-modal" role="dialog" aria-modal="true" aria-label="Lọc trùng" onClick={e => e.stopPropagation()}>
        <div className="pane-h">
          <h3>Lọc trùng</h3>
          <span className="sp" />
          <CaseToggle checked={caseSensitive} onChange={setCaseSensitive} />
          <button type="button" className="btn sm icon-btn" aria-label="Đóng" onClick={onClose}><Icon name="close" size={14} /></button>
        </div>
        <div className="dedupe-modal-body">
          <DedupePanel caseSensitive={caseSensitive} />
        </div>
      </div>
    </div>
  )
}
