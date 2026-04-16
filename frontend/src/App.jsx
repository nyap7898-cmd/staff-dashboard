import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login.jsx'
import Layout from './components/Layout.jsx'
import Overview from './pages/Overview.jsx'
import Attendance from './pages/Attendance.jsx'
import LeaveBalance from './pages/LeaveBalance.jsx'
import LeaveApproval from './pages/LeaveApproval.jsx'
import LeaveApplyForm from './pages/LeaveApplyForm.jsx'
import StaffProfile from './pages/StaffProfile.jsx'

function PrivateRoute({ children }) {
  const auth = localStorage.getItem('director_auth')
  return auth ? children : <Navigate to="/login" />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route index element={<Navigate to="/overview" />} />
          <Route path="overview" element={<Overview />} />
          <Route path="attendance" element={<Attendance />} />
          <Route path="leave-balance" element={<LeaveBalance />} />
          <Route path="leave-approval" element={<LeaveApproval />} />
          <Route path="leave-apply" element={<LeaveApplyForm />} />
          <Route path="staff" element={<StaffProfile />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
