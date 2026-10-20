import type { ReactNode } from 'react'

export function PageHead({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <header className="head">
      <div>
        <h1>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {children && <div className="head-c">{children}</div>}
    </header>
  )
}

export interface SubTabItem<T extends string> { id: T; label: string; count?: number }

// Thanh tab phụ dạng viên thuốc, dùng cho mọi nhóm công cụ
export function SubTabs<T extends string>({ items, value, onChange, label }: {
  items: SubTabItem<T>[]
  value: T
  onChange: (id: T) => void
  label: string
}) {
  return (
    <div className="subtabs" role="tablist" aria-label={label}>
      {items.map(it => (
        <button key={it.id} type="button" role="tab" aria-selected={value === it.id} className={value === it.id ? 'on' : ''} onClick={() => onChange(it.id)}>
          {it.label}{it.count !== undefined && <span className="subtabs-n">{it.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function CaseToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="fld case-toggle">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      Phân biệt hoa/thường
    </label>
  )
}
