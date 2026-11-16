// src/features/transactions.js
import { collection, doc, addDoc, updateDoc, deleteDoc, serverTimestamp, getDoc, getDocs, query, where, writeBatch } from "firebase/firestore";
import { db } from '../config/firebase.js';
import { generateReceiptNo, getStrictDate, isViewingHistoricalDate, escapeHtml, escapeJsSingleQuote } from '../utils/helpers.js';
import { showAppAlert, showFlashMessage, openModal, closeModal, setButtonLoading, refreshCustomDropdowns, markInputError, clearInputError } from '../utils/ui-helpers.js';
import { AppState } from '../core/state.js';
import { passStockFirewall } from './inventory.js';

const fmt = (num) => Number(num || 0).toLocaleString('en-IN');
let isSaving = false;
let isSyncing = false;

// ==========================================
//    ERS KEYPAD LOGIC
// ==========================================

export function updateErsDisplay() { 
    const ersDisplay = document.getElementById('ers-display');
    if (ersDisplay) {
        ersDisplay.innerText = Number(AppState.ui.currentErsAmount).toLocaleString('en-IN'); 
    }
}

export function ersKeyPress(num) {
    if (navigator.vibrate) navigator.vibrate(10);
    if (AppState.ui.currentErsAmount === '0') { 
        if (num !== '00' && num !== '0') AppState.ui.currentErsAmount = num; 
    } else { 
        // Bumped limit to 6 digits to allow up to 999,999 Tk flexiloads safely
        if ((AppState.ui.currentErsAmount + num).length <= 6) AppState.ui.currentErsAmount += num; 
    }
    updateErsDisplay();
}

export function ersBackspace() { 
    if (navigator.vibrate) navigator.vibrate(15);
    AppState.ui.currentErsAmount = AppState.ui.currentErsAmount.length > 1 ? AppState.ui.currentErsAmount.slice(0, -1) : '0'; 
    updateErsDisplay(); 
}

export function ersClear() {
    if (navigator.vibrate) navigator.vibrate(15);
    AppState.ui.currentErsAmount = '0';
    updateErsDisplay();
}

export function ersAddPreset(presetAmount) {
    if (navigator.vibrate) navigator.vibrate(10);
    const addVal = Math.max(0, parseInt(presetAmount, 10) || 0);
    const current = parseInt(AppState.ui.currentErsAmount, 10) || 0;
    const next = Math.min(999999, current + addVal);
    AppState.ui.currentErsAmount = String(next);
    updateErsDisplay();
}

export function saveErs(paymentMethod) {
    if (isSaving) return;
    isSaving = true;

    const amount = parseInt(AppState.ui.currentErsAmount);
    if (amount <= 0) { 
        isSaving = false;
        showAppAlert("Invalid Input", "Please enter a valid amount."); 
        return; 
    }
    if (isViewingHistoricalDate()) {
        isSaving = false;
        showAppAlert("Action Blocked", "You cannot process new transactions while viewing a past date. Please return to 'Today'.");
        return;
    }
    addTransactionToCloud('ERS', 'ERS Flexiload', amount, 1, paymentMethod);
    AppState.ui.currentErsAmount = '0'; 
    updateErsDisplay();
    
    setTimeout(() => {
        isSaving = false;
    }, 500);
}

function isSimOrMnpSale(nameStr) {
    if (!nameStr) return false;
    const clean = nameStr.trim().toLowerCase();
    
    if (clean.includes('replacement') || clean.includes('foc') || clean.includes('reissue')) return false;
    
    const keywords = ['prime', 'djuice', 'no. 1', 'no.1', 'skitto', 'nishchinto', 'mnp', 'esim', 'my sim', 'recycle sim'];
    return keywords.some(kw => clean.includes(kw));
}

export function canSelectMultiQty(itemName) {
    return Boolean(itemName && itemName !== 'Recycle SIM' && !isSimOrMnpSale(itemName));
}

export function selectItem(itemName, price) {
    let catItem = Object.values(AppState.globalCatalog).find(c => c.name === itemName);
    if (catItem?.managerOnly && AppState.currentUserRole !== 'center_manager') {
        showAppAlert("Access Denied", "Center Manager clearance is required to process this service.");
        return;
    }
    if (isViewingHistoricalDate()) {
        showAppAlert("Action Blocked", "You cannot process new transactions while viewing a past date. Please return to 'Today'.");
        return;
    }
    if (!passStockFirewall(itemName, 1)) {
        return;
    }
    
    if (itemName === 'Recycle SIM') {
        document.querySelectorAll('.modal-overlay').forEach(modal => modal.classList.remove('active'));
        if (typeof window.triggerStoreRecycleSale === 'function') {
            window.triggerStoreRecycleSale();
        } else if (typeof window.Amolnama?.triggerStoreRecycleSale === 'function') {
            window.Amolnama.triggerStoreRecycleSale();
        }
        return;
    }
    
    if (isSimOrMnpSale(itemName)) {
        document.querySelectorAll('.modal-overlay').forEach(modal => modal.classList.remove('active'));
        addTransactionToCloud('Item', itemName, price, 1, (price > 0 && AppState.isMfs) ? "MFS" : "Cash");
        return;
    }
    
    document.querySelectorAll('.modal-overlay').forEach(modal => modal.classList.remove('active'));
    AppState.ui.currentItemName = itemName; AppState.ui.currentItemPrice = price; AppState.ui.currentQty = '1';
    
    const numInput = document.getElementById('qty-number-input');
    const sliderInput = document.getElementById('qty-slider');
    if (numInput) numInput.value = '1';
    if (sliderInput) sliderInput.value = '1';
    
    updateQtyDisplay(); 
    openModal('modal-quantity');
}

function updateQtyDisplay() {
    document.getElementById('qty-item-name').innerText = AppState.ui.currentItemName;
    document.getElementById('qty-display').innerText = AppState.ui.currentQty;
    let qtyInt = parseInt(AppState.ui.currentQty) || 0;
    document.getElementById('qty-calc-display').innerText = AppState.ui.currentItemPrice === 0 ? `Inventory Update (0 Tk)` : `${qtyInt} x ${fmt(AppState.ui.currentItemPrice)} = ${fmt(qtyInt * AppState.ui.currentItemPrice)} Tk`;
}

export function stepQty(amount) {
    if (navigator.vibrate) navigator.vibrate(10);
    let qtyInt = parseInt(AppState.ui.currentQty) || 1;
    qtyInt = Math.min(100, Math.max(1, qtyInt + amount));
    AppState.ui.currentQty = String(qtyInt);
    
    const numInput = document.getElementById('qty-number-input');
    const sliderInput = document.getElementById('qty-slider');
    if (numInput) numInput.value = qtyInt;
    if (sliderInput) sliderInput.value = Math.min(100, qtyInt);
    
    updateQtyDisplay();
}

