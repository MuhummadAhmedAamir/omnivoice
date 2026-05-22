# OmniVoice AI 🎙️🍔

OmniVoice AI is an enterprise-grade, low-latency, voice-driven virtual restaurant cashier system. By leveraging a highly decoupled architecture, an **HTTP Push-to-Talk (PTT) audio processing pipeline**, and a direct-to-client **Supabase (PostgreSQL)** database interface, OmniVoice converts live microphone recordings into structured relational database entries with zero input typing required.

The system is optimized for instantaneous turn-based interactions, routing voice data through high-speed cloud inference infrastructure to maintain sub-second response cadences without requiring heavy local hardware resources.

---

## 💻 Project Technical Stack

* **Frontend:** React (SPA Architecture), Lucide React (Icon System), Native Browser MediaStream Recording API, Supabase JS Client SDK.
* **Backend Framework:** FastAPI / Python (Exposed via secure `ngrok` HTTP tunneling).
* **Database & Persistence:** Supabase Cloud Instance (PostgreSQL with relational cascades).
* **Speech-to-Text Engine:** Whisper Large V3 (Cloud API execution via Groq).
* **Conversational Reasoning Engine:** LLaMA 3.1 8B Instant (Cloud API execution via Groq).
* **Audio Synthesis Engine:** Microsoft Edge Neural TTS Streams (`edge-tts`).

---

## 🛠️ System Architecture & AI Core Approach

To eliminate local compute boundaries, OmniVoice offloads all acoustic, cognitive, and vocal synthesis processes to cloud-managed API layers. The backend serves purely as a stateless orchestration gateway.

```
+---------------------------------------------------------------------------------------+
|                                     REACT FRONTEND                                    |
+---------------------------------------------------------------------------------------+
| Landing (Menu) | Auth (Login/Reg) | Client Dashboard | Kitchen Panel | PTT Call Interface |
+---------------------------------------------------------------------------------------+
        |                  |                 |                |                 ▲
        | (Direct Fetch)   | (Direct Auth)   | (Direct Fetch) | (Direct Update) |
        v                  v                 v                v                 |
+-------------------------------------------------------------------------------+ |
|                           SUPABASE CLOUD DATABASE                             | |
+-------------------------------------------------------------------------------+ |
|   menu_items   |     customers     |     orders     |   order_items   |       | |
+-------------------------------------------------------------------------------+ |
                                                                                | |
                                                   (POST WebM Binary Payload)   | |
                                                                                v |
                                                +-------------------------------+ |
                                                |  FASTAPI BACKEND MIDDLEWARE   | |
                                                +-------------------------------+ |
                                                |     /process-voice Router     | |
                                                +-------------------------------+ |
                                                                |                 |
                                        +-----------------------+-------+         |
                                        |                               |         |
                                        v                               v         |
                        +-------------------------------+ +-----------------------+-----+
                        |     STT & BRAIN (GROQ API)    | |   VOICE LAYER (TTS)   |
                        +-------------------------------+ +-----------------------+-----+
                        | * Whisper Large V3 (STT)      | | * edge-tts Stream     |
                        | * LLaMA 3.1 8B Instant (LLM)  | | * en-IN-PrabhatNeural |
                        +-------------------------------+ +-----------------------+-----+

```

### 1. Ears Layer (Speech-to-Text)

When the client engages the Push-to-Talk button, the frontend records human speech and transmits a unified `audio/webm` file binary payload over HTTP. The backend captures this file stream and immediately pipes it to the Groq Cloud API running **Whisper Large V3**, returning a precise text transcript within milliseconds.

### 2. Brain Layer (Large Language Model Inference)

The text transcription is fed to **LLaMA 3.1 8B Instant** via the Groq engine. The system passes context-injected prompts along with unique tracking session IDs to keep state boundaries stable. The model resolves order intent, validates structured variables, and maps conversational requests down to explicit database parameters.

### 3. Voice Layer (Text-to-Speech Synthesis)

