import { useEffect, useState, Fragment } from 'react'
import axios from 'axios'
import Badge from '../components/Badge.jsx'

function fmt(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function LeaveApproval() {
  const [pending, setPending] = useState([])
  const [recent, setRecent] = useState([])
  const [acting, setActing] = useState({})
  const [expanded, setExpanded] = useState(null)
  const [expandedRecent, setExpandedRecent] = useState(null)

  function load() {
    axios.get('/api/leaves?status=pending').then(r => setPending(r.data))
    axios.get('/api/leaves').then(r => {
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - 30)
      const hist = r.data.filter(l =>
        l.status !== 'pending' &&
        l.decided_at &&
        new Date(l.decided_at) >= cutoff
      )
      setRecent(hist)
    })
  }

  useEffect(() => { load() }, [])

  async function decide(id, action) {
    setActing(prev => ({ ...prev, [id]: action }))
    await axios.put(`/api/leaves/${id}/${action}`)
    load()
    setActing(prev => { const n = { ...prev }; delete n[id]; return n })
    setExpanded(null)
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-800 mb-5">Leave Approval</h1>

      {/* Pending */}
      <section className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Pending Approvals</h2>
          {pending.length > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{pending.length}</span>
          )}
        </div>

        {pending.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center text-gray-400 text-sm">
            No pending leave requests
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-5 py-3">Staff</th>
                  <th className="text-left px-4 py-3">Type</th>
                  <th className="text-left px-4 py-3">Start</th>
                  <th className="text-left px-4 py-3">End</th>
                  <th className="text-center px-4 py-3">Days</th>
                  <th className="text-left px-4 py-3">Reason</th>
                  <th className="text-left px-4 py-3">Applied</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {pending.map(l => (
                  <Fragment key={l.id}>
                    <tr
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => setExpanded(expanded === l.id ? null : l.id)}
                    >
                      <td className="px-5 py-3 font-medium text-gray-800">{l.name || <span className="text-gray-400 italic text-xs">(no name — fix in Staff Profiles)</span>}</td>
                      <td className="px-4 py-3"><Badge status={l.leave_type} /></td>
                      <td className="px-4 py-3 text-gray-600">{fmt(l.start_date)}</td>
                      <td className="px-4 py-3 text-gray-600">{fmt(l.end_date)}</td>
                      <td className="px-4 py-3 text-center font-medium">{l.days}</td>
                      <td className="px-4 py-3 text-gray-500 max-w-[180px] truncate">{l.reason || '—'}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{fmt(l.applied_at)}</td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex gap-2">
                          <button
                            onClick={() => decide(l.id, 'approve')}
                            disabled={!!acting[l.id]}
                            className="text-xs bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
                          >
                            {acting[l.id] === 'approve' ? '...' : 'Approve'}
                          </button>
                          <button
                            onClick={() => decide(l.id, 'reject')}
                            disabled={!!acting[l.id]}
                            className="text-xs bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
                          >
                            {acting[l.id] === 'reject' ? '...' : 'Reject'}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expanded === l.id && (
                      <tr className="bg-blue-50">
                        <td colSpan={8} className="px-6 py-4">
                          <div className="text-sm space-y-1 text-gray-700">
                            <div><span className="font-medium text-gray-500 w-28 inline-block">Staff:</span>{l.name} ({l.department})</div>
                            <div><span className="font-medium text-gray-500 w-28 inline-block">Leave type:</span>{l.leave_type.charAt(0).toUpperCase() + l.leave_type.slice(1)} Leave</div>
                            <div><span className="font-medium text-gray-500 w-28 inline-block">Period:</span>{fmt(l.start_date)} → {fmt(l.end_date)} ({l.days} day{l.days !== 1 ? 's' : ''})</div>
                            <div><span className="font-medium text-gray-500 w-28 inline-block">Reason:</span>{l.reason || <em className="text-gray-400">No reason given</em>}</div>
                            <div><span className="font-medium text-gray-500 w-28 inline-block">Applied:</span>{fmt(l.applied_at)}</div>
                            {l.document_name && (
                              <div>
                                <span className="font-medium text-gray-500 w-28 inline-block">Document:</span>
                                <a
                                  href={`/api/leaves/${l.id}/document`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:underline text-sm"
                                  onClick={e => e.stopPropagation()}
                                >
                                  📎 {l.document_name}
                                </a>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Recent decisions */}
      <section>
        <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">Recent Decisions (last 30 days)</h2>
        {recent.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center text-gray-400 text-sm">
            No recent decisions
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-5 py-3">Staff</th>
                  <th className="text-left px-4 py-3">Type</th>
                  <th className="text-left px-4 py-3">Dates</th>
                  <th className="text-center px-4 py-3">Days</th>
                  <th className="text-left px-4 py-3">Decision</th>
                  <th className="text-left px-4 py-3">Decided</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recent.map(l => (
                  <Fragment key={l.id}>
                    <tr
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => setExpandedRecent(expandedRecent === l.id ? null : l.id)}
                    >
                      <td className="px-5 py-3 font-medium text-gray-800">{l.name || <span className="text-gray-400 italic text-xs">(no name — fix in Staff Profiles)</span>}</td>
                      <td className="px-4 py-3"><Badge status={l.leave_type} /></td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{fmt(l.start_date)} – {fmt(l.end_date)}</td>
                      <td className="px-4 py-3 text-center">{l.days}</td>
                      <td className="px-4 py-3"><Badge status={l.status} /></td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{fmt(l.decided_at)}</td>
                    </tr>
                    {expandedRecent === l.id && (
                      <tr className="bg-gray-50">
                        <td colSpan={6} className="px-6 py-4">
                          <div className="text-sm space-y-1 text-gray-700">
                            <div><span className="font-medium text-gray-500 w-28 inline-block">Staff:</span>{l.name} ({l.department})</div>
                            <div><span className="font-medium text-gray-500 w-28 inline-block">Leave type:</span>{l.leave_type.charAt(0).toUpperCase() + l.leave_type.slice(1)} Leave</div>
                            <div><span className="font-medium text-gray-500 w-28 inline-block">Period:</span>{fmt(l.start_date)} → {fmt(l.end_date)} ({l.days} day{l.days !== 1 ? 's' : ''})</div>
                            <div><span className="font-medium text-gray-500 w-28 inline-block">Reason:</span>{l.reason || <em className="text-gray-400">No reason given</em>}</div>
                            <div><span className="font-medium text-gray-500 w-28 inline-block">Decision:</span><Badge status={l.status} /></div>
                            <div><span className="font-medium text-gray-500 w-28 inline-block">Decided:</span>{fmt(l.decided_at)}</div>
                            {l.document_name && (
                              <div>
                                <span className="font-medium text-gray-500 w-28 inline-block">Document:</span>
                                <a
                                  href={`/api/leaves/${l.id}/document`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:underline text-sm"
                                  onClick={e => e.stopPropagation()}
                                >
                                  📎 {l.document_name}
                                </a>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
