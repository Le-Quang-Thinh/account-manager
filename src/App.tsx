import { Activity, Suspense, lazy, useCallback, useRef, useState } from 'react'
import { readStored, writeStored } from './shared/lib/storage'

// Mỗi nhóm công cụ tách thành một chunk riêng, chỉ tải khi mở lần đầu
const AccountsTool = lazy(() => import('./tools/accounts/AccountsTool'))
const DedupeTool = lazy(() => import('./tools/dedupe/DedupeTool'))
const SplitTool = lazy(() => import('./tools/split/SplitTool'))
const TransformTool = lazy(() => import('./tools/transform/TransformTool'))

type ToolId = 'accounts' | 'dedupe' | 'split' | 'transform'

const TOOLS: { id: ToolId; label: string }[] = [
  { id: 'accounts', label: 'Quản lý account' },
  { id: 'dedupe', label: 'Lọc trùng' },
  { id: 'split', label: 'Chia và tách' },
  { id: 'transform', label: 'Biến đổi' },
]
const TOOL_IDS = TOOLS.map(t => t.id)
const TOOL_KEY = 'accmgr_tool'

function Body({ id, toast }: { id: ToolId; toast: (m: string) => void }) {
  switch (id) {
    case 'accounts': return <AccountsTool toast={toast} />
    case 'dedupe': return <DedupeTool />
    case 'split': return <SplitTool />
    case 'transform': return <TransformTool />
  }
}

export default function App({ username, onLogout }: { username?: string; onLogout?: () => void }) {
  const [tool, setTool] = useState<ToolId>(() => readStored(TOOL_KEY, TOOL_IDS, 'accounts'))
  // nhóm đã mở: giữ nguyên (ẩn) để không mất dữ liệu khi chuyển tab, nhóm chưa mở thì chưa tải
  const [opened, setOpened] = useState<ToolId[]>(() => [tool])
  const [toastMsg, setToastMsg] = useState('')
  const toastTimer = useRef<number | undefined>(undefined)

  const toast = useCallback((m: string) => {
    setToastMsg(m)
    clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToastMsg(''), 4200)
  }, [])

  const pickTool = (id: ToolId) => {
    setTool(id)
    setOpened(o => o.includes(id) ? o : [...o, id])
    writeStored(TOOL_KEY, id)
    window.scrollTo(0, 0)
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-in">
          <div className="brand">
            <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="2" y="3" width="20" height="5" rx="1" fill="var(--teal)" />
              <rect x="2" y="10" width="14" height="5" rx="1" fill="var(--amber)" />
              <rect x="2" y="17" width="8" height="4" rx="1" fill="var(--slate)" />
            </svg>
            <span>Quản lý account</span>
          </div>
          <nav className="tool-tabs" role="tablist" aria-label="Nhóm công cụ">
            {TOOLS.map(t => (
              <button key={t.id} type="button" role="tab" aria-selected={tool === t.id} className={tool === t.id ? 'on' : ''} onClick={() => pickTool(t.id)}>{t.label}</button>
            ))}
          </nav>
          {onLogout && (
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, flex: 'none' }}>
              <span style={{ color: 'var(--mute)', fontSize: 14 }}>{username}</span>
              <button type="button" className="btn" onClick={onLogout}>Đăng xuất</button>
            </div>
          )}
        </div>
      </header>
      <main className="main">
        {opened.map(id => (
          <Activity key={id} mode={tool === id ? 'visible' : 'hidden'}>
            <Suspense fallback={<p className="loading" role="status">Đang tải…</p>}>
              <Body id={id} toast={toast} />
            </Suspense>
          </Activity>
        ))}
      </main>
      <div id="toast" className={toastMsg ? 'on' : ''} role="status" aria-live="polite">{toastMsg}</div>
    </>
  )
}
