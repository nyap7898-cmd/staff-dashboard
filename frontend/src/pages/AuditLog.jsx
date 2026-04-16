import { useEffect, useState } from 'react'
import axios from 'axios'

function fmt(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('en-MY', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true
  })
}

const actionColour = {
  'Attendance Edit': 'bg-blue-100 text-blue-700',
  'Leave Applied': 'bg-yellow-100 text-yellow-700',
  'Leave Approved': 'bg-green-100 text-green-700',
  'Leave Rejected': 'bg-red-100 text-red-700',
  'Staff Profile Edited': 'bg-purple-100 text-purple-700',
}

const roleColour = {
  director: 'bg-blue-100 text-blue-700',
  hr: 'bg-green-100 text-green-700',
}

export default function AuditLog() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    axios.get('/api/audit').then(r => {
      setLogs(r.data)
      setLoading(false)
    })
  }, [])

  const filtered = filter === 'all' ? logs : logs.filter(l => l.role === filter)

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-800">Audit Log</h1>
        <div className="flex gap-2">
          {['all', 'hr', 'director'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === f ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {f === 'all' ? 'All' : f === 'hr' ? 'HR Only' : 'Director Only'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-12">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center text-gray-400 text-sm">
          No activity recorded yet
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-5 py-3">Time</th>
                <th className="text-left px-4 py-3">By</th>
                <th className="text-left px-4 py-3">Action</th>
                <th className="text-left px-4 py-3">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(log => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 text-gray-400 text-xs whitespace-nowrap">{fmt(log.timestamp)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleColour[log.role] || 'bg-gray-100 text-gray-600'}`}>
                      {log.role === 'director' ? '👑 Director' : '🗂️ HR'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${actionColour[log.action] || 'bg-gray-100 text-gray-600'}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{log.details || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
