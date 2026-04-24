import { useEffect, useState } from 'react'
import axios from 'axios'

const LEAVE_TYPES = ['annual', 'mc', 'emergency', 'unpaid', 'maternity', 'paternity']

function daysBetween(start, end) {
  if (!start || !end) return 0
  const s = new Date(start), e = new Date(end)
  if (e < s) return 0
  return Math.round((e - s) / 86400000) + 1
}

export default function LeaveApplyForm() {
  const [staff, setStaff] = useState([])
  const [form, setForm] = useState({
    staff_id: '', leave_type: 'annual', start_date: '', end_date: '', reason: '', session: 'full',
  })
  const [file, setFile] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    axios.get('/api/staff').then(r => setStaff(r.data))
  }, [])

  function update(field, value) {
    setForm(prev => {
      const next = { ...prev, [field]: value }
      // When half day selected, force end date = start date
      if (field === 'session' && value === 'half') {
        next.end_date = next.start_date
      }
      if (field === 'start_date' && next.session === 'half') {
        next.end_date = value
      }
      return next
    })
    setSuccess(false)
    setError('')
  }

  const fullDays = daysBetween(form.start_date, form.end_date)
  const days = form.session === 'half' ? 0.5 : fullDays

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.staff_id) return setError('Please select a staff member.')
    if (!form.start_date) return setError('Please select a start date.')
    if (form.session === 'full' && !form.end_date) return setError('Please select an end date.')
    if (days <= 0) return setError('End date must be on or after start date.')

    setSubmitting(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('staff_id', form.staff_id)
      fd.append('leave_type', form.leave_type)
      fd.append('start_date', form.start_date)
      fd.append('end_date', form.session === 'half' ? form.start_date : form.end_date)
      fd.append('days', days)
      fd.append('reason', form.reason)
      if (file) fd.append('document', file)

      await axios.post('/api/leaves', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setSuccess(true)
      setForm({ staff_id: '', leave_type: 'annual', start_date: '', end_date: '', reason: '', session: 'full' })
      setFile(null)
      document.getElementById('doc-upload').value = ''
    } catch {
      setError('Failed to submit. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-bold text-gray-800 mb-5">Apply Leave</h1>

      {success && (
        <div className="mb-5 bg-green-50 border border-green-200 text-green-800 rounded-xl px-5 py-4 text-sm font-medium">
          ✅ Leave application submitted successfully. Pending director approval.
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Staff */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Staff Member *</label>
            <select value={form.staff_id} onChange={e => update('staff_id', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">— Select staff —</option>
              {staff.map(s => <option key={s.id} value={s.id}>{s.name} ({s.department})</option>)}
            </select>
          </div>

          {/* Leave type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Leave Type *</label>
            <select value={form.leave_type} onChange={e => update('leave_type', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {LEAVE_TYPES.map(t => (
                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)} Leave</option>
              ))}
            </select>
          </div>

          {/* Session — always visible */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Session *</label>
            <div className="flex gap-3">
              <button type="button" onClick={() => update('session', 'full')}
                className={`flex-1 py-2.5 rounded-lg border text-sm font-medium transition-colors ${form.session === 'full' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                Full Day
              </button>
              <button type="button" onClick={() => update('session', 'half')}
                className={`flex-1 py-2.5 rounded-lg border text-sm font-medium transition-colors ${form.session === 'half' ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                ½ Half Day
              </button>
            </div>
          </div>

          {/* Dates */}
          <div className={`grid gap-4 ${form.session === 'full' ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {form.session === 'half' ? 'Date *' : 'Start Date *'}
              </label>
              <input type="date" value={form.start_date} onChange={e => update('start_date', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            {form.session === 'full' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Date *</label>
                <input type="date" value={form.end_date} min={form.start_date}
                  onChange={e => update('end_date', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            )}
          </div>

          {/* Days summary */}
          {(days > 0) && (
            <div className={`border rounded-lg px-4 py-2.5 text-sm font-medium ${form.session === 'half' ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-blue-50 border-blue-100 text-blue-700'}`}>
              Total: <strong>{days}</strong> {form.session === 'half' ? 'half day (0.5)' : `day${days !== 1 ? 's' : ''}`}
            </div>
          )}

          {/* Reason */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason / Remarks</label>
            <textarea value={form.reason} onChange={e => update('reason', e.target.value)}
              rows={3} placeholder="Optional — provide reason or details"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>

          {/* Document */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Supporting Document (optional)</label>
            <input id="doc-upload" type="file" accept=".pdf,.jpg,.jpeg,.png"
              onChange={e => setFile(e.target.files[0] || null)}
              className="w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
            <p className="text-xs text-gray-400 mt-1">PDF, JPG or PNG. Max 10MB.</p>
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <button type="submit" disabled={submitting}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-3 rounded-lg transition-colors">
            {submitting ? 'Submitting...' : 'Submit Leave Application'}
          </button>
        </form>
      </div>
    </div>
  )
}
