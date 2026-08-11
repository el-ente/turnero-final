import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { UserRole } from 'shared'
import { TotemView } from './views/TotemView'
import { PublicDisplay } from './views/PublicDisplay'
import { TerminalView } from './views/TerminalView'
import { TerminalSelector } from './views/TerminalSelector'
import { AdminView } from './views/AdminView'
import { LoginView } from './views/LoginView'
import { TicketMark } from './components/TicketMark'
import { RequireAuth } from './components/RequireAuth'
import { AuthProvider } from './contexts/AuthContext'
import './App.css'

const STAFF_ROLES = [UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.CASHIER]

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public display is fullscreen, no auth */}
          <Route path="/display" element={<PublicDisplay />} />

          {/* Other views have navbar */}
          <Route path="/*" element={
            <div className="app">
              <nav className="navbar">
                <h1 className="navbar-brand">
                  <TicketMark size={22} />
                  Turnero
                </h1>
                <ul className="nav-links">
                  <li><NavLink to="/" end>Totem</NavLink></li>
                  <li><NavLink to="/display">Pantalla Pública</NavLink></li>
                  <li><NavLink to="/terminal">Terminal</NavLink></li>
                  <li><NavLink to="/admin">Admin</NavLink></li>
                </ul>
              </nav>

              <Routes>
                {/* Totem is the public kiosk, no auth */}
                <Route path="/" element={<TotemView />} />
                <Route path="/login" element={<LoginView />} />
                <Route path="/terminal" element={
                  <RequireAuth roles={STAFF_ROLES}><TerminalSelector /></RequireAuth>
                } />
                <Route path="/terminal/:terminalId" element={
                  <RequireAuth roles={STAFF_ROLES}><TerminalView /></RequireAuth>
                } />
                <Route path="/admin" element={
                  <RequireAuth roles={[UserRole.ADMIN]}><AdminView /></RequireAuth>
                } />
              </Routes>
            </div>
          } />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
