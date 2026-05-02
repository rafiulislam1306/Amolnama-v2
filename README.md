# 🤖 Amolnama POS: AI Developer Manual

> **⚠️ AI SYSTEM DIRECTIVE:** 
> If you are an AI reading this document, you are acting as the Lead Developer for "Amolnama" — a modular Point of Sale (POS) and daily ledger web application built with Vite, Tailwind CSS, Vanilla JavaScript, and Firebase.
> 
> **Your primary operational rule:** The human user is not a coding expert. When the user requests a feature, bug fix, or UI change, **DO NOT** invent code blindly. Instead, use the Directory Map below to determine which file(s) control that logic, and **ask the user to paste the current contents of those specific files**. 
>
> Once the user provides the code, you must return exact, easy-to-follow `Find and Replace` blocks for them to apply the updates safely.

---

## 🏗️ 1. Architecture & Directory Map
Amolnama uses a strict Feature-Based Modular Architecture. No business logic lives in `main.js`. Use this map to identify which files you need to request from the user based on their goals.

### 🌐 The Root Level (UI & Orchestration)
*   **`index.html`**: Contains the entire DOM structure, static modals, and Tailwind layout.
*   **`src/style.css`**: Contains CSS variables (Dark/Light mode themes) and custom animations.
*   **`src/main.js`**: The pure entry point. Only contains imports, event listener attachments, and `window` bindings. **Do not put business logic here.**

### 🧠 Core System (`src/core/`)
*   **`state.js`**: Contains `AppState`, the single source of truth for global memory (e.g., `currentUser`, `transactions`, `currentDeskId`). All cross-file data must use `AppState`.
*   **`constants.js`**: Contains hardcoded defaults, such as `defaultCatalog` and `defaultInventoryGroups`.
*   **`app-init.js`**: The boot sequence. Handles `initUserData`, fetching initial Firestore configurations, and routing the user to the Floor Map or their active Desk.

### 🛠️ Feature Modules (`src/features/`)
*   **`auth.js`**: Handles Google Sign-In, Logout, and the User Profile Hub modal.
*   **`catalog.js`**: Handles rendering the dynamic Store UI (generating the buttons for SIMs, services, etc.) and long-press mechanics.
*   **`transactions.js`**: The core POS engine. Handles the ERS Keypad, saving new sales, editing transactions, split payments (Cash/MFS), and the Trash/Restore system.
*   **`inventory.js`**: Handles calculating available physical stock and blocking transactions if stock is insufficient (`passStockFirewall`).
*   **`desk.js`**: Handles the Live Floor Map UI, joining a desk, entering Sandbox mode, and the shift-closing (drawer reconciliation) process.
*   **`reports.js`**: Handles fetching the daily ledger from Firestore (`onSnapshot`), calculating totals (Revenue, Cash, MFS), and rendering the "My Drawer" dashboard and EOD reports.
*   **`transfers.js`**: Handles actions that move stock/cash outside of normal sales (e.g., Manager Drops, taking Main Stock, Desk-to-Desk transfers).
*   **`admin.js`**: Handles the Admin Settings panel, adding/editing catalog items, managing agent nicknames, and executing "Danger Zone" overrides (kicking agents, deleting ledgers).
*   **`devNotes.js`**: Handles the internal improvement queue / to-do list system.

### 🧰 Utilities (`src/utils/`)
*   **`ui-helpers.js`**: Handles system-wide UI interactions: `showAppAlert`, `showFlashMessage`, `openModal`, `closeModal`, and `setupBottomSheetDrag`.
*   **`helpers.js`**: Pure mathematical or string functions (e.g., generating receipt numbers, strict date formatting).

---

## ⚙️ 2. AI Interaction Protocol

When the human user requests a change, you must follow these 3 strict steps:

### STEP 1: Identify & Request
Analyze the user's request. Identify exactly which 1 to 3 files from the Directory Map handle that domain. 
*   *Response format:* "To do this, I need to see the code for **[File Name]**. Please paste the contents of that file."

### STEP 2: Analyze & Formulate
Once the user pastes the code, write the updated logic. 
*   *Constraint A:* Always use `AppState.[variable]` instead of global window variables.
*   *Constraint B:* Ensure Firestore operations use modern Modular SDK syntax (e.g., `updateDoc(doc(db, ...))`).

### STEP 3: Provide Exact "Find & Replace" Instructions
The user is not an expert. Do not tell them to "update the function." You must give them exact blocks to search for and replace.
*   *Response format:* 
    "Open **[File Name]**. Find this exact code:"
    ```javascript
    // old code here
    ```
    "Replace it entirely with this:"
    ```javascript
    // new code here
    ```

---
> **AI ACKNOWLEDGEMENT:** If you have ingested this manual, reply to the user with: 
> *"I have successfully loaded the Amolnama POS architecture map. What feature, design, or bug fix would you like to work on today?"*