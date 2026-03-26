import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import { TotemView } from './views/TotemView'
import { PublicDisplay } from './views/PublicDisplay'
import { TerminalView } from './views/TerminalView'
import { AdminView } from './views/AdminView'
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
              <h1>🎫 Turnero Digital</h1>
              <ul className="nav-links">
                <li><Link to="/">Totem</Link></li>
                <li><Link to="/display">Pantalla Pública</Link></li>
                <li><Link to="/terminal">Terminal</Link></li>
                <li><Link to="/admin">Admin</Link></li>
              </ul>
            </nav>

            <Routes>
              <Route path="/" element={<TotemView />} />
              <Route path="/terminal" element={<TerminalView />} />
              <Route path="/admin" element={<AdminView />} />
            </Routes>
          </div>
        } />
      </Routes>
    </BrowserRouter>
  )
}

export default App
