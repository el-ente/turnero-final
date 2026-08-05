import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { TotemView } from './views/TotemView'
import { PublicDisplay } from './views/PublicDisplay'
import { TerminalView } from './views/TerminalView'
import { TerminalSelector } from './views/TerminalSelector'
import { AdminView } from './views/AdminView'
import { TicketMark } from './components/TicketMark'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public display is fullscreen */}
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
              <Route path="/" element={<TotemView />} />
              <Route path="/terminal" element={<TerminalSelector />} />
              <Route path="/terminal/:terminalId" element={<TerminalView />} />
              <Route path="/admin" element={<AdminView />} />
            </Routes>
          </div>
        } />
      </Routes>
    </BrowserRouter>
  )
}

export default App
