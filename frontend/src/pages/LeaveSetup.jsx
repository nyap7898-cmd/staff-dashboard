import { useEffect, useState } from 'react'
import axios from 'axios'

export default function LeaveSetup() {
  const [staff, setStaff] = useState([])
  const [edits, setEdits] = useState({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    axios.get('/api/leaves/balance').then(r => {
      setStaff(r.data)
      const init = {}
      for (const s of r.data) {
        init[s.id] = {
          annual_opening_used: s.annual_opening_used || 0,
          mc_opening_used: s.mc_opening_used || 0,
        }
      }
      setEdits(init)
      setLoading(false)
    })
  }, [])

  function update(id, field, val) {
    const num = Math.max(0, parseInt(val) || 0)
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: num } }))
    setSaved(false)
  }

  function getRemaining(s, field) {
    const e = edits[s.id]
    if (!e) return '—'
    if (field === 'annual') {
      const systemUsed = (s.annual_used || 0) - (s.annual_opening_used || 0)
      return s.annual_entitlement - e.annual_opening_used - Math.max(0, systemUsed)
    } else {
      const systemUsed = (s.mc_used || 0) - (s.mc_opening_used || 0)
      return s.mc_entitlement - e.mc_opening_used - Math.max(0, systemUsed)
    }
  }

  async function saveAll() {
    setSaving(true)
    const updates = staff.map(s => ({
      id: s.id,
      annual_opening_used: edits[s.id]?.annual_opening_used ?? 0,
      mc_opening_used: edits[s.id]?.mc_opening_used ?? 0,
    }))
    await axios.put('/api/staff/leave-opening', { updates })
    setSaving(false)
    setSaved(true)
  }

  if (loading) return <div className="text-gray-500 text-sm">Loading...</div>

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-800">Leave Balance Setup</h1>
        <p className="text-sm text-gray-500 mt-1">
          Enter how many leave days each staff has <strong>already used</strong> this year before this system started tracking.
          The remaining balance will be calculated automatically.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-5">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-5 py-3">Staff Name</th>
              <th className="text-center px-4 py-3">AL Entitlement</th>
              <th className="text-center px-4 py-3">AL Used (pre-system)</th>
              <th className="text-center px-4 py-3 text-blue-600">AL Remaining</th>
              <th className="text-center px-4 py-3">MC Entitlement</th>
              <th className="text-center px-4 py-3">MC Used (pre-system)</th>
              <th className="text-center px-4 py-3 text-green-600">MC Remaining</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {staff.map(s => {
              const e = edits[s.id] || { annual_opening_used: 0, mc_opening_used: 0 }
              const alRemaining = getRemaining(s, 'annual')
              const mcRemaining = getRemaining(s, 'mc')
              return (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-800">{s.name}</td>
                  <td className="px-4 py-3 text-center text-gray-600">{s.annual_entitlement}</td>
                  <td className="px-4 py-2 text-center">
                    <input
                      type="number"
                      min="0"
                      max={s.annual_entitlement}
                      value={e.annual_opening_used}
                      onChange={ev => update(s.id, 'annual_opening_used', ev.target.value)}
                      className="w-16 border rounded px-2 py-1 text-center text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`font-semibold ${alRemaining < 0 ? 'text-red-600' : 'text-blue-600'}`}>
                      {alRemaining}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-gray-600">{s.mc_entitlement}</td>
                  <td className="px-4 py-2 text-center">
                    <input
                      type="number"
                      min="0"
                      max={s.mc_entitlement}
                      value={e.mc_opening_used}
                      onChange={ev => update(s.id, 'mc_opening_used', ev.target.value)}
                      className="w-16 border rounded px-2 py-1 text-center text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`font-semibold ${mcRemaining < 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {mcRemaining}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={saveAll}
          disabled={saving}
          className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-blue-300 transition-colors"
        >
          {saving ? 'Saving...' : '💾 Save All Balances'}
        </button>
        {saved && <span className="text-green-600 text-sm font-medium">✅ Saved! Leave Balance page is now updated.</span>}
      </div>

      <div className="mt-5 bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
        <strong>How to use:</strong> Under "AL Used (pre-system)", enter the number of Annual Leave days each staff has already taken
        from January until today (before you started using this system). Do the same for MC. The remaining balance will auto-calculate.
        Click <strong>Save All Balances</strong> when done.
      </div>
    </div>
  )
}
