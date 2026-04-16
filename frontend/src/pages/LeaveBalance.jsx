import { useEffect, useState } from 'react'
import axios from 'axios'

function colourDays(n) {
  if (n <= 2) return 'text-red-600 font-bold'
  if (n <= 5) return 'text-orange-500 font-semibold'
  return 'text-green-600 font-semibold'
}

function exportCSV(data) {
  const headers = ['Name', 'Department', 'Annual Total', 'Annual Used', 'Annual Remaining', 'MC Total', 'MC Used', 'MC Remaining', 'Emergency Used', 'Unpaid Used']
  const rows = data.map(r => [
    r.name, r.department, r.annual_entitlement, r.annual_used, r.annual_remaining,
    r.mc_entitlement, r.mc_used, r.mc_remaining, r.emergency_used, r.unpaid_used
  ])
  const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `leave-balance-${new Date().toISOString().split('T')[0]}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function LeaveBalance() {
  const [balances, setBalances] = useState([])

  useEffect(() => {
    axios.get('/api/leaves/balance').then(r => setBalances(r.data))
  }, [])

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-800">Leave Balance — {new Date().getFullYear()}</h1>
        <button
          onClick={() => exportCSV(balances)}
          className="text-sm bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors"
        >
          Export CSV
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-5 py-3">Name</th>
              <th className="text-left px-4 py-3">Dept</th>
              <th className="text-center px-4 py-3 border-l border-gray-100" colSpan={3}>Annual Leave</th>
              <th className="text-center px-4 py-3 border-l border-gray-100" colSpan={3}>MC</th>
              <th className="text-center px-4 py-3 border-l border-gray-100">Emergency</th>
              <th className="text-center px-4 py-3">Unpaid</th>
            </tr>
            <tr className="text-gray-400">
              <th className="px-5 pb-2"></th>
              <th className="px-4 pb-2"></th>
              <th className="px-4 pb-2 border-l border-gray-100 text-center">Total</th>
              <th className="px-4 pb-2 text-center">Used</th>
              <th className="px-4 pb-2 text-center">Left</th>
              <th className="px-4 pb-2 border-l border-gray-100 text-center">Total</th>
              <th className="px-4 pb-2 text-center">Used</th>
              <th className="px-4 pb-2 text-center">Left</th>
              <th className="px-4 pb-2 border-l border-gray-100 text-center">Used</th>
              <th className="px-4 pb-2 text-center">Used</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {balances.map(b => (
              <tr key={b.id} className="hover:bg-gray-50">
                <td className="px-5 py-3 font-medium text-gray-800">{b.name}</td>
                <td className="px-4 py-3 text-gray-500">{b.department}</td>
                <td className="px-4 py-3 text-center border-l border-gray-50">{b.annual_entitlement}</td>
                <td className="px-4 py-3 text-center text-gray-500">{b.annual_used}</td>
                <td className={`px-4 py-3 text-center ${colourDays(b.annual_remaining)}`}>{b.annual_remaining}</td>
                <td className="px-4 py-3 text-center border-l border-gray-50">{b.mc_entitlement}</td>
                <td className="px-4 py-3 text-center text-gray-500">{b.mc_used}</td>
                <td className={`px-4 py-3 text-center ${colourDays(b.mc_remaining)}`}>{b.mc_remaining}</td>
                <td className="px-4 py-3 text-center border-l border-gray-50">{b.emergency_used}</td>
                <td className="px-4 py-3 text-center">{b.unpaid_used}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-4 mt-4 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-green-500 inline-block"></span> &gt; 5 days left</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-orange-400 inline-block"></span> 3–5 days left</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500 inline-block"></span> ≤ 2 days left</span>
      </div>
    </div>
  )
}