export function onQtySliderChange(val) {
    let qtyInt = parseInt(val) || 1;
    AppState.ui.currentQty = String(qtyInt);
    
    const numInput = document.getElementById('qty-number-input');
    if (numInput) numInput.value = qtyInt;
    
    updateQtyDisplay();
}

export function onQtyInputChange(val) {
    let qtyInt = parseInt(val) || 1;
    qtyInt = Math.min(100, Math.max(1, qtyInt));
    AppState.ui.currentQty = String(qtyInt);
    
    const sliderInput = document.getElementById('qty-slider');
    if (sliderInput) sliderInput.value = Math.min(100, qtyInt);
    
    updateQtyDisplay();
}

export function saveQuantity() {
    if (isSaving) return; // Drop accidental double-taps
    isSaving = true;

    let qtyInt = parseInt(AppState.ui.currentQty) || 0;
    if (qtyInt <= 0) {
        isSaving = false;
        showAppAlert("Invalid Input", "Please enter a quantity of 1 or more.");
        return;
    }
    
    // Prevent sales while viewing historical dates
    if (isViewingHistoricalDate()) {
        isSaving = false;
        showAppAlert("Action Blocked", "You cannot process new transactions while viewing a past date. Please return to 'Today'.");
        return;
    }

    if (!passStockFirewall(AppState.ui.currentItemName, qtyInt)) {
        isSaving = false;
        return;
    }

    addTransactionToCloud('Item', AppState.ui.currentItemName, qtyInt * AppState.ui.currentItemPrice, qtyInt, (AppState.ui.currentItemPrice > 0 && AppState.isMfs) ? "MFS" : "Cash");

    setTimeout(() => {
        closeModal('modal-quantity');
        isSaving = false; // Release lock after modal slide animations finish
    }, 300);
}

export function instantSaveItem(itemName, price) {
  if (isSaving) {
      return;
  }
  isSaving = true;

  let catItem = Object.values(AppState.globalCatalog).find(c => c.name === itemName);
  if (catItem?.managerOnly && AppState.currentUserRole !== 'center_manager') {
      isSaving = false;
      showAppAlert("Access Denied", "Center Manager clearance is required to process this service.");
      return;
  }

  // Prevent sales while viewing historical dates
  if (isViewingHistoricalDate()) {
      isSaving = false;
      showAppAlert("Action Blocked", "You cannot process new transactions while viewing a past date. Please return to 'Today'.");
      return;
  }

  if (!passStockFirewall(itemName, 1)) {
      isSaving = false;
      return;
  }

  if (itemName === 'Recycle SIM') {
      isSaving = false;
      document.querySelectorAll('.modal-overlay').forEach(modal => modal.classList.remove('active'));
      if (typeof window.triggerStoreRecycleSale === 'function') {
          window.triggerStoreRecycleSale();
      } else if (typeof window.Amolnama?.triggerStoreRecycleSale === 'function') {
          window.Amolnama.triggerStoreRecycleSale();
      }
      return;
  }

  if (isSimOrMnpSale(itemName)) {
      isSaving = false;
      document.querySelectorAll('.modal-overlay').forEach(modal => modal.classList.remove('active'));
      addTransactionToCloud('Item', itemName, price, 1, (price > 0 && AppState.isMfs) ? "MFS" : "Cash");
      return;
  }

  addTransactionToCloud('Item', itemName, price, 1, (price > 0 && AppState.isMfs) ? "MFS" : "Cash");

  setTimeout(() => {
    document.querySelectorAll('.modal-overlay').forEach(modal => modal.classList.remove('active'));
    isSaving = false; // Release the lock after the UI clears
  }, 300); // 300ms window perfectly absorbs physical screen double-taps
}

// ==========================================
//    CORE TRANSACTION SAVER
// ==========================================
export function addTransactionToCloud(type, name, amount, qty, payment, cashAmt = 0, mfsAmt = 0, onboarding = null) {
    if(!AppState.currentUser) {
        return;
    }
    
    // Prevent transactions if the desk hasn't been opened
    if (!AppState.currentSessionId) {
        showAppAlert("Desk Closed", "You must open your desk and verify your float before making transactions.");
        return;
    }

    const isGPOnboarding = isSimOrMnpSale(name) && !name.toLowerCase().includes('skitto');
    const isSkittoOnboarding = isSimOrMnpSale(name) && name.toLowerCase().includes('skitto');

    if (type === 'Item' && (isGPOnboarding || isSkittoOnboarding) && onboarding === null) {
        promptSimOnboarding(name, (firstCall, appReg) => {
            if (firstCall !== null) {
                addTransactionToCloud(type, name, amount, qty, payment, cashAmt, mfsAmt, { firstCall, appReg });
            } else {
                showFlashMessage("Sale aborted.");
            }
        });
        return;
    }

    if (payment === 'Cash') { cashAmt = amount; mfsAmt = 0; }
    if (payment === 'MFS') { cashAmt = 0; mfsAmt = amount; }

    let catItem = Object.values(AppState.globalCatalog).find(c => c.name === name);
    let trackAs = catItem ? (catItem.trackAs === '' ? '' : (catItem.trackAs || name)) : name; 
    let cat = catItem ? catItem.cat : 'unknown';

    const tx = {
        id: Date.now(), receiptNo: generateReceiptNo(), type: type, name: name, trackAs: trackAs, cat: cat, amount: amount, qty: qty,
        payment: payment, cashAmt: cashAmt, mfsAmt: mfsAmt, isDeleted: false,
        time: new Date().toLocaleTimeString('en-GB', {hour: '2-digit', minute:'2-digit'}),
        dateStr: getStrictDate(),
        deskId: AppState.currentDeskId, sessionId: AppState.currentSessionId, agentId: AppState.currentUser.uid, agentName: AppState.userNickname || AppState.userDisplayName,
        timestamp: serverTimestamp()
    };

    if (onboarding) {
        tx.onboarding = onboarding;
    }

    // --- OPTIMISTIC UI INJECTION ---
    // Push to local state immediately with a pending flag so the UI shows it instantly
    AppState.transactions.push({ ...tx, isPending: true });
    
    // Force the UI to repaint instantly without waiting for the Firestore roundtrip
    if (typeof window.renderDeskDashboard === 'function') window.renderDeskDashboard(AppState.currentDeskId);
    if (typeof window.renderPersonalReport === 'function') window.renderPersonalReport();
    if (typeof window.renderAppUI === 'function') window.renderAppUI(); // Updates visual stock limits
    // -------------------------------

    let confirmMsg = type === 'ERS' ? `ERS ${amount} Tk Logged!` : `${qty}x ${name} Logged!`;

    addDoc(collection(db, 'transactions'), tx).then(() => {
        // Success: The listener will pick it up, or if we rely on optimistic updates, it just stays.
    }).catch(e => {
        console.warn("Database Error (Quota/Offline): Queuing transaction locally", e);
        
        const localTxIndex = AppState.transactions.findIndex(t => t.id === tx.id);
        if (localTxIndex > -1) {
            AppState.transactions[localTxIndex].isPending = false;
            AppState.transactions[localTxIndex].isOffline = true;
        }

        let offlineTxs = JSON.parse(localStorage.getItem('amolnama_offline_txs') || '[]');
        const safeTx = { ...tx };
        delete safeTx.timestamp; // Remove Firebase serverTimestamp
        offlineTxs.push(safeTx);
        localStorage.setItem('amolnama_offline_txs', JSON.stringify(offlineTxs));
        
        showFlashMessage("Saved Offline (Pending Sync)");
        
        if (typeof window.renderAppUI === 'function') window.renderAppUI(); 
        if (typeof window.renderPersonalReport === 'function') window.renderPersonalReport();
        if (typeof window.renderDeskDashboard === 'function') window.renderDeskDashboard(AppState.currentDeskId);
    });

    showFlashMessage(confirmMsg);

    if (AppState.isMfs && typeof window.toggleMFS === 'function') {
        window.toggleMFS();
    }
}

window.syncOfflineTransactions = async function() {
    if (isSyncing) return;
    
    // Multi-tab concurrency guard using localStorage
    const syncLockKey = 'amolnama_sync_lock';
    const syncLockTime = parseInt(localStorage.getItem(syncLockKey) || '0');
    const now = Date.now();
    if (syncLockTime && (now - syncLockTime < 15000)) {
        // Already syncing in another tab (lock valid for 15s)
        return;
    }
    
    isSyncing = true;
    localStorage.setItem(syncLockKey, String(Date.now()));
    
    // Periodically update the lock during long syncs
    const lockUpdater = setInterval(() => {
        localStorage.setItem(syncLockKey, String(Date.now()));
    }, 5000);

    try {
        let offlineSessions = JSON.parse(localStorage.getItem('amolnama_offline_sessions') || '[]');
        let offlineTxs = JSON.parse(localStorage.getItem('amolnama_offline_txs') || '[]');
        
        if (offlineSessions.length === 0 && offlineTxs.length === 0) return;

        if (typeof window.showAppAlert === 'function') {
            window.showAppAlert("Syncing", `Attempting to sync ${offlineTxs.length} transactions...`);
        }

        let successCount = 0;
        let failedCount = 0;

        // 1. Sync Sessions First
        for (let i = offlineSessions.length - 1; i >= 0; i--) {
            const sess = offlineSessions[i];
            try {
                const dataToSync = { ...sess.data, openedAt: serverTimestamp() };
                await setDoc(doc(db, 'sessions', sess.id), dataToSync);
                
                // Re-read latest offlineSessions in case another operation/tab modified it
                offlineSessions = JSON.parse(localStorage.getItem('amolnama_offline_sessions') || '[]');
                const idx = offlineSessions.findIndex(s => s.id === sess.id);
                if (idx > -1) {
                    offlineSessions.splice(idx, 1);
                    localStorage.setItem('amolnama_offline_sessions', JSON.stringify(offlineSessions));
                }
            } catch (e) {
                console.error("Failed to sync session:", e);
                failedCount++;
                break; // Stop on quota error
            }
        }

        if (failedCount > 0) {
            if (typeof window.showAppAlert === 'function') {
                window.showAppAlert("Sync Paused", "Stopped because the database is still locked or offline.");
            }
            if (window.updateNetworkStatus) window.updateNetworkStatus();
            return;
        }

        // 2. Sync Transactions
        for (let i = offlineTxs.length - 1; i >= 0; i--) {
            // Re-read current list to ensure index safety and prevent array mutation conflicts
            offlineTxs = JSON.parse(localStorage.getItem('amolnama_offline_txs') || '[]');
            if (i >= offlineTxs.length) {
                i = offlineTxs.length - 1;
                if (i < 0) break;
            }
            const tx = offlineTxs[i];
            
            // Re-inject a fresh serverTimestamp since we stripped it when saving locally
            tx.timestamp = serverTimestamp();

            try {
                await addDoc(collection(db, 'transactions'), tx);
                
                // Success: remove it by matching unique transaction ID
                offlineTxs = JSON.parse(localStorage.getItem('amolnama_offline_txs') || '[]');
                const idx = offlineTxs.findIndex(t => t.id === tx.id);
                if (idx > -1) {
                    offlineTxs.splice(idx, 1);
                    localStorage.setItem('amolnama_offline_txs', JSON.stringify(offlineTxs));
                }
                successCount++;
                if (typeof window.renderOfflineBanner === 'function') window.renderOfflineBanner(offlineTxs.length);
            } catch (e) {
                console.error("Failed to sync transaction during bulk sync:", e);
                failedCount++;
                break; // Stop immediately if we hit a quota error or true offline state
            }
        }

        if (window.updateNetworkStatus) window.updateNetworkStatus();

        if (failedCount > 0) {
            if (typeof window.showAppAlert === 'function') {
                window.showAppAlert("Sync Paused", `Synced ${successCount}. Stopped because the database is still locked or offline. Remaining: ${offlineTxs.length}`);
            }
        } else {
            if (typeof window.showAppAlert === 'function') {
                window.showAppAlert("Sync Complete", "All offline transactions have been securely pushed to the database!");
            }
        }
    } finally {
        clearInterval(lockUpdater);
        localStorage.removeItem(syncLockKey);
        isSyncing = false;
    }
}

// ==========================================
//   EDIT, SPLIT PAYMENT, & TRASH
// ==========================================

function findTxById(list, id) {
    if (id === null || id === undefined || id === '') return null;
    const needle = String(id);
    return (list || []).find(t => t && (String(t.id) === needle || (t.docId && String(t.docId) === needle))) || null;
}

function normalizeDocIdParam(docId) {
    if (!docId || docId === 'undefined' || docId === 'null') return '';
    return String(docId);
}

export function isTransactionModifiable(tx, action) {
    if (AppState.currentUserRole === 'admin' && action === 'delete') {
        return true;
    }

    if (tx.type === 'transfer_out' || tx.type === 'transfer_in') {
        let msg = action === 'delete' 
            ? "Remote transfers cannot be deleted via the Trash bin to prevent stock duplication. Please issue a reverse transfer from the Desk Actions menu instead." 
            : "Remote stock transfers cannot be edited. Please issue a reverse transfer from the Desk Actions menu instead.";
        showAppAlert("Action Blocked", msg);
        return false;
    }
    if (action === 'edit' && tx.type === 'adjustment') {
        showAppAlert("Action Blocked", "Cash adjustments (Drops, Floats, Expenses) cannot be edited to protect ledger integrity. Please delete the item and log it again.");
        return false;
    }
    if (tx.isOffline) {
        showAppAlert("Action Blocked", "Offline transactions cannot be modified until they are synced to the live database.");
        return false;
    }

    const isPrivileged = ['admin', 'owner', 'manager', 'center_manager'].includes(AppState.currentUserRole);
    if (!isPrivileged && tx.agentId && AppState.currentUser && tx.agentId !== AppState.currentUser.uid) {
        showAppAlert("Action Blocked", `You can only ${action} transactions that you created.`);
        return false;
    }
    return true;
}

export function setEditPaymentMethod(method = 'Cash') {
    const valid = ['Cash', 'MFS', 'Split'].includes(method) ? method : 'Cash';
    const paymentInput = document.getElementById('edit-tx-payment');
    if (paymentInput) {
        paymentInput.value = valid;
    }
    document.querySelectorAll('#modal-edit-tx [data-edit-pay]').forEach(btn => {
        const isActive = btn.getAttribute('data-edit-pay') === valid;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
    toggleEditSplitFields();
}

export function openEditTx(id) {
    let tx = findTxById(AppState.transactions, id);
    if (!tx) return;
    
    // STRICT POS PROTOCOL: Block editing of non-sale items to prevent math corruption
    if (!isTransactionModifiable(tx, 'edit')) return;

    AppState.ui.currentEditTxId = tx.id;
    const qtyEl = document.getElementById('edit-tx-qty');
    const amtEl = document.getElementById('edit-tx-amount');
    const cashEl = document.getElementById('edit-tx-cash');
    const mfsEl = document.getElementById('edit-tx-mfs');
    const notesEl = document.getElementById('edit-tx-notes');
    const metaEl = document.getElementById('edit-tx-meta');
    const nameEl = document.getElementById('edit-tx-name');
    const onboardingSection = document.getElementById('edit-tx-onboarding-section');
    const firstCallChk = document.getElementById('edit-tx-firstcall');
    const appRegChk = document.getElementById('edit-tx-appreg');
    const appRegLabel = document.getElementById('edit-tx-appreg-label');

    clearInputError(qtyEl);
    clearInputError(amtEl);
    clearInputError(cashEl);
    clearInputError(mfsEl);

    if (nameEl) nameEl.innerText = "Edit: " + tx.name;
    if (metaEl) {
        const parts = [];
        if (tx.receiptNo) parts.push(`#${tx.receiptNo}`);
        if (tx.time) parts.push(tx.time);
        if (tx.agentName) parts.push(tx.agentName);
        metaEl.innerText = parts.join(' · ');
        metaEl.style.display = parts.length > 0 ? 'block' : 'none';
    }

    const currentQty = parseInt(tx.qty, 10) || 1;
    const lockSingleQty = tx.type === 'ERS' || (!canSelectMultiQty(tx.name) && currentQty === 1);
    if (qtyEl) {
        qtyEl.value = currentQty;
        qtyEl.disabled = lockSingleQty;
    }
    if (amtEl) amtEl.value = tx.amount !== undefined && tx.amount !== null ? tx.amount : 0;
    if (notesEl) notesEl.value = tx.notes || '';

    const showOnboarding = Boolean(tx.onboarding || (tx.type === 'Item' && isSimOrMnpSale(tx.name)));
    if (onboardingSection) {
        onboardingSection.style.display = showOnboarding ? 'block' : 'none';
        if (showOnboarding) {
            const isSkitto = (tx.name || '').toLowerCase().includes('skitto');
            if (appRegLabel) appRegLabel.innerText = isSkitto ? 'Skitto App Registration' : 'MyGP Registration';
            if (firstCallChk) firstCallChk.checked = Boolean(tx.onboarding?.firstCall);
            if (appRegChk) appRegChk.checked = Boolean(tx.onboarding?.appReg);
        }
    }

    const paymentSelect = document.getElementById('edit-tx-payment');
    const splitFields = document.getElementById('edit-split-fields');
    const isSplit = tx.payment === 'Split' || ((Number(tx.cashAmt) || 0) > 0 && (Number(tx.mfsAmt) || 0) > 0);
    const resolvedMethod = isSplit ? 'Split' : (tx.payment === 'MFS' ? 'MFS' : 'Cash');

    if (paymentSelect) paymentSelect.value = resolvedMethod;
    document.querySelectorAll('#modal-edit-tx [data-edit-pay]').forEach(btn => {
        const isActive = btn.getAttribute('data-edit-pay') === resolvedMethod;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });

    if (splitFields) {
        if (resolvedMethod === 'Split') {
            splitFields.style.display = 'flex';
            if (cashEl) cashEl.value = tx.cashAmt ?? 0;
            if (mfsEl) mfsEl.value = tx.mfsAmt ?? 0;
        } else {
            splitFields.style.display = 'none';
            if (cashEl) cashEl.value = resolvedMethod === 'Cash' ? (tx.amount || 0) : 0;
            if (mfsEl) mfsEl.value = resolvedMethod === 'MFS' ? (tx.amount || 0) : 0;
        }
    }
    if (paymentSelect && paymentSelect.tagName === 'SELECT') {
        refreshCustomDropdowns(paymentSelect);
    }

    openModal('modal-edit-tx');
    
    setTimeout(() => {
        const targetFocusEl = lockSingleQty ? amtEl : qtyEl;
        if (targetFocusEl && !targetFocusEl.disabled) {
            targetFocusEl.focus();
            if (typeof targetFocusEl.select === 'function') targetFocusEl.select();
        }
    }, 100);
}

export function toggleEditSplitFields() {
    const paymentEl = document.getElementById('edit-tx-payment');
    const splitFields = document.getElementById('edit-split-fields');
    const amtEl = document.getElementById('edit-tx-amount');
    const cashEl = document.getElementById('edit-tx-cash');
    const mfsEl = document.getElementById('edit-tx-mfs');
    if (!paymentEl || !splitFields) return;

    const method = paymentEl.value;
    document.querySelectorAll('#modal-edit-tx [data-edit-pay]').forEach(btn => {
        const isActive = btn.getAttribute('data-edit-pay') === method;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });

    if (method === 'Split') {
        splitFields.style.display = 'flex';
        const total = parseFloat(amtEl?.value) || 0;
        const curCash = parseFloat(cashEl?.value) || 0;
        const curMfs = parseFloat(mfsEl?.value) || 0;
        if (Math.abs((curCash + curMfs) - total) > 0.01 || (curCash === 0 && curMfs === 0 && total > 0)) {
            if (cashEl) cashEl.value = total;
            if (mfsEl) mfsEl.value = 0;
        }
    } else {
        splitFields.style.display = 'none';
    }
}

export function autoCalcEditTotal() {
    let tx = findTxById(AppState.transactions, AppState.ui.currentEditTxId);
    if (!tx) return;
    if (tx.type === 'ERS') return;
         
    let catItem = Object.values(AppState.globalCatalog).find(c => c.name === tx.name);
    let unitPrice = catItem ? catItem.price : (tx.qty > 0 ? (tx.amount / tx.qty) : 0);
    let newQty = parseInt(document.getElementById('edit-tx-qty')?.value, 10) || 0;
         
    const amtEl = document.getElementById('edit-tx-amount');
    if (amtEl) amtEl.value = Math.round((unitPrice * newQty) * 100) / 100;
    updateSplitTotal();
}

export function updateSplitTotal() {
    const paymentVal = document.getElementById('edit-tx-payment')?.value;
    if (paymentVal !== 'Split') return;

    let totalAmount = parseFloat(document.getElementById('edit-tx-amount')?.value) || 0;
    let cashInput = document.getElementById('edit-tx-cash');
    let mfsInput = document.getElementById('edit-tx-mfs');
    if (!cashInput || !mfsInput) return;

    const roundMoney = (val) => Math.round(Math.max(0, val) * 100) / 100;
          
    if (typeof document !== 'undefined' && document.activeElement === mfsInput) {
        let mfsAmt = parseFloat(mfsInput.value) || 0;
        cashInput.value = roundMoney(totalAmount - mfsAmt);
    } else {
        let cashAmt = parseFloat(cashInput.value) || 0;
        mfsInput.value = roundMoney(totalAmount - cashAmt);
    }
}

export function cancelTxEdit() {
    AppState.ui.currentEditTxId = null;
    closeModal('modal-edit-tx');
}

export async function saveTxEdit() {
    if (!AppState.currentUser) return;
    if (isSaving) return;
    isSaving = true;

    const submitBtn = document.querySelector('#modal-edit-tx .btn-primary-full');
    let tx = null;
    let prevSnapshot = null;

    try {
        tx = findTxById(AppState.transactions, AppState.ui.currentEditTxId);
        if (!tx) return;
        
        const qtyEl = document.getElementById('edit-tx-qty');
        const amtEl = document.getElementById('edit-tx-amount');
        const cashEl = document.getElementById('edit-tx-cash');
        const mfsEl = document.getElementById('edit-tx-mfs');
        const notesEl = document.getElementById('edit-tx-notes');
        const onboardingSection = document.getElementById('edit-tx-onboarding-section');
        const firstCallChk = document.getElementById('edit-tx-firstcall');
        const appRegChk = document.getElementById('edit-tx-appreg');

        clearInputError(qtyEl);
        clearInputError(amtEl);
        clearInputError(cashEl);
        clearInputError(mfsEl);

        const rawQty = String(qtyEl?.value ?? '').trim();
        const newQty = rawQty === '' ? NaN : parseInt(rawQty, 10);
        const rawAmt = String(amtEl?.value ?? '').trim();
        const newAmountRaw = rawAmt === '' ? NaN : Number(rawAmt);
        const newAmount = Number.isNaN(newAmountRaw) ? NaN : Math.round(newAmountRaw * 100) / 100;
             
        if (Number.isNaN(newQty) || newQty <= 0) {
            markInputError(qtyEl);
            showAppAlert("Invalid Edit", "Quantities must be 1 or greater.");
            return;
        }
        if (Number.isNaN(newAmount) || newAmount < 0) {
            markInputError(amtEl);
            showAppAlert("Invalid Edit", "Please enter a valid non-negative Total Tk amount.");
            return;
        }
        if (tx.type === 'ERS' && newAmount <= 0) {
            markInputError(amtEl);
            showAppAlert("Invalid Edit", "ERS Flexiload amount must be greater than 0 Tk.");
            return;
        }

        let method = document.getElementById('edit-tx-payment')?.value || 'Cash';
        if (!['Cash', 'MFS', 'Split'].includes(method)) method = 'Cash';

        let finalCash = 0, finalMfs = 0;
        let diff = newQty - (parseInt(tx.qty, 10) || 1);
         
        if (diff > 0 && (!tx.sessionId || tx.sessionId === AppState.currentSessionId) && !passStockFirewall(tx.name, diff)) {
            return;
        }
        
        if (method === 'Cash') {
            finalCash = newAmount;
        } else if (method === 'MFS') {
            finalMfs = newAmount;
        } else if (method === 'Split') {
            const rawCash = String(cashEl?.value ?? '').trim();
            const rawMfs = String(mfsEl?.value ?? '').trim();
            finalCash = rawCash === '' ? 0 : Number(rawCash);
            finalMfs = rawMfs === '' ? 0 : Number(rawMfs);
            if (Number.isNaN(finalCash) || Number.isNaN(finalMfs) || finalCash < 0 || finalMfs < 0) {
                markInputError(finalCash < 0 || Number.isNaN(finalCash) ? cashEl : mfsEl);
                showAppAlert("Invalid Split", "Cash and MFS portions cannot be negative.");
                return;
            }
            if (Math.abs((finalCash + finalMfs) - newAmount) > 0.01) {
                markInputError(cashEl);
                markInputError(mfsEl);
                showAppAlert("Error", "Cash + MFS must equal Total Tk.");
                return;
            }
            finalCash = Math.round(finalCash * 100) / 100;
            finalMfs = Math.round(finalMfs * 100) / 100;
        }

        const nextNotes = notesEl ? notesEl.value.trim() : (tx.notes || '');
        const hasOnboardingEditor = Boolean(
            onboardingSection && onboardingSection.style.display !== 'none' && firstCallChk && appRegChk
        );
        const nextOnboarding = hasOnboardingEditor
            ? { firstCall: Boolean(firstCallChk.checked), appReg: Boolean(appRegChk.checked) }
            : tx.onboarding;

        // Resolve Firestore docId if optimistic entry was just written
        if (!tx.docId) {
            try {
                const lookupSnap = await getDocs(query(collection(db, 'transactions'), where('id', '==', tx.id)));
                if (!lookupSnap.empty) {
                    tx.docId = lookupSnap.docs[0].id;
                    tx.isPending = false;
                }
            } catch (_) {}
        }

        if (!tx.docId) {
            showAppAlert("Sync Pending", "This transaction is still syncing to the cloud. Please try again in a moment.");
            return;
        }
        
        let prevTxState = {
            qty: tx.qty, amount: tx.amount, payment: tx.payment, cashAmt: tx.cashAmt, mfsAmt: tx.mfsAmt,
            editedAt: new Date().toISOString(), editedBy: AppState.userNickname || AppState.userDisplayName, editedByUid: AppState.currentUser.uid
        };
        let updatedEditHistory = tx.editHistory ? [...tx.editHistory, prevTxState] : [prevTxState];
        
        prevSnapshot = {
            qty: tx.qty,
            amount: tx.amount,
            payment: tx.payment,
            cashAmt: tx.cashAmt,
            mfsAmt: tx.mfsAmt,
            notes: tx.notes,
            onboarding: tx.onboarding ? { ...tx.onboarding } : undefined,
            isEdited: tx.isEdited,
            editHistory: tx.editHistory ? [...tx.editHistory] : undefined
        };

        setButtonLoading(submitBtn, true, 'Updating...');

        // --- OPTIMISTIC LOCAL UPDATE ---
        tx.qty = newQty;
        tx.amount = newAmount;
        tx.payment = method;
        tx.cashAmt = finalCash;
        tx.mfsAmt = finalMfs;
        tx.notes = nextNotes;
        if (nextOnboarding !== undefined) tx.onboarding = nextOnboarding;
        tx.isEdited = true;
        tx.editHistory = updatedEditHistory;

        const targetDeskId = tx.deskId || AppState.currentDeskId;
        if (targetDeskId && typeof window.renderDeskDashboard === 'function') window.renderDeskDashboard(targetDeskId);
        if (typeof window.renderPersonalReport === 'function') window.renderPersonalReport();
        if (typeof window.renderAppUI === 'function') window.renderAppUI();

        const updatePayload = {
            qty: newQty,
            amount: newAmount,
            payment: method,
            cashAmt: finalCash,
            mfsAmt: finalMfs,
            notes: nextNotes,
            isEdited: true,
            editHistory: updatedEditHistory
        };
        if (nextOnboarding !== undefined) {
            updatePayload.onboarding = nextOnboarding;
        }

        // --- FIRESTORE UPDATE ---
        await updateDoc(doc(db, 'transactions', tx.docId), updatePayload);
        AppState.needsRender.floor = true;
        if (typeof document !== 'undefined' && document.getElementById('tab-floor')?.classList.contains('active') && typeof window.renderLiveFloorTab === 'function') {
            window.renderLiveFloorTab();
        }
        showFlashMessage(navigator.onLine ? `${tx.name} Updated!` : "Offline: Edit queued");
        closeModal('modal-edit-tx');
        AppState.ui.currentEditTxId = null;
    } catch (e) {
        if (tx && prevSnapshot) {
            tx.qty = prevSnapshot.qty;
            tx.amount = prevSnapshot.amount;
            tx.payment = prevSnapshot.payment;
            tx.cashAmt = prevSnapshot.cashAmt;
            tx.mfsAmt = prevSnapshot.mfsAmt;
            tx.notes = prevSnapshot.notes;
            if (prevSnapshot.onboarding !== undefined) tx.onboarding = prevSnapshot.onboarding;
            else delete tx.onboarding;
            tx.isEdited = prevSnapshot.isEdited;
            if (prevSnapshot.editHistory !== undefined) tx.editHistory = prevSnapshot.editHistory;
            else delete tx.editHistory;

            const targetDeskId = tx.deskId || AppState.currentDeskId;
            if (targetDeskId && typeof window.renderDeskDashboard === 'function') window.renderDeskDashboard(targetDeskId);
            if (typeof window.renderPersonalReport === 'function') window.renderPersonalReport();
            if (typeof window.renderAppUI === 'function') window.renderAppUI();
        }
        const errMsg = e?.code === 'permission-denied'
            ? "Permission Denied: Only managers, admins, or the agent who logged this transaction can edit it."
            : "Could not save edit to database. Please check your connection and try again.";
        showAppAlert("Save Failed", errMsg);
        console.error(e);
    } finally {
        isSaving = false;
        setButtonLoading(submitBtn, false);
    }
}

export function deleteTransaction(docId, localId) {
    if (!AppState.currentUser) return;
    
    const resolvedDocId = normalizeDocIdParam(docId);
    let tx = (resolvedDocId && AppState.transactions.find(t => t.docId === resolvedDocId)) || findTxById(AppState.transactions, localId);
    if (tx && !isTransactionModifiable(tx, 'delete')) return;
    const finalDocId = resolvedDocId || tx?.docId || '';

    showAppAlert("Delete Item", tx && tx.transferGroupId ? "This is a transfer. Deleting it will delete both sending and receiving sides. Proceed?" : "Are you sure you want to move this transaction to the trash?", true, async () => {
        if (isSaving) return;
        isSaving = true;

        let nowStr = new Date().toString();
        let agentStr = AppState.userNickname || AppState.userDisplayName;

        // Optimistic local update
        if (tx) tx.isDeleted = true;
        const targetDeskId = tx?.deskId || AppState.currentDeskId;
        if (targetDeskId && typeof window.renderDeskDashboard === 'function') window.renderDeskDashboard(targetDeskId);

        if (finalDocId) {
            try {
                if (tx && tx.transferGroupId) {
                    const groupSnap = await getDocs(query(collection(db, 'transactions'), where('transferGroupId', '==', tx.transferGroupId)));
                    const batch = writeBatch(db);
                    groupSnap.forEach(tDoc => {
                        batch.update(doc(db, 'transactions', tDoc.id), { isDeleted: true, deletedBy: agentStr, deletedByUid: AppState.currentUser.uid, deletedAt: nowStr });
                        let localTx = AppState.transactions.find(t => t.docId === tDoc.id);
                        if (localTx) localTx.isDeleted = true;
                    });
                    await batch.commit();
                } else {
                    await updateDoc(doc(db, 'transactions', finalDocId), { isDeleted: true, deletedBy: agentStr, deletedByUid: AppState.currentUser.uid, deletedAt: nowStr });
                }

                // If this was a Recycle SIM sale transaction, revert the SIM status in Firestore back to its previous status (e.g. arrived)
                if (tx && (tx.recycleSimId || tx.isRecycleSale || tx.name === 'Recycle SIM' || tx.notes?.includes('Recycle SIM:'))) {
                    try {
                        let targetSimId = tx.recycleSimId;
                        if (!targetSimId && tx.notes) {
                            const match = tx.notes.match(/Recycle SIM:\s*(01[3-9]\d{8})/);
                            if (match && match[1]) {
                                const q = query(collection(db, 'recycle_sims'), where('recycledNumber', '==', match[1]));
                                const qSnap = await getDocs(q);
                                if (!qSnap.empty) {
                                    targetSimId = qSnap.docs[0].id;
                                }
                            }
                        }

                        if (targetSimId) {
                            const simRef = doc(db, 'recycle_sims', targetSimId);
                            const simSnap = await getDoc(simRef);
                            if (simSnap.exists()) {
                                const simData = simSnap.data();
                                if (simData.status === 'completed') {
                                    const revertStatus = simData.previousStatus || 'arrived';
                                    await updateDoc(simRef, {
                                        status: revertStatus,
                                        completedAt: null,
                                        completedBy: null,
                                        soldBy: null,
                                        updatedBy: agentStr,
                                        updatedAt: serverTimestamp(),
                                        history: [...(simData.history || []), {
                                            status: revertStatus,
                                            timestamp: new Date().toISOString(),
                                            by: agentStr,
                                            note: `Sale transaction deleted from ledger; status restored to ${revertStatus}.`
                                        }]
                                    });
                                }
                            }
                        }
                    } catch (revertErr) {
                        console.warn("Could not revert recycle SIM status on tx deletion:", revertErr);
                    }
                }

                showFlashMessage(navigator.onLine ? "Moved to Trash!" : "Offline: Trash queued");
            } catch(e) {
                if (tx) tx.isDeleted = false; // Rollback on failure
                if (typeof window.renderDeskDashboard === 'function') window.renderDeskDashboard(AppState.currentDeskId);
                showAppAlert("Delete Failed", "Could not move to trash.");
                console.error(e);
            } finally {
                isSaving = false;
            }
        } else {
            isSaving = false;
        }
    }, "Move to Trash");
}

export function openTrash() { renderTrash(); openModal('modal-trash'); }

export function renderTrash() {
    let html = '';
    if(AppState.trashTransactions.length === 0) html = '<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg><p>Trash is empty</p><span>Deleted transactions appear here for 30 days before permanent removal.</span></div>';
    else {
        [...AppState.trashTransactions].sort((a,b) => b.id - a.id).forEach(tx => {
            let safeDocId = tx.docId ? `'${escapeJsSingleQuote(tx.docId)}'` : `null`;
            html += `
                <div style="border:1px solid var(--border-color); padding:12px; margin-bottom:8px; border-radius:8px; background: var(--surface-color);">
                    <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                        <strong style="color: var(--text-primary); text-decoration: line-through;">${tx.qty}x ${escapeHtml(tx.name)}</strong> 
                        <span class="tabular-nums" style="font-weight:bold; color: var(--danger-text);">${tx.amount} Tk</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:0.8rem; color:var(--text-secondary);">${escapeHtml(tx.time)} | ${escapeHtml(tx.payment)}</span>
                        <div style="display:flex; gap: 8px;">
                            <button type="button" class="btn-outline" style="padding:6px 12px; font-size:0.85rem; height:auto; color: var(--success-text); border-color: var(--success-border); gap: 6px;" onclick="restoreTx(${safeDocId}, ${tx.id})">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg> Restore
                            </button>
                            <button type="button" class="btn-outline" style="padding:6px 12px; font-size:0.85rem; height:auto; color: var(--danger-text); border-color: var(--danger-border); gap: 6px; background: var(--danger-bg);" onclick="permanentlyDeleteTx(${safeDocId}, ${tx.id})">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg> Delete
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });
    }
    document.getElementById('trash-log').innerHTML = html;
}

export async function restoreTx(docId, localId) {
    if(!AppState.currentUser) return;
    if (isSaving) return;
    isSaving = true;

    let nowStr = new Date().toString();
    let agentStr = AppState.userNickname || AppState.userDisplayName;

    if(docId) {
        try {
            let tx = AppState.trashTransactions.find(t => t.docId === docId);
            if (tx) {
                if (tx.transferGroupId) {
                    const groupSnap = await getDocs(query(collection(db, 'transactions'), where('transferGroupId', '==', tx.transferGroupId)));
                    
                    // Verify firewall for the sender's side (since restoring transfer consumes stock from sender)
                    for (const tDoc of groupSnap.docs) {
                        const tData = tDoc.data();
                        if (tData.type === 'transfer_out' && !passStockFirewall(tData.name, tData.qty)) {
                            isSaving = false;
                            return;
                        }
                    }

                    const batch = writeBatch(db);
                    groupSnap.forEach(tDoc => {
                        batch.update(doc(db, 'transactions', tDoc.id), { isDeleted: false, isRestored: true, restoredBy: agentStr, restoredByUid: AppState.currentUser.uid, restoredAt: nowStr });
                        let localTx = AppState.trashTransactions.find(t => t.docId === tDoc.id);
                        if (localTx) localTx.isDeleted = false;
                    });
                    await batch.commit();
                    showFlashMessage(navigator.onLine ? "Transfer Restored!" : "Offline: Restore queued");
                } else {
                    if (!passStockFirewall(tx.name, tx.qty)) {
                        isSaving = false;
                        return;
                    }
                    await updateDoc(doc(db, 'transactions', docId), { isDeleted: false, isRestored: true, restoredBy: agentStr, restoredByUid: AppState.currentUser.uid, restoredAt: nowStr });
                    showFlashMessage(navigator.onLine ? `${tx.name} Restored!` : "Offline: Restore queued");
                }
                setTimeout(() => { renderTrash(); if(AppState.trashTransactions.length === 0) closeModal('modal-trash'); }, 500);
            }
        } catch(e) {
            showAppAlert("Restore Failed", "Could not restore. Please check your connection.");
            console.error("Restore error:", e);
        } finally {
            isSaving = false;
        }
    } else {
        isSaving = false;
    }
}

export function permanentlyDeleteTx(docId, localId) {
    const resolvedDocId = normalizeDocIdParam(docId);
    let tx = (resolvedDocId && AppState.trashTransactions.find(t => t.docId === resolvedDocId)) || findTxById(AppState.trashTransactions, localId);
    const finalDocId = resolvedDocId || tx?.docId || '';
    showAppAlert("Permanent Delete", tx && tx.transferGroupId ? "This is a transfer. Permanently deleting it will erase both sides forever. Proceed?" : "This transaction will be permanently erased. This cannot be undone.", true, async () => {
        if (isSaving) return;
        isSaving = true;
        if (finalDocId) {
            try {
                if (tx && tx.transferGroupId) {
                    const groupSnap = await getDocs(query(collection(db, 'transactions'), where('transferGroupId', '==', tx.transferGroupId)));
                    const batch = writeBatch(db);
                    groupSnap.forEach(tDoc => {
                        batch.delete(doc(db, 'transactions', tDoc.id));
                    });
                    await batch.commit();
                } else {
                    await deleteDoc(doc(db, 'transactions', finalDocId));
                }
                showFlashMessage(navigator.onLine ? "Permanently Deleted!" : "Offline: Delete queued");
            } catch(e) {
                showAppAlert("Delete Failed", "Could not permanently delete.");
                console.error(e);
            } finally {
                isSaving = false;
            }
        } else {
            isSaving = false;
        }
    }, "Delete Forever");
}

export async function emptyTrash() {
    if(AppState.trashTransactions.length === 0) return;
    showAppAlert("Empty Trash", "Are you sure you want to permanently delete ALL items in the trash?", true, async () => {
        if (isSaving) return;
        isSaving = true;
        
        const idsToDelete = AppState.trashTransactions.map(t => t.docId).filter(id => id);
        
        try {
            // Wait for all deletes to resolve BEFORE clearing the local arrays and UI
            await Promise.all(idsToDelete.map(id => deleteDoc(doc(db, 'transactions', id))));
            
            AppState.trashTransactions = [];
            renderTrash();
            closeModal('modal-trash');
            showFlashMessage("Trash Emptied!");
        } catch(e) {
            showAppAlert("Error", "Failed to empty trash completely. Check connection.");
            console.error("Error emptying trash:", e);
        } finally {
            isSaving = false;
        }
    }, "Empty Trash");
}

export function showAuditTrail(txId) {
    let tx = AppState.transactions.find(t => t.id == txId) || AppState.trashTransactions.find(t => t.id == txId);
    if (!tx) return;
    
    let msg = `Receipt: ${tx.receiptNo || tx.id}\nCreated by: ${tx.agentName} at ${tx.time}\n\n`;
    
    if (tx.editHistory && tx.editHistory.length > 0) {
        msg += `--- EDIT HISTORY ---\n`;
        tx.editHistory.forEach((edit, idx) => {
            let d = new Date(edit.editedAt).toLocaleTimeString('en-GB', {hour: '2-digit', minute:'2-digit'});
            msg += `[${idx+1}] Changed by ${edit.editedBy} at ${d}.\nPrevious State: ${edit.qty}x, ${edit.amount} Tk (${edit.payment})\n\n`;
        });
    }
    
    if (tx.onboarding) {
        const fc = tx.onboarding.firstCall ? 'Completed' : 'Not Done';
        const listB = ['Skitto', 'eSIM Skitto'];
        const appLabel = listB.includes(tx.name) ? 'Skitto App' : 'MyGP';
        const app = tx.onboarding.appReg ? 'Completed' : 'Not Done';
        
        msg += `--- ONBOARDING STATUS ---\n`;
        msg += `First Call: ${fc}\n`;
        msg += `${appLabel} Registration: ${app}\n\n`;
    }

    if (tx.isRestored) {
        let rd = tx.restoredAt ? new Date(tx.restoredAt).toLocaleTimeString('en-GB', {hour: '2-digit', minute:'2-digit'}) : 'Unknown';
        msg += `--- RESTORED ---\nRestored by ${tx.restoredBy || 'Unknown'} at ${rd}\n\n`;
    }
    
    if (tx.isDeleted) {
        let dd = tx.deletedAt ? new Date(tx.deletedAt).toLocaleTimeString('en-GB', {hour: '2-digit', minute:'2-digit'}) : 'Unknown';
        msg += `--- DELETED ---\nDeleted by ${tx.deletedBy || 'Unknown'} at ${dd}\n\n`;
    }
    
    showAppAlert("Transaction Audit Trail", msg);
}

let currentOnboardingCallback = null;

export function promptSimOnboarding(simName, onConfirm) {
    const isGP = isSimOrMnpSale(simName) && !simName.toLowerCase().includes('skitto');
    const isSkitto = isSimOrMnpSale(simName) && simName.toLowerCase().includes('skitto');
    
    if (!isGP && !isSkitto) {
        onConfirm(null, null);
        return;
    }
    
    // Configure modal texts
    document.getElementById('onboarding-sim-title').innerText = `${simName} Onboarding`;
    
    const appLabel = document.getElementById('onboarding-app-label');
    if (isSkitto) {
        appLabel.innerText = "Skitto App Registration";
    } else {
        appLabel.innerText = "MyGP Registration";
    }
    
    // Reset inputs to unchecked
    document.getElementById('onboarding-chk-call').checked = false;
    document.getElementById('onboarding-chk-app').checked = false;
    
    // Visually reset active classes and styles
    const rowCall = document.getElementById('onboarding-row-call');
    const rowApp = document.getElementById('onboarding-row-app');
    
    if (rowCall) {
        rowCall.style.borderColor = 'var(--border-color)';
        rowCall.style.backgroundColor = 'var(--surface-color)';
    }
    if (rowApp) {
        rowApp.style.borderColor = 'var(--border-color)';
        rowApp.style.backgroundColor = 'var(--surface-color)';
    }
    
    currentOnboardingCallback = onConfirm;
    
    openModal('modal-sim-onboarding');
}

export function confirmSimOnboarding() {
    const firstCall = document.getElementById('onboarding-chk-call').checked;
    const appReg = document.getElementById('onboarding-chk-app').checked;
    
    closeModal('modal-sim-onboarding');
    
    if (currentOnboardingCallback) {
        currentOnboardingCallback(firstCall, appReg);
        currentOnboardingCallback = null;
    }
}

export function cancelSimOnboarding() {
    closeModal('modal-sim-onboarding');
    
    if (currentOnboardingCallback) {
        currentOnboardingCallback(null, null);
        currentOnboardingCallback = null;
    }
}

export function toggleOnboardingRow(checkboxId, rowEl, activeColor) {
    const chk = document.getElementById(checkboxId);
    if (chk) {
        chk.checked = !chk.checked;
        rowEl.style.borderColor = chk.checked ? activeColor : 'var(--border-color)';
        rowEl.style.backgroundColor = chk.checked ? `${activeColor}0c` : 'var(--surface-color)';
    }
}

export function syncOnboardingCheck(checkboxId, rowId, activeColor) {
    const chk = document.getElementById(checkboxId);
    const rowEl = document.getElementById(rowId);
    if (chk && rowEl) {
        rowEl.style.borderColor = chk.checked ? activeColor : 'var(--border-color)';
        rowEl.style.backgroundColor = chk.checked ? `${activeColor}0c` : 'var(--surface-color)';
    }
}