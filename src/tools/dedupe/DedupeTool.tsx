import { useState } from 'react'
import { DedupePanel } from './DedupePanel'
import { CaseToggle, PageHead, UserOnlyToggle } from '../../shared/components/Layout'

export default function DedupeTool() {
  const [caseSensitive, setCaseSensitive] = useState(true)
  const [userOnly, setUserOnly] = useState(false)
  return (
    <>
      <PageHead title="Lọc trùng" sub="Dán File 1 để lọc dòng trùng. Dán thêm File 2 để so sánh hai file.">
        <UserOnlyToggle checked={userOnly} onChange={setUserOnly} />
        <CaseToggle checked={caseSensitive} onChange={setCaseSensitive} />
      </PageHead>
      <DedupePanel caseSensitive={caseSensitive} userOnly={userOnly} />
    </>
  )
}
