import { useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import { copyText, download, readTextFile, withTxt } from '../lib/browser'
import { Icon } from './Icon'

export type Tone = 'teal' | 'amber' | 'red' | 'slate'

export function CopyButton({ text, title = 'Copy toàn bộ' }: { text: string; title?: string }) {
  const [copied, setCopied] = useState(false)
  const onCopy = () => {
    if (!text) return
    copyText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    }).catch(() => { /* trình duyệt chặn clipboard: người dùng tự bôi đen */ })
  }
  return (
    <button type="button" className={'btn sm icon-btn' + (copied ? ' done' : '')} title={title} onClick={onCopy} disabled={!text}>
      <Icon name={copied ? 'check' : 'copy'} size={14} />{copied ? 'Đã copy' : 'Copy'}
    </button>
  )
}

export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: Tone }) {
  return <span className={'badge tone-' + tone}>{children}</span>
}

export function NumberField({ label, value, onChange, width = 64 }: { label: ReactNode; value: string | number; onChange: (v: string) => void; width?: number }) {
  return (
    <label className="fld">{label}
      <input className="inp" type="number" min={1} style={{ width }} value={value} onChange={e => onChange(e.target.value)} />
    </label>
  )
}

interface InputPaneProps {
  title: ReactNode
  tone?: Tone
  value: string
  onChange: (v: string) => void
  placeholder?: string
  count?: number
  uploadLabel?: string
  multiple?: boolean
  // gọi khi người dùng chọn file; mặc định ghi đè nội dung bằng file đã chọn
  onFiles?: (texts: string[], files: File[]) => void
  onClear?: () => void
  headExtra?: ReactNode
  children?: ReactNode
  // thay cho ô textarea mặc định (vd. ô có tô sáng từ khoá)
  field?: ReactNode
  minHeight?: number
}

export function InputPane({
  title, tone = 'slate', value, onChange, placeholder, count, uploadLabel = 'Tải file lên',
  multiple, onFiles, onClear, headExtra, children, field, minHeight,
}: InputPaneProps) {
  const upload = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files || [])]
    e.target.value = ''
    if (!files.length) return
    try {
      const texts = await Promise.all(files.map(readTextFile))
      if (onFiles) onFiles(texts, files)
      else onChange(texts.join('\n'))
    } catch (err) { alert('Không đọc được file. Hãy chọn file văn bản (.txt).') }
  }
  return (
    <section className={'pane tone-' + tone}>
      <div className="pane-h">
        <h3>{title}</h3>
        {count !== undefined && <Badge tone={tone}>{count} dòng</Badge>}
        {headExtra}
        <span className="sp" />
        {onClear && <button type="button" className="btn sm ghost" onClick={onClear}>Xóa sạch</button>}
        <label className="btn sm icon-btn upload">
          <Icon name="upload" size={14} />{uploadLabel}
          <input type="file" accept=".txt,.csv,.tsv,text/plain" multiple={multiple} hidden onChange={upload} />
        </label>
      </div>
      {children}
      {field ?? (
        <textarea className="ta-pane" style={minHeight ? { minHeight } : undefined} wrap="off" spellCheck={false}
          aria-label={typeof title === 'string' ? title : undefined}
          value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
      )}
    </section>
  )
}

interface OutputPaneProps {
  title: ReactNode
  tone?: Tone
  text: string
  count: number
  defaultName: string
  headExtra?: ReactNode
  minHeight?: number
}

export function OutputPane({ title, tone = 'slate', text, count, defaultName, headExtra, minHeight }: OutputPaneProps) {
  const [name, setName] = useState('')
  return (
    <section className={'pane tone-' + tone}>
      <div className="pane-h">
        <h3>{title}</h3>
        <Badge tone={tone}>{count} dòng</Badge>
        {headExtra}
        <span className="sp" />
        <CopyButton text={text} />
      </div>
      <textarea className="ta-pane out" style={minHeight ? { minHeight } : undefined} wrap="off" spellCheck={false} readOnly
        aria-label={typeof title === 'string' ? title : undefined} value={text} />
      <div className="pane-f">
        <input className="inp" type="text" placeholder={defaultName} aria-label="Tên file xuất" value={name} onChange={e => setName(e.target.value)} />
        <button type="button" className="btn sm solid icon-btn" disabled={!text} onClick={() => download(withTxt(name, defaultName), text)}>
          <Icon name="download" size={14} />Tải về
        </button>
      </div>
    </section>
  )
}
