import { useEffect, useState, useRef } from 'react'
import axios from 'axios'
import Badge from '../components/Badge.jsx'

const STATUS_OPTIONS = ['present', 'absent', 'on_leave', 'half_day']

export default function Attendance() {
  const today = new Date().toISOString().split('T')[0]
  const [tab, setTab] = useState('manual')
  const [date, setDate] = useState(today)
  const [records, setRecords] = useState([])
  const [editing, setEditing] = useState({})
  const [saving, setSaving] = useState({})

  // Upload state
  const [uploadFile, setUploadFile] = useState(null)
  const [parsing, setParsing] = useState(false)
  const [parseResult, setParseResult] = useState(null)   // generic format
  const [machineResult, setMachineResult] = useState(null) // machine format preview
  const [nameOverrides, setNameOverrides] = useState({})  // { rawName: staffId }
  const [mapping, setMapping] = useState({ nameCol: '', dateCol: '', checkInCol: '', checkOutCol: '' })
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef()

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

  async function handleFileParse(file) {
    if (!file) return
    setUploadFile(file)
    setParseResult(null)
    setMachineResult(null)
    setImportResult(null)
    setParsing(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      // First try machine format detection
      const machineRes = await axios.post('/api/attendance/parse-machine', fd)
      if (machineRes.data.isMachineFormat) {
        setMachineResult(machineRes.data)
        setNameOverrides({})
        setParsing(false)
        return
      }
      // Fall back to generic column-mapping parser
      const fd2 = new FormData()
      fd2.append('file', file)
      const res = await axios.post('/api/attendance/parse-file', fd2)
      setParseResult(res.data)
      setMapping({
        nameCol: res.data.suggested.nameCol ?? '',
        dateCol: res.data.suggested.dateCol ?? '',
        checkInCol: res.data.suggested.checkInCol ?? '',
        checkOutCol: res.data.suggested.checkOutCol ?? '',
      })
    } catch (e) {
      setParseResult({ error: e.response?.data?.error || 'Failed to read file' })
    }
    setParsing(false)
  }

  async function handleImport() {
    if (!uploadFile) return
    setImporting(true)
    setImportResult(null)
    try {
      const fd = new FormData()
      fd.append('file', uploadFile)
      fd.append('nameCol', mapping.nameCol)
      fd.append('dateCol', mapping.dateCol)
      fd.append('checkInCol', mapping.checkInCol !== '' ? mapping.checkInCol : '')
      fd.append('checkOutCol', mapping.checkOutCol !== '' ? mapping.checkOutCol : '')
      const res = await axios.post('/api/attendance/import', fd)
      setImportResult(res.data)
      const att = await axios.get(`/api/attendance?date=${date}`)
      setRecords(att.data)
    } catch (e) {
      setImportResult({ error: e.response?.data?.error || 'Import failed' })
    }
    setImporting(false)
  }

  async function handleMachineImport() {
    if (!uploadFile) return
    setImporting(true)
    setImportResult(null)
    try {
      const fd = new FormData()
      fd.append('file', uploadFile)
      fd.append('overrides', JSON.stringify(nameOverrides))
      const res = await axios.post('/api/attendance/import-machine', fd)
      setImportResult(res.data)
      // If the imported date is the currently viewed date, refresh the table
      if (res.data.date === date) {
        const att = await axios.get(`/api/attendance?date=${date}`)
        setRecords(att.data)
      }
    } catch (e) {
      setImportResult({ error: e.response?.data?.error || 'Import failed' })
    }
    setImporting(false)
  }

  function resetUpload() {
    setUploadFile(null)
    setParseResult(null)
    setMachineResult(null)
    setNameOverrides({})
    setImportResult(null)
    setMapping({ nameCol: '', dateCol: '', checkInCol: '', checkOutCol: '' })
    if (fileRef.current) fileRef.current.value = ''
  }

  const canImport = parseResult && !parseResult.error && mapping.nameCol !== '' && mapping.dateCol !== ''

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-800">Attendance</h1>
        <div className="flex items-center gap-3">
          {tab === 'manual' && (
            <input
              type="date"
              value={date}
              max={today}
              onChange={e => setDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          )}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={() => setTab('manual')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${tab === 'manual' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              Manual
            </button>
            <button
              onClick={() => setTab('upload')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${tab === 'upload' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              📂 Upload File
            </button>
          </div>
        </div>
      </div>

      {tab === 'manual' && (
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
                          <button onClick={() => saveRow(key, r.staff_id)} disabled={saving[key]}
                            className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 disabled:bg-blue-300">
                            {saving[key] ? 'Saving...' : 'Save'}
                          </button>
                          <button onClick={() => setEditing(prev => { const n = { ...prev }; delete n[key]; return n })}
                            className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
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
                          <button onClick={() => startEdit(r)} className="text-xs text-blue-600 hover:underline font-medium">Edit</button>
                        </td>
                      </>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'upload' && (
        <div className="space-y-5">
          {/* Step 1: Drop zone */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold">1</span>
              <h2 className="font-semibold text-gray-700">Upload attendance file from thumbprint machine</h2>
            </div>
            <p className="text-xs text-gray-400 mb-4">Supports thumbprint machine XLS exports (auto-detected) and standard Excel / CSV files</p>

            {!uploadFile ? (
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); handleFileParse(e.dataTransfer.files[0]) }}
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'}`}
              >
                <div className="text-3xl mb-3">📂</div>
                <p className="text-sm font-medium text-gray-600">Drag & drop file here, or click to browse</p>
                <p className="text-xs text-gray-400 mt-1">.xlsx, .xls, .csv</p>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                  onChange={e => handleFileParse(e.target.files[0])} />
              </div>
            ) : (
              <div className="flex items-center justify-between bg-blue-50 rounded-lg px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-xl">📄</span>
                  <div>
                    <div className="text-sm font-medium text-gray-700">{uploadFile.name}</div>
                    <div className="text-xs text-gray-400">{(uploadFile.size / 1024).toFixed(1)} KB</div>
                  </div>
                </div>
                <button onClick={resetUpload} className="text-xs text-red-500 hover:text-red-700">Remove</button>
              </div>
            )}

            {parsing && <p className="text-sm text-blue-600 mt-3 text-center">Reading file...</p>}
            {parseResult?.error && <p className="text-sm text-red-600 mt-3 text-center">⚠️ {parseResult.error}</p>}
          </div>

          {/* Machine format: auto-detected preview */}
          {machineResult && !importResult && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-6 h-6 rounded-full bg-green-600 text-white text-xs flex items-center justify-center font-bold">✓</span>
                <h2 className="font-semibold text-gray-700">Thumbprint machine format detected</h2>
              </div>
              <p className="text-xs text-gray-400 mb-4 ml-8">
                Date: <strong>{machineResult.date}</strong> · {machineResult.records.length} staff found in file
              </p>
              <div className="overflow-x-auto rounded-lg border border-gray-100 mb-4">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                    <tr>
                      <th className="text-left px-4 py-2">Machine Name</th>
                      <th className="text-left px-4 py-2">Matched Staff</th>
                      <th className="text-left px-4 py-2">Check In</th>
                      <th className="text-left px-4 py-2">Check Out</th>
                      <th className="text-left px-4 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {machineResult.records.map((r, i) => {
                      const isMatched = r.staffName || nameOverrides[r.rawName]
                      const overrideName = nameOverrides[r.rawName]
                        ? (machineResult.allStaff || []).find(s => String(s.id) === String(nameOverrides[r.rawName]))?.name
                        : null
                      return (
                        <tr key={i} className={isMatched ? 'hover:bg-gray-50' : 'bg-red-50'}>
                          <td className="px-4 py-2 font-mono text-xs text-gray-600">{r.rawName}</td>
                          <td className="px-4 py-2">
                            {r.staffName
                              ? <span className="text-green-700 font-medium">{r.staffName}</span>
                              : (
                                <select
                                  value={nameOverrides[r.rawName] || ''}
                                  onChange={e => setNameOverrides(prev => ({ ...prev, [r.rawName]: e.target.value }))}
                                  className="text-xs border border-red-300 rounded px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
                                >
                                  <option value="">⚠ Select staff...</option>
                                  {(machineResult.allStaff || []).map(s => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                  ))}
                                </select>
                              )
                            }
                          </td>
                          <td className="px-4 py-2 text-gray-600">{r.check_in || <span className="text-gray-300">—</span>}</td>
                          <td className="px-4 py-2 text-gray-600">{r.check_out || <span className="text-gray-300">—</span>}</td>
                          <td className="px-4 py-2">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                              r.status === 'present' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                            }`}>{r.status}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {machineResult.records.some(r => !r.staffName) && (
                <p className="text-xs text-yellow-700 bg-yellow-50 rounded-lg px-3 py-2 mb-3">
                  ⚠ Some names couldn't be matched. Make sure staff names in the dashboard include the machine name (e.g. "Yap Ah Kow" matches "yap"). Unmatched staff will be skipped.
                </p>
              )}
              <button
                onClick={handleMachineImport}
                disabled={importing}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-medium px-6 py-2.5 rounded-lg text-sm transition-colors"
              >
                {importing ? 'Importing...' : `Import ${machineResult.records.filter(r => r.staffName).length} records for ${machineResult.date}`}
              </button>
            </div>
          )}

          {/* Machine import result */}
          {machineResult && importResult && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              {importResult.error ? (
                <p className="text-red-600 text-sm">⚠️ {importResult.error}</p>
              ) : (
                <div className="space-y-3">
                  <div className="flex gap-4">
                    <div className="bg-green-50 border border-green-100 rounded-lg px-4 py-3 text-center">
                      <div className="text-2xl font-bold text-green-600">{importResult.imported}</div>
                      <div className="text-xs text-green-500 mt-0.5">Imported</div>
                    </div>
                    <div className="bg-yellow-50 border border-yellow-100 rounded-lg px-4 py-3 text-center">
                      <div className="text-2xl font-bold text-yellow-600">{importResult.skipped}</div>
                      <div className="text-xs text-yellow-500 mt-0.5">Not matched</div>
                    </div>
                  </div>
                  {importResult.unmatched?.length > 0 && (
                    <p className="text-xs text-gray-500 bg-yellow-50 rounded-lg p-3">
                      <strong>Unmatched:</strong> {importResult.unmatched.join(', ')}
                    </p>
                  )}
                  <p className="text-xs text-green-600">✅ Attendance for {importResult.date} saved successfully.</p>
                  <button onClick={resetUpload} className="text-sm text-blue-600 hover:underline">Upload another file</button>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Column mapping (generic files only) */}
          {parseResult && !parseResult.error && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center gap-2 mb-4">
                <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold">2</span>
                <h2 className="font-semibold text-gray-700">Standard file — map columns</h2>
              </div>
              <p className="text-xs text-gray-400 mb-4">
                Found <strong>{parseResult.totalRows}</strong> data rows and <strong>{parseResult.headers.length}</strong> columns.
                {' '}Columns have been auto-detected — check and adjust if needed.
              </p>

              <div className="grid grid-cols-2 gap-4 mb-5">
                {[
                  { key: 'nameCol', label: '👤 Employee Name / ID', required: true },
                  { key: 'dateCol', label: '📅 Date', required: true },
                  { key: 'checkInCol', label: '🕘 Check In Time', required: false },
                  { key: 'checkOutCol', label: '🕔 Check Out Time', required: false },
                ].map(({ key, label, required }) => (
                  <div key={key}>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      {label} {required && <span className="text-red-500">*</span>}
                    </label>
                    <select
                      value={mapping[key]}
                      onChange={e => setMapping(prev => ({ ...prev, [key]: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">— Not in file —</option>
                      {parseResult.headers.map((h, i) => (
                        <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {/* Preview table */}
              <div className="text-xs font-medium text-gray-500 mb-2">Preview (first {parseResult.rows.length} rows)</div>
              <div className="overflow-x-auto rounded-lg border border-gray-100">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      {parseResult.headers.map((h, i) => (
                        <th key={i} className={`px-3 py-2 text-left font-medium whitespace-nowrap ${
                          [mapping.nameCol, mapping.dateCol, mapping.checkInCol, mapping.checkOutCol].includes(String(i))
                            ? 'text-blue-600 bg-blue-50' : 'text-gray-500'
                        }`}>
                          {h || `Col ${i+1}`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {parseResult.rows.map((row, ri) => (
                      <tr key={ri} className="hover:bg-gray-50">
                        {row.map((cell, ci) => (
                          <td key={ci} className={`px-3 py-1.5 whitespace-nowrap ${
                            [mapping.nameCol, mapping.dateCol, mapping.checkInCol, mapping.checkOutCol].includes(String(ci))
                              ? 'text-blue-700 font-medium' : 'text-gray-600'
                          }`}>
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Step 3: Import */}
          {parseResult && !parseResult.error && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center gap-2 mb-4">
                <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold">3</span>
                <h2 className="font-semibold text-gray-700">Import attendance records</h2>
              </div>

              {!importResult ? (
                <button
                  onClick={handleImport}
                  disabled={!canImport || importing}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-medium px-6 py-2.5 rounded-lg text-sm transition-colors"
                >
                  {importing ? 'Importing...' : `Import ${parseResult.totalRows} records`}
                </button>
              ) : importResult.error ? (
                <div className="text-red-600 text-sm">⚠️ {importResult.error}</div>
              ) : (
                <div className="space-y-3">
                  <div className="flex gap-4">
                    <div className="bg-green-50 border border-green-100 rounded-lg px-4 py-3 text-center">
                      <div className="text-2xl font-bold text-green-600">{importResult.imported}</div>
                      <div className="text-xs text-green-500 mt-0.5">Imported</div>
                    </div>
                    <div className="bg-yellow-50 border border-yellow-100 rounded-lg px-4 py-3 text-center">
                      <div className="text-2xl font-bold text-yellow-600">{importResult.noMatch}</div>
                      <div className="text-xs text-yellow-500 mt-0.5">Not matched</div>
                    </div>
                    <div className="bg-gray-50 border border-gray-100 rounded-lg px-4 py-3 text-center">
                      <div className="text-2xl font-bold text-gray-500">{importResult.skipped}</div>
                      <div className="text-xs text-gray-400 mt-0.5">Skipped</div>
                    </div>
                  </div>
                  {importResult.unmatched?.length > 0 && (
                    <div className="text-xs text-gray-500 bg-yellow-50 rounded-lg p-3">
                      <strong>Names not matched:</strong> {importResult.unmatched.join(', ')}
                      <br/>
                      <span className="text-gray-400">Make sure these names match exactly with staff profiles.</span>
                    </div>
                  )}
                  <button onClick={resetUpload} className="text-sm text-blue-600 hover:underline">Upload another file</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
