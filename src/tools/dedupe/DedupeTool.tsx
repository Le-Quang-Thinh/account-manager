import { useState } from 'react'
import { DedupePanel } from './DedupePanel'
import { CaseToggle, PageHead } from '../../shared/components/Layout'

export default function DedupeTool() {
  const [caseSensitive, setCaseSensitive] = useState(true)
  return (
    <>
      <PageHead title="Lọc trùng" sub="Dán File 1 để lọc dòng trùng. Dán thêm File 2 để so sánh hai file.">
        <CaseToggle checked={caseSensitive} onChange={setCaseSensitive} />
      </PageHead>
      <DedupePanel caseSensitive={caseSensitive} />
    </>
  )
}
