import React, { useState, useEffect } from 'react'
import { LogOut, ShoppingBag, Truck, CheckCircle } from 'lucide-react'
import '../styles/CustomerDashboard.css'

function CustomerDashboard({ token, onLogout }) {
  const [orders, setOrders] = useState([])
  const [stats, setStats] = useState({ total: 0, pending: 0, completed: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchOrders()
    const interval = setInterval(fetchOrders, 5000)
    return () => clearInterval(interval)
  }, [])

  const fetchOrders = async () => {
    try {
      const response = await fetch(`http://localhost:8000/orders/history?token=${token}`)
      if (response.ok) {
        const data = await response.json()
        setOrders(data.data)
        
        // Calculate stats
        const stats = {
          total: data.data.length,
          pending: data.data.filter(o => o.status === 'pending').length,
          completed: data.data.filter(o => o.status === 'completed').length
        }
        setStats(stats)
      }
    } catch (error) {
      console.error('Error fetching orders:', error)
    } finally {
      setLoading(false)
    }
  }

  const getStatusIcon = (status) => {
    switch(status) {
      case 'pending':
        return <ShoppingBag className="status-icon pending" />
      case 'preparing':
        return <Truck className="status-icon preparing" />
      case 'completed':
        return <CheckCircle className="status-icon completed" />
      default:
        return <ShoppingBag className="status-icon" />
    }
  }

  return (
    <div className="customer-dashboard">
      <header className="navbar">
        <div className="nav-container">
          <h1 className="logo">🍽️ OmniVoice AI - My Orders</h1>
          <button className="btn btn-logout" onClick={onLogout}>
            <LogOut size={20} /> Logout
          </button>
        </div>
      </header>

      <div className="dashboard-content">
        <div className="stats-row">
          <div className="stat-box total">
            <div>
              <h3>Total Orders</h3>
              <p className="count">{stats.total}</p>
            </div>
          </div>
          <div className="stat-box pending">
            <div>
              <h3>Pending</h3>
              <p className="count">{stats.pending}</p>
            </div>
          </div>
          <div className="stat-box completed">
            <div>
              <h3>Completed</h3>
              <p className="count">{stats.completed}</p>
            </div>
          </div>
        </div>

        <section className="orders-section">
          <h2>Order History</h2>
          {loading ? (
            <p>Loading...</p>
          ) : orders.length === 0 ? (
            <p className="no-orders">No orders yet. Start by making a voice call!</p>
          ) : (
            <div className="orders-table">
              <table>
                <thead>
                  <tr>
                    <th>Order ID</th>
                    <th>Items</th>
                    <th>Total</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th>Delivery</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map(order => (
                    <tr key={order.id} className={`status-${order.status}`}>
                      <td>#{order.id}</td>
                      <td>
                        {order.order_items?.map(item => (
                          <span key={item.id} className="item-badge">
                            {item.menu_items?.name || 'Item'} x{item.quantity}
                          </span>
                        ))}
                      </td>
                      <td>Rs. {order.total_amount}</td>
                      <td>
                        <div className="status-badge" style={{
                          background: order.status === 'pending' ? '#FFA500' : order.status === 'completed' ? '#228B22' : '#4169E1'
                        }}>
                          {getStatusIcon(order.status)}
                          {order.status}
                        </div>
                      </td>
                      <td>{new Date(order.created_at).toLocaleDateString()}</td>
                      <td>{order.delivery_address}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export default CustomerDashboard
