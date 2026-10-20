import { useDeferredValue, useMemo, useState } from 'react'
import { mixLines } from './logic'
import { InputPane, NumberField, OutputPane } from '../../shared/components/Panes'
import { parseIntOr } from '../../shared/lib/lines'

export default function MixTab() {
  const [textA, setTextA] = useState('')
  const [textB, setTextB] = useState('')
  const [countA, setCountA] = useState('10')
  const [countB, setCountB] = useState('10')
  const dA = useDeferredValue(textA)
  const dB = useDeferredValue(textB)
  const mix = useMemo(() => mixLines(dA, dB, parseIntOr(countA), parseIntOr(countB)), [dA, dB, countA, countB])

  return (
    <div className="stack">
      <p className="note">Lấy lần lượt {parseIntOr(countA)} dòng từ A, rồi {parseIntOr(countB)} dòng từ B, lặp lại đến khi hết cả hai danh sách.</p>
      <div className="grid two">
        <InputPane title="Danh sách A" tone="teal" count={mix.stats.a} value={textA} onChange={setTextA}
          onClear={() => setTextA('')} placeholder="Dán danh sách A..."
          headExtra={<NumberField label="Lấy" value={countA} onChange={setCountA} width={56} />} />
        <InputPane title="Danh sách B" tone="amber" count={mix.stats.b} value={textB} onChange={setTextB}
          onClear={() => setTextB('')} placeholder="Dán danh sách B..."
          headExtra={<NumberField label="Lấy" value={countB} onChange={setCountB} width={56} />} />
      </div>
      <OutputPane title="Kết quả trộn" tone="slate" text={mix.result} count={mix.stats.out} defaultName="mixed.txt" minHeight={240} />
    </div>
  )
}
