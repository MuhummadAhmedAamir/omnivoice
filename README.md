# OmniVoice AI 🎙️🍔

OmniVoice AI is an enterprise-grade, low-latency, voice-driven virtual restaurant waiter designed to operate seamlessly on resource-constrained consumer hardware (optimized for an **8GB RAM** environment).

By leveraging a highly decoupled **Layered Architecture**, a persistent bidirectional **WebSocket pipeline**, and a cloud-managed **Supabase (PostgreSQL)** database, OmniVoice converts live microphone streams into structured relational database transactions in real time. The agent speaks with a natural, high-speed South Asian male English accent, eliminating the slow, mechanical drag typical of generic AI voice bots.

---

## 💻 Project Technical Stack

* **Frontend:** React (SPA Architecture), TailwindCSS, Native Browser MediaStream Recording API.
* **Backend:** FastAPI (Python), WebSockets, Asyncio, Supabase-py.
* **Database:** Supabase (PostgreSQL Cloud Instance).
* **AI Inference Engine (Local CPU):** `llama-cpp-python` (with 4-bit quantization) & `faster-whisper`.
* **AI Synthesis Engine (Cloud Neural Streams):** `edge-tts`.

---

## 🛠️ System Architecture & AI Core Approach

To avoid system lockups or memory thrashing on 8GB RAM hardware, OmniVoice separates static memory, speech recognition, logical deduction, and audio streaming into decoupled asynchronous domains.

```
+-----------------------------------------------------------------------------------+
|                                  REACT FRONTEND                                   |
+-----------------------------------------------------------------------------------+
|   Guest Page (Live Call)  |   Customer Dashboard   |      Admin Dashboard         |
+-----------------------------------------------------------------------------------+
          ^                              ^                         ^
          | (WebSocket Audio Chunks)     | (REST API / JWT)        | (Real-time Feed)
          v                              v                         v
+-----------------------------------------------------------------------------------+
|                                 FASTAPI BACKEND                                   |
+-----------------------------------------------------------------------------------+
|  Auth Router (JWT)  |  Admin Router  |  WebSocket Call Gateway (State Machine)    |
+-----------------------------------------------------------------------------------+
                                                 |
                +--------------------------------+--------------------------------+
                |                                |                                |
                v                                v                                v
+-------------------------------+ +-------------------------------+ +-------------------------------+
|       EARS LAYER (STT)        | |       BRAIN LAYER (LLM)       | |       VOICE LAYER (TTS)       |
+-------------------------------+ +-------------------------------+ +-------------------------------+
| Faster-Whisper (tiny.en)      | | Llama-3.2-1B (GGUF Q4_K_M)    | | Edge-TTS                      |
| * Local CPU Execution (int8)  | | * JSON Intent & Entity Parser | | * en-IN-PrabhatNeural (Fast)  |
+-------------------------------+ +-------------------------------+ +-------------------------------+
                                                 |
                                                 v
                                  +------------------------------+
                                  |    DATABASE SINK LAYER       |
                                  +------------------------------+
                                  | Supabase (PostgreSQL Cloud)  |
                                  +------------------------------+

```

### 1. Ears Layer (Speech-to-Text)

OmniVoice uses **Faster-Whisper** initialized with the **`tiny.en`** model weight (~75MB). Executing locally with `int8` quantization, it processes streaming audio frames instantaneously on a standard CPU. It utilizes an aggressive **Voice Activity Detection (VAD)** mathematical filter to ignore background kitchen noises and isolate user speech blocks.

### 2. Brain Layer (Large Language Model)

The system leverages **Llama-3.2-1B-Instruct** packed inside a 4-bit **`Q4_K_M GGUF`** container file. This tiny 700MB model executes logical reasoning operations in milliseconds on a standard Core i7 processor.

* **The Intent Parser:** Rather than outputting conversational prose, Llama is strictly system-prompted to yield a dual-layered structured object combining a hidden execution **JSON structure** and a customer-facing **Spoken Text** wrapper.

