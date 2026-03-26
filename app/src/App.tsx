import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import { TotemView } from './views/TotemView'
import './App.css'

function App() {
  return (
    <BrowserRouter>
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
          <Route path="/display" element={<div className="placeholder">Pantalla Pública (Fase 8)</div>} />
          <Route path="/terminal" element={<div className="placeholder">Terminal/Operador (Fase 9)</div>} />
          <Route path="/admin" element={<div className="placeholder">Admin (Fase 10)</div>} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App
