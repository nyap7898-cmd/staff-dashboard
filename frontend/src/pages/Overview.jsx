import { useEffect, useState } from 'react'
import axios from 'axios'
import StaffTable from '../components/StaffTable.jsx'
import { useNavigate } from 'react-router-dom'

function MetricCard({ label, value, colour, alert, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex flex-col gap-1 ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
    >
      <div className="text-sm text-gray-500">{label}</div>
      <div className={`text-3xl font-bold ${colour}`}>
        {value}
        {alert > 0 && (
          <span className="ml-2 text-sm bg-red-500 text-white px-2 py-0.5 rounded-full align-middle">
            {alert}
          </span>
        )}
      </div>
    </div>
  )
}

export default function Overview() {
  const [overview, setOverview] = useState(null)
  const [staff, setStaff] = useState([])
  const [balances, setBalances] = useState([])
  const [todayStatus, setTodayStatus] = useState({})
  const navigate = useNavigate()

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0]
    Promise.all([
      axios.get('/api/overview'),
      axios.get('/api/staff'),
      axios.get('/api/leaves/balance'),
      axios.get(`/api/attendance?date=${today}`),
    ]).then(([ov, st, bal, att]) => {
      setOverview(ov.data)
      setStaff(st.data)
      setBalances(bal.data)
      const map = {}
      for (const r of att.data) {
        if (r.staff_id && r.status) map[r.staff_id] = r.status
      }
      setTodayStatus(map)
    })
  }, [])

  if (!overview) return <div className="text-gray-400 text-sm">Loading...</div>

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-800 mb-5">Overview</h1>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-7">
        <MetricCard label="Total Staff" value={overview.totalStaff} colour="text-gray-800" />
        <MetricCard label="Present Today" value={overview.presentToday} colour="text-green-600" />
        <MetricCard label="On Leave" value={overview.onLeaveToday} colour="text-yellow-600" />
        <MetricCard label="Absent" value={overview.absentToday} colour="text-red-600" />
        <MetricCard
          label="Pending Approvals"
          value={overview.pendingLeaves}
          colour={overview.pendingLeaves > 0 ? 'text-red-600' : 'text-gray-800'}
          alert={overview.pendingLeaves > 0 ? overview.pendingLeaves : 0}
          onClick={() => navigate('/leave-approval')}
        />
      </div>

      <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">Staff Summary</h2>
      <StaffTable staff={staff} balances={balances} todayStatus={todayStatus} />
    </div>
  )
}
