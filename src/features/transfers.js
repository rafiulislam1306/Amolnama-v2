// src/features/transfers.js
import { collection, addDoc, getDocs, query, where, doc, getDoc, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from '../config/firebase.js';
import { AppState } from '../core/state.js';
import { generateReceiptNo, getStrictDate } from '../utils/helpers.js';
import { showAppAlert, showFlashMessage, openModal, closeModal } from '../utils/ui-helpers.js';
import { passStockFirewall, getPhysicalItems } from './inventory.js';

export function openManagerCashModal() {
    if(!AppState.currentSessionId) { showAppAlert("Error", "Desk not open."); return; }
    document.getElementById('mgr-cash-amount').value = '';
    openModal('modal-manager-cash');
    setTimeout(() => {
        const amtInput = document.getElementById('mgr-cash-amount');
        if (amtInput) { amtInput.focus(); }
    }, 100);
}

export async function saveManagerCash() {
    let amount = parseFloat(document.getElementById('mgr-cash-amount').value) || 0;
    if (amount <= 0) { showAppAlert("Invalid Input", "Enter a valid amount."); return; }
    
    let action = document.getElementById('mgr-cash-action').value; 
    let isCashIn = action === 'receive_float' || action === 'handset_cash';
    let finalValue = isCashIn ? amount : -amount;
    
    let txName = 'Cash Adjustment';
    let paymentLabel = '';
    
    if (action === 'drop_manager') { txName = 'Manager Drop'; paymentLabel = 'Dropped to Manager'; }
    else if (action === 'expense') { txName = 'Expense / Donation'; paymentLabel = 'Cash Out'; }
    else if (action === 'handset_cash') { txName = 'Handset Cash'; paymentLabel = 'Cash In (Holding)'; }
    else if (action === 'receive_float') { txName = 'Manager Float'; paymentLabel = 'Cash In (Float)'; }

    const tx = {
        id: Date.now(), receiptNo: generateReceiptNo(), type: 'adjustment', name: txName, trackAs: 'Physical Cash', amount: amount, qty: 1,
        payment: paymentLabel, cashAmt: finalValue, mfsAmt: 0, isDeleted: false,
        time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
        dateStr: getStrictDate(), deskId: AppState.currentDeskId, sessionId: AppState.currentSessionId, agentId: AppState.currentUser.uid, agentName: AppState.userNickname || AppState.userDisplayName,
        timestamp: serverTimestamp()
    };

    try {
        await addDoc(collection(db, 'transactions'), tx);
        closeModal('modal-manager-cash');
        showFlashMessage(navigator.onLine ? `${txName} Logged!` : "Offline: Action queued");
    } catch(e) {
        showAppAlert("Save Failed", "Could not complete cash action. Please try again.");
        console.error(e);
    }
}

export function openMainStockModal() {
    if(!AppState.currentSessionId) { showAppAlert("Error", "Desk not open."); return; }
    document.getElementById('main-stock-qty').value = '';
    let selectEl = document.getElementById('main-stock-item');
    selectEl.innerHTML = '';
    getPhysicalItems().forEach(itemName => {
        let opt = document.createElement('option'); opt.value = itemName; opt.innerText = itemName;
        selectEl.appendChild(opt);
    });
    openModal('modal-main-stock');
    setTimeout(() => {
        const qtyInput = document.getElementById('main-stock-qty');
        if (qtyInput) { qtyInput.focus(); }
    }, 150);
}

export async function saveMainStock() {
    let qty = parseInt(document.getElementById('main-stock-qty').value) || 0;
    if (qty <= 0) { showAppAlert("Invalid Input", "Enter a valid quantity."); return; }
    let itemName = document.getElementById('main-stock-item').value;

    const tx = {
        id: Date.now(), receiptNo: generateReceiptNo(), type: 'transfer_in', name: itemName, trackAs: itemName, amount: 0, qty: qty,
        payment: 'Received from Main Stock', cashAmt: 0, mfsAmt: 0, isDeleted: false,
        time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
        dateStr: getStrictDate(), deskId: AppState.currentDeskId, sessionId: AppState.currentSessionId, agentId: AppState.currentUser.uid, agentName: AppState.userNickname || AppState.userDisplayName,
        timestamp: serverTimestamp()
    };

    try {
        await addDoc(collection(db, 'transactions'), tx);
        closeModal('modal-main-stock');
        showFlashMessage(navigator.onLine ? `+${qty}x ${itemName} Added!` : "Offline: Stock queued");
    } catch(e) {
        showAppAlert("Save Failed", "Could not add stock from main inventory.");
        console.error(e);
    }
}

export function openReturnStockModal() {
    if(!AppState.currentSessionId) { showAppAlert("Error", "Desk not open."); return; }
    document.getElementById('return-stock-qty').value = '';
    let selectEl = document.getElementById('return-stock-item');
    selectEl.innerHTML = '';
    getPhysicalItems().forEach(itemName => {
        let opt = document.createElement('option'); opt.value = itemName; opt.innerText = itemName;
        selectEl.appendChild(opt);
    });
    openModal('modal-return-stock');
    setTimeout(() => {
        const qtyInput = document.getElementById('return-stock-qty');
        if (qtyInput) { qtyInput.focus(); }
    }, 150);
}

export async function saveReturnStock() {
    let qty = parseInt(document.getElementById('return-stock-qty').value) || 0;
    if (qty <= 0) { showAppAlert("Invalid Input", "Enter a valid quantity."); return; }
    let itemName = document.getElementById('return-stock-item').value;

    if (!passStockFirewall(itemName, qty)) return;

    const tx = {
        id: Date.now(), receiptNo: generateReceiptNo(), type: 'transfer_out', name: itemName, trackAs: itemName, amount: 0, qty: qty,
        payment: 'Returned to Main Stock', cashAmt: 0, mfsAmt: 0, isDeleted: false,
        time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
        dateStr: getStrictDate(), deskId: AppState.currentDeskId, sessionId: AppState.currentSessionId, agentId: AppState.currentUser.uid, agentName: AppState.userNickname || AppState.userDisplayName,
        timestamp: serverTimestamp()
    };

    try {
        await addDoc(collection(db, 'transactions'), tx);
        closeModal('modal-return-stock');
        showFlashMessage(navigator.onLine ? `-${qty}x ${itemName} Returned!` : "Offline: Return queued");
    } catch(e) {
        showAppAlert("Save Failed", "Could not return stock to main inventory.");
        console.error(e);
    }
}

export async function openDeskTransfer() {
    if(!AppState.currentSessionId) { showAppAlert("Error", "Desk not open."); return; }
    document.getElementById('desk-transfer-qty').value = '';
    
    let itemSelect = document.getElementById('desk-transfer-item');
    itemSelect.innerHTML = '';
    getPhysicalItems().forEach(itemName => {
        let opt = document.createElement('option'); opt.value = itemName; opt.innerText = itemName;
        itemSelect.appendChild(opt);
    });

    let targetSelect = document.getElementById('desk-transfer-target');
    targetSelect.innerHTML = '<option value="">Loading active desks...</option>';
    openModal('modal-desk-transfer');
    setTimeout(() => {
        const qtyInput = document.getElementById('desk-transfer-qty');
        if (qtyInput) { qtyInput.focus(); }
    }, 150);

    try {
        const activeSessionsSnap = await getDocs(query(collection(db, 'sessions'), where('status', '==', 'open')));
        let optionsHTML = '';
        
        for (const docSnap of activeSessionsSnap.docs) {
            let deskData = docSnap.data();
            if(deskData.deskId !== AppState.currentDeskId) {
                let displayName = deskData.deskId.replace('_', ' ').toUpperCase();
                
                try {
                    const deskSnap = await getDoc(doc(db, 'desks', deskData.deskId));
                    if (deskSnap.exists() && deskSnap.data().name) {
                        displayName = deskSnap.data().name;
                    }
                } catch(e) { console.error(e); }
                
                optionsHTML += `<option value="${deskData.deskId}|${docSnap.id}">${displayName}</option>`;
            }
        }
        
        targetSelect.innerHTML = optionsHTML || '<option value="">No other desks open</option>';
    } catch(e) { targetSelect.innerHTML = '<option value="">Offline: Cannot fetch desks</option>'; }
}

export async function executeDeskTransfer() {
    if (!navigator.onLine) {
        showAppAlert("Connection Required", "Desk-to-desk transfers require an active internet connection so the receiving desk gets the stock immediately. Please connect and try again.");
        return;
    }

    let qty = parseInt(document.getElementById('desk-transfer-qty').value) || 0;
    if (qty <= 0) { showAppAlert("Invalid Input", "Enter valid quantity."); return; }
    let itemName = document.getElementById('desk-transfer-item').value;

    let targetSelect = document.getElementById('desk-transfer-target');
    let targetVal = targetSelect.value;
    if (!targetVal) { showAppAlert("Error", "Please select a desk."); return; }
    
    let targetDeskName = targetSelect.options[targetSelect.selectedIndex].text;
    let [targetDeskId, targetSessionId] = targetVal.split('|');
    let timeStr = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    let dateStr = getStrictDate();

    let directionEl = document.querySelector('input[name="transfer-direction"]:checked');
    let direction = directionEl ? directionEl.value : 'send';

    let senderTx, receiverTx;

    if (direction === 'send') {
        if (!passStockFirewall(itemName, qty)) return;
        senderTx = { id: Date.now(), receiptNo: generateReceiptNo(), type: 'transfer_out', name: itemName, trackAs: itemName, amount: 0, qty: qty, payment: `Sent to ${targetDeskName}`, cashAmt: 0, mfsAmt: 0, isDeleted: false, time: timeStr, dateStr: dateStr, deskId: AppState.currentDeskId, sessionId: AppState.currentSessionId, agentId: AppState.currentUser.uid, agentName: AppState.userNickname || AppState.userDisplayName, timestamp: serverTimestamp() };
        receiverTx = { id: Date.now() + 1, receiptNo: generateReceiptNo(), type: 'transfer_in', name: itemName, trackAs: itemName, amount: 0, qty: qty, payment: `Received from ${AppState.currentDeskName}`, cashAmt: 0, mfsAmt: 0, isDeleted: false, time: timeStr, dateStr: dateStr, deskId: targetDeskId, sessionId: targetSessionId, agentId: AppState.currentUser.uid, agentName: AppState.userNickname || AppState.userDisplayName, isRemoteTransfer: true, timestamp: serverTimestamp() };
        
        try {
            const batch = writeBatch(db);
            batch.set(doc(collection(db, 'transactions')), senderTx);
            batch.set(doc(collection(db, 'transactions')), receiverTx);
            
            await batch.commit();
            closeModal('modal-desk-transfer');
            showFlashMessage(navigator.onLine ? `Sent ${qty}x ${itemName} to ${targetDeskName}!` : "Offline: Transfer queued");
        } catch(e) {
            showAppAlert("Transfer Failed", "Could not securely move the stock. No items were transferred.");
            console.error(e);
        }
    } else {
        try {
            let tSessSnap = await getDoc(doc(db, 'sessions', targetSessionId));
            let theirInv = tSessSnap.exists() ? (tSessSnap.data().openingBalances?.inventory || {}) : {};
            let theirStock = theirInv[itemName] || 0;
            
            const txSnap = await getDocs(query(collection(db, 'transactions'), where('sessionId', '==', targetSessionId), where('isDeleted', '==', false), where('trackAs', '==', itemName)));
            txSnap.forEach(tDoc => { 
                let t = tDoc.data();
                if (t.type === 'transfer_in') theirStock += Math.abs(t.qty);
                else if (t.type === 'transfer_out') theirStock -= Math.abs(t.qty);
                else if (t.type === 'adjustment') theirStock += Math.abs(t.qty);
                else theirStock -= Math.abs(t.qty);
            });
            
            if (theirStock < qty) {
                showAppAlert("Pull Failed", `${targetDeskName} only has ${theirStock}x ${itemName} available.`);
                return;
            }
            
            senderTx = { id: Date.now(), receiptNo: generateReceiptNo(), type: 'transfer_out', name: itemName, trackAs: itemName, amount: 0, qty: qty, payment: `Pulled by ${AppState.currentDeskName}`, cashAmt: 0, mfsAmt: 0, isDeleted: false, time: timeStr, dateStr: dateStr, deskId: targetDeskId, sessionId: targetSessionId, agentId: AppState.currentUser.uid, agentName: AppState.userNickname || AppState.userDisplayName, isRemoteTransfer: true, timestamp: serverTimestamp() };
            receiverTx = { id: Date.now() + 1, receiptNo: generateReceiptNo(), type: 'transfer_in', name: itemName, trackAs: itemName, amount: 0, qty: qty, payment: `Pulled from ${targetDeskName}`, cashAmt: 0, mfsAmt: 0, isDeleted: false, time: timeStr, dateStr: dateStr, deskId: AppState.currentDeskId, sessionId: AppState.currentSessionId, agentId: AppState.currentUser.uid, agentName: AppState.userNickname || AppState.userDisplayName, timestamp: serverTimestamp() };
            
            const batch = writeBatch(db);
            batch.set(doc(collection(db, 'transactions')), senderTx);
            batch.set(doc(collection(db, 'transactions')), receiverTx);
            
            await batch.commit();
            closeModal('modal-desk-transfer');
            showFlashMessage(navigator.onLine ? `Pulled ${qty}x ${itemName} from ${targetDeskName}!` : "Offline: Transfer queued");
        } catch(e) {
            showAppAlert("Pull Failed", "Could not complete the pull request. Check your connection.");
            console.error(e);
        }
    }
}

let targetTransferDeskId = null; 
let targetTransferSessionId = null;
let targetTransferDeskName = ''; 

export function openTransferModal(targetDesk, targetSession, targetName) {
    targetTransferDeskId = targetDesk; 
    targetTransferSessionId = targetSession;
    targetTransferDeskName = targetDesk.startsWith('personal_') ? (targetName || "Personal Drawer") : targetDesk.replace('_', ' ').toUpperCase();
    
    document.getElementById('transfer-target-name').innerText = targetTransferDeskName;
    document.getElementById('transfer-qty').value = '';
    let selectEl = document.getElementById('transfer-item-select');
    selectEl.innerHTML = '';
    getPhysicalItems().forEach(itemName => {
        let opt = document.createElement('option'); opt.value = itemName; opt.innerText = itemName;
        selectEl.appendChild(opt);
    });
    openModal('modal-transfer');
}

export function executeTransfer() {
    let qty = parseInt(document.getElementById('transfer-qty').value) || 0;
    if (qty <= 0) { showAppAlert("Invalid Input", "Enter valid quantity."); return; }
    let itemName = document.getElementById('transfer-item-select').value;
    let timeStr = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    let dateStr = getStrictDate();

    let senderName = AppState.currentDeskName || "Admin";

    const senderTx = { id: Date.now(), receiptNo: generateReceiptNo(), type: 'transfer_out', name: itemName, trackAs: itemName, amount: 0, qty: qty, payment: `Sent to ${targetTransferDeskName}`, cashAmt: 0, mfsAmt: 0, isDeleted: false, time: timeStr, dateStr: dateStr, deskId: AppState.currentDeskId || "Admin", sessionId: AppState.currentSessionId || "Admin", agentId: AppState.currentUser.uid, agentName: AppState.userNickname || AppState.userDisplayName, timestamp: serverTimestamp() };
    const receiverTx = { id: Date.now() + 1, receiptNo: generateReceiptNo(), type: 'transfer_in', name: itemName, trackAs: itemName, amount: 0, qty: qty, payment: `Received from ${senderName}`, cashAmt: 0, mfsAmt: 0, isDeleted: false, time: timeStr, dateStr: dateStr, deskId: targetTransferDeskId, sessionId: targetTransferSessionId, agentId: AppState.currentUser.uid, agentName: AppState.userNickname || AppState.userDisplayName, isRemoteTransfer: true, timestamp: serverTimestamp() };

    showAppAlert("Confirm Force Transfer", `You are about to force-transfer ${qty}x ${itemName} to ${targetTransferDeskName}. This bypasses standard stock limits. Proceed?`, true, async () => {
        try {
            const batch = writeBatch(db);
            batch.set(doc(collection(db, 'transactions')), senderTx);
            batch.set(doc(collection(db, 'transactions')), receiverTx);
            
            await batch.commit();
            closeModal('modal-transfer');
            showFlashMessage(navigator.onLine ? `Sent to ${targetTransferDeskName}!` : "Offline: Queued for sync.");
        } catch(e) {
            showAppAlert("Transfer Failed", "Could not complete admin transfer.");
            console.error(e);
        }
    }, "Force Transfer");
}