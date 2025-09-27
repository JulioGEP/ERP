import { DealRecord } from '../../services/deals'
import { DealHeader } from './DealHeader'
import { DealTrainingList } from './DealTrainingList'
import { DealExtrasList } from './DealExtrasList'
import { DealNotes } from './DealNotes'
import { DealAttachments } from './DealAttachments'
import { DealSessionsEditor } from './DealSessionsEditor'

type Props = {
  deal: DealRecord
  notes: { id: number; content?: string }[]
  attachments: { id: number; file_name: string; url: string }[]
  sessions: { id: number; startAt: string; endAt: string; trainerId?: number; sede?: string }[]
  onClose: () => void
}

function DealDetailModal({ deal, notes, attachments, sessions, onClose }: Props) {
  return (
    <div className="modal">
      <button onClick={onClose} className="btn btn-close float-end" />

      <DealHeader deal={deal} />
      <DealTrainingList deal={deal} />
      <DealExtrasList deal={deal} />
      <DealNotes notes={notes} />
      <DealAttachments attachments={attachments} />
      <DealSessionsEditor sessions={sessions} />
    </div>
  )
}

export default DealDetailModal
