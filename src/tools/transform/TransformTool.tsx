import { Activity, useState } from 'react'
import ConvertTab from './ConvertTab'
import ColumnsTab from './ColumnsTab'
import MixTab from './MixTab'
import { PageHead, SubTabs } from '../../shared/components/Layout'
import type { SubTabItem } from '../../shared/components/Layout'
import { readStored, writeStored } from '../../shared/lib/storage'

type ModeId = 'convert' | 'columns' | 'mix'

const MODES: (SubTabItem<ModeId> & { hint: string })[] = [
  { id: 'convert', label: 'Tách dính liền', hint: 'Tách chuỗi dính liền thành từng dòng.' },
  { id: 'columns', label: 'Trích xuất cột', hint: 'Giữ lại một số cột từ dữ liệu dạng bảng.' },
  { id: 'mix', label: 'Trộn xen kẽ', hint: 'Trộn hai danh sách theo nhịp A, B, A, B.' },
]
const IDS = MODES.map(m => m.id)
const KEY = 'accmgr_transform_mode'

export default function TransformTool() {
  const [mode, setMode] = useState<ModeId>(() => readStored(KEY, IDS, 'convert'))
  const pick = (id: ModeId) => { setMode(id); writeStored(KEY, id) }

  return (
    <>
      <PageHead title="Biến đổi" sub={MODES.find(m => m.id === mode)!.hint} />
      <SubTabs items={MODES} value={mode} onChange={pick} label="Chế độ biến đổi" />
      <Activity mode={mode === 'convert' ? 'visible' : 'hidden'}><ConvertTab /></Activity>
      <Activity mode={mode === 'columns' ? 'visible' : 'hidden'}><ColumnsTab /></Activity>
      <Activity mode={mode === 'mix' ? 'visible' : 'hidden'}><MixTab /></Activity>
    </>
  )
}
