import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import axios from 'axios'
import Login from './pages/Login.jsx'
import Layout from './components/Layout.jsx'
import Overview from './pages/Overview.jsx'
import Attendance from './pages/Attendance.jsx'
import LeaveBalance from './pages/LeaveBalance.jsx'
import LeaveApproval from './pages/LeaveApproval.jsx'
import LeaveApplyForm from './pages/LeaveApplyForm.jsx'
import StaffProfile from './pages/StaffProfile.jsx'
import AuditLog from './pages/AuditLog.jsx'

function PrivateRoute({ children }) {
  const auth = localStorage.getItem('director_auth')
  return auth ? children : <Navigate to="/login" />
}

function DirectorRoute({ children }) {
  const auth = localStorage.getItem('director_auth')
  const role = localStorage.getItem('user_role')
  if (!auth) return <Navigate to="/login" />
  if (role !== 'director') return <Navigate to="/overview" />
  return children
}

export default function App() {
  useEffect(() => {
    // Restore role header on page reload
    const role = localStorage.getItem('user_role')
    if (role) axios.defaults.headers.common['x-user-role'] = role
  }, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route index element={<Navigate to="/overview" />} />
          <Route path="overview" element={<Overview />} />
          <Route path="attendance" element={<Attendance />} />
          <Route path="leave-balance" element={<LeaveBalance />} />
          <Route path="leave-approval" element={<DirectorRoute><LeaveApproval /></DirectorRoute>} />
          <Route path="leave-apply" element={<LeaveApplyForm />} />
          <Route path="staff" element={<StaffProfile />} />
          <Route path="audit-log" element={<DirectorRoute><AuditLog /></DirectorRoute>} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
