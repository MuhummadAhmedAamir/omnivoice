import React, { useState, useEffect } from 'react'
import { LogOut, ArrowRight, Clock, Zap } from 'lucide-react'
import '../styles/AdminDashboard.css'

function AdminDashboard({ token, onLogout }) {
  const [orders, setOrders] = useState([])
  const [stats, setStats] = useState({ pending: 0, preparing: 0, completed: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchOrders()
    const interval = setInterval(fetchOrders, 5000)
    return () => clearInterval(interval)
  }, [])

  const fetchOrders = async () => {
    try {
      const response = await fetch(`http://localhost:8000/admin/orders?token=${token}`)
      if (response.ok) {
        const data = await response.json()
        setOrders(data.data || [])
        
        const stats = {
          pending: data.data?.filter(o => o.status === 'pending').length || 0,
          preparing: data.data?.filter(o => o.status === 'preparing').length || 0,
          completed: data.data?.filter(o => o.status === 'completed').length || 0
        }
        setStats(stats)
      }
    } catch (error) {
      console.error('Error fetching orders:', error)
    } finally {
      setLoading(false)
    }
  }

  const updateOrderStatus = async (orderId, newStatus) => {
    try {
      const response = await fetch(`http://localhost:8000/admin/orders/${orderId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, token })
      })
      
      if (response.ok) {
        fetchOrders()
      }
    } catch (error) {
      console.error('Error updating order:', error)
    }
  }

  const getOrdersByStatus = (status) => {
    return orders.filter(order => order.status === status)
  }

  return (
    <div className="admin-dashboard">
      <header className="navbar">
        <div className="nav-container">
          <h1 className="logo">👨‍🍳 Kitchen Monitor</h1>
          <button className="btn btn-logout" onClick={onLogout}>
            <LogOut size={20} /> Logout
          </button>
        </div>
      </header>

      <div className="dashboard-content">
        <div className="stats-row">
          <div className="stat-box pending">
            <div>
              <h3>Pending Orders</h3>
              <p className="count">{stats.pending}</p>
            </div>
            <Clock size={40} />
          </div>
          <div className="stat-box preparing">
            <div>
              <h3>Preparing</h3>
              <p className="count">{stats.preparing}</p>
            </div>
            <Zap size={40} />
          </div>
          <div className="stat-box completed">
            <div>
              <h3>Completed</h3>
              <p className="count">{stats.completed}</p>
            </div>
          </div>
        </div>

        <div className="kanban-board">
          {/* Pending Column */}
          <div className="kanban-column">
            <h3 className="column-header pending-header">📋 Pending ({stats.pending})</h3>
            <div className="kanban-items">
              {getOrdersByStatus('pending').map(order => (
                <div key={order.id} className="kanban-card pending-card">
                  <div className="card-header">
                    <h4>Order #{order.id}</h4>
                    <span className="time">{new Date(order.created_at).toLocaleTimeString()}</span>
                  </div>
                  <div className="card-body">
                    <p><strong>Customer:</strong> {order.customers?.name || 'Guest'}</p>
                    <p><strong>Address:</strong> {order.delivery_address}</p>
                  </div>
                  <div className="card-items">
                    {order.order_items?.map(item => (
                      <div key={item.id} className="item">
                        {item.menu_items?.name} x{item.quantity}
                      </div>
                    ))}
                  </div>
                  <button 
                    className="btn btn-move"
                    onClick={() => updateOrderStatus(order.id, 'preparing')}
                  >
                    <ArrowRight size={16} /> Start Preparing
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Preparing Column */}
          <div className="kanban-column">
            <h3 className="column-header preparing-header">👨‍🍳 Preparing ({stats.preparing})</h3>
            <div className="kanban-items">
              {getOrdersByStatus('preparing').map(order => (
                <div key={order.id} className="kanban-card preparing-card">
                  <div className="card-header">
                    <h4>Order #{order.id}</h4>
                    <span className="time">{new Date(order.created_at).toLocaleTimeString()}</span>
                  </div>
                  <div className="card-body">
                    <p><strong>Customer:</strong> {order.customers?.name || 'Guest'}</p>
                    <p><strong>Phone:</strong> {order.customers?.phone_number}</p>
                  </div>
                  <div className="card-items">
                    {order.order_items?.map(item => (
                      <div key={item.id} className="item">
                        {item.menu_items?.name} x{item.quantity}
                      </div>
                    ))}
                  </div>
                  <button 
                    className="btn btn-move"
                    onClick={() => updateOrderStatus(order.id, 'completed')}
                  >
                    <ArrowRight size={16} /> Mark Ready
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Completed Column */}
          <div className="kanban-column">
            <h3 className="column-header completed-header">✅ Ready for Pickup ({stats.completed})</h3>
            <div className="kanban-items">
              {getOrdersByStatus('completed').map(order => (
                <div key={order.id} className="kanban-card completed-card">
                  <div className="card-header">
                    <h4>Order #{order.id}</h4>
                    <span className="time">{new Date(order.created_at).toLocaleTimeString()}</span>
                  </div>
                  <div className="card-body">
                    <p><strong>Customer:</strong> {order.customers?.name || 'Guest'}</p>
                    <p><strong>Total:</strong> Rs. {order.total_amount}</p>
                  </div>
                  <div className="card-items">
                    {order.order_items?.map(item => (
                      <div key={item.id} className="item">
                        {item.menu_items?.name} x{item.quantity}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AdminDashboard
