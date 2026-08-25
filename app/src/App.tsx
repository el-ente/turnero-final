import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import { UserRole } from 'shared'
import { TotemView } from './views/TotemView'
import { PublicDisplay } from './views/PublicDisplay'
import { WebTicketView } from './views/WebTicketView'
import { TicketMark } from './components/TicketMark'
import { RequireAuth } from './components/RequireAuth'
import { AuthProvider } from './contexts/AuthContext'
import { useAuth } from './contexts/useAuth'
import './App.css'

const TerminalSelector = lazy(() => import('./views/TerminalSelector').then((m) => ({ default: m.TerminalSelector })))
const TerminalView = lazy(() => import('./views/TerminalView').then((m) => ({ default: m.TerminalView })))
const AdminView = lazy(() => import('./views/AdminView').then((m) => ({ default: m.AdminView })))
const LoginView = lazy(() => import('./views/LoginView').then((m) => ({ default: m.LoginView })))

const STAFF_ROLES = [UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.CASHIER]

function RouteFallback() {
  return <div className="auth-status">Cargando…</div>
}

function AuthStatus() {
  const { firebaseUser, signOutUser } = useAuth()
  if (!firebaseUser) return null
  return (
    <div className="auth-status-bar">
      <span className="auth-status-email">{firebaseUser.email}</span>
      <button className="auth-status-signout" onClick={() => signOutUser()}>Cerrar sesión</button>
    </div>
  )
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Totem is the unattended public kiosk, fullscreen, no auth, no navbar */}
          <Route path="/" element={<TotemView />} />

          {/* Public display is fullscreen, no auth */}
          <Route path="/display" element={<PublicDisplay />} />

          {/* Mi Turno / Login are public-facing, no staff nav */}
          <Route path="/mi-turno" element={<WebTicketView />} />
          <Route path="/mi-turno/:turnId" element={<WebTicketView />} />
          <Route path="/login" element={
            <Suspense fallback={<RouteFallback />}>
              <LoginView />
            </Suspense>
          } />

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
                  <li><NavLink to="/mi-turno">Mi Turno</NavLink></li>
                  <li><NavLink to="/display">Pantalla Pública</NavLink></li>
                  <li><NavLink to="/terminal">Terminal</NavLink></li>
                  <li><NavLink to="/admin">Admin</NavLink></li>
                </ul>
                <AuthStatus />
              </nav>

              <Suspense fallback={<RouteFallback />}>
                <Routes>
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
              </Suspense>
            </div>
          } />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
