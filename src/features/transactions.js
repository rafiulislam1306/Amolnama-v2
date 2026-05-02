// src/features/transactions.js
import { collection, addDoc } from "firebase/firestore";
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
    
    if (!passStockFirewall(currentItemName, qtyInt)) return;

    addTransactionToCloud('Item', currentItemName, qtyInt * currentItemPrice, qtyInt, (currentItemPrice > 0 && AppState.isMfs) ? "MFS" : "Cash");
    closeModal('modal-quantity');
}

export function instantSaveItem(itemName, price) {
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
    if (payment === 'Cash') { cashAmt = amount; mfsAmt = 0; }
    if (payment === 'MFS') { cashAmt = 0; mfsAmt = amount; }

    let catItem = Object.values(AppState.globalCatalog).find(c => c.name === name);
    let trackAs = catItem ? (catItem.trackAs || name) : name; 

    const tx = {
        id: Date.now(), receiptNo: generateReceiptNo(), type: type, name: name, trackAs: trackAs, amount: amount, qty: qty,
        payment: payment, cashAmt: cashAmt, mfsAmt: mfsAmt, isDeleted: false,
        time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
        dateStr: getStrictDate(),
        deskId: AppState.currentDeskId, sessionId: AppState.currentSessionId, agentId: AppState.currentUser.uid, agentName: AppState.userNickname || AppState.userDisplayName
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