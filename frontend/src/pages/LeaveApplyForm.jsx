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
    staff_id: '', leave_type: 'annual', start_date: '', end_date: '', reason: '',
  })
  const [customDays, setCustomDays] = useState('')
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
      // If half-day is active and start_date changes, lock end_date to same day
      if (field === 'start_date' && customDays === '0.5') {
        next.end_date = value
      }
      return next
    })
    // Reset custom days when dates change (unless it's a half-day — keep that)
    if (field === 'start_date' || field === 'end_date') {
      if (customDays !== '0.5') setCustomDays('')
    }
    setSuccess(false)
    setError('')
  }

  function toggleHalfDay() {
    if (customDays === '0.5') {
      // Untick — just clear
      setCustomDays('')
    } else {
      // Tick — set half day and lock end_date = start_date
      setCustomDays('0.5')
      if (form.start_date) {
        setForm(prev => ({ ...prev, end_date: prev.start_date }))
      }
    }
  }

  const autoDays = daysBetween(form.start_date, form.end_date)
  // If HR typed a custom value use it, otherwise use auto-calculated
  const days = customDays !== '' ? parseFloat(customDays) : autoDays

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.staff_id) return setError('Please select a staff member.')
    if (!form.start_date || !form.end_date) return setError('Please select start and end dates.')
    if (!days || days <= 0) return setError('Number of days must be greater than 0.')

    setSubmitting(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('staff_id', form.staff_id)
      fd.append('leave_type', form.leave_type)
      fd.append('start_date', form.start_date)
      fd.append('end_date', form.end_date)
      fd.append('days', days)
      fd.append('reason', form.reason)
      if (file) fd.append('document', file)

      await axios.post('/api/leaves', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setSuccess(true)
      setForm({ staff_id: '', leave_type: 'annual', start_date: '', end_date: '', reason: '' })
      setCustomDays('')
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

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
              <input type="date" value={form.start_date} onChange={e => update('start_date', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End Date *
                {customDays === '0.5' && <span className="ml-2 text-xs text-yellow-600 font-normal">— locked (½ day)</span>}
              </label>
              <input
                type="date"
                value={form.end_date}
                min={form.start_date}
                max={customDays === '0.5' ? form.start_date : undefined}
                onChange={e => update('end_date', e.target.value)}
                disabled={customDays === '0.5'}
                className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  customDays === '0.5'
                    ? 'border-yellow-300 bg-yellow-50 text-gray-500 cursor-not-allowed'
                    : 'border-gray-300'
                }`}
              />
            </div>
          </div>

          {/* Days */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Number of Days *</label>

            {/* Half-day yellow checkbox — always visible */}
            <button
              type="button"
              onClick={toggleHalfDay}
              className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl border-2 font-medium text-sm transition-colors mb-3 ${
                days === 0.5
                  ? 'bg-yellow-50 border-yellow-400 text-yellow-800'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-yellow-300 hover:bg-yellow-50'
              }`}
            >
              <span className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                days === 0.5 ? 'bg-yellow-400 border-yellow-400' : 'border-gray-300 bg-white'
              }`}>
                {days === 0.5 && <span className="text-white text-xs font-bold">✓</span>}
              </span>
              <span>½ Day <span className="font-normal text-xs ml-1 opacity-70">(0.5 days — morning or afternoon only)</span></span>
            </button>

            {/* Full days — shown when not half-day */}
            {days !== 0.5 && (
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={customDays !== '' ? customDays : (autoDays > 0 ? autoDays : '')}
                  placeholder={autoDays > 0 ? String(autoDays) : '1'}
                  onChange={e => setCustomDays(e.target.value)}
                  className="w-24 border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-center font-semibold"
                />
                <span className="text-sm text-gray-500">
                  {days === 1 ? 'day' : 'days'}
                  {autoDays > 0 && (
                    <span className="ml-2 text-xs text-gray-400">
                      (auto: {autoDays})
                      {customDays !== '' && parseFloat(customDays) !== autoDays && (
                        <button type="button" onClick={() => setCustomDays('')}
                          className="ml-2 text-blue-500 hover:underline">reset</button>
                      )}
                    </span>
                  )}
                </span>
              </div>
            )}
          </div>

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
