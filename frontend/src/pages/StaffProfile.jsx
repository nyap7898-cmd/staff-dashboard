import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import axios from 'axios'
import Badge from '../components/Badge.jsx'

function maskIC(ic) {
  if (!ic) return '—'
  const clean = ic.replace(/-/g, '')
  if (clean.length < 4) return ic
  return '••••••-••-' + clean.slice(-4)
}

function fmt(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })
}

function colourDays(n) {
  if (n <= 2) return 'text-red-600'
  if (n <= 5) return 'text-orange-500'
  return 'text-green-600'
}

const avatarColours = ['bg-blue-500','bg-purple-500','bg-green-500','bg-orange-500','bg-pink-500','bg-teal-500','bg-red-500']
function initials(name) { return name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase() }

export default function StaffProfile() {
  const [params, setParams] = useSearchParams()
  const [staffList, setStaffList] = useState([])
  const [selected, setSelected] = useState(null)
  const [balance, setBalance] = useState(null)
  const [history, setHistory] = useState([])
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [leaveEdit, setLeaveEdit] = useState(null)   // leave record being edited
  const [leaveSaving, setLeaveSaving] = useState(false)
  const role = localStorage.getItem('user_role') || 'hr'

  useEffect(() => {
    axios.get('/api/staff').then(r => {
      setStaffList(r.data)
      const idParam = params.get('id')
      const first = idParam ? r.data.find(s => String(s.id) === idParam) : r.data[0]
      if (first) loadStaff(first)
    })
  }, [])

  async function loadStaff(s) {
    setSelected(s)
    setEditing(false)
    setParams({ id: s.id })
    const [bal, hist] = await Promise.all([
      axios.get('/api/leaves/balance'),
      axios.get(`/api/leaves/staff/${s.id}`),
    ])
    setBalance(bal.data.find(b => b.id === s.id))
    setHistory(hist.data)
  }

  function startEdit() {
    setEditForm({ ...selected })
    setEditing(true)
  }

  async function saveEdit() {
    if (!editForm.name || !editForm.name.trim()) {
      alert('Staff name cannot be empty.')
      return
    }
    setSaving(true)
    await axios.put(`/api/staff/${selected.id}`, editForm)
    const updated = { ...selected, ...editForm }
    setSelected(updated)
    setStaffList(prev => prev.map(s => s.id === updated.id ? updated : s))
    setEditing(false)
    setSaving(false)
  }

  async function saveLeaveEdit() {
    setLeaveSaving(true)
    await axios.put(`/api/leaves/${leaveEdit.id}`, leaveEdit)
    setLeaveEdit(null)
    const hist = await axios.get(`/api/leaves/staff/${selected.id}`)
    setHistory(hist.data)
    const bal = await axios.get('/api/leaves/balance')
    setBalance(bal.data.find(b => b.id === selected.id))
    setLeaveSaving(false)
  }

  async function deleteLeave(l) {
    if (!window.confirm(`Delete this ${l.leave_type} leave (${fmt(l.start_date)} – ${fmt(l.end_date)}, ${l.days} day${l.days !== 1 ? 's' : ''})?`)) return
    await axios.delete(`/api/leaves/${l.id}`)
    const hist = await axios.get(`/api/leaves/staff/${selected.id}`)
    setHistory(hist.data)
    const bal = await axios.get('/api/leaves/balance')
    setBalance(bal.data.find(b => b.id === selected.id))
  }

  const colIdx = staffList.findIndex(s => s.id === selected?.id) % avatarColours.length

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-800 mb-5">Staff Profiles</h1>

      {/* Staff selector tabs */}
      <div className="flex gap-2 flex-wrap mb-6">
        {staffList.map((s, i) => (
          <button
            key={s.id}
            onClick={() => loadStaff(s)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              selected?.id === s.id
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {s.name}
          </button>
        ))}
      </div>

      {selected && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Profile card */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex flex-col items-center mb-5">
                <div className={`w-16 h-16 rounded-full ${avatarColours[colIdx]} flex items-center justify-center text-white text-2xl font-bold mb-3`}>
                  {initials(selected.name)}
                </div>
                {editing ? (
                  <input value={editForm.name} onChange={e => setEditForm(p=>({...p,name:e.target.value}))}
                    className="text-center text-lg font-bold border-b border-gray-300 focus:outline-none w-full text-center" />
                ) : (
                  <div className="text-lg font-bold text-gray-800 text-center">{selected.name}</div>
                )}
                <div className="text-sm text-gray-500 mt-0.5">{editing ? editForm.job_title : selected.job_title}</div>
                <div className="text-xs text-gray-400">{editing ? editForm.department : selected.department}</div>
              </div>

              {editing ? (
                <div className="space-y-3 text-sm">
                  {[
                    ['job_title', 'Job Title'],
                    ['department', 'Department'],
                    ['email', 'Email'],
                    ['phone', 'Phone'],
                    ['date_joined', 'Date Joined'],
                  ].map(([field, label]) => (
                    <div key={field}>
                      <label className="text-xs text-gray-500 block mb-0.5">{label}</label>
                      <input
                        type={field === 'date_joined' ? 'date' : 'text'}
                        value={editForm[field] || ''}
                        onChange={e => setEditForm(p=>({...p,[field]:e.target.value}))}
                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  ))}
                  <div className="grid grid-cols-2 gap-2">
                    {[['annual_entitlement','Annual Days'],['mc_entitlement','MC Days']].map(([field,label])=>(
                      <div key={field}>
                        <label className="text-xs text-gray-500 block mb-0.5">{label}</label>
                        <input type="number" value={editForm[field]||0}
                          onChange={e=>setEditForm(p=>({...p,[field]:Number(e.target.value)}))}
                          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button onClick={saveEdit} disabled={saving}
                      className="flex-1 bg-blue-600 text-white text-sm py-2 rounded-lg hover:bg-blue-700 disabled:bg-blue-300">
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                    <button onClick={() => setEditing(false)}
                      className="flex-1 border border-gray-300 text-gray-600 text-sm py-2 rounded-lg hover:bg-gray-50">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 text-sm">
                  {[
                    ['IC Number', maskIC(selected.ic_number)],
                    ['Email', selected.email || '—'],
                    ['Phone', selected.phone || '—'],
                    ['Date Joined', fmt(selected.date_joined)],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between">
                      <span className="text-gray-400">{label}</span>
                      <span className="text-gray-700 text-right max-w-[60%] break-all">{value}</span>
                    </div>
                  ))}
                  <button onClick={startEdit}
                    className="w-full mt-4 border border-blue-200 text-blue-600 text-sm py-2 rounded-lg hover:bg-blue-50 transition-colors">
                    Edit Details
                  </button>
                </div>
              )}
            </div>

            {/* Leave balance */}
            {balance && !editing && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mt-4">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Leave Balance {new Date().getFullYear()}</div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="text-center">
                    <div className={`text-3xl font-bold ${colourDays(balance.annual_remaining)}`}>{balance.annual_remaining}</div>
                    <div className="text-xs text-gray-400 mt-1">Annual Left</div>
                    <div className="text-xs text-gray-300">of {balance.annual_entitlement}</div>
                  </div>
                  <div className="text-center">
                    <div className={`text-3xl font-bold ${colourDays(balance.mc_remaining)}`}>{balance.mc_remaining}</div>
                    <div className="text-xs text-gray-400 mt-1">MC Left</div>
                    <div className="text-xs text-gray-300">of {balance.mc_entitlement}</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Leave history */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-50">
                <div className="text-sm font-semibold text-gray-700">Leave History — {new Date().getFullYear()}</div>
              </div>
              {history.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-sm">No leave records for this year</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                    <tr>
                      <th className="text-left px-5 py-3">Type</th>
                      <th className="text-left px-4 py-3">Start</th>
                      <th className="text-left px-4 py-3">End</th>
                      <th className="text-center px-4 py-3">Days</th>
                      <th className="text-left px-4 py-3">Status</th>
                      <th className="text-left px-4 py-3">Reason</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {history.map(l => leaveEdit?.id === l.id ? (
                      // ── Inline edit row ──
                      <tr key={l.id} className="bg-blue-50">
                        <td className="px-4 py-2">
                          <select value={leaveEdit.leave_type} onChange={e => setLeaveEdit(p=>({...p,leave_type:e.target.value}))}
                            className="border rounded px-2 py-1 text-xs">
                            {['annual','mc','emergency','unpaid','maternity','paternity'].map(t=>(
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <input type="date" value={leaveEdit.start_date} onChange={e => setLeaveEdit(p=>({...p,start_date:e.target.value}))}
                            className="border rounded px-2 py-1 text-xs w-32" />
                        </td>
                        <td className="px-4 py-2">
                          <input type="date" value={leaveEdit.end_date} onChange={e => setLeaveEdit(p=>({...p,end_date:e.target.value}))}
                            className="border rounded px-2 py-1 text-xs w-32" />
                        </td>
                        <td className="px-4 py-2">
                          <input type="number" step="0.5" min="0.5" value={leaveEdit.days} onChange={e => setLeaveEdit(p=>({...p,days:e.target.value}))}
                            className="border rounded px-2 py-1 text-xs w-16 text-center" />
                        </td>
                        <td className="px-4 py-2">
                          <select value={leaveEdit.status} onChange={e => setLeaveEdit(p=>({...p,status:e.target.value}))}
                            className="border rounded px-2 py-1 text-xs">
                            {['pending','approved','rejected'].map(s=>(
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <input value={leaveEdit.reason || ''} onChange={e => setLeaveEdit(p=>({...p,reason:e.target.value}))}
                            className="border rounded px-2 py-1 text-xs w-28" placeholder="Reason" />
                        </td>
                        <td className="px-4 py-2 flex gap-1">
                          <button onClick={saveLeaveEdit} disabled={leaveSaving}
                            className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:bg-blue-300">
                            {leaveSaving ? '...' : 'Save'}
                          </button>
                          <button onClick={() => setLeaveEdit(null)}
                            className="text-xs text-gray-500 hover:text-gray-700 px-1">✕</button>
                        </td>
                      </tr>
                    ) : (
                      // ── Normal row ──
                      <tr key={l.id} className="hover:bg-gray-50">
                        <td className="px-5 py-3"><Badge status={l.leave_type} /></td>
                        <td className="px-4 py-3 text-gray-600">{fmt(l.start_date)}</td>
                        <td className="px-4 py-3 text-gray-600">{fmt(l.end_date)}</td>
                        <td className="px-4 py-3 text-center font-medium">{l.days}</td>
                        <td className="px-4 py-3"><Badge status={l.status} /></td>
                        <td className="px-4 py-3 text-gray-400 text-xs max-w-xs truncate">{l.reason || '—'}</td>
                        <td className="px-4 py-3 flex gap-2">
                          <button onClick={() => setLeaveEdit({...l})}
                            className="text-xs text-blue-600 hover:underline font-medium">Edit</button>
                          <button onClick={() => deleteLeave(l)}
                            className="text-xs text-red-500 hover:underline font-medium">Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
