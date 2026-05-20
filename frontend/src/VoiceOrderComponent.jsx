import React, { useState, useRef, useEffect } from 'react';
import { Mic, PhoneCall, LogIn, UserPlus, LogOut, ClipboardList, ShieldAlert, CheckCircle, Clock, RefreshCw } from 'lucide-react';
import { supabase } from './supabaseClient'; 

const BACKEND_URL = "https://embassy-specimen-jersey.ngrok-free.dev";

export default function VoiceOrderComponent() {
  // Navigation & Identity States
  const [view, setView] = useState('landing'); // landing, auth, customer, admin, call
  const [authMode, setAuthMode] = useState('login'); // login, register
  const [currentUser, setCurrentUser] = useState(null);

  // Core Data Tables Hooks
  const [menuItems, setMenuItems] = useState([]);
  const [previousOrders, setPreviousOrders] = useState([]);
  const [adminOrders, setAdminOrders] = useState([]);

  // Form Field Input Controllers
  const [loginForm, setLoginForm] = useState({ phone: '', password: '' });
  const [registerForm, setRegisterForm] = useState({ phone: '', name: '', password: '', address: '' });

  // Voice Pipeline State Matrix
  const [isRecording, setIsRecording] = useState(false);
  const [statusText, setStatusText] = useState("Ready to take order");
  const [isPlaying, setIsPlaying] = useState(false);
  
  const sessionIdRef = useRef("");
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioPlayerRef = useRef(new Audio());

  // Fetch available menu items on initialization
  useEffect(() => {
    fetchMenuFromSupabase();
    sessionIdRef.current = "session_" + Math.random().toString(36).substring(2, 15);
  }, [view]);

  const fetchMenuFromSupabase = async () => {
    try {
      const { data, error } = await supabase
        .from('menu_items')
        .select('*')
        .eq('is_available', true);
      if (error) throw error;
      if (data) setMenuItems(data);
    } catch (err) {
      console.error("Failed to query menu records:", err.message);
    }
  };

  // Query Dashboard parameters based on Logged-in Customer ID
  const fetchCustomerOrdersHistory = async (customerId) => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      if (data) setPreviousOrders(data);
    } catch (err) {
      console.error("Dashboard ingestion pipeline execution failure:", err.message);
    }
  };

  // Admin View: Query ALL active structural orders inside the system
  const fetchAllOrdersForKitchenMonitor = async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id, total_amount, status, delivery_address, created_at, customer_id,
          customers ( name, phone_number )
        `)
        .order('created_at', { ascending: false });
      if (error) throw error;
      if (data) setAdminOrders(data);
    } catch (err) {
      console.error("Admin real-time feed processing error:", err.message);
    }
  };

  // Admin Interaction Trigger: Update order status properties inside cloud schema
  const handleUpdateOrderStatus = async (orderId, newStatus) => {
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: newStatus })
        .eq('id', orderId);
      if (error) throw error;
      
      // Refresh admin queue UI matrix following updates
      fetchAllOrdersForKitchenMonitor();
      alert(`Order #${orderId} successfully transitioned to ${newStatus.toUpperCase()}`);
    } catch (err) {
      alert("Failed to modify target order lifecycle status element: " + err.message);
    }
  };

  // SECURE AUTH SYSTEM LAYER: Native Direct Database Queries
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    try {
      if (authMode === 'login') {
        const { data, error } = await supabase
          .from('customers')
          .select('*')
          .eq('phone_number', loginForm.phone)
          .eq('password_hash', loginForm.password) 
          .single();

        if (error || !data) {
          alert("Authentication failed! Invalid phone number or password credentials.");
          return;
        }

        setCurrentUser(data);
        console.log(`👤 User identified with ID: ${data.id}`);

        // ROUTING CONSTRAINT: If login customer ID is exactly 1, dispatch to Admin Workspace
        if (parseInt(data.id) === 1) {
          await fetchAllOrdersForKitchenMonitor();
          setView('admin');
        } else {
          await fetchCustomerOrdersHistory(data.id);
          setView('customer');
        }

      } else {
        const { data, error } = await supabase
          .from('customers')
          .insert([
            {
              phone_number: registerForm.phone,
              name: registerForm.name,
              password_hash: registerForm.password, 
              default_delivery_address: registerForm.address
            }
          ])
          .select()
          .single();

        if (error) throw error;

        alert("Account registration successful!");
        setCurrentUser(data);
        await fetchCustomerOrdersHistory(data.id);
        setView('customer');
      }
    } catch (err) {
      alert("Authentication database transaction failure: " + err.message);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setPreviousOrders([]);
    setAdminOrders([]);
    setView('landing');
  };

  // Integrated Push-To-Talk Voice Logic Mapping to Colab Server
  const startRecording = async () => {
    try {
      if (!audioPlayerRef.current.paused) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current.currentTime = 0;
        setIsPlaying(false);
        console.log("🛑 AI playback forcefully interrupted by user speech.");
      }

      audioChunksRef.current = [];
      setStatusText("Listening...");
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        setStatusText("Processing audio turn...");
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await sendAudioToBackend(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Microphone access denied:", err);
      setStatusText("Error accessing microphone");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
    }
  };

  const sendAudioToBackend = async (audioBlob) => {
    const formData = new FormData();
    formData.append("file", audioBlob, "audio.webm");
    formData.append("session_id", sessionIdRef.current);
    
    // Pass user authentication ID to back-end to customize instructions context
    if (currentUser && currentUser.id) {
      formData.append("customer_id", currentUser.id);
    }

    try {
      const response = await fetch(`${BACKEND_URL}/process-audio`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Backend pipeline error");

      setStatusText("AI Waiter Speaking...");
      setIsPlaying(true);

      const responseAudioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(responseAudioBlob);
      
      audioPlayerRef.current.src = audioUrl;
      audioPlayerRef.current.play();

      audioPlayerRef.current.onended = () => {
        setIsPlaying(false);
        setStatusText("Ready for next command");
      };

    } catch (error) {
      console.error("Pipeline Error:", error);
      setStatusText("Error. Try speaking again.");
    }
  };

  return (
    <div style={styles.appWrapper}>
      {/* Header Navbar */}
      <nav style={styles.navbar}>
        <div style={styles.navBrand} onClick={() => setView('landing')}>🎙️ OmniVoice AI</div>
        <div style={styles.navLinks}>
          {!currentUser ? (
            <>
              <button style={styles.navBtnGlass} onClick={() => { setAuthMode('login'); setView('auth'); }}><LogIn size={16} /> Sign In</button>
              <button style={styles.navBtnGlass} onClick={() => { setAuthMode('register'); setView('auth'); }}><UserPlus size={16} /> Register</button>
            </>
          ) : (
            <>
              <span style={styles.userBadge}>👤 {currentUser.name} (ID: {currentUser.id})</span>
              {parseInt(currentUser.id) !== 1 && <button style={styles.navBtnLink} onClick={() => { fetchCustomerOrdersHistory(currentUser.id); setView('customer'); }}><ClipboardList size={16} /> Dashboard</button>}
              {parseInt(currentUser.id) === 1 && <button style={styles.navBtnLink} onClick={() => { fetchAllOrdersForKitchenMonitor(); setView('admin'); }}><ShieldAlert size={16} /> Kitchen Panel</button>}
              <button style={styles.navBtnLogout} onClick={handleLogout}><LogOut size={16} /> Logout</button>
            </>
          )}
        </div>
      </nav>

      {/* VIEW 1: Main Landing / Menu Layout */}
      {view === 'landing' && (
        <div style={styles.mainLayout}>
          <header style={styles.heroBlock}>
            <h1>Autonomous Voice-Driven Food Ordering</h1>
            <p>Connect instantly with our open-source AI restaurant cashier layer. Zero input typing required.</p>
            <button style={styles.primaryCallBtn} onClick={() => setView('call')}><PhoneCall size={20} /> Open Voice Waiter Call</button>
          </header>

          <section style={styles.menuSection}>
            <h2>Premium Menu Records</h2>
            <div style={styles.menuGrid}>
              {menuItems.length === 0 ? <p style={{color:'#8A99AD'}}>Connecting to Supabase menu records index...</p> : menuItems.map(item => (
                <div key={item.id} style={styles.menuCard}>
                  <div style={styles.cardTag}>Rs. {item.price}</div>
                  <h3>{item.name}</h3>
                  <p style={styles.cardDesc}>{item.description || "Fresh restaurant option available for fast delivery."}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* VIEW 2: Authentication Window Box */}
      {view === 'auth' && (
        <div style={styles.authViewport}>
          <div style={styles.authCard}>
            <h2>{authMode === 'login' ? 'Supabase Secure Access' : 'Create Account Profile'}</h2>
            <form onSubmit={handleAuthSubmit} style={styles.formElement}>
              {authMode === 'register' && (
                <>
                  <input type="text" placeholder="Full Name" style={styles.formInput} value={registerForm.name} onChange={(e) => setRegisterForm({...registerForm, name: e.target.value})} required />
                  <input type="text" placeholder="Delivery Destination Address" style={styles.formInput} value={registerForm.address} onChange={(e) => setRegisterForm({...registerForm, address: e.target.value})} required />
                </>
              )}
              <input type="tel" placeholder="Phone Number Reference" style={styles.formInput} value={authMode === 'login' ? loginForm.phone : registerForm.phone} onChange={(e) => authMode === 'login' ? setLoginForm({...loginForm, phone: e.target.value}) : setRegisterForm({...registerForm, phone: e.target.value})} required />
              <input type="password" placeholder="Password PIN Key" style={styles.formInput} value={authMode === 'login' ? loginForm.password : registerForm.password} onChange={(e) => authMode === 'login' ? setLoginForm({...loginForm, password: e.target.value}) : setRegisterForm({...registerForm, password: e.target.value})} required />
              
              <button type="submit" style={styles.formSubmitBtn}>{authMode === 'login' ? 'Log In' : 'Commit Registry Row'}</button>
            </form>
            <p style={styles.switchAuthText} onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>
              {authMode === 'login' ? "New customer? Register profiles here" : "Returnee profile? Run validation here"}
            </p>
          </div>
        </div>
      )}

      {/* VIEW 3: Real-Time Dynamic Customer Order Log Dashboard */}
      {view === 'customer' && (
        <div style={styles.dashboardContainer}>
          <div style={styles.dashboardHeader}>
            <h2>Customer Invoicing Dashboard</h2>
            <button style={styles.primaryCallBtnSmall} onClick={() => setView('call')}><PhoneCall size={16} /> Launch New Order Call</button>
          </div>
          <div style={styles.historySection}>
            <h3>Your Authenticated Voice Sessions Transactions</h3>
            {previousOrders.length === 0 ? <p style={{color:'#8A99AD'}}>No transactional order lines found matching your phone user reference key.</p> : (
              <div style={styles.ordersTableWrapper}>
                <table style={styles.table}>
                  <thead>
                    <tr style={styles.tableHeaderRow}>
                      <th>Order #</th><th>Date & Time Timestamp</th><th>Grand Cost Total</th><th>Destination Location Address</th><th>Fulfillment Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previousOrders.map(order => (
                      <tr key={order.id} style={styles.tableBodyRow}>
                        <td>#{order.id}</td>
                        <td>{new Date(order.created_at).toLocaleString()}</td>
                        <td>Rs. {order.total_amount}</td>
                        <td>{order.delivery_address}</td>
                        <td>
                          <span style={{
                            ...styles.statusCompletedBadge,
                            color: order.status === 'completed' ? '#10B981' : order.status === 'pending' ? '#FF9F1C' : '#3B82F6'
                          }}>
                            <CheckCircle size={12} /> {order.status.toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW 4: Admin Live Kitchen Feed Monitor Route (Triggers when ID === 1) */}
      {view === 'admin' && (
        <div style={styles.dashboardContainer}>
          <div style={styles.dashboardHeader}>
            <h2>🧑‍🍳 Production Line Kitchen Control Board</h2>
            <button style={styles.btnRefreshAdmin} onClick={fetchAllOrdersForKitchenMonitor}><RefreshCw size={14} /> Refresh Feed</button>
          </div>
          <div style={styles.adminGrid}>
            {adminOrders.length === 0 ? <p>No active consumer order requests waiting inside Supabase index queues.</p> : adminOrders.map(order => (
              <div key={order.id} style={styles.adminCard}>
                <div style={styles.adminCardHeader}>
                  <span style={styles.orderNumber}>Order Token Reference: #{order.id}</span>
                  <span style={order.status === 'pending' ? styles.statusPendingBadge : order.status === 'preparing' ? styles.statusPreparingBadge : styles.statusCompletedBadge}>
                    {order.status.toUpperCase()}
                  </span>
                </div>
                <div style={styles.adminCardBody}>
                  <p><strong>Caller Name:</strong> {order.customers?.name || "Voice-Route Guest User"}</p>
                  <p><strong>Mobile Reference:</strong> {order.customers?.phone_number || "No contact digits captured"}</p>
                  <p><strong>Target Delivery Address:</strong> {order.delivery_address}</p>
                  <div style={styles.adminCardPriceRow}><strong>Invoiced Cost:</strong> <span>Rs. {order.total_amount}</span></div>
                  
                  {/* Status Dropdown Controller */}
                  <div style={styles.dropdownStatusRow}>
                    <label style={{fontSize:'0.8rem', color:'#8A99AD'}}>Update Order Lifecycle State Matrix:</label>
                    <select 
                      value={order.status} 
                      onChange={(e) => handleUpdateOrderStatus(order.id, e.target.value)}
                      style={styles.selectStatusBox}
                    >
                      <option value="pending">Pending Inbound Queue</option>
                      <option value="preparing">Preparing inside Kitchen</option>
                      <option value="dispatched">Dispatched via Courier</option>
                      <option value="completed">Completed & Finalized</option>
                      <option value="cancelled">Cancelled/Revoked Token</option>
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* VIEW 5: Push-To-Talk Calling Interface */}
      {view === 'call' && (
        <div style={styles.callLayoutWindow}>
          <div style={styles.callInterfaceBox}>
            <div style={styles.callHeader}>
              <div style={styles.pulseIndicator}>
                <div style={{...styles.coreDot, backgroundColor: isRecording ? '#ff4d4d' : '#FF9F1C'}}></div>
                <div style={{...styles.waveRing, borderColor: isRecording ? '#ff4d4d' : '#FF9F1C'}}></div>
              </div>
              <span style={styles.callTitle}>{isRecording ? "MIC RECORDING SEQUENCE ENGAGED" : "CONNECTED TO AI WAITER HOTLINE"}</span>
            </div>

            <div style={styles.viewportConversation}>
              <div style={styles.systemMessage}>Tracking Session String Token: {sessionIdRef.current}</div>
              <div style={styles.statusDisplay}>Status: <strong>{statusText}</strong></div>
              {isPlaying && <div style={styles.audioWaveAnimation}>🔊 Stream Playback Active: Sound output generating...</div>}
            </div>

            <div style={styles.controlDockPanel}>
              <button 
                onMouseDown={startRecording} 
                onMouseUp={stopRecording}
                onTouchStart={startRecording}
                onTouchEnd={stopRecording}
                style={{
                  ...styles.hugePushToTalkBtn,
                  backgroundColor: isRecording ? '#ff4d4d' : '#4CAF50'
                }}
              >
                {isRecording ? "🎤 Release Button to Transmit Voice" : "🔘 Press & Hold to Speak"}
              </button>
              <button style={styles.btnExitCall} onClick={() => setView(currentUser ? (parseInt(currentUser.id) === 1 ? 'admin' : 'customer') : 'landing')}>Hang Up / Disconnect</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Full-fledged Custom Layout CSS styling
const styles = {
  appWrapper: { backgroundColor: '#0B0F19', color: '#F4F6FA', minHeight: '100vh', fontFamily: 'system-ui, sans-serif' },
  navbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 2rem', backgroundColor: '#151D30', borderBottom: '1px solid #24324F' },
  navBrand: { fontSize: '1.25rem', fontWeight: '700', color: '#FF9F1C', cursor: 'pointer' },
  navLinks: { display: 'flex', alignItems: 'center', gap: '1rem' },
  navBtnGlass: { backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid #24324F', color: '#F4F6FA', padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' },
  navBtnLink: { background: 'none', border: 'none', color: '#8A99AD', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize:'0.95rem' },
  navBtnLogout: { backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#EF4444', padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' },
  userBadge: { fontSize: '0.85rem', color: '#8A99AD', backgroundColor: '#1E2942', padding: '0.4rem 0.8rem', borderRadius: '6px' },
  
  mainLayout: { padding: '2rem max(2rem, (100vw - 1200px)/2)' },
  heroBlock: { textAlign: 'center', padding: '5rem 1rem', background: 'radial-gradient(circle at center, #1a2540 0%, #0B0F19 100%)' },
  primaryCallBtn: { backgroundColor: '#FF9F1C', color: '#000', border: 'none', padding: '1rem 2.5rem', fontSize: '1.1rem', fontWeight: '600', borderRadius: '12px', cursor: 'pointer', marginTop: '2rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' },
  primaryCallBtnSmall: { backgroundColor: '#FF9F1C', color: '#000', border: 'none', padding: '0.5rem 1rem', fontSize: '0.9rem', fontWeight: '600', borderRadius: '8px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' },
  
  menuSection: { marginTop: '4rem' },
  menuGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1max))', gap: '2rem', marginTop: '2rem' },
  menuCard: { backgroundColor: '#151D30', border: '1px solid #24324F', padding: '1.5rem', borderRadius: '16px', position: 'relative' },
  cardTag: { position: 'absolute', top: '1rem', right: '1rem', fontSize: '0.85rem', backgroundColor: 'rgba(255,159,28,0.1)', color: '#FF9F1C', padding: '0.2rem 0.6rem', borderRadius: '4px', fontWeight:'600' },
  cardDesc: { color: '#8A99AD', fontSize: '0.9rem', margin: '0.5rem 0 0.5rem 0', height: '40px', overflow: 'hidden' },

  authViewport: { minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  authCard: { backgroundColor: '#151D30', border: '1px solid #24324F', padding: '2.5rem', borderRadius: '24px', width: '100%', maxWidth: '400px' },
  formElement: { display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '1.5rem' },
  formInput: { backgroundColor: '#0B0F19', border: '1px solid #24324F', color: '#F4F6FA', padding: '0.9rem 1rem', borderRadius: '10px', outline: 'none' },
  formSubmitBtn: { backgroundColor: '#FF9F1C', color: '#000', border: 'none', padding: '1rem', fontWeight: '600', borderRadius: '10px', cursor: 'pointer' },
  switchAuthText: { color: '#8A99AD', fontSize: '0.9rem', textAlign: 'center', marginTop: '1.5rem', cursor: 'pointer' },

  dashboardContainer: { padding: '3rem max(2rem, (100vw - 1200px)/2)' },
  dashboardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', borderBottom: '1px solid #24324F', paddingBottom: '1rem' },
  historySection: { backgroundColor: '#151D30', border: '1px solid #24324F', padding: '2rem', borderRadius: '16px' },
  ordersTableWrapper: { overflowX: 'auto', marginTop: '1.5rem' },
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left' },
  tableHeaderRow: { borderBottom: '2px solid #24324F', color: '#8A99AD', fontSize: '0.9rem', paddingBottom:'1rem' },
  tableBodyRow: { borderBottom: '1px solid #24324F', fontSize: '0.95rem' },
  statusCompletedBadge: { color: '#10B981', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem', fontWeight:'600' },

  btnRefreshAdmin: { backgroundColor: '#1E2942', border: '1px solid #24324F', color: '#F4F6FA', padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize:'0.85rem' },
  adminGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1max))', gap: '2rem' },
  adminCard: { backgroundColor: '#151D30', border: '1px solid #24324F', borderRadius: '18px', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  adminCardHeader: { display: 'flex', justifyContent: 'space-between', padding: '1rem 1.5rem', backgroundColor: '#1E2942', borderBottom: '1px solid #24324F', alignItems:'center' },
  orderNumber: { fontWeight: '700', fontSize:'0.9rem' },
  statusPendingBadge: { color: '#FF9F1C', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem', fontWeight:'600' },
  statusPreparingBadge: { color: '#3B82F6', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem', fontWeight:'600' },
  adminCardBody: { padding: '1.5rem', fontSize: '0.9rem', color: '#8A99AD', display: 'flex', flexDirection: 'column', gap: '0.6rem' },
  adminCardPriceRow: { borderTop: '1px solid #24324F', marginTop: '0.5rem', paddingTop: '0.75rem', color: '#F4F6FA', display: 'flex', justifyContent: 'space-between', fontSize: '1rem' },
  dropdownStatusRow: { display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '1rem', borderTop: '1px dashed #24324F', paddingTop: '1rem' },
  selectStatusBox: { backgroundColor: '#0B0F19', color: '#F4F6FA', border: '1px solid #24324F', padding: '0.6rem', borderRadius: '8px', outline: 'none', cursor: 'pointer' },

  callLayoutWindow: { minHeight: '80vh', display: 'flex', alignItems: 'center', justifywhere: 'center', padding: '2rem' },
  callInterfaceBox: { width: '100%', maxWidth: '500px', backgroundColor: '#151D30', border: '1px solid #24324F', borderRadius: '24px', overflow: 'hidden', padding: '2rem', margin: '0 auto' },
  callHeader: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginBottom: '3rem' },
  pulseIndicator: { position: 'relative', width: '12px', height: '12px' },
  coreDot: { width: '100%', height: '100%', borderRadius: '50%' },
  waveRing: { position: 'absolute', width: '100%', height: '100%', borderRadius: '50%', border: '2px solid', top: '0', left: '0' },
  callTitle: { fontSize: '0.85rem', fontWeight: '600', letterSpacing: '0.5px' },
  viewportConversation: { minHeight: '150px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '1rem', padding: '1rem', backgroundColor: '#0B0F19', borderRadius: '14px', marginBottom: '2rem' },
  systemMessage: { fontSize: '0.75rem', color: '#44566C', fontFamily: 'monospace' },
  statusDisplay: { fontSize: '1.2rem', color: '#FF9F1C' },
  audioWaveAnimation: { fontSize: '0.85rem', color: '#8A99AD' },
  controlDockPanel: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  hugePushToTalkBtn: { color: '#fff', border: 'none', width: '100%', padding: '1.25rem', fontSize: '1.1rem', fontWeight: '600', borderRadius: '14px', cursor: 'pointer', userSelect: 'none' },
  btnExitCall: { background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontWeight: '500', fontSize: '0.95rem', marginTop: '0.5rem' }
};