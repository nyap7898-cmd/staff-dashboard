import { useEffect, useState } from 'react'
import axios from 'axios'
import Badge from '../components/Badge.jsx'

const STATUS_OPTIONS = ['present', 'absent', 'on_leave', 'half_day']

export default function Attendance() {
  const today = new Date().toISOString().split('T')[0]
  const [date, setDate] = useState(today)
  const [records, setRecords] = useState([])
  const [editing, setEditing] = useState({})
  const [saving, setSaving] = useState({})

  useEffect(() => {
    axios.get(`/api/attendance?date=${date}`).then(r => {
      setRecords(r.data)
      setEditing({})
    })
  }, [date])

  function startEdit(r) {
    setEditing(prev => ({
      ...prev,
      [r.id || r.staff_id]: {
        staff_id: r.staff_id,
        check_in: r.check_in || '',
        check_out: r.check_out || '',
        status: r.status || 'present',
        notes: r.notes || '',
      }
    }))
  }

  function updateEdit(key, field, value) {
    setEditing(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }))
  }

  async function saveRow(key, staffId) {
    const data = editing[key]
    setSaving(prev => ({ ...prev, [key]: true }))
    await axios.post('/api/attendance', { ...data, staff_id: staffId, date })
    const res = await axios.get(`/api/attendance?date=${date}`)
    setRecords(res.data)
    setEditing(prev => { const n = { ...prev }; delete n[key]; return n })
    setSaving(prev => { const n = { ...prev }; delete n[key]; return n })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-800">Attendance</h1>
        <input
          type="date"
          value={date}
          max={today}
          onChange={e => setDate(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-5 py-3">Name</th>
              <th className="text-left px-4 py-3">Check In</th>
              <th className="text-left px-4 py-3">Check Out</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Notes</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {records.map(r => {
              const key = r.id || r.staff_id
              const ed = editing[key]
              return (
                <tr key={key} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-800">{r.name}</td>
                  {ed ? (
                    <>
                      <td className="px-4 py-2">
                        <input type="time" value={ed.check_in} onChange={e => updateEdit(key, 'check_in', e.target.value)}
                          className="border rounded px-2 py-1 text-xs w-24" />
                      </td>
                      <td className="px-4 py-2">
                        <input type="time" value={ed.check_out} onChange={e => updateEdit(key, 'check_out', e.target.value)}
                          className="border rounded px-2 py-1 text-xs w-24" />
                      </td>
                      <td className="px-4 py-2">
                        <select value={ed.status} onChange={e => updateEdit(key, 'status', e.target.value)}
                          className="border rounded px-2 py-1 text-xs">
                          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <input value={ed.notes} onChange={e => updateEdit(key, 'notes', e.target.value)}
                          className="border rounded px-2 py-1 text-xs w-32" placeholder="Notes" />
                      </td>
                      <td className="px-4 py-2 flex gap-2">
                        <button onClick={() => saveRow(key, r.staff_id)}
                          disabled={saving[key]}
                          className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 disabled:bg-blue-300">
                          {saving[key] ? 'Saving...' : 'Save'}
                        </button>
                        <button onClick={() => setEditing(prev => { const n = { ...prev }; delete n[key]; return n })}
                          className="text-xs text-gray-500 hover:text-gray-700">
                          Cancel
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3 text-gray-600">{r.check_in || <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-3 text-gray-600">{r.check_out || <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-3">
                        {r.status ? <Badge status={r.status} /> : <span className="text-gray-300 text-xs">Not marked</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{r.notes || <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => startEdit(r)}
                          className="text-xs text-blue-600 hover:underline font-medium">
                          Edit
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
