# 🤖 Amolnama POS: AI Developer Manual
**Version:** 2.0 | **Last Updated:** Session 2

> **⚠️ AI SYSTEM DIRECTIVE:**
> You are acting as the Lead Developer for **Amolnama** — a modular Point of Sale (POS) and daily ledger web application built with **Vite, Tailwind CSS, Vanilla JavaScript, and Firebase Firestore**.
>
> The human user is **not a coding expert.** Your job is to make changes safely, completely, and without breaking anything.
>
> **Before every session:** The user will give you this README. Read it fully before doing anything.
> **After every session:** Check if anything changed (new file, new function, new pattern, deleted file). If yes, provide an updated README section for the user to paste in.

---

## 📋 Table of Contents
1. [Architecture & Directory Map](#1-architecture--directory-map)
2. [Key Functions Reference](#2-key-functions-reference)
3. [AI Interaction Protocol](#3-ai-interaction-protocol)
4. [Critical Patterns & Rules](#4-critical-patterns--rules)
5. [Debug & Audit Mode](#5-debug--audit-mode)
6. [README Maintenance](#6-readme-maintenance)
7. [Git Commit Protocol](#7-git-commit-protocol)

---

## 1. Architecture & Directory Map

Amolnama uses a **strict Feature-Based Modular Architecture**. No business logic lives in `main.js`. Every feature has its own file. Use this map to identify which files to request before making any change.

---

### 🌐 Root Level (UI & Orchestration)

| File | Responsibility |
|------|---------------|
| `index.html` | Entire DOM structure, all static modals, tab layout, bottom nav, all HTML containers |
| `src/style.css` | CSS variables for Dark/Light mode themes, animations, component classes |
| `src/main.js` | Entry point only — imports, `window.*` bindings, `switchTab`, `toggleMFS`, auth listener |

---

### 🧠 Core System (`src/core/`)

| File | Responsibility |
|------|---------------|
| `state.js` | `AppState` object (single source of truth) and `resetAppState()` for clearing session data securely |
| `constants.js` | `defaultCatalog` and `defaultInventoryGroups` — hardcoded defaults used on first boot |
| `app-init.js` | Boot sequence — `initUserData`, fetches Firestore config, routes user to floor map or active desk |

---

### 🛠️ Feature Modules (`src/features/`)

| File | Responsibility |
|------|---------------|
| `auth.js` | Google Sign-In, Logout, Profile Hub modal |
| `catalog.js` | Renders Store tab UI — generates product buttons, handles tap and long-press |
| `transactions.js` | Core POS engine — ERS keypad, saving sales, editing, split payments, trash/restore |
| `inventory.js` | Stock calculation, `passStockFirewall` (blocks sale if stock too low), `switchStoreCategory` |
| `desk.js` | Floor map, joining/opening a desk, Sandbox mode, shift closing (reconciliation) |
| `reports.js` | Fetches ledger from Firestore (`onSnapshot`), renders Drawer dashboard and personal report |
| `transfers.js` | Cash actions (manager drop, float), main stock in/out, desk-to-desk transfers |
| `admin.js` | Admin panel — catalog editor, nickname manager, user management, danger zone, audit logs, CSV export |
| `devNotes.js` | Improvement queue — add, edit, toggle, delete notes; syncs to Firestore under user doc |
| `pwa.js` | Service worker registration, PWA install prompt, update notification |

---

### 🧰 Utilities (`src/utils/`)

| File | Responsibility |
|------|---------------|
| `ui-helpers.js` | `showAppAlert`, `showFlashMessage`, `openModal`, `closeModal`, `showTooltip`, `initNetworkStatus`, `setupBottomSheetDrag` |
| `helpers.js` | `getStrictDate()`, `formatToGBDate()`, `generateReceiptNo()` — pure utility functions, no side effects |

---

## 2. Key Functions Reference

Use this section to identify exactly which function controls a feature — so you request only the right file.

---

### `src/main.js`
- `switchTab(tabId, title)` — switches visible tab, calls render functions for store/desk/floor
- `toggleMFS()` — toggles Cash/MFS payment mode in Store tab
- All `window.*` bindings — every function callable from HTML `onclick` must be bound here

---

### `src/core/app-init.js`
- `initUserData(onComplete)` — full boot: fetches user doc, global catalog, routes to desk or floor map
- `updateCurrencyUI()` — updates currency label across UI

---

### `src/features/auth.js`
- `initAuth(onLoginSuccess, onLogout)` — sets up Firebase auth state listener
- `signInWithGoogle()` — triggers Google popup sign-in
- `logout()` — signs out and reloads page
- `openProfileHub()` — opens profile bottom sheet modal

---

### `src/features/catalog.js`
- `renderAppUI()` — clears and re-renders all Store tab product buttons from `AppState.globalCatalog`

---

### `src/features/inventory.js`
- `getPhysicalItems()` — returns `AppState.globalInventoryGroups` array
- `getInventoryChange(tx)` — calculates stock delta for a transaction (+/-)
- `getAvailableStock(itemName)` — calculates live stock using opening inventory + session transactions
- `passStockFirewall(itemName, qty)` — blocks sale if insufficient stock, shows alert
- `switchStoreCategory(catId, btn)` — shows/hides store category groups, updates pill buttons

---

### `src/features/transactions.js`
- `ersKeyPress(num)`, `ersBackspace()`, `saveErs(method)` — ERS keypad logic
- `selectItem(name, price)` — opens quantity modal for long-press
- `instantSaveItem(name, price)` — saves 1x item on tap
- `saveQuantity()` — saves from quantity modal
- `addTransactionToCloud(...)` — core transaction saver, handles Firestore + sandbox
- `openEditTx(id)`, `saveTxEdit()`, `cancelTxEdit()` — edit transaction modal
- `toggleEditSplitFields()`, `updateSplitTotal()`, `autoCalcEditTotal()` — split payment helpers
- `deleteTransaction(docId, localId)` — soft delete (moves to trash)
- `openTrash()`, `renderTrash()`, `restoreTx()`, `permanentlyDeleteTx()`, `emptyTrash()` — trash system
- `showAuditTrail(txId)` — shows edit/delete history for a transaction

---

### `src/features/desk.js`
- `performLazyAutoClose()` — auto-closes desks from previous days on boot
- `loadFloorMap()` — loads desk selection screen from Firestore
- `handleDeskSelect(deskId, deskName, status, sessionId)` — joins open desk or opens new desk flow
- `confirmOpenDesk()` — finalizes opening a desk, saves session to Firestore
- `renderLiveFloorTab()` — renders live floor map with all active desks
- `openMyDeskDashboard()` — navigates to current user's drawer tab
- `peekAtDesk(deskId, deskName)` — views another agent's desk (read-only)
- `handleMyDrawerNav()` — Drawer nav button handler; routes to desk or floor map
- `initiateCloseDesk()` — builds and opens shift closing modal
- `submitClosingReport()` — saves closing report to Firestore, frees desk

---

### `src/features/reports.js`
- `renderPersonalReport()` — renders Report tab: stats, items sold, activity log
- `renderDeskDashboard(targetDeskId)` — renders Drawer tab: cash formula, stock, ledger
- `generateDashboardHTML(...)` — builds the HTML for the drawer dashboard cards
- `fetchTransactionsForDate()` — sets up Firestore `onSnapshot` listener, populates `AppState.transactions`
- `shareReport()`, `shareDeskReport()` — generates and shares/copies text report
- `buildLifecycleText(txList, openingInv)` — builds inventory lifecycle text for share report
- `fallbackCopy(text)` — clipboard fallback for older browsers
- `getTxListenerUnsubscribe()`, `setTxListenerUnsubscribe(val)` — manages real-time listener lifecycle
- `downloadReportAsPDF(containerId, prefix)` — converts the tab HTML into a standard, formatted PDF while hiding UI elements

---

### `src/features/transfers.js`
- `openManagerCashModal()`, `saveManagerCash()` — cash drop / float / expense actions
- `openMainStockModal()`, `saveMainStock()` — receive physical stock from main center
- `openReturnStockModal()`, `saveReturnStock()` — return stock to main center
- `openDeskTransfer()`, `executeDeskTransfer()` — send stock to another active desk
- `openTransferModal(deskId, sessionId, name)`, `executeTransfer()` — admin-initiated transfer from floor map

---

### `src/features/admin.js`
- `openSettings()` — opens admin panel, renders catalog and inventory editor
- `saveSettings()` — publishes catalog changes to Firestore
- `filterAdminCatalog()` — search filter for catalog list
- `toggleAddForm()` — shows/hides new item form
- `addNewItem()` — adds item to local catalog (needs Save to publish)
- `removeRow(btn)` — marks item as deleted in admin UI
- `addInventoryGroup()`, `removeInventoryGroup(index)` — manage physical SKU list
- `renderInventoryGroupsAdmin()` — re-renders SKU chips in admin panel
- `openNicknameManager()`, `saveAdminNickname(uid, inputId)` — manage agent nicknames
- `renderUserManagementAdmin()` — renders active agents list in admin panel
- `kickAgent(uid)` — removes agent from desk without deleting data
- `nukeAgent(uid, name)` — kicks agent AND deletes all their transactions today
- `resetMyDeskLock()` — releases current user's desk assignment
- `forceCloseAllDesks()` — emergency close all desks
- `nukeTodaysLedger()` — permanently deletes today's entire ledger
- `fixPastManagerDrops()` — data repair tool for legacy 0 Tk drops
- `exportLedgerCSV()` — downloads today's transactions as CSV
- `openAuditModal()`, `fetchAuditLogs()` — historical EOD audit viewer
- `openForceReallocate()`, `executeForceTransfer()` — admin emergency stock reallocation

---

### `src/features/devNotes.js`
- `openDevNotes()` — opens improvement queue modal
- `renderDevNotes()` — renders sorted note list
- `addDevNote()` — adds new note and syncs to Firestore
- `editDevNote(id)`, `cancelInlineEdit()`, `saveInlineEdit(id)` — inline edit flow
- `toggleDevNote(id)` — marks note pending/resolved
- `deleteDevNote(id)` — removes note permanently
- `syncDevNotes()` — saves `AppState.devNotesQueue` to Firestore user doc

---

### `src/features/pwa.js`
- `initPWA()` — registers service worker, handles install prompt, handles update notification

---

### `src/utils/ui-helpers.js`
- `showAppAlert(title, msg, isConfirm, callback, confirmText)` — modal alert/confirm dialog
- `executeAlertConfirm()` — fires the confirm callback from alert modal
- `showFlashMessage(text)` — bottom toast notification
- `openModal(id)`, `closeModal(id)` — show/hide modal overlays
- `showTooltip(element, text)` — mobile-friendly tooltip on tap
- `initNetworkStatus()` — shows/hides offline banner
- `setupBottomSheetDrag()` — attaches drag-to-close physics on all `.bottom-sheet` elements

---

### `src/utils/helpers.js`
- `getStrictDate()` — returns today as `DD/MM/YYYY` string (local time, Bangladesh-safe)
- `formatToGBDate(iso)` — converts `YYYY-MM-DD` picker value to `DD/MM/YYYY`
- `generateReceiptNo()` — generates unique receipt number like `TXN-0405-A3X1`

---

## 3. AI Interaction Protocol

When the user requests a change, follow these steps in order. Do not skip steps.

---

### STEP 1 — Understand the Request
Read the request carefully. Identify:
- Which **feature** is being changed (UI, logic, data, styling)
- Which **files** from the Directory Map own that feature
- Whether you need 1 file or multiple files

If the request is **vague or ambiguous**, ask one focused clarifying question before proceeding.

---

### STEP 2 — Request the Right Files
Always ask for files before writing code. Do not write code based on memory alone — the codebase may have changed.

**How many files to request:**
- Simple UI text change → usually just `index.html`
- Logic change → usually 1-2 feature files
- New feature → may need 2-3 files plus `main.js`
- Bug fix → request the file where the bug lives plus any file it calls

**Response format:**
> "To do this, I need to see the current code for **[filename]**. Please paste its contents."

Request files one at a time if the second file depends on what you see in the first.

---

### STEP 3 — Analyze Before Writing
Once files are pasted:
- Read the full file, not just the relevant function
- Check for dependencies (what does this function call? what calls it?)
- Confirm your change won't break adjacent logic

---

### STEP 4 — Provide Exact Find & Replace Instructions
The user is not a coding expert. Never say "update the function" or "modify this section."

Always give word-for-word blocks:

> Open **[filename]**. Find this exact code:
> ```javascript
> // old code
> ```
> Replace it with:
> ```javascript
> // new code
> ```

If multiple files need changes, list them one by one in the correct order.

---

### STEP 5 — Confirm Completeness
After giving the fix, confirm:
- Which files were changed
- What the change does
- Whether any related files also need updating (even if not changed this session)

---

## 4. Critical Patterns & Rules

These are non-negotiable rules derived from how this codebase works. Violating them causes silent failures or crashes.

---

### 🔴 Rule 1: Always Use `window.*` for Cross-Module Calls in `main.js`

In `main.js`, all functions from other modules are bound to `window`:
```javascript
window.renderDeskDashboard = renderDeskDashboard;
window.renderAppUI = renderAppUI;
```

When calling these functions from **inside `main.js`** (e.g. inside `switchTab`), always use `window.functionName()`:

```javascript
// ✅ CORRECT
if (typeof window.renderDeskDashboard === 'function') window.renderDeskDashboard();

// ❌ WRONG — will silently fail, function not in local scope
if (typeof renderDeskDashboard === 'function') renderDeskDashboard();
```

Any new function added to a feature file that needs to be called from `index.html` or `main.js` must be:
1. Exported from its feature file
2. Imported in `main.js`
3. Bound to `window` in `main.js`

---

### 🔴 Rule 2: Always Use `AppState.*` for Shared Data

Never use bare global variables. All shared state lives in `AppState` (defined in `src/core/state.js`):

```javascript
// ✅ CORRECT
AppState.currentDeskId
AppState.transactions
AppState.globalCatalog

// ❌ WRONG
window.currentDeskId
let transactions = []
```

---

### 🔴 Rule 3: Always Use Modular Firestore SDK Syntax

```javascript
// ✅ CORRECT
import { doc, updateDoc } from "firebase/firestore";
await updateDoc(doc(db, 'collection', 'docId'), { field: value });

// ❌ WRONG — legacy v8 syntax, will crash
db.collection('collection').doc('docId').update({ field: value });
```

---

### 🔴 Rule 4: Date Formatting — Use Local Time, Not UTC

The app uses `DD/MM/YYYY` format via `getStrictDate()` which uses **local device time**.

Never use `new Date().toISOString()` for date comparisons — it returns UTC time, which is 6 hours behind Bangladesh Standard Time and will cause wrong-date bugs between midnight and 6am.

```javascript
// ✅ CORRECT — uses local time
import { getStrictDate } from '../utils/helpers.js';
const today = getStrictDate(); // "04/05/2026"

// ❌ WRONG — UTC, causes midnight bug in Bangladesh
new Date().toISOString().split('T')[0] // "2026-05-04" but potentially yesterday
```

---

### 🟡 Rule 5: `renderAppUI()` Must Be Called After Catalog Changes

The Store tab does not auto-refresh. Any time `AppState.globalCatalog` is modified, call:
```javascript
if (typeof window.renderAppUI === 'function') window.renderAppUI();
```

---

### 🟡 Rule 6: New `window.*` Bindings Go in `main.js` Only

If you create a new function that needs to be called from HTML `onclick` attributes, it must be bound in `main.js`. Do not bind functions to `window` from inside feature files.

---

### 🟡 Rule 7: Sandbox Mode Must Be Handled Separately

Many functions check `AppState.currentDeskId === 'sandbox'` and use local `AppState` instead of Firestore. Any new transaction-saving logic must include a sandbox branch:

```javascript
if (AppState.currentDeskId === 'sandbox') {
    // local only, no Firestore
    return;
}
// Firestore logic below
```

---

## 5. Debug & Audit Mode

If the user wants to find a bug, check why something isn't working, or audit the full codebase, follow this protocol.

---

### When the user says things like:
- "something is broken"
- "X feature isn't working"
- "check if everything is fine"
- "audit the code"
- "why is X happening"

### Do this:

**First, ask:**
> "Do you want me to:
> **(A)** Debug a specific issue — tell me what's happening and I'll identify which file to check
> **(B)** Full audit — you paste all relevant files and I'll review everything for bugs, dead code, and inconsistencies"

---

### For Option A (Targeted Debug):
1. Ask the user to describe what they see vs what they expect
2. Use the Directory Map to identify 1-2 suspect files
3. Ask the user to paste those files
4. Diagnose and provide a fix using the Find & Replace format

---

### For Option B (Full Audit):
Ask the user to paste files in this order:
1. `src/core/state.js`
2. `src/core/constants.js`
3. `src/core/app-init.js`
4. `src/features/auth.js`
5. `src/features/catalog.js`
6. `src/features/inventory.js`
7. `src/features/transactions.js`
8. `src/features/transfers.js`
9. `src/features/desk.js`
10. `src/features/reports.js`
11. `src/features/admin.js`
12. `src/features/devNotes.js`
13. `src/features/pwa.js`
14. `src/utils/ui-helpers.js`
15. `src/utils/helpers.js`
16. `index.html`
17. `src/main.js`

After reviewing all files, produce a report with:
- 🔴 Critical bugs (will crash or produce wrong data)
- ⚠️ Minor issues (dead code, edge cases, inconsistencies)
- ✅ Files that are clean

---

## 6. README Maintenance

**This README must stay in sync with the codebase.**

---

### At the End of Every Session:

After completing any change, the AI must check:

1. **New file created?** → Add it to the Directory Map and Key Functions Reference
2. **File deleted?** → Remove it from both sections
3. **New function added?** → Add it under the correct file in Key Functions Reference
4. **Function renamed or removed?** → Update Key Functions Reference
5. **New pattern or rule discovered?** → Add it to Critical Patterns & Rules
6. **New `window.*` binding added?** → Note it under `main.js` in Key Functions Reference

**Then say:**
> "README update needed. Here is the section to update:"
> *(provide the exact updated block for the user to paste in)*

---

### How the User Updates the README:
The user will paste the provided block into the correct section of this file and save it. The updated README is then used at the start of the next session.

---

## 7. Git Commit Protocol

At the end of every session **where actual code was changed**, the AI must provide a one-line commit summary for the user to paste into GitHub Desktop.

---

### Rules:
- Only provide a commit summary if at least one code file was changed this session
- If the session was discussion only (no files edited), do not provide a commit summary
- README updates alone do not count as a code change
- Keep the summary focused on the code change only — do not mention README updates
- Format: `Action: short description` in plain, clear English

### Format examples:
- `Fix: store tab not rendering on open`
- `Fix: drawer tab dashboard not loading`
- `Add: openHistoricalSession function to admin panel`
- `Update: stock calculation now uses sessionId instead of deskId`
- `Remove: dead FAB reference from app-init`

### If multiple code changes were made in one session:
Combine into one line covering the most significant change:
- `Fix: store and drawer tabs not rendering + switchTab window binding`

---

### At the end of every session with code changes, say:

> **Commit summary for GitHub Desktop:**
> `Action: description here`

---

> **AI ACKNOWLEDGEMENT:** If you have fully read this manual, reply with:
> *"Amolnama POS developer manual loaded. Ready — what would you like to work on?"*
>
> Then wait for the user's request. Do not suggest anything unprompted.