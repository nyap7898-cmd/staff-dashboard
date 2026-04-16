import { useNavigate } from 'react-router-dom'
import Badge from './Badge.jsx'

function initials(name) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

const avatarColours = [
  'bg-blue-500', 'bg-purple-500', 'bg-green-500', 'bg-orange-500',
  'bg-pink-500', 'bg-teal-500', 'bg-red-500',
]

export default function StaffTable({ staff, balances, todayStatus }) {
  const navigate = useNavigate()

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
          <tr>
            <th className="text-left px-5 py-3">Staff</th>
            <th className="text-left px-4 py-3">Department</th>
            <th className="text-left px-4 py-3">Today</th>
            <th className="text-center px-4 py-3">Annual Left</th>
            <th className="text-center px-4 py-3">MC Left</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {staff.map((s, i) => {
            const bal = balances?.find(b => b.id === s.id)
            const status = todayStatus?.[s.id]
            return (
              <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full ${avatarColours[i % avatarColours.length]} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                      {initials(s.name)}
                    </div>
                    <span className="font-medium text-gray-800">{s.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-500">{s.department}</td>
                <td className="px-4 py-3">
                  {status ? <Badge status={status} /> : <span className="text-gray-400 text-xs">—</span>}
                </td>
                <td className="px-4 py-3 text-center">
                  {bal ? <span className="font-medium">{bal.annual_remaining}</span> : '—'}
                </td>
                <td className="px-4 py-3 text-center">
                  {bal ? <span className="font-medium">{bal.mc_remaining}</span> : '—'}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => navigate(`/staff?id=${s.id}`)}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium hover:underline"
                  >
                    View Profile
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