The logical text response from the LLM is processed by the **`edge-tts`** Python asynchronous library, passing instructions to the high-cadence **`en-IN-PrabhatNeural`** voice engine. This synthesizes a natural, clear South Asian English voice. The raw MP3 streaming bytes are passed directly back through the initial HTTP response thread to the browser client.

---

## 🗄️ Supabase Relational Database Schema

The system uses a relational PostgreSQL schema hosted on Supabase. The React frontend interacts directly with these tables using the client-side SDK for CRUD operations, while the backend mutates state variables during active call processing.

```sql
CREATE TYPE session_step AS ENUM ('welcome', 'ordering', 'address', 'confirming', 'completed');
CREATE TYPE order_status AS ENUM ('pending', 'preparing', 'dispatched', 'completed', 'cancelled');

-- Identity Layer
CREATE TABLE customers (
    id SERIAL PRIMARY KEY,
    phone_number VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    default_delivery_address TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Menu Categories
CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT
);

-- Individual Menu Items (Queried directly by Frontend)
CREATE TABLE menu_items (
    id SERIAL PRIMARY KEY,
    category_id INT REFERENCES categories(id) ON DELETE SET NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    price NUMERIC(10, 2) NOT NULL,
    is_available BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Live Call State Machine Coordinator
CREATE TABLE sessions (
    id VARCHAR(255) PRIMARY KEY, -- Maps directly to client-generated session tracking hashes
    customer_id INT REFERENCES customers(id) ON DELETE SET NULL,
    current_step session_step DEFAULT 'welcome',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Main Master Orders Table
CREATE TABLE orders (
    id VARCHAR(255) PRIMARY KEY, -- Supports structured UUID tracking strings
    customer_id INT REFERENCES customers(id) ON DELETE SET NULL,
    total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    status order_status DEFAULT 'pending',
    delivery_address TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Line Items Purchased inside an Order
CREATE TABLE order_items (
    id SERIAL PRIMARY KEY,
    order_id VARCHAR(255) REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id INT REFERENCES menu_items(id) ON DELETE SET NULL,   
    quantity INT NOT NULL DEFAULT 1,
    price_at_purchase NUMERIC(10, 2) NOT NULL
);

```

---

## ⚛️ React Frontend Implementation Architecture

The interface uses React internal functional hooks (`useState`, `useRef`, `useEffect`) to drive state transitions across distinct user views:

### 1. View: Landing & Public Catalog

* **Dynamic Fetching:** On application mount, the client triggers an direct call to the Supabase client:
```javascript
supabase.from('menu_items').select('*').eq('is_available', true);

```


This renders the dynamic menu catalog across a scannable grid layout view.
* **Session Initialization:** When a user launches the voice call view, a unique, randomized local interaction token hash string is generated:
```javascript
sessionIdRef.current = "session_" + Math.random().toString(36).substring(2, 15);

```



### 2. View: Secure Authorization Terminal

* **Dual Mode Authentication:** Toggles between `login` and `register` form handling blocks.
* **Direct Validation Routing:** Validates entries directly against the `customers` database mapping layers:
```javascript
supabase.from('customers').select('*').eq('phone_number', loginForm.phone).eq('password_hash', loginForm.password).single();

```


* **Role Separation Switching:** If user validation credentials match administrative flags (`phone_number === "admin"` or `id === 1`), the interface automatically routes permissions to the **Kitchen Panel View**. Standard matching keys load the regular **Customer Dashboard View**.

### 3. View: Customer Invoicing Dashboard

* **Historical Ingestion Query:** Performs a descending, indexed historical fetch to populate the client's order trends directly into a scannable UI data table layout:
```javascript
supabase.from('orders').select('*').eq('customer_id', customerId).order('created_at', { ascending: false });

```



### 4. View: Production Kitchen Control Board

* **Aggregated Foreign Key Resolution:** Pulls a unified dataset using PostgreSQL relational joins to fetch master order steps paired along with client names and mobile phone digits:
```javascript
supabase.from('orders').select(`id, total_amount, status, delivery_address, created_at, customer_id, customers ( name, phone_number )`);

```


* **Direct Lifecycle Mutations:** Kitchen workers modify state dropdown attributes, triggering an internal update query block that cascades changes out to the remote cluster instantly:
```javascript
supabase.from('orders').update({ status: newStatus }).eq('id', orderId);

```