### 3. Voice Layer (Text-to-Speech)

To achieve conversational realism, the backend sends the generated text to **Edge-TTS** pointing to the **`en-IN-PrabhatNeural`** voice engine. This delivers an authentic South Asian male English accent. Crucially, the engine runs with a speed parameter modification of **`rate="+25%"`**, matching the real-world cadence of a fast-talking, hospitable hotline server.

### 4. Memory Optmization (The Context-Reduction Trick)

Appending a raw text chat log to an LLM's history array during a long call expands token allocation exponentially, causing CPU execution times to grind to a halt. **OmniVoice avoids this by treating Supabase as its long-term memory layer.** After every conversational exchange, the backend flushes the raw text history and reconstructs a concise, condensed state token wrapper injected into the system prompt:

```
Current Verified Database Cart: [2x Zinger Burger, 1x Coke]. 
User voice input text: "Make it two cokes please".

```

---

## 🗄️ Supabase Relational Database Schema

The cloud-managed database relies on specialized relational tables, custom PostgreSQL custom ENUM variants, and automatic cascades to handle operational lifecycles without local CPU overhead.

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

-- Individual Menu Items
CREATE TABLE menu_items (
    id SERIAL PRIMARY KEY,
    category_id INT REFERENCES categories(id) ON DELETE SET NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    price NUMERIC(10, 2) NOT NULL,
    is_available BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Item Modifiers (Add-ons)
CREATE TABLE item_modifiers (
    id SERIAL PRIMARY KEY,
    menu_item_id INT REFERENCES menu_items(id) ON DELETE CASCADE,
    modifier_name VARCHAR(100) NOT NULL,
    extra_price NUMERIC(10, 2) DEFAULT 0.00,
    is_available BOOLEAN DEFAULT TRUE
);

-- Promotional Offers / Combo Deals
CREATE TABLE deals (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    deal_price NUMERIC(10, 2) NOT NULL,
    start_date TIMESTAMP NOT NULL,
    end_date TIMESTAMP NOT NULL,
    is_active BOOLEAN DEFAULT TRUE
);

-- Mapping Items inside a Combo Deal
CREATE TABLE deal_items (
    id SERIAL PRIMARY KEY,
    deal_id INT REFERENCES deals(id) ON DELETE CASCADE,
    menu_item_id INT REFERENCES menu_items(id) ON DELETE CASCADE,
    quantity INT NOT NULL DEFAULT 1
);

-- Live Call State Machine Coordinator
CREATE TABLE sessions (
    id VARCHAR(255) PRIMARY KEY, -- Maps directly to active WebSocket Connection ID
    customer_id INT REFERENCES customers(id) ON DELETE SET NULL,
    current_step session_step DEFAULT 'welcome',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Main Master Orders Table
CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    customer_id INT REFERENCES customers(id) ON DELETE SET NULL,
    session_id VARCHAR(255) REFERENCES sessions(id) ON DELETE SET NULL,
    total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    status order_status DEFAULT 'pending',
    delivery_address TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Line Items Purchased inside an Order
CREATE TABLE order_items (
    id SERIAL PRIMARY KEY,
    order_id INT REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id INT REFERENCES menu_items(id) ON DELETE SET NULL, 
    deal_id INT REFERENCES deals(id) ON DELETE SET NULL,           
    quantity INT NOT NULL DEFAULT 1,
    price_at_purchase NUMERIC(10, 2) NOT NULL -- Protects structural calculations against future menu price modifications
);

-- Modifiers Chosen During Live Call
CREATE TABLE order_item_modifiers (
    id SERIAL PRIMARY KEY,
    order_item_id INT REFERENCES order_items(id) ON DELETE CASCADE,
    item_modifier_id INT REFERENCES item_modifiers(id) ON DELETE SET NULL,
    price_at_purchase NUMERIC(10, 2) NOT NULL
);

```

---

## ⚛️ React Frontend Implementation Architecture

The user interface uses client-side route shielding based on identity tokens.

```
                      +-----------------------+
                      |      Main Landing     |
                      |      Page Route       |
                      +-----------+-----------+
                                  |
               +------------------+------------------+
               |                                     |
    (If JWT Token Missing)                 (If Valid JWT Present)
               v                                     v
+------------------------------+      +------------------------------+
|          GUEST VIEW          |      |        CUSTOMER VIEW         |
+------------------------------+      +------------------------------+
| * Display General Menu       |      | * Load Profile Metadata      |
| * Public REST API Fetch      |      | * Query Relational History   |
| * "Call Waiter" (UUID Alloc) |      | * Auto-inject User Metadata  |
+------------------------------+      +------------------------------+
                                                     |
                                            (If User Has Admin Tag)
                                                     v
                                      +------------------------------+
                                      |          ADMIN VIEW          |
                                      +------------------------------+
                                      | * Supabase Realtime Channels |
                                      | * Auto-reactive Order Feed   |
                                      | * Status Step Update Actions |
                                      +------------------------------+

```

### 1. Guest View Mode (Unauthenticated)

* **Menu Interface:** Fetching data through clean asynchronous public GET endpoints straight from the Supabase REST extension table `menu_items`.
* **The Live Voice Stream Controller:** Contains a primary call interface button. Once triggered, it allocates a temporary local string UUID as `session_id`, gains permission to access hardware audio interfaces via the browser context, and creates a raw, persistent connection to the live voice loop:
```javascript
const ws = new WebSocket(`ws://localhost:8000/call/${sessionId}`);

```



### 2. Customer View Mode (Authenticated Dashboard)

* **Secure Access:** Activated upon passing credentials through phone number validation keys. On validation success, it persists a short-lived JSON Web Token (JWT) in browser memory.
* **Historical Data Ingestion:** Runs a complex relational database lookup request to gather all orders associated with the customer's ID, mapping lines from `orders`, `order_items`, and `menu_items` synchronously to populate a structured UI table showing order trends.
* **Metadata Auto-Injection:** If an authenticated customer initiates the live voice call button, the frontend automatically wraps the customer's cryptographic database ID and their mapped `default_delivery_address` inside the initial setup frame of the WebSocket message handshake. This skips the step of the virtual waiter having to awkwardly ask for an existing user's details.

### 3. Admin View Mode (The Kitchen Monitor Monitor)

* **Reactive Rendering Layer:** Restricted to users possessing explicit structural status authorization tags within the identity provider infrastructure.
* **Supabase Realtime Webhook Listeners:** Instead of executing continuous database polling loops (which degrades system performance), the admin page subscribes natively to active PostgreSQL change data logs via WebSocket notifications.
* **The Order Pipeline Pipeline Panel:** Rendered as a kanban-style production matrix layout interface. When the backend registers a successful audio-driven checkout transition, the record card flashes up inside the kitchen control board instantly. Kitchen staff can change status properties directly using point-and-click UI triggers that execute corresponding update commands against the cloud remote database engine.

---

## 📞 Detailed Asynchronous Voice State Flow Matrix

During an active voice transaction call session, the FastAPI backend listens dynamically to the state variables within `sessions.current_step` in order to change system prompting rules.

### 1. The `welcome` Step State

* **Audio Pipeline:** The client microphone streams binary audio buffers continuously at short intervals over the open WebSocket layer.
* **Processing Engine:** Faster-Whisper captures raw voice markers and extracts the text stream block. Llama reads the prompt and determines that the state variable equals `welcome`.
* **System Action:** The agent greets the user with local professional hospitality, captures the name parameters from the spoken audio text, writes it to a new session tracking row inside Supabase, and changes the field variable marker target to `ordering`.

### 2. The `ordering` Step State

* **Processing Engine:** Llama shifts into structural feature entity mode. It handles incoming conversational speech commands using specialized extraction prompts.
* **JSON Intent Transformation:** The structural output parsing script strictly converts natural speech commands into a standardized data model format:
```json
{
  "intent": "add_item",
  "items": [
    {"name": "Zinger Burger", "quantity": 2, "modifiers": ["Extra Cheese"]}
  ],
  "spoken_response": "Perfect Sir, adding two Zinger Burgers with extra cheese. Anything else, Sir?"
}

```


* **Database Synchronization Engine:** The backend loops through the derived JSON array objects, issues confirmation queries to checking availability against `menu_items`, pulls the correct pricing structures, updates `order_items` logs, and appends modifier additions inside the `order_item_modifiers` table under the active `session_id`.
* **Transition Flag:** When the user utters phrases like "that's all" or "checkout", the logic switches `sessions.current_step` to `address`.

### 3. The `address` Step State

* **Processing Engine:** The AI changes prompts to gather geographical distribution variables: *"Excellent choice Sir. What is the delivery address for this order?"*
* **Database Action:** The user's vocal location descriptions are captured by the STT engine, evaluated for semantic clarity, and populated directly into the parent column `orders.delivery_address`. The system shifts state properties directly into `confirming`.

### 4. The `confirming` Step State

* **Processing Engine:** The backend server queries Supabase, running a complete join transaction aggregation script to calculate the total order value across all sub-items and active contextual upcharge modifications.
* **Human-Voice Verbal Receipt Verification:** Llama is provided this structured summary string and repeats it back through Edge-TTS using clear accents and conversational filler indicators:
> *"Alright Sir, let me verify your complete order list. You have ordered two Zinger Burgers with extra cheese and one Coke. The grand total bill amount is exactly 1,220 Rupees, delivering to Lahore. Shall I finalize this order, Sir?"*


* **Transition Trigger:** If the microphone catches an affirmative response phrase, the backend changes the `orders.status` value to `pending` and advances the session step flag variables to `completed`.

### 5. The `completed` Step State

* **Processing Engine:** The system handles final transaction completion indicators and reads a warm parting signature phrase over the streaming WebSocket connection: *"Perfect Sir, your order is processing inside the kitchen right now. Have an exceptional day!"*
* **Pipeline Clean-Up Protocol:** The server drops the active WebSocket loop thread channel, releases all hardware connection points cleanly, and completely frees up any local RAM dependencies on the host machine.

---

## 🚀 Setup & Execution Manual

Follow these sequential onboarding procedures to spin up the local development environment on your machine.

### Prerequisites & Installations

1. Install **Python 3.11** or **Python 3.13** (Ensure you check "Add Python to Environment PATH variables" during execution).
2. Install **Node.js LTS Version**.
3. Enable **Windows Long Paths Support** by executing this script inside a PowerShell console run under administrative clearance permissions:
```powershell
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force

```



### 1. Model Preloading Procedures

* Create a root system project directory named `OmniVoice_AI`.
* Inside, establish the folder structures: `backend`, `frontend`, and `model_bins`.
* Inside `model_bins`, create a folder named `SST`.
* Download the model target file **`Llama-3.2-1B-Instruct-Q4_K_M.gguf`** from Hugging Face and place it under `model_bins/`.

### 2. Backend Initialization Sequence

* Navigate your terminal into the local `backend` directory.
* Install core dependencies and precompiled wheels optimized for execution loops over consumer CPU hardware processing paths:
```bash
pip install fastapi uvicorn faster-whisper edge-tts supabase
pip install llama-cpp-python --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cpu

```


* Create an entry configuration script file named `.env` and fill out your cloud access verification tokens extracted from your Supabase setup panel:
```env
SUPABASE_URL="https://your-project-id.supabase.co"
SUPABASE_KEY="your-anon-public-key"

```


* Fire up the backend engine thread listener:
```bash
uvicorn main:app --reload

```



### 3. Frontend Initialization Sequence

* Navigate your terminal workspace window into the `frontend` root.
* Initialize installation scripts to set up the package layer dependencies:
```bash
npm install
npm install @supabase/supabase-js react-router-dom lucide-react

```


* Launch the local dev UI engine browser layer server:
```bash
npm run dev

```
