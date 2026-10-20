import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { compareFiles } from './logic'
import { Badge, CopyButton, InputPane, OutputPane } from '../../shared/components/Panes'
import { CaseToggle, PageHead } from '../../shared/components/Layout'
import { Icon } from '../../shared/components/Icon'
import { download } from '../../shared/lib/browser'

interface DupView { title: string; content: string; filename: string; count: number }

function DuplicateModal({ view, onClose }: { view: DupView; onClose: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose])
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={view.title} onClick={e => e.stopPropagation()}>
        <div className="pane-h">
          <h3>{view.title}</h3>
          <Badge tone="red">{view.count} dòng</Badge>
          <span className="sp" />
          <CopyButton text={view.content} />
          <button type="button" className="btn sm solid icon-btn" onClick={() => download(view.filename, view.content)}><Icon name="download" size={14} />Tải về</button>
          <button type="button" className="btn sm icon-btn" aria-label="Đóng" onClick={onClose}><Icon name="close" size={14} /></button>
        </div>
        <textarea className="ta-pane out" style={{ minHeight: 320 }} readOnly wrap="off" value={view.content} aria-label={view.title} />
      </div>
    </div>
  )
}

export default function DedupeTool() {
  const [caseSensitive, setCaseSensitive] = useState(true)
  const [textA, setTextA] = useState('')
  const [textB, setTextB] = useState('')
  const [modal, setModal] = useState<DupView | null>(null)
  // dữ liệu lớn: ô nhập luôn mượt, kết quả cập nhật sau
  const dA = useDeferredValue(textA)
  const dB = useDeferredValue(textB)
  const d = useMemo(() => compareFiles(dA, dB, caseSensitive), [dA, dB, caseSensitive])
  const hasB = dB.trim().length > 0 // có File 2 thì so sánh, không thì chỉ lọc trùng File 1

  const dupBadge = (n: number, title: string, content: string, filename: string) => n > 0 && (
    <button type="button" className="dup-chip" onClick={() => setModal({ title, content, filename, count: n })}>
      <Icon name="warn" size={12} />Ẩn {n} dòng trùng<u>Xem và tải</u>
    </button>
  )

  return (
    <>
      <PageHead title="Lọc trùng" sub="Dán File 1 để lọc dòng trùng. Dán thêm File 2 để so sánh hai file.">
        <CaseToggle checked={caseSensitive} onChange={setCaseSensitive} />
      </PageHead>
      <div className="stack">
        <div className="grid two">
          <InputPane title={<>File 1 <small>(cần lọc trùng)</small></>} tone="teal" count={d.stats.a}
            value={textA} onChange={setTextA} placeholder="Dán nội dung File 1 vào đây..." uploadLabel="Tải File 1"
            headExtra={hasB && dupBadge(d.stats.dupesA, 'Trùng lặp nội bộ - File 1', d.duplicateA, 'file1_internal_duplicates.txt')} />
          <InputPane title={<>File 2 <small>(tuỳ chọn, để so sánh)</small></>} tone="amber" count={d.stats.b}
            value={textB} onChange={setTextB} placeholder="Để trống = chỉ lọc trùng File 1. Dán vào đây để so sánh hai file..." uploadLabel="Tải File 2"
            headExtra={dupBadge(d.stats.dupesB, 'Trùng lặp nội bộ - File 2', d.duplicateB, 'file2_internal_duplicates.txt')} />
        </div>
        {hasB ? (
          <div className="grid three">
            <OutputPane title="Chỉ có ở File 1" tone="teal" text={d.onlyA} count={d.stats.onlyA} defaultName="only_in_file1.txt" />
            <OutputPane title="Có ở cả hai" tone="slate" text={d.both} count={d.stats.both} defaultName="in_both_files.txt" />
            <OutputPane title="Chỉ có ở File 2" tone="amber" text={d.onlyB} count={d.stats.onlyB} defaultName="only_in_file2.txt" />
          </div>
        ) : (
          <div className="grid two">
            <OutputPane title="Đã lọc (không trùng)" tone="teal" text={d.onlyA} count={d.stats.onlyA} defaultName="unique_lines.txt" />
            <OutputPane title="Dòng bị trùng" tone="red" text={d.duplicateA} count={d.stats.dupesA} defaultName="duplicate_lines.txt" />
          </div>
        )}
      </div>
      {modal && <DuplicateModal view={modal} onClose={() => setModal(null)} />}
    </>
  )
}