### 5. View: Push-to-Talk Call Interface (Core Voice Core Engine)

* **Hardware Capture Loop:** Uses browser-native media capture streams. Holding down the button mounts raw data chunks to memory arrays without triggering reactive layout redraw cycles:
```javascript
mediaRecorderRef.current.ondataavailable = (event) => { if (event.data.size > 0) audioChunksRef.current.push(event.data); };

```


* **Interruption Handling:** If the client initiates a brand-new recording session while the AI speaker layer is currently transmitting audio output, an explicit reference handler intercepts execution to silence the active voice player instantly:
```javascript
if (activeAudioPlayerRef.current) { activeAudioPlayerRef.current.pause(); setIsAiTalking(false); }

```


* **Binary Processing Dispatches:** On trigger release, the backend receives a unified `FormData` multi-part construction carrying the audio binary blob, the `session_id`, and any verified active `customer_id` keys.
* **HTML5 Playback Orchestration:** The incoming HTTP audio byte array response is localized using clean internal browser URL memory links and executed instantly:
```javascript
const audioUrl = URL.createObjectURL(responseBlob);
const audio = new Audio(audioUrl);
audio.play();

```



---

## 📞 Detailed Asynchronous Voice State Flow Matrix

```
[User Audio Record] ---> (POST /process-voice) ---> [Groq STT Inference]
                                                              |
                                                              v
[HTTP Response Out] <--- [Edge TTS Stream] <--- [Groq LLaMA Context Engine]

```

1. **The Inbound Request Frame:** The user holds down the Mic button, speaks an order command (e.g., *"Add two Zinger Burgers"*), and releases the button. The WebM audio binary drops directly into the backend `/process-voice` endpoint.
2. **Context Enrichment Lookup:** The backend server intercepts incoming parameters, reads the tracking session identification keys, checks current data rows inside the database tables, and bundles active menu details together inside the instruction prompts.
3. **The Semantic Evaluation Turn:** LLaMA parses intent. If items are successfully added, the script processes order calculations, computes costs against actual menu prices, commits new line mappings to tracking rows, and builds an acknowledgment response string.
4. **Vocal Synthesis Streaming:** The final output string passes to Edge-TTS. The system packages generated audio directly into the HTTP response stream body, instantly returning it to the frontend client to transition the state interface parameters out from processing modes back into ready configurations.
5. **Session Cleanup Terminal:** Closing out or exiting the call workspace drops tracking references from client memory caches, ensuring zero runtime footprint remains active on the host machine.

---

## 🚀 Setup & Execution Manual

Follow this layout sequence to initialize both backend and frontend layers locally.

### 1. Backend Service Initialization

* Ensure Python 3.10+ is installed on the hosting environment.
* Establish a standard isolated environment and run terminal installations to load mandatory library wheels:
```bash
pip install fastapi uvicorn edge-tts supabase groq python-multipart

```


* Configure the local `.env` setup file inside the root directory to store endpoint authorization variables:
```env
GROQ_API_KEY="your_groq_api_key_string"
SUPABASE_URL="https://your_project_id.supabase.co"
SUPABASE_KEY="your_anon_public_key_string"

```


* Launch the backend server architecture thread under Uvicorn configuration boundaries:
```bash
uvicorn main:app --reload --port 8000

```


* Use an **ngrok** configuration to tunnel your local port safely into a secure public HTTPS gateway matching the endpoint declaration used inside the frontend:
```bash
ngrok http 8000

```



### 2. Frontend Interface Initialization

* Navigate into the frontend package directory workspace.
* Verify your local `supabaseclient.js` initialization script accurately matches your target database access references.
* Update the `BACKEND_URL` variable constant string found within `VoiceOrderComponent.jsx` to map directly to your live active ngrok deployment tunnel hash:
```javascript
const BACKEND_URL = "https://your-active-ngrok-subdomain.ngrok-free.dev";

```


* Initialize package configurations and boot up the development compilation engine:
```bash
npm install
npm run dev

```
