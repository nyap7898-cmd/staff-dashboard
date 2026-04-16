const colours = {
  present:  'bg-green-100 text-green-800',
  approved: 'bg-green-100 text-green-800',
  on_leave: 'bg-yellow-100 text-yellow-800',
  pending:  'bg-yellow-100 text-yellow-800',
  half_day: 'bg-blue-100 text-blue-800',
  absent:   'bg-red-100 text-red-800',
  rejected: 'bg-red-100 text-red-800',
  annual:   'bg-indigo-100 text-indigo-800',
  mc:       'bg-orange-100 text-orange-800',
  emergency:'bg-red-100 text-red-800',
  unpaid:   'bg-gray-100 text-gray-800',
  maternity:'bg-pink-100 text-pink-800',
  paternity:'bg-cyan-100 text-cyan-800',
}

const labels = {
  present: 'Present', approved: 'Approved', on_leave: 'On Leave',
  pending: 'Pending', half_day: 'Half Day', absent: 'Absent',
  rejected: 'Rejected', annual: 'Annual', mc: 'MC',
  emergency: 'Emergency', unpaid: 'Unpaid', maternity: 'Maternity', paternity: 'Paternity',
}

export default function Badge({ status }) {
  const cls = colours[status] || 'bg-gray-100 text-gray-700'
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {labels[status] || status}
    </span>
  )
}
