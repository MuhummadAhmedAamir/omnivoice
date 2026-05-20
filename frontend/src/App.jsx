import React, { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import GuestView from './pages/GuestView'
import CustomerDashboard from './pages/CustomerDashboard'
import AdminDashboard from './pages/AdminDashboard'
import './styles/global.css'

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'))
  const [isAdmin, setIsAdmin] = useState(localStorage.getItem('isAdmin') === 'true')

  useEffect(() => {
    const storedToken = localStorage.getItem('token')
    const storedAdmin = localStorage.getItem('isAdmin') === 'true'
    if (storedToken) {
      setToken(storedToken)
      setIsAdmin(storedAdmin)
    }
  }, [])

  const handleLogin = (token, admin = false) => {
    localStorage.setItem('token', token)
    localStorage.setItem('isAdmin', admin)
    setToken(token)
    setIsAdmin(admin)
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('isAdmin')
    setToken(null)
    setIsAdmin(false)
  }

  return (
    <Router>
      <Routes>
        <Route 
          path="/" 
          element={token && isAdmin ? <Navigate to="/admin" /> : token ? <Navigate to="/dashboard" /> : <GuestView onLogin={handleLogin} />} 
        />
        <Route 
          path="/dashboard" 
          element={token && !isAdmin ? <CustomerDashboard token={token} onLogout={handleLogout} /> : <Navigate to="/" />} 
        />
        <Route 
          path="/admin" 
          element={token && isAdmin ? <AdminDashboard token={token} onLogout={handleLogout} /> : <Navigate to="/" />} 
        />
      </Routes>
    </Router>
  )
}

export default App
