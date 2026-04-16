import { Outlet, NavLink, useNavigate } from 'react-router-dom'

const nav = [
  { to: '/overview', label: 'Overview', icon: '📊' },
  { to: '/attendance', label: 'Attendance', icon: '✅' },
  { to: '/leave-balance', label: 'Leave Balance', icon: '📅' },
  { to: '/leave-approval', label: 'Leave Approval', icon: '📋' },
  { to: '/leave-apply', label: 'Apply Leave', icon: '✏️' },
  { to: '/staff', label: 'Staff Profiles', icon: '👤' },
]

export default function Layout() {
  const navigate = useNavigate()
  const today = new Date().toLocaleDateString('en-MY', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  function logout() {
    localStorage.removeItem('director_auth')
    navigate('/login')
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 bg-gray-900 text-white flex flex-col shrink-0">
        <div className="p-5 border-b border-gray-700">
          <div className="text-lg font-bold text-white leading-tight">Moon Face Audio</div>
          <div className="text-xs text-gray-400 mt-1">Staff Dashboard</div>
        </div>
        <nav className="flex-1 py-4">
          {nav.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-5 py-3 text-sm transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white font-medium'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              <span>{icon}</span>
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-700">
          <button
            onClick={logout}
            className="w-full text-sm text-gray-400 hover:text-white py-2 hover:bg-gray-800 rounded px-3 text-left transition-colors"
          >
            🔒 Logout
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shrink-0">
          <div className="text-sm text-gray-500">{today}</div>
          <div className="text-sm font-medium text-gray-700">Director</div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
