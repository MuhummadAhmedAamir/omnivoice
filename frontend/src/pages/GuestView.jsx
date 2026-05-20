import React, { useState } from 'react'
import { Mic, LogIn, UserPlus, PhoneCall } from 'lucide-react'
import '../styles/GuestView.css'

function GuestView({ onLogin }) {
  const [view, setView] = useState('menu') // menu, login, register, call
  const [menu, setMenu] = useState([
    { id: 1, name: 'Zinger Burger', category: 'Burgers', price: 450, description: 'Spicy fried chicken' },
    { id: 2, name: 'Classic Burger', category: 'Burgers', price: 350, description: 'Beef with cheese' },
    { id: 3, name: 'Coke', category: 'Beverages', price: 80, description: 'Cold drink' },
    { id: 4, name: 'Fries', category: 'Sides', price: 120, description: 'Crispy fries' },
  ])
  const [isRecording, setIsRecording] = useState(false)
  const [loginForm, setLoginForm] = useState({ phone: '', password: '' })
  const [registerForm, setRegisterForm] = useState({ phone: '', name: '', password: '', address: '' })

  const handleVoiceCall = async () => {
    setIsRecording(true)
    const sessionId = Math.random().toString(36).substr(2, 9)
    
    try {
      const ws = new WebSocket(`ws://localhost:8000/call/${sessionId}`)
      
      ws.onopen = () => {
        console.log('WebSocket connected')
        ws.send(JSON.stringify({ type: 'session_init' }))
      }
      
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data)
        if (data.type === 'audio_response') {
          const audio = new Audio('data:audio/mp3;base64,' + data.audio)
          audio.play()
        }
      }
      
      // Capture microphone
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          ws.send(JSON.stringify({
            type: 'audio_chunk',
            audio: event.data
          }))
        }
      }
      
      mediaRecorder.start(1000)
      
      setTimeout(() => {
        mediaRecorder.stop()
        setIsRecording(false)
        ws.close()
      }, 60000) // 60 second call
    } catch (error) {
      console.error('Microphone access denied:', error)
      alert('Please allow microphone access to use voice call')
      setIsRecording(false)
    }
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    try {
      const response = await fetch('http://localhost:8000/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone_number: loginForm.phone, password: loginForm.password })
      })
      
      if (response.ok) {
        const data = await response.json()
        localStorage.setItem('token', data.access_token)
        localStorage.setItem('customerId', data.customer_id)
        onLogin(data.access_token, false)
      } else {
        alert('Login failed')
      }
    } catch (error) {
      console.error('Login error:', error)
      alert('Login error')
    }
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    try {
      const response = await fetch('http://localhost:8000/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone_number: registerForm.phone,
          name: registerForm.name,
          password: registerForm.password,
          delivery_address: registerForm.address
        })
      })
      
      if (response.ok) {
        const data = await response.json()
        localStorage.setItem('token', data.access_token)
        localStorage.setItem('customerId', data.customer_id)
        onLogin(data.access_token, false)
      } else {
        alert('Registration failed')
      }
    } catch (error) {
      console.error('Registration error:', error)
      alert('Registration error')
    }
  }

  return (
    <div className="guest-view">
      {view === 'menu' && (
        <>
          <header className="hero">
            <div className="hero-content">
              <h1>🎙️ OmniVoice AI</h1>
              <p>Order food by speaking with our AI waiter</p>
              <div className="hero-buttons">
                <button className="btn btn-primary" onClick={() => setView('call')}>
                  <PhoneCall size={20} /> Start Voice Call
                </button>
                <button className="btn btn-secondary" onClick={() => setView('login')}>
                  <LogIn size={20} /> Sign In
                </button>
                <button className="btn btn-secondary" onClick={() => setView('register')}>
                  <UserPlus size={20} /> Register
                </button>
              </div>
            </div>
          </header>

          <section className="menu-section">
            <h2>Our Menu</h2>
            <div className="menu-grid">
              {menu.map(item => (
                <div key={item.id} className="menu-card">
                  <h3>{item.name}</h3>
                  <p className="category">{item.category}</p>
                  <p className="description">{item.description}</p>
                  <p className="price">Rs. {item.price}</p>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {view === 'call' && (
        <div className="voice-call-container">
          <div className="voice-call-box">
            <h2>Voice Call Active</h2>
            <div className={`microphone-icon ${isRecording ? 'recording' : ''}`}>
              <Mic size={80} />
            </div>
            <p className="call-status">{isRecording ? 'Recording...' : 'Ready to call'}</p>
            {!isRecording ? (
              <button className="btn btn-primary" onClick={handleVoiceCall}>
                Start Recording
              </button>
            ) : (
              <button className="btn btn-danger" onClick={() => setIsRecording(false)}>
                Stop Recording
              </button>
            )}
            <button className="btn btn-secondary" onClick={() => setView('menu')}>
              Back to Menu
            </button>
          </div>
        </div>
      )}

      {view === 'login' && (
        <div className="auth-container">
          <form className="auth-form" onSubmit={handleLogin}>
            <h2>Sign In</h2>
            <input
              type="tel"
              placeholder="Phone Number"
              value={loginForm.phone}
              onChange={(e) => setLoginForm({...loginForm, phone: e.target.value})}
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={loginForm.password}
              onChange={(e) => setLoginForm({...loginForm, password: e.target.value})}
              required
            />
            <button type="submit" className="btn btn-primary">Sign In</button>
            <button type="button" className="btn btn-secondary" onClick={() => setView('menu')}>
              Back
            </button>
          </form>
        </div>
      )}

      {view === 'register' && (
        <div className="auth-container">
          <form className="auth-form" onSubmit={handleRegister}>
            <h2>Create Account</h2>
            <input
              type="tel"
              placeholder="Phone Number"
              value={registerForm.phone}
              onChange={(e) => setRegisterForm({...registerForm, phone: e.target.value})}
              required
            />
            <input
              type="text"
              placeholder="Full Name"
              value={registerForm.name}
              onChange={(e) => setRegisterForm({...registerForm, name: e.target.value})}
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={registerForm.password}
              onChange={(e) => setRegisterForm({...registerForm, password: e.target.value})}
              required
            />
            <input
              type="text"
              placeholder="Delivery Address"
              value={registerForm.address}
              onChange={(e) => setRegisterForm({...registerForm, address: e.target.value})}
            />
            <button type="submit" className="btn btn-primary">Register</button>
            <button type="button" className="btn btn-secondary" onClick={() => setView('menu')}>
              Back
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

export default GuestView
