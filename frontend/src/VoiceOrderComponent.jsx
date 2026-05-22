import React, { useState, useRef, useEffect } from 'react';
import { Mic, PhoneCall, LogIn, UserPlus, LogOut, ClipboardList, ShieldAlert, CheckCircle, RefreshCw, Radio, ShoppingBag } from 'lucide-react';
import { supabase } from './supabaseclient.js'; 

//const BACKEND_URL = "https://embassy-specimen-jersey.ngrok-free.dev";
const BACKEND_URL = "https://ahmednadeem18-omnivoice-backend.hf.space";
export default function VoiceOrderComponent() {
  const [view, setView] = useState('landing'); 
  const [authMode, setAuthMode] = useState('login'); 
  const [currentUser, setCurrentUser] = useState(null);

  const [menuItems, setMenuItems] = useState([]);
  const [previousOrders, setPreviousOrders] = useState([]);
  const [adminOrders, setAdminOrders] = useState([]);

  const [loginForm, setLoginForm] = useState({ phone: '', password: '' });
  const [registerForm, setRegisterForm] = useState({ phone: '', name: '', password: '', address: '' });

  const [isRecording, setIsRecording] = useState(false);
  const [isAiTalking, setIsAiTalking] = useState(false);
  const [statusText, setStatusText] = useState("Hold the button below to speak.");
  const [screenWidth, setScreenWidth] = useState(window.innerWidth);
  
  const sessionIdRef = useRef("");
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const activeAudioPlayerRef = useRef(null);

  useEffect(() => {
    const handleResize = () => setScreenWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    fetchMenuFromSupabase();
    if (view === 'call') {
      sessionIdRef.current = "session_" + Math.random().toString(36).substring(2, 15);
      setStatusText("Press and hold the Mic button to order.");
    }
  }, [view]);

  const fetchMenuFromSupabase = async () => {
    try {
      const { data, error } = await supabase.from('menu_items').select('*').eq('is_available', true);
      if (error) throw error;
      if (data) setMenuItems(data);
    } catch (err) {
      console.error("Failed to query menu records:", err.message);
    }
  };

  // USER LOGS: Fetches orders AND joins individual line items + food names
  const fetchCustomerOrdersHistory = async (customerId) => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id, 
          total_amount, 
          status, 
          delivery_address, 
          created_at,
          order_items (
            quantity,
            price_at_purchase,
            menu_items ( name )
          )
        `)
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      if (data) setPreviousOrders(data);
    } catch (err) {
      console.error("Dashboard ingestion failure:", err.message);
    }
  };

  // ADMIN MONITOR: Fetches ALL system orders AND joins relational items + food names
  const fetchAllOrdersForKitchenMonitor = async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id, 
          total_amount, 
          status, 
          delivery_address, 
          created_at, 
          customer_id, 
          customers ( name, phone_number ),
          order_items (
            quantity,
            price_at_purchase,
            menu_items ( name )
          )
        `)
        .order('created_at', { ascending: false });
      if (error) throw error;
      if (data) setAdminOrders(data);
    } catch (err) {
      console.error("Admin processing error:", err.message);
    }
  };

  const handleUpdateOrderStatus = async (orderId, newStatus) => {
    try {
      const { error } = await supabase.from('orders').update({ status: newStatus }).eq('id', orderId);
      if (error) throw error;
      fetchAllOrdersForKitchenMonitor();
    } catch (err) {
      alert("Failed to update status: " + err.message);
    }
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    try {
      if (authMode === 'login') {
        const { data, error } = await supabase.from('customers').select('*').eq('phone_number', loginForm.phone).eq('password_hash', loginForm.password).single();
        if (error || !data) {
          alert("Invalid credentials.");
          return;
        }
        setCurrentUser(data);
        
        if (parseInt(data.id) === 1 || data.phone_number === "admin") {
          await fetchAllOrdersForKitchenMonitor();
          setView('admin');
        } else {
          await fetchCustomerOrdersHistory(data.id);
          setView('customer');
        }
      } else {
        const { data, error } = await supabase.from('customers').insert([{ phone_number: registerForm.phone, name: registerForm.name, password_hash: registerForm.password, default_delivery_address: registerForm.address }]).select().single();
        if (error) throw error;
        setCurrentUser(data);
        await fetchCustomerOrdersHistory(data.id);
        setView('customer');
      }
    } catch (err) {
      alert("Database error: " + err.message);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setPreviousOrders([]);
    setAdminOrders([]);
    setView('landing');
  };

  const startRecording = async () => {
    if (activeAudioPlayerRef.current) {
        activeAudioPlayerRef.current.pause();
        setIsAiTalking(false);
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await sendAudioToBackend(audioBlob);
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setStatusText("Listening... (Release to send)");
    } catch (err) {
      console.error("Microphone access denied:", err);
      alert("Microphone access is required.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setStatusText("Processing your voice...");
    }
  };

  const sendAudioToBackend = async (audioBlob) => {
    const formData = new FormData();
    formData.append('file', audioBlob, 'voice.webm');
    formData.append('session_id', sessionIdRef.current);
    if (currentUser) {
      formData.append('customer_id', currentUser.id);
    }

    try {
      const response = await fetch(`${BACKEND_URL}/process-audio`, {
        method: 'POST',
        headers: {
          'ngrok-skip-browser-warning': 'true',
        },
        body: formData,
      });

      if (!response.ok) throw new Error("Server rejected audio");

      const responseBlob = await response.blob();
      if (responseBlob.size > 0) {
        playAiResponse(responseBlob);
      } else {
        setStatusText("Ready. Press and hold to speak.");
      }
    } catch (err) {
      console.error("Network error:", err);
      setStatusText("Network error. Try again.");
    }
  };

  const playAiResponse = (audioBlob) => {
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    activeAudioPlayerRef.current = audio;

    setIsAiTalking(true);
    setStatusText("AI is responding...");

    audio.onended = () => {
      setIsAiTalking(false);
      setStatusText("Ready. Press and hold to speak.");
      URL.revokeObjectURL(audioUrl); 
    };

    audio.play().catch(e => {
        console.error("Playback failed", e);
        setIsAiTalking(false);
        setStatusText("Playback blocked by browser. Try again.");
    });
  };

  const terminateCall = () => {
    if (activeAudioPlayerRef.current) activeAudioPlayerRef.current.pause();
    setIsAiTalking(false);
    setIsRecording(false);
    setView(currentUser ? (parseInt(currentUser.id) === 1 || currentUser.phone_number === "admin" ? 'admin' : 'customer') : 'landing');
  };

  const isMobile = screenWidth <= 768;

  return (
    <div style={styles.appWrapper}>
      {/* Header Navbar */}
      <nav style={{ ...styles.navbar, flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? '1rem' : '0.5rem', textAlign: 'center' }}>
        <div style={styles.navBrand} onClick={() => setView('landing')}>🎙️ OmniVoice AI</div>
        <div style={{ ...styles.navLinks, flexDirection: isMobile ? 'column' : 'row', width: isMobile ? '100%' : 'auto', justifyContent: 'center', gap: isMobile ? '0.75rem' : '1rem' }}>
          {!currentUser ? (
            <>
              <button style={{...styles.navBtnGlass, width: isMobile ? '100%' : 'auto', justifyContent:'center'}} onClick={() => { setAuthMode('login'); setView('auth'); }}><LogIn size={16} /> Sign In</button>
              <button style={{...styles.navBtnGlass, width: isMobile ? '100%' : 'auto', justifyContent:'center'}} onClick={() => { setAuthMode('register'); setView('auth'); }}><UserPlus size={16} /> Register</button>
            </>
          ) : (
            <>
              <span style={{...styles.userBadge, width: isMobile ? '100%' : 'auto', boxSizing:'border-box'}}>{currentUser.name || 'User'}</span>
              {(parseInt(currentUser.id) !== 1 && currentUser.phone_number !== "admin") && <button style={styles.navBtnLink} onClick={() => { fetchCustomerOrdersHistory(currentUser.id); setView('customer'); }}><ClipboardList size={16} /> Dashboard</button>}
              {(parseInt(currentUser.id) === 1 || currentUser.phone_number === "admin") && <button style={styles.navBtnLink} onClick={() => { fetchAllOrdersForKitchenMonitor(); setView('admin'); }}><ShieldAlert size={16} /> Kitchen Panel</button>}
              <button style={{...styles.navBtnLogout, width: isMobile ? '100%' : 'auto', justifyContent:'center'}} onClick={handleLogout}><LogOut size={16} /> Logout</button>
            </>
          )}
        </div>
      </nav>

      {/* VIEW 1: Main Menu Landing */}
      {view === 'landing' && (
        <div style={{...styles.mainLayout, padding: isMobile ? '1rem' : styles.mainLayout.padding}}>
          <header style={{...styles.heroBlock, padding: isMobile ? '3rem 1rem' : styles.heroBlock.padding}}>
            <h1 style={{fontSize: isMobile ? '1.8rem' : '2.5rem', lineHeight: '1.2'}}>Autonomous Voice-Driven Food Ordering</h1>
            <p style={{fontSize: isMobile ? '0.95rem' : '1.1rem'}}>Connect instantly with our open-source AI restaurant cashier layer. Zero input typing required.</p>
            <button style={{...styles.primaryCallBtn, width: isMobile ? '100%' : 'auto', justifyContent: 'center'}} onClick={() => setView('call')}><PhoneCall size={20} /> Open Voice Waiter Call</button>
          </header>

          <section style={styles.menuSection}>
            <h2 style={{textAlign: isMobile ? 'center' : 'left'}}>Premium Menu Records</h2>
            <div style={{ ...styles.menuGrid, gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))' }}>
              {menuItems.length === 0 ? <p style={{color:'#8A99AD', gridColumn:'1/-1', textAlign:'center'}}>Connecting to Supabase menu records index...</p> : menuItems.map(item => (
                <div key={item.id} style={styles.menuCard}>
                  <div style={styles.cardTag}>$ {item.price}</div>
                  <h3 style={{paddingRight: '4.5rem'}}>{item.name}</h3>
                  <span style={styles.categoryLabel}>{item.category || "Main Course"}</span>
                  <p style={styles.cardDesc}>{item.description || "Fresh option available for fast delivery."}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* VIEW 2: Secure Auth Gateway */}
      {view === 'auth' && (
        <div style={{...styles.authViewport, padding: '1rem'}}>
          <div style={{...styles.authCard, maxWidth: isMobile ? '100%' : '400px', boxSizing:'border-box'}}>
            <h2>{authMode === 'login' ? 'Supabase Secure Access' : 'Create Account Profile'}</h2>
            <form onSubmit={handleAuthSubmit} style={styles.formElement}>
              {authMode === 'register' && (
                <>
                  <input type="text" placeholder="Full Name" style={styles.formInput} value={registerForm.name} onChange={(e) => setRegisterForm({...registerForm, name: e.target.value})} required />
                  <input type="text" placeholder="Delivery Destination Address" style={styles.formInput} value={registerForm.address} onChange={(e) => setRegisterForm({...registerForm, address: e.target.value})} required />
                </>
              )}
              <input type="text" placeholder="Phone Number Reference" style={styles.formInput} value={authMode === 'login' ? loginForm.phone : registerForm.phone} onChange={(e) => authMode === 'login' ? setLoginForm({...loginForm, phone: e.target.value}) : setRegisterForm({...registerForm, phone: e.target.value})} required />
              <input type="password" placeholder="Password PIN Key" style={styles.formInput} value={authMode === 'login' ? loginForm.password : registerForm.password} onChange={(e) => authMode === 'login' ? setLoginForm({...loginForm, password: e.target.value}) : setRegisterForm({...registerForm, password: e.target.value})} required />
              <button type="submit" style={styles.formSubmitBtn}>{authMode === 'login' ? 'Log In' : 'Commit Registry Row'}</button>
            </form>
            <p style={styles.switchAuthText} onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>
              {authMode === 'login' ? "New customer? Register profiles here" : "Returnee profile? Run validation here"}
            </p>
          </div>
        </div>
      )}

      {/* VIEW 3: Customer History Log Table */}
      {view === 'customer' && (
        <div style={{...styles.dashboardContainer, padding: isMobile ? '1.5rem 1rem' : styles.dashboardContainer.padding}}>
          <div style={{ ...styles.dashboardHeader, flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', gap: '1rem', textAlign: isMobile ? 'center' : 'left' }}>
            <h2>Customer Invoicing Dashboard</h2>
            <button style={{...styles.primaryCallBtnSmall, justifyContent:'center'}} onClick={() => setView('call')}><PhoneCall size={16} /> Launch New Order Call</button>
          </div>
          <div style={{...styles.historySection, padding: isMobile ? '1rem' : '2rem'}}>
            <h3>Your Authenticated Voice Sessions Transactions</h3>
            {previousOrders.length === 0 ? <p style={{color:'#8A99AD', textAlign:'center', marginTop:'1rem'}}>No records matching your reference key.</p> : (
              <div style={styles.ordersTableWrapper}>
                <table style={styles.table}>
                  <thead>
                    <tr style={styles.tableHeaderRow}>
                      <th style={{padding: '0.75rem 0.5rem'}}>Order #</th>
                      <th style={{padding: '0.75rem 0.5rem'}}>Items Details Basket</th>
                      <th style={{padding: '0.75rem 0.5rem'}}>Date</th>
                      <th style={{padding: '0.75rem 0.5rem'}}>Grand Cost</th>
                      <th style={{padding: '0.75rem 0.5rem'}}>Address</th>
                      <th style={{padding: '0.75rem 0.5rem'}}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previousOrders.map(order => (
                      <tr key={order.id} style={styles.tableBodyRow}>
                        <td style={{padding: '0.75rem 0.5rem', fontSize: isMobile ? '0.8rem' : '0.95rem'}}>#{order.id}</td>
                        
                        {/* ITERATIVE MAPPING ON EXTRACTED NESTED ITEMS */}
                        <td style={{padding: '0.75rem 0.5rem', fontSize: '0.9rem', color: '#B4C6E4'}}>
                          <div style={{display:'flex', flexDirection:'column', gap:'2px'}}>
                            {order.order_items?.map((item, idx) => (
                              <span key={idx}>📦 {item.menu_items?.name} <strong style={{color:'#FF9F1C'}}>x{item.quantity}</strong></span>
                            )) || <span style={{color:'#555'}}>No data entries found</span>}
                          </div>
                        </td>

                        <td style={{padding: '0.75rem 0.5rem', fontSize: isMobile ? '0.8rem' : '0.95rem'}}>{new Date(order.created_at).toLocaleDateString()}</td>
                        <td style={{padding: '0.75rem 0.5rem', fontSize: isMobile ? '0.8rem' : '0.95rem'}}>Rs. {order.total_amount}</td>
                        <td style={{padding: '0.75rem 0.5rem', fontSize: isMobile ? '0.8rem' : '0.95rem', maxWidth: isMobile ? '80px' : 'none', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{order.delivery_address}</td>
                        <td style={{padding: '0.75rem 0.5rem'}}>
                          <span style={{ ...styles.statusCompletedBadge, color: order.status === 'completed' ? '#10B981' : order.status === 'pending' ? '#FF9F1C' : '#3B82F6', fontSize: isMobile ? '0.75rem' : '0.85rem' }}>
                            <CheckCircle size={12} /> {(order.status || 'pending').toUpperCase()}
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

      {/* VIEW 4: Admin Kitchen Control Panel Monitor */}
      {view === 'admin' && (
        <div style={{...styles.dashboardContainer, padding: isMobile ? '1.5rem 1rem' : styles.dashboardContainer.padding}}>
          <div style={{ ...styles.dashboardHeader, flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', gap: '1rem', textAlign: isMobile ? 'center' : 'left' }}>
            <h2>🧑‍🍳 Production Kitchen Control Board</h2>
            <button style={{...styles.btnRefreshAdmin, justifyContent:'center'}} onClick={fetchAllOrdersForKitchenMonitor}><RefreshCw size={14} /> Refresh Feed</button>
          </div>
          <div style={{ ...styles.adminGrid, gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(320px, 1fr))' }}>
            {adminOrders.length === 0 ? <p style={{gridColumn:'1/-1', textAlign:'center', color:'#8A99AD'}}>No active consumer order requests waiting inside index queues.</p> : adminOrders.map(order => (
              <div key={order.id} style={styles.adminCard}>
                <div style={styles.adminCardHeader}>
                  <span style={styles.orderNumber}>Order: #{order.id}</span>
                  <span style={order.status === 'completed' ? styles.statusCompletedBadge : order.status === 'pending' ? styles.statusPendingBadge : styles.statusPreparingBadge}>
                    {(order.status || 'pending').toUpperCase()}
                  </span>
                </div>
                <div style={styles.adminCardBody}>
                  <p><strong>Caller Name:</strong> {order.customers?.name || "Voice-Route Guest User"}</p>
                  <p><strong>Mobile Reference:</strong> {order.customers?.phone_number || "No contact digits"}</p>
                  <p><strong>Target Delivery Address:</strong> {order.delivery_address}</p>
                  
                  {/* ADMIN INTERACTION VIEW: Render the list of food ordered right inside the kitchen card */}
                  <div style={styles.adminBasketContainer}>
                    <h4 style={{margin:'0 0 0.5rem 0', color:'#FFF', display:'flex', alignItems:'center', gap:'4px'}}><ShoppingBag size={14} color="#FF9F1C" /> Kitchen Preparation Slip:</h4>
                    <ul style={{margin:0, paddingLeft:'1.2rem', color:'#F4F6FA', fontSize:'0.95rem'}}>
                      {order.order_items?.map((item, idx) => (
                        <li key={idx} style={{marginBottom:'3px'}}>
                          {item.menu_items?.name} — <strong style={{color:'#FF9F1C'}}>Qty: {item.quantity}</strong>
                        </li>
                      )) || <li style={{color:'#555'}}>No items registered</li>}
                    </ul>
                  </div>

                  <div style={styles.adminCardPriceRow}><strong>Invoiced Cost:</strong> <span>Rs. {order.total_amount}</span></div>
                  <div style={styles.dropdownStatusRow}>
                    <label style={{fontSize:'0.8rem', color:'#8A99AD'}}>Update Order Lifecycle State:</label>
                    <select value={order.status} onChange={(e) => handleUpdateOrderStatus(order.id, e.target.value)} style={styles.selectStatusBox}>
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

      {/* VIEW 5: Push-to-Talk Call Interface */}
      {view === 'call' && (
        <div style={{...styles.callLayoutWindow, padding: isMobile ? '1rem' : '2rem'}}>
          <div style={{ ...styles.callInterfaceBox, padding: isMobile ? '1.5rem' : '2.5rem', width: '100%', boxSizing: 'border-box' }}>
            
            <div style={styles.duplexStatusHeader}>
              <div style={{
                ...styles.duplexPulseCircle,
                backgroundColor: isRecording ? '#EF4444' : isAiTalking ? '#3B82F6' : '#10B981',
                boxShadow: isRecording ? '0 0 20px #EF4444' : isAiTalking ? '0 0 20px #3B82F6' : '0 0 20px #10B981',
                transform: (isRecording || isAiTalking) ? 'scale(1.1)' : 'scale(1)'
              }}>
                <Radio size={24} color="#FFF" />
              </div>
              <h2 style={{margin:'0', color:'#FFF', fontSize: '1.4rem'}}>
                {isRecording ? "Listening..." : isAiTalking ? "AI Transmitting" : "Ready to Speak"}
              </h2>
              <p style={{color:'#8A99AD', margin:'0', fontSize:'0.85rem'}}>HTTP Push-to-Talk Mode</p>
            </div>

            <div style={styles.viewportConversation}>
              <div style={styles.systemMessage}>Streaming Token: {sessionIdRef.current.substring(0,20)}...</div>
              <div style={{...styles.statusDisplay, fontSize: isMobile ? '1.05rem' : '1.2rem', color: isRecording ? '#EF4444' : isAiTalking ? '#3B82F6' : '#10B981'}}>
                System: <strong>{statusText}</strong>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
              <button 
                onMouseDown={startRecording}
                onMouseUp={stopRecording}
                onTouchStart={startRecording}
                onTouchEnd={stopRecording}
                style={{
                  ...styles.hugeHangUpButton, 
                  backgroundColor: isRecording ? '#DC2626' : '#3B82F6',
                  padding: '1.5rem 3rem',
                  borderRadius: '30px',
                  userSelect: 'none'
                }}
              >
                <Mic size={24} /> {isRecording ? "Release to Send" : "Hold to Speak"}
              </button>
              
              <button onClick={terminateCall} style={{...styles.navBtnLogout, border: 'none', marginTop: '1rem'}}>
                Exit Call Session
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}

// Global Layout CSS Style sheets Matrix
const styles = {
  appWrapper: { backgroundColor: '#0B0F19', color: '#F4F6FA', minHeight: '100vh', fontFamily: 'system-ui, sans-serif', width: '100%', overflowX: 'hidden' },
  navbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem max(1rem, (100vw - 1200px)/2)', backgroundColor: '#151D30', borderBottom: '1px solid #24324F', boxSizing: 'border-box' },
  navBrand: { fontSize: '1.25rem', fontWeight: '700', color: '#FF9F1C', cursor: 'pointer' },
  navLinks: { display: 'flex', alignItems: 'center', gap: '1rem' },
  navBtnGlass: { backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid #24324F', color: '#F4F6FA', padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' },
  navBtnLink: { background: 'none', border: 'none', color: '#8A99AD', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize:'0.95rem' },
  navBtnLogout: { backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#EF4444', padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' },
  userBadge: { fontSize: '0.85rem', color: '#8A99AD', backgroundColor: '#1E2942', padding: '0.4rem 0.8rem', borderRadius: '6px', textAlign:'center' },
  
  mainLayout: { padding: '2rem max(2rem, (100vw - 1200px)/2)', boxSizing: 'border-box', width: '100%' },
  heroBlock: { textAlign: 'center', padding: '5rem 1rem', background: 'radial-gradient(circle at center, #1a2540 0%, #0B0F19 100%)', borderRadius: '16px' },
  primaryCallBtn: { backgroundColor: '#FF9F1C', color: '#000', border: 'none', padding: '1rem 2.5rem', fontSize: '1.1rem', fontWeight: '600', borderRadius: '12px', cursor: 'pointer', marginTop: '2rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' },
  primaryCallBtnSmall: { backgroundColor: '#FF9F1C', color: '#000', border: 'none', padding: '0.5rem 1rem', fontSize: '0.9rem', fontWeight: '600', borderRadius: '8px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' },
  
  menuSection: { marginTop: '4rem', width: '100%' },
  menuGrid: { display: 'grid', gap: '2rem', marginTop: '2rem', width: '100%' },
  menuCard: { backgroundColor: '#151D30', border: '1px solid #24324F', padding: '1.5rem', borderRadius: '16px', position: 'relative', display: 'flex', flexDirection: 'column', boxSizing:'border-box', width: '100%' },
  cardTag: { position: 'absolute', top: '1rem', right: '1rem', fontSize: '0.85rem', backgroundColor: 'rgba(255,159,28,0.1)', color: '#FF9F1C', padding: '0.2rem 0.6rem', borderRadius: '4px', fontWeight:'600' },
  categoryLabel: { fontSize: '0.75rem', color: '#8A99AD', backgroundColor: '#1E2942', alignSelf: 'flex-start', padding: '0.15rem 0.5rem', borderRadius: '4px', marginTop: '0.25rem', fontWeight: '500' },
  cardDesc: { color: '#8A99AD', fontSize: '0.9rem', margin: '0.75rem 0 0', minHeight: '40px', overflow: 'hidden' },

  authViewport: { minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', width:'100%', boxSizing:'border-box' },
  authCard: { backgroundColor: '#151D30', border: '1px solid #24324F', padding: '2.5rem 1.5rem', borderRadius: '24px', width: '100%' },
  formElement: { display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '1.5rem' },
  formInput: { backgroundColor: '#0B0F19', border: '1px solid #24324F', color: '#F4F6FA', padding: '0.9rem 1rem', borderRadius: '10px', outline: 'none', fontSize: '1rem', boxSizing:'border-box', width:'100%' },
  formSubmitBtn: { backgroundColor: '#FF9F1C', color: '#000', border: 'none', padding: '1rem', fontWeight: '600', borderRadius: '10px', cursor: 'pointer', fontSize:'1rem' },
  switchAuthText: { color: '#8A99AD', fontSize: '0.9rem', textAlign: 'center', marginTop: '1.5rem', cursor: 'pointer' },

  dashboardContainer: { padding: '3rem max(2rem, (100vw - 1200px)/2)', boxSizing:'border-box', width: '100%' },
  dashboardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', borderBottom: '1px solid #24324F', paddingBottom: '1rem' },
  historySection: { backgroundColor: '#151D30', border: '1px solid #24324F', borderRadius: '16px', boxSizing:'border-box', width: '100%' },
  ordersTableWrapper: { overflowX: 'auto', marginTop: '1.5rem', width: '100%', WebkitOverflowScrolling: 'touch' },
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '600px' },
  tableHeaderRow: { borderBottom: '2px solid #24324F', color: '#8A99AD', fontSize: '0.9rem' },
  tableBodyRow: { borderBottom: '1px solid #24324F', fontSize: '0.95rem', color: '#F4F6FA' },
  statusCompletedBadge: { display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontWeight:'600' },

  btnRefreshAdmin: { backgroundColor: '#1E2942', border: '1px solid #24324F', color: '#F4F6FA', padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize:'0.85rem' },
  adminGrid: { display: 'grid', gap: '2rem', width: '100%' },
  adminCard: { backgroundColor: '#151D30', border: '1px solid #24324F', borderRadius: '18px', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxSizing:'border-box', width: '100%' },
  adminCardHeader: { display: 'flex', justifyContent: 'space-between', padding: '1rem 1.5rem', backgroundColor: '#1E2942', borderBottom: '1px solid #24324F', alignItems:'center', gap:'0.5rem' },
  orderNumber: { fontWeight: '700', fontSize:'0.9rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' },
  statusPendingBadge: { color: '#FF9F1C', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem', fontWeight:'600' },
  statusPreparingBadge: { color: '#3B82F6', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem', fontWeight:'600' },
  adminCardBody: { padding: '1.5rem', fontSize: '0.9rem', color: '#8A99AD', display: 'flex', flexDirection: 'column', gap: '0.6rem' },
  adminCardPriceRow: { borderTop: '1px solid #24324F', marginTop: '0.5rem', paddingTop: '0.75rem', color: '#F4F6FA', display: 'flex', justifyContent: 'space-between', fontSize: '1rem' },
  dropdownStatusRow: { display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '1rem', borderTop: '1px dashed #24324F', paddingTop: '1rem' },
  selectStatusBox: { backgroundColor: '#0B0F19', color: '#F4F6FA', border: '1px solid #24324F', padding: '0.6rem', borderRadius: '8px', outline: 'none' },
  
  adminBasketContainer: { backgroundColor: '#0B0F19', padding: '1rem', borderRadius: '10px', border: '1px solid #1E2942', marginTop: '0.25rem' },
  
  callLayoutWindow: { display: 'flex', justifyContent: 'center', width: '100%', boxSizing: 'border-box' },
  callInterfaceBox: { backgroundColor: '#151D30', border: '1px solid #24324F', borderRadius: '24px', display: 'flex', flexDirection: 'column', gap: '2rem', maxWidth: '600px', margin: '0 auto' },
  duplexStatusHeader: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', textAlign: 'center' },
  duplexPulseCircle: { width: '64px', height: '64px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.3s ease' },
  viewportConversation: { backgroundColor: '#0B0F19', padding: '1.5rem', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: '120px' },
  systemMessage: { color: '#8A99AD', fontSize: '0.85rem', fontFamily: 'monospace' },
  statusDisplay: { fontWeight: '500', transition: 'color 0.3s ease' },
  hugeHangUpButton: { color: '#FFF', border: 'none', fontSize: '1.2rem', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'all 0.2s ease' }
};
