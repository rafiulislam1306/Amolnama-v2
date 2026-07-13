// src/features/transfers.js
import { collection, addDoc, getDocs, query, where, doc, getDoc, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from '../config/firebase.js';
import { AppState } from '../core/state.js';
import { generateReceiptNo, getStrictDate } from '../utils/helpers.js';
import { showAppAlert, showFlashMessage, openModal, closeModal } from '../utils/ui-helpers.js';
import { passStockFirewall, getPhysicalItems, getInventoryChange } from './inventory.js';

export function openManagerCashModal() {
    if(!AppState.currentSessionId) { showAppAlert("Error", "Desk not open."); return; }
    document.getElementById('mgr-cash-amount').value = '';
    
    const notesInput = document.getElementById('mgr-cash-notes');
    if (notesInput) notesInput.value = '';
    
    const handsetModelInput = document.getElementById('mgr-cash-handset-model');
    if (handsetModelInput) handsetModelInput.value = '';
    
    const handsetWrapper = document.getElementById('handset-model-wrapper');
    if (handsetWrapper) handsetWrapper.style.display = 'none';
    
    // Reset payment fields
    const paySelect = document.getElementById('mgr-cash-payment');
    if (paySelect) paySelect.value = 'Cash';
    const payWrapper = document.getElementById('mgr-cash-payment-wrapper');
    if (payWrapper) payWrapper.style.display = 'none';
    const splitFields = document.getElementById('mgr-cash-split-fields');
    if (splitFields) splitFields.style.display = 'none';
    document.getElementById('mgr-cash-split-cash').value = '';
    document.getElementById('mgr-cash-split-mfs').value = '';
    
    const actionSelect = document.getElementById('mgr-cash-action');
    if (actionSelect) {
        actionSelect.value = 'drop_manager';
        // Attach change listener if not already done
        if (!actionSelect.dataset.listenerBound) {
            actionSelect.addEventListener('change', (e) => {
                const wrapper = document.getElementById('handset-model-wrapper');
                const pWrapper = document.getElementById('mgr-cash-payment-wrapper');
                const nWrapper = document.getElementById('mgr-cash-notes-wrapper');
                if (wrapper) {
                    wrapper.style.display = e.target.value === 'handset_cash' ? 'block' : 'none';
                }
                if (pWrapper) {
                    pWrapper.style.display = e.target.value === 'handset_cash' ? 'block' : 'none';
                    if (e.target.value !== 'handset_cash') {
                        document.getElementById('mgr-cash-split-fields').style.display = 'none';
                    }
                }
                if (nWrapper) {
                    nWrapper.style.display = e.target.value === 'handset_cash' ? 'none' : 'block';
                }
            });
            actionSelect.dataset.listenerBound = 'true';
        }
    }
    
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
    let finalCash = 0;
    let finalMfs = 0;
    let method = 'Cash';
    let txName = 'Cash Adjustment';
    let paymentLabel = '';

    if (action === 'drop_manager') { 
        txName = 'Manager Drop'; 
        paymentLabel = 'Dropped to Manager'; 
        finalCash = -amount;
    } else if (action === 'expense') { 
        txName = 'Expense / Donation'; 
        paymentLabel = 'Cash Out'; 
        finalCash = -amount;
    } else if (action === 'receive_float') { 
        txName = 'Manager Float'; 
        paymentLabel = 'Cash In (Float)'; 
        finalCash = amount;
    } else if (action === 'handset_cash') { 
        txName = 'Handset Cash'; 
        method = document.getElementById('mgr-cash-payment').value;
        
        if (method === 'Split') {
            let cashVal = parseFloat(document.getElementById('mgr-cash-split-cash').value) || 0;
            let mfsVal = parseFloat(document.getElementById('mgr-cash-split-mfs').value) || 0;
            if (Math.abs((cashVal + mfsVal) - amount) > 0.01) {
                showAppAlert("Invalid Split", "Cash and MFS amounts must sum up to the total amount.");
                return;
            }
            finalCash = cashVal;
            finalMfs = mfsVal;
            paymentLabel = 'Split';
        } else if (method === 'MFS') {
            finalMfs = amount;
            paymentLabel = 'MFS';
        } else {
            finalCash = amount;
            paymentLabel = 'Cash';
        }
    }

    let notes = '';
    if (action !== 'handset_cash') {
        notes = document.getElementById('mgr-cash-notes') ? document.getElementById('mgr-cash-notes').value.trim() : '';
    }
    let handsetModel = '';
    if (action === 'handset_cash') {
        const modelInput = document.getElementById('mgr-cash-handset-model');
        if (modelInput) handsetModel = modelInput.value.trim();
    }

    const tx = {
        id: Date.now(), receiptNo: generateReceiptNo(), type: 'adjustment', name: txName, trackAs: 'Physical Cash', amount: amount, qty: 1,
        payment: paymentLabel, cashAmt: finalCash, mfsAmt: finalMfs, isDeleted: false,
        time: new Date().toLocaleTimeString('en-GB', {hour: '2-digit', minute:'2-digit'}),
        dateStr: getStrictDate(), deskId: AppState.currentDeskId, sessionId: AppState.currentSessionId, agentId: AppState.currentUser.uid, agentName: AppState.userNickname || AppState.userDisplayName,
        timestamp: serverTimestamp()
    };

    if (notes) tx.notes = notes;
    if (handsetModel) tx.handsetModel = handsetModel;

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
        time: new Date().toLocaleTimeString('en-GB', {hour: '2-digit', minute:'2-digit'}),
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
        time: new Date().toLocaleTimeString('en-GB', {hour: '2-digit', minute:'2-digit'}),
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
        
        // Deduplicate sessions (prevent sending to ghost sessions)
        let uniqueDesks = new Map();
        activeSessionsSnap.docs.forEach(doc => {
            const data = doc.data();
            if (uniqueDesks.has(data.deskId)) {
                const existingOpenedAt = uniqueDesks.get(data.deskId).data().openedAt;
                const newOpenedAt = data.openedAt;
                const existingTime = (existingOpenedAt && typeof existingOpenedAt.toMillis === 'function') ? existingOpenedAt.toMillis() : (existingOpenedAt?.seconds ? existingOpenedAt.seconds * 1000 : 0);
                const newTime = (newOpenedAt && typeof newOpenedAt.toMillis === 'function') ? newOpenedAt.toMillis() : (newOpenedAt?.seconds ? newOpenedAt.seconds * 1000 : 0);
                if (newTime > existingTime) {
                    uniqueDesks.set(data.deskId, doc);
                }
            } else {
                uniqueDesks.set(data.deskId, doc);
            }
        });
        
        for (const docSnap of uniqueDesks.values()) {
            let deskData = docSnap.data();
            let sid = docSnap.id;

            // Filter out old sessions from past dates that were left open and not yet rolled over
            if (deskData.dateStr !== getStrictDate()) continue;

            if(deskData.deskId !== AppState.currentDeskId) {
                // --- FLOOR MAP HEALTH CHECK ---
                const sessionTxs = AppState.transactions.filter(tx => tx.sessionId === sid && !tx.isDeleted);
                let liveCash = parseFloat(deskData.openingBalances?.cash) || 0;
                let liveInv = { ...(deskData.openingBalances?.inventory || {}) };
                let hasSalesActivity = false;

                sessionTxs.forEach(tx => {
                    let safeCashAmt = tx.cashAmt !== undefined ? tx.cashAmt : (tx.payment === 'Cash' ? tx.amount : 0);
                    liveCash += safeCashAmt;
                    
                    let change = getInventoryChange(tx);
                    if (change !== 0) {
                        liveInv[tx.trackAs] = (liveInv[tx.trackAs] || 0) + change;
                    }
                    
                    if (tx.type === 'Item' || tx.type === 'ERS' || tx.type === 'sale') {
                        hasSalesActivity = true;
                    }
                });

                let totalStockQty = Object.values(liveInv).reduce((sum, qty) => sum + Math.max(0, qty || 0), 0);

                // Skip ghost desks: No sales, zero stock, zero cash
                if (!hasSalesActivity && totalStockQty === 0 && liveCash === 0) continue;
                // ------------------------------

                let displayName = deskData.deskName || deskData.deskId.replace('_', ' ').toUpperCase();
                
                if (deskData.deskId.startsWith('personal_')) {
                    const uid = deskData.deskId.replace('personal_', '');
                    try {
                        const userSnap = await getDoc(doc(db, 'users', uid));
                        if (userSnap.exists() && userSnap.data().nickname) {
                            displayName = `${userSnap.data().nickname}'s Drawer`;
                        } else if (userSnap.exists() && userSnap.data().displayName) {
                            const firstName = userSnap.data().displayName.split(' ')[0];
                            displayName = `${firstName}'s Drawer`;
                        }
                    } catch(e) { console.error(e); }
                } else {
                    try {
                        const deskSnap = await getDoc(doc(db, 'desks', deskData.deskId));
                        if (deskSnap.exists() && deskSnap.data().name) {
                            displayName = deskSnap.data().name;
                        }
                    } catch(e) { console.error(e); }
                }
                
                optionsHTML += `<option value="${deskData.deskId}|${docSnap.id}|${deskData.openedByUid || ''}|${(deskData.openedBy || '').replace(/\|/g, '')}">${displayName}</option>`;
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
    let [targetDeskId, targetSessionId, targetAgentId, targetAgentName] = targetVal.split('|');
    let timeStr = new Date().toLocaleTimeString('en-GB', {hour: '2-digit', minute:'2-digit'});
    let dateStr = getStrictDate();

    let senderTx, receiverTx;

    if (!passStockFirewall(itemName, qty)) return;
    let transferGroupId = 'tr_' + Date.now();
    senderTx = { id: Date.now(), receiptNo: generateReceiptNo(), type: 'transfer_out', name: itemName, trackAs: itemName, amount: 0, qty: qty, payment: `Sent to ${targetDeskName}`, cashAmt: 0, mfsAmt: 0, isDeleted: false, time: timeStr, dateStr: dateStr, deskId: AppState.currentDeskId, sessionId: AppState.currentSessionId, agentId: AppState.currentUser.uid, agentName: AppState.userNickname || AppState.userDisplayName, transferGroupId: transferGroupId, timestamp: serverTimestamp() };
    receiverTx = { id: Date.now() + 1, receiptNo: generateReceiptNo(), type: 'transfer_in', name: itemName, trackAs: itemName, amount: 0, qty: qty, payment: `Received from ${AppState.currentDeskName}`, cashAmt: 0, mfsAmt: 0, isDeleted: false, time: timeStr, dateStr: dateStr, deskId: targetDeskId, sessionId: targetSessionId, agentId: targetAgentId || AppState.currentUser.uid, agentName: AppState.userNickname || AppState.userDisplayName, isRemoteTransfer: true, transferGroupId: transferGroupId, timestamp: serverTimestamp() };
    
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
    let timeStr = new Date().toLocaleTimeString('en-GB', {hour: '2-digit', minute:'2-digit'});
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

export function toggleMgrCashPaymentFields() {
    const payVal = document.getElementById('mgr-cash-payment').value;
    const splitFields = document.getElementById('mgr-cash-split-fields');
    if (splitFields) {
        splitFields.style.display = payVal === 'Split' ? 'flex' : 'none';
    }
    if (payVal === 'Split') {
        const totalAmt = parseFloat(document.getElementById('mgr-cash-amount').value) || 0;
        document.getElementById('mgr-cash-split-cash').value = totalAmt;
        document.getElementById('mgr-cash-split-mfs').value = 0;
    }
}

export function validateMgrCashSplit() {
    const totalAmt = parseFloat(document.getElementById('mgr-cash-amount').value) || 0;
    let cashAmt = parseFloat(document.getElementById('mgr-cash-split-cash').value) || 0;
    let mfsAmt = parseFloat(document.getElementById('mgr-cash-split-mfs').value) || 0;

    const activeEl = document.activeElement;
    if (activeEl && activeEl.id === 'mgr-cash-split-cash') {
        mfsAmt = Math.max(0, totalAmt - cashAmt);
        document.getElementById('mgr-cash-split-mfs').value = mfsAmt;
    } else if (activeEl && activeEl.id === 'mgr-cash-split-mfs') {
        cashAmt = Math.max(0, totalAmt - mfsAmt);
        document.getElementById('mgr-cash-split-cash').value = cashAmt;
    }
}