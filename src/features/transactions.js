// src/features/transactions.js
import { collection, doc, addDoc, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db } from '../config/firebase.js';
import { generateReceiptNo, getStrictDate } from '../utils/helpers.js';
import { showAppAlert, showFlashMessage, openModal, closeModal } from '../utils/ui-helpers.js';
import { AppState } from '../core/state.js';
import { passStockFirewall } from './inventory.js';

// ==========================================
//    ERS KEYPAD LOGIC
// ==========================================
let currentErsAmount = '0';

export function updateErsDisplay() { 
    const ersDisplay = document.getElementById('ers-display');
    if (ersDisplay) {
        ersDisplay.innerText = Number(currentErsAmount).toLocaleString('en-IN'); 
    }
}

export function ersKeyPress(num) {
    if (navigator.vibrate) navigator.vibrate(10);
    if (currentErsAmount === '0') { 
        if (num !== '00' && num !== '0') currentErsAmount = num; 
    } else { 
        if ((currentErsAmount + num).length <= 5) currentErsAmount += num; 
    }
    updateErsDisplay();
}

export function ersBackspace() { 
    if (navigator.vibrate) navigator.vibrate(15);
    currentErsAmount = currentErsAmount.length > 1 ? currentErsAmount.slice(0, -1) : '0'; 
    updateErsDisplay(); 
}

export function saveErs(paymentMethod) {
    const amount = parseInt(currentErsAmount);
    if (amount <= 0) { showAppAlert("Invalid Input", "Please enter a valid amount."); return; }
    addTransactionToCloud('ERS', 'ERS Flexiload', amount, 1, paymentMethod);
    currentErsAmount = '0'; updateErsDisplay();
}

// ==========================================
//    ITEM QUANTITY MODAL LOGIC
// ==========================================
let currentItemName = ''; 
let currentItemPrice = 0; 
let currentQty = '1';

export function selectItem(itemName, price) {
    document.querySelectorAll('.modal-overlay').forEach(modal => modal.classList.remove('active'));
    currentItemName = itemName; currentItemPrice = price; currentQty = '1';
    updateQtyDisplay(); 
    openModal('modal-quantity');
}

function updateQtyDisplay() {
    document.getElementById('qty-item-name').innerText = currentItemName;
    document.getElementById('qty-display').innerText = currentQty;
    let qtyInt = parseInt(currentQty) || 0;
    document.getElementById('qty-calc-display').innerText = currentItemPrice === 0 ? `Inventory Update (0 Tk)` : `${qtyInt} x ${currentItemPrice} = ${qtyInt * currentItemPrice} Tk`;
}

export function qtyKeyPress(num) { 
    if (navigator.vibrate) navigator.vibrate(10);
    if (currentQty === '0') currentQty = num; 
    else if (currentQty.length < 3) currentQty += num; 
    updateQtyDisplay(); 
}

export function qtyBackspace() { 
    if (navigator.vibrate) navigator.vibrate(15);
    currentQty = currentQty.length > 1 ? currentQty.slice(0, -1) : '0'; 
    updateQtyDisplay(); 
}

export function saveQuantity() {
    let qtyInt = parseInt(currentQty) || 0;
    if (qtyInt <= 0) { showAppAlert("Invalid Input", "Please enter a quantity of 1 or more."); return; }
    
    // Prevent sales while viewing historical dates
    const datePicker = document.getElementById('report-date-picker');
    const t = new Date();
    const todayLocal = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
    if (datePicker && datePicker.value && datePicker.value !== todayLocal) {
        showAppAlert("Action Blocked", "You cannot process new transactions while viewing a past date. Please return to 'Today'.");
        return;
    }

    if (!passStockFirewall(currentItemName, qtyInt)) return;

    addTransactionToCloud('Item', currentItemName, qtyInt * currentItemPrice, qtyInt, (currentItemPrice > 0 && AppState.isMfs) ? "MFS" : "Cash");
    closeModal('modal-quantity');
}

export function instantSaveItem(itemName, price) {
  // Prevent sales while viewing historical dates
  const datePicker = document.getElementById('report-date-picker');
  const t = new Date();
  const todayLocal = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
  
  if (datePicker && datePicker.value && datePicker.value !== todayLocal) {
      showAppAlert("Action Blocked", "You cannot process new transactions while viewing a past date. Please return to 'Today'.");
      return;
  }

  if (!passStockFirewall(itemName, 1)) return;

  addTransactionToCloud('Item', itemName, price, 1, (price > 0 && AppState.isMfs) ? "MFS" : "Cash");

  setTimeout(() => {
    document.querySelectorAll('.modal-overlay').forEach(modal => modal.classList.remove('active'));
  }, 100);
}

// ==========================================
//    CORE TRANSACTION SAVER
// ==========================================
export function addTransactionToCloud(type, name, amount, qty, payment, cashAmt = 0, mfsAmt = 0) {
    if(!AppState.currentUser) return;
    
    // Prevent transactions if the desk hasn't been opened
    if (!AppState.currentSessionId && AppState.currentDeskId !== 'sandbox') {
        showAppAlert("Desk Closed", "You must open your desk and verify your float before making transactions.");
        return;
    }

    if (payment === 'Cash') { cashAmt = amount; mfsAmt = 0; }
    if (payment === 'MFS') { cashAmt = 0; mfsAmt = amount; }

    let catItem = Object.values(AppState.globalCatalog).find(c => c.name === name);
    let trackAs = catItem ? (catItem.trackAs || name) : name; 

    const tx = {
        id: Date.now(), receiptNo: generateReceiptNo(), type: type, name: name, trackAs: trackAs, amount: amount, qty: qty,
        payment: payment, cashAmt: cashAmt, mfsAmt: mfsAmt, isDeleted: false,
        time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
        dateStr: getStrictDate(),
        deskId: AppState.currentDeskId, sessionId: AppState.currentSessionId, agentId: AppState.currentUser.uid, agentName: AppState.userNickname || AppState.userDisplayName,
        timestamp: serverTimestamp()
    };

    if (AppState.currentDeskId === 'sandbox') {
        tx.docId = 'local_' + tx.id;
        AppState.transactions.push(tx);
        AppState.transactions.sort((a, b) => a.id - b.id);
        if (typeof window.renderPersonalReport === 'function') window.renderPersonalReport();
        if (document.getElementById('tab-desk') && document.getElementById('tab-desk').classList.contains('active') && typeof window.renderDeskDashboard === 'function') {
            window.renderDeskDashboard();
        }
        showFlashMessage("Saved to Sandbox!");
        if (AppState.isMfs && typeof window.toggleMFS === 'function') window.toggleMFS();
        return;
    }

    let confirmMsg = type === 'ERS' ? `ERS ${amount} Tk Logged!` : `${qty}x ${name} Logged!`;

    addDoc(collection(db, 'transactions'), tx).catch(e => {
        showAppAlert("Storage Error", "Could not save locally. Check storage.");
        console.error(e);
    });

    if (navigator.onLine) {
        showFlashMessage(confirmMsg);
    } else {
        showFlashMessage("Offline: Queued for sync");
    }

    if (AppState.isMfs && typeof window.toggleMFS === 'function') {
        window.toggleMFS();
    }
}

// ==========================================
//    EDIT, SPLIT PAYMENT, & TRASH
// ==========================================
let currentEditTxId = null;

export function openEditTx(id) {
    let tx = AppState.transactions.find(t => t.id === id);
    if(!tx) return;
    currentEditTxId = id;
    document.getElementById('edit-tx-name').innerText = "Edit: " + tx.name;
    document.getElementById('edit-tx-qty').value = tx.qty || 1;
    document.getElementById('edit-tx-amount').value = tx.amount;
    
    let paymentSelect = document.getElementById('edit-tx-payment');
    let splitFields = document.getElementById('edit-split-fields');
    if (tx.cashAmt > 0 && tx.mfsAmt > 0) {
        paymentSelect.value = 'Split'; splitFields.style.display = 'flex';
        document.getElementById('edit-tx-cash').value = tx.cashAmt;
        document.getElementById('edit-tx-mfs').value = tx.mfsAmt;
    } else { paymentSelect.value = tx.payment; splitFields.style.display = 'none'; }
    openModal('modal-edit-tx');
    
    setTimeout(() => {
        const qtyInput = document.getElementById('edit-tx-qty');
        if (qtyInput) { qtyInput.focus(); qtyInput.select(); }
    }, 100);
}

export function toggleEditSplitFields() {
    if (document.getElementById('edit-tx-payment').value === 'Split') {
        document.getElementById('edit-split-fields').style.display = 'flex';
        document.getElementById('edit-tx-cash').value = parseFloat(document.getElementById('edit-tx-amount').value) || 0;
        document.getElementById('edit-tx-mfs').value = 0;
    } else document.getElementById('edit-split-fields').style.display = 'none';
}

export function autoCalcEditTotal() {
    let tx = AppState.transactions.find(t => t.id === currentEditTxId);
    if (!tx) return;
         
    let catItem = Object.values(AppState.globalCatalog).find(c => c.name === tx.name);
    let unitPrice = catItem ? catItem.price : (tx.qty > 0 ? (tx.amount / tx.qty) : 0);
    let newQty = parseInt(document.getElementById('edit-tx-qty').value) || 0;
         
    document.getElementById('edit-tx-amount').value = unitPrice * newQty;
    updateSplitTotal();
}

export function updateSplitTotal() {
    let totalAmount = parseFloat(document.getElementById('edit-tx-amount').value) || 0;
    let cashInput = document.getElementById('edit-tx-cash');
    let mfsInput = document.getElementById('edit-tx-mfs');
         
    if (document.activeElement === cashInput) {
        let cashAmt = parseFloat(cashInput.value) || 0;
        mfsInput.value = Math.max(0, totalAmount - cashAmt);
    } else if (document.activeElement === mfsInput) {
        let mfsAmt = parseFloat(mfsInput.value) || 0;
        cashInput.value = Math.max(0, totalAmount - mfsAmt);
    }
}

export function cancelTxEdit() {
    currentEditTxId = null;
    closeModal('modal-edit-tx');
}

export function saveTxEdit() {
    if(!AppState.currentUser) return;
    let txIndex = AppState.transactions.findIndex(t => t.id === currentEditTxId);
    if(txIndex === -1) return;
    let tx = AppState.transactions[txIndex];
    
    let newQty = parseInt(document.getElementById('edit-tx-qty').value) || 0;
    let newAmount = parseFloat(document.getElementById('edit-tx-amount').value) || 0;
         
    if (newQty <= 0 || newAmount < 0) {
        showAppAlert("Invalid Edit", "Quantities must be 1 or greater, and amounts cannot be negative.");
        return;
    }
    let method = document.getElementById('edit-tx-payment').value;
    let finalCash = 0, finalMfs = 0;
    let diff = newQty - tx.qty;
     
    if (diff > 0 && !passStockFirewall(tx.name, diff)) return;
    
    if (method === 'Cash') finalCash = newAmount;
    else if (method === 'MFS') finalMfs = newAmount;
    else if (method === 'Split') {
        finalCash = parseFloat(document.getElementById('edit-tx-cash').value) || 0;
        finalMfs = parseFloat(document.getElementById('edit-tx-mfs').value) || 0;
        if (Math.abs((finalCash + finalMfs) - newAmount) > 0.01) { showAppAlert("Error", "Cash + MFS must equal Total Tk."); return; }
    }
    
    let prevTxState = {
        qty: tx.qty, amount: tx.amount, payment: tx.payment, cashAmt: tx.cashAmt, mfsAmt: tx.mfsAmt,
        editedAt: new Date().toISOString(), editedBy: AppState.userNickname || AppState.userDisplayName, editedByUid: AppState.currentUser.uid
    };
    let updatedEditHistory = tx.editHistory ? [...tx.editHistory, prevTxState] : [prevTxState];
    
    closeModal('modal-edit-tx');
    currentEditTxId = null;
         
    if (AppState.currentDeskId === 'sandbox') {
        tx.qty = newQty; tx.amount = newAmount; tx.payment = method === 'Split' ? 'Split' : method; tx.cashAmt = finalCash; tx.mfsAmt = finalMfs; tx.isEdited = true; tx.editHistory = updatedEditHistory;
        if (window.renderPersonalReport) window.renderPersonalReport(); 
        if (document.getElementById('tab-desk').classList.contains('active') && window.renderDeskDashboard) window.renderDeskDashboard();
        showFlashMessage("Sandbox Transaction Updated!"); 
        return;
    }
    if (tx.docId) {
        let msg = `${tx.name} Updated!`;
        updateDoc(doc(db, 'transactions', tx.docId), { qty: newQty, amount: newAmount, payment: method === 'Split' ? 'Split' : method, cashAmt: finalCash, mfsAmt: finalMfs, isEdited: true, editHistory: updatedEditHistory }).catch(e => console.error(e));
        showFlashMessage(navigator.onLine ? msg : "Offline: Edit queued");
    }
}

export function deleteTransaction(docId, localId) {
    if(!AppState.currentUser) return;
    showAppAlert("Delete Item", "Are you sure you want to move this transaction to the trash?", true, () => {
        let nowStr = new Date().toISOString();
        let agentStr = AppState.userNickname || AppState.userDisplayName;
        if (AppState.currentDeskId === 'sandbox') {
            let txIndex = AppState.transactions.findIndex(t => t.id === localId);
            if(txIndex > -1) { 
                let tx = AppState.transactions.splice(txIndex, 1)[0];
                tx.isDeleted = true; 
                tx.deletedBy = agentStr; tx.deletedByUid = AppState.currentUser.uid; tx.deletedAt = nowStr;
                AppState.trashTransactions.push(tx); 
                if (window.renderPersonalReport) window.renderPersonalReport(); 
                if (document.getElementById('tab-desk').classList.contains('active') && window.renderDeskDashboard) window.renderDeskDashboard();
                showFlashMessage("Moved to Sandbox Trash!"); 
            }
            return;
        }
        if(docId) {
            updateDoc(doc(db, 'transactions', docId), { isDeleted: true, deletedBy: agentStr, deletedByUid: AppState.currentUser.uid, deletedAt: nowStr }).catch(e => console.error(e));
            showFlashMessage(navigator.onLine ? "Moved to Trash!" : "Offline: Trash queued");
        }
    }, "Move to Trash");
}

export function openTrash() { renderTrash(); openModal('modal-trash'); }

export function renderTrash() {
    let html = '';
    if(AppState.trashTransactions.length === 0) html = '<p class="placeholder-text">Trash is empty</p>';
    else {
        [...AppState.trashTransactions].sort((a,b) => b.id - a.id).forEach(tx => {
            let safeDocId = tx.docId ? `'${tx.docId}'` : `null`;
            html += `
                <div style="border:1px solid var(--border-color); padding:12px; margin-bottom:8px; border-radius:8px; background: var(--surface-color);">
                    <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                        <strong style="color: var(--text-primary); text-decoration: line-through;">${tx.qty}x ${tx.name}</strong> 
                        <span style="font-weight:bold; color:#ef4444;">${tx.amount} Tk</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:0.8rem; color:var(--text-secondary);">${tx.time} | ${tx.payment}</span>
                        <div style="display:flex; gap: 8px;">
                            <button class="btn-outline" style="padding:6px 12px; font-size:0.85rem; height:auto; color: #10b981; gap: 6px;" onclick="restoreTx(${safeDocId}, ${tx.id})">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg> Restore
                            </button>
                            <button class="btn-outline" style="padding:6px 12px; font-size:0.85rem; height:auto; color: #ef4444; gap: 6px; background: #fef2f2;" onclick="permanentlyDeleteTx(${safeDocId}, ${tx.id})">
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

export function restoreTx(docId, localId) {
    if(!AppState.currentUser) return;
    let nowStr = new Date().toISOString();
    let agentStr = AppState.userNickname || AppState.userDisplayName;
    if (AppState.currentDeskId === 'sandbox') {
        let txIndex = AppState.trashTransactions.findIndex(t => t.id === localId);
        if (txIndex > -1) {
            let tx = AppState.trashTransactions[txIndex];
            if (!passStockFirewall(tx.name, tx.qty)) return;
            tx.isDeleted = false; tx.isRestored = true;
            tx.restoredBy = agentStr; tx.restoredByUid = AppState.currentUser.uid; tx.restoredAt = nowStr;
            AppState.trashTransactions.splice(txIndex, 1);
            AppState.transactions.push(tx);
            if (window.renderPersonalReport) window.renderPersonalReport(); 
            if (document.getElementById('tab-desk').classList.contains('active') && window.renderDeskDashboard) window.renderDeskDashboard();
            showFlashMessage("Sandbox Transaction Restored!");
            setTimeout(() => { renderTrash(); if(AppState.trashTransactions.length === 0) closeModal('modal-trash'); }, 500);
        }
        return;
    }
    if(docId) {
        try {
            let tx = AppState.trashTransactions.find(t => t.docId === docId);
            if (tx && !passStockFirewall(tx.name, tx.qty)) return;
            updateDoc(doc(db, 'transactions', docId), { isDeleted: false, isRestored: true, restoredBy: agentStr, restoredByUid: AppState.currentUser.uid, restoredAt: nowStr }).catch(e => console.error(e));
            showFlashMessage(navigator.onLine ? (tx ? `${tx.name} Restored!` : "Transaction Restored!") : "Offline: Restore queued");
            setTimeout(() => { renderTrash(); if(AppState.trashTransactions.length === 0) closeModal('modal-trash'); }, 500);
        } catch(e) {
            showAppAlert("Restore Failed", "Could not restore. Please check your connection.");
            console.error("Restore error:", e);
        }
    }
}

export function permanentlyDeleteTx(docId, localId) {
    showAppAlert("Permanent Delete", "This transaction will be permanently erased. This cannot be undone.", true, () => {
        if(docId) {
            deleteDoc(doc(db, 'transactions', docId)).catch(e => console.error(e));
            showFlashMessage(navigator.onLine ? "Permanently Deleted!" : "Offline: Delete queued");
        }
    }, "Delete Forever");
}

export function emptyTrash() {
    if(AppState.trashTransactions.length === 0) return;
    showAppAlert("Empty Trash", "Are you sure you want to permanently delete ALL items in the trash?", true, () => {
        closeModal('modal-trash');
        
        if (AppState.currentDeskId === 'sandbox') {
            AppState.trashTransactions = [];
            renderTrash();
            showFlashMessage("Sandbox Trash Emptied!");
            return;
        }
        const idsToDelete = AppState.trashTransactions.map(t => t.docId).filter(id => id);
        
        Promise.all(idsToDelete.map(id => deleteDoc(doc(db, 'transactions', id))))
            .catch(e => console.error("Error emptying trash:", e));
            
        AppState.trashTransactions = [];
        renderTrash();
        showFlashMessage("Trash Emptied!");
    }, "Empty Trash");
}

export function showAuditTrail(txId) {
    let tx = AppState.transactions.find(t => t.id == txId) || AppState.trashTransactions.find(t => t.id == txId);
    if (!tx) return;
    
    let msg = `Receipt: ${tx.receiptNo || tx.id}\nCreated by: ${tx.agentName} at ${tx.time}\n\n`;
    
    if (tx.editHistory && tx.editHistory.length > 0) {
        msg += `--- EDIT HISTORY ---\n`;
        tx.editHistory.forEach((edit, idx) => {
            let d = new Date(edit.editedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            msg += `[${idx+1}] Changed by ${edit.editedBy} at ${d}.\nPrevious State: ${edit.qty}x, ${edit.amount} Tk (${edit.payment})\n\n`;
        });
    }
    
    if (tx.isRestored) {
        let rd = tx.restoredAt ? new Date(tx.restoredAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Unknown';
        msg += `--- RESTORED ---\nRestored by ${tx.restoredBy || 'Unknown'} at ${rd}\n\n`;
    }
    
    if (tx.isDeleted) {
        let dd = tx.deletedAt ? new Date(tx.deletedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Unknown';
        msg += `--- DELETED ---\nDeleted by ${tx.deletedBy || 'Unknown'} at ${dd}\n\n`;
    }
    
    showAppAlert("Transaction Audit Trail", msg);
}