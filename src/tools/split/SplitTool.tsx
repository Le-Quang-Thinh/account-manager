import { Activity, useState } from 'react'
import SplitTab from './SplitTab'
import GroupTrimTab from './GroupTrimTab'
import SpecialTab from './SpecialTab'
import SortMachineTab from './SortMachineTab'
import InterleaveTab from './InterleaveTab'
import { CaseToggle, PageHead, SubTabs } from '../../shared/components/Layout'
import type { SubTabItem } from '../../shared/components/Layout'
import { readStored, writeStored } from '../../shared/lib/storage'

type ModeId = 'split' | 'group_trim' | 'special' | 'sort_machine' | 'interleave'

const MODES: (SubTabItem<ModeId> & { hint: string })[] = [
  { id: 'split', label: 'Tách file', hint: 'Chia danh sách thành nhiều file, tải về dạng .zip.' },
  { id: 'group_trim', label: 'Chia nhóm và tỉa', hint: 'Chia thành các lô để copy, rồi tỉa từng lô trong khu vực làm việc.' },
  { id: 'special', label: 'Tách Special', hint: 'Tách dòng theo từ khóa hoặc regex, kết quả được tô sáng.' },
  { id: 'sort_machine', label: 'Sắp theo máy', hint: 'Gom phần đầu mỗi máy (ưu tiên) và phần còn lại, giữ nguyên thứ tự trong từng máy.' },
  { id: 'interleave', label: 'Xen kẽ theo máy', hint: 'Đọc lại danh sách theo hàng ngang: 1, 51, 101, …, 951, 2, 52, … (transpose theo số máy).' },
]
const IDS = MODES.map(m => m.id)
const KEY = 'accmgr_split_mode'

export default function SplitTool() {
  const [mode, setMode] = useState<ModeId>(() => readStored(KEY, IDS, 'split'))
  const [caseSensitive, setCaseSensitive] = useState(true)
  const pick = (id: ModeId) => { setMode(id); writeStored(KEY, id) }

  return (
    <>
      <PageHead title="Chia và tách" sub={MODES.find(m => m.id === mode)!.hint}>
        <CaseToggle checked={caseSensitive} onChange={setCaseSensitive} />
      </PageHead>
      <SubTabs items={MODES} value={mode} onChange={pick} label="Chế độ chia và tách" />
      {/* Activity giữ dữ liệu đang nhập ở tab đã mở, nhưng không vẽ lại khi đang ẩn */}
      <Activity mode={mode === 'split' ? 'visible' : 'hidden'}><SplitTab caseSensitive={caseSensitive} /></Activity>
      <Activity mode={mode === 'group_trim' ? 'visible' : 'hidden'}><GroupTrimTab caseSensitive={caseSensitive} /></Activity>
      <Activity mode={mode === 'special' ? 'visible' : 'hidden'}><SpecialTab caseSensitive={caseSensitive} /></Activity>
      <Activity mode={mode === 'sort_machine' ? 'visible' : 'hidden'}><SortMachineTab /></Activity>
      <Activity mode={mode === 'interleave' ? 'visible' : 'hidden'}><InterleaveTab /></Activity>
    </>
  )
}
