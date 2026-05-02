// ==========================================
//    1. FIREBASE CONFIGURATION & IMPORTS
// ==========================================
import { auth, db } from './config/firebase.js';
import { collection, doc, setDoc, getDoc, addDoc, updateDoc, deleteDoc, query, where, getDocs, orderBy, limit, serverTimestamp, onSnapshot } from "firebase/firestore";
import { getStrictDate, generateReceiptNo, formatToGBDate } from './utils/helpers.js';
import { showAppAlert, executeAlertConfirm, showFlashMessage, openModal, closeModal, showTooltip } from './utils/ui-helpers.js';
import { initPWA } from './features/pwa.js';
import { initAuth, signInWithGoogle, logout } from './features/auth.js';
import { AppState } from './core/state.js';
import { ersKeyPress, ersBackspace, saveErs, selectItem, qtyKeyPress, qtyBackspace, saveQuantity, instantSaveItem, addTransactionToCloud } from './features/transactions.js';
import { getPhysicalItems, getInventoryChange, getAvailableStock, passStockFirewall, switchStoreCategory } from './features/inventory.js';
import { performLazyAutoClose, loadFloorMap, adminBypass, enterSandboxMode, handleDeskSelect, confirmOpenDesk } from './features/desk.js';
import { toggleReportMode, renderPersonalReport, shareReport, shareDeskReport, renderDeskDashboard } from './features/reports.js';
import { openManagerCashModal, saveManagerCash, openMainStockModal, saveMainStock, openReturnStockModal, saveReturnStock, openDeskTransfer, executeDeskTransfer, openTransferModal, executeTransfer } from './features/transfers.js';
import { filterAdminCatalog, toggleAddForm, addInventoryGroup, removeInventoryGroup, openSettings, removeRow, addNewItem, saveSettings, openNicknameManager, saveAdminNickname, kickAgent, nukeAgent, resetMyDeskLock, forceCloseAllDesks, nukeTodaysLedger, fixPastManagerDrops, exportLedgerCSV, openAuditModal, fetchAuditLogs, openForceReallocate, executeForceTransfer } from './features/admin.js';
import { openDevNotes, addDevNote, editDevNote, toggleDevNote, deleteDevNote } from './features/devNotes.js';

// ==========================================
//    TEMPORARY REFACTORING BRIDGE
// ==========================================
// This links the old variable names to our new AppState so the rest of main.js doesn't break!
Object.defineProperties(window, {
    currentUser: { get: () => AppState.currentUser, set: (v) => AppState.currentUser = v },
    userDisplayName: { get: () => AppState.userDisplayName, set: (v) => AppState.userDisplayName = v },
    userNickname: { get: () => AppState.userNickname, set: (v) => AppState.userNickname = v },
    currentUserRole: { get: () => AppState.currentUserRole, set: (v) => AppState.currentUserRole = v },
    currentDeskId: { get: () => AppState.currentDeskId, set: (v) => AppState.currentDeskId = v },
    currentSessionId: { get: () => AppState.currentSessionId, set: (v) => AppState.currentSessionId = v },
    currentDeskName: { get: () => AppState.currentDeskName, set: (v) => AppState.currentDeskName = v },
    currentOpeningCash: { get: () => AppState.currentOpeningCash, set: (v) => AppState.currentOpeningCash = v },
    currentOpeningInv: { get: () => AppState.currentOpeningInv, set: (v) => AppState.currentOpeningInv = v },
    globalCatalog: { get: () => AppState.globalCatalog, set: (v) => AppState.globalCatalog = v },
    globalInventoryGroups: { get: () => AppState.globalInventoryGroups, set: (v) => AppState.globalInventoryGroups = v },
    transactions: { get: () => AppState.transactions, set: (v) => AppState.transactions = v },
    trashTransactions: { get: () => AppState.trashTransactions, set: (v) => AppState.trashTransactions = v },
    isMfs: { get: () => AppState.isMfs, set: (v) => AppState.isMfs = v }
    devNotesQueue: { get: () => AppState.devNotesQueue, set: (v) => AppState.devNotesQueue = v }
});

// Initialize Service Worker & PWA Install Prompts
initPWA();

// Bind UI Helpers to the window so HTML buttons can click them
window.executeAlertConfirm = executeAlertConfirm;
window.showTooltip = showTooltip;
window.openModal = openModal;
window.closeModal = closeModal;
window.showAppAlert = showAppAlert;
window.showFlashMessage = showFlashMessage;
window.ersKeyPress = ersKeyPress;
window.ersBackspace = ersBackspace;
window.saveErs = saveErs;
window.selectItem = selectItem;
window.qtyKeyPress = qtyKeyPress;
window.qtyBackspace = qtyBackspace;
window.saveQuantity = saveQuantity;
window.toggleMFS = toggleMFS;
window.getPhysicalItems = getPhysicalItems;
window.getInventoryChange = getInventoryChange;
window.passStockFirewall = passStockFirewall;
window.switchStoreCategory = switchStoreCategory;
window.loadFloorMap = loadFloorMap;
window.adminBypass = adminBypass;
window.enterSandboxMode = enterSandboxMode;
window.handleDeskSelect = handleDeskSelect;
window.confirmOpenDesk = confirmOpenDesk;
window.toggleReportMode = toggleReportMode;
window.renderPersonalReport = renderPersonalReport;
window.shareReport = shareReport;
window.shareDeskReport = shareDeskReport;
window.renderDeskDashboard = renderDeskDashboard;
window.openManagerCashModal = openManagerCashModal;
window.saveManagerCash = saveManagerCash;
window.openMainStockModal = openMainStockModal;
window.saveMainStock = saveMainStock;
window.openReturnStockModal = openReturnStockModal;
window.saveReturnStock = saveReturnStock;
window.openDeskTransfer = openDeskTransfer;
window.executeDeskTransfer = executeDeskTransfer;
window.openTransferModal = openTransferModal;
window.executeTransfer = executeTransfer;
window.filterAdminCatalog = filterAdminCatalog;
window.toggleAddForm = toggleAddForm;
window.addInventoryGroup = addInventoryGroup;
window.removeInventoryGroup = removeInventoryGroup;
window.openSettings = openSettings;
window.removeRow = removeRow;
window.addNewItem = addNewItem;
window.saveSettings = saveSettings;
window.openNicknameManager = openNicknameManager;
window.saveAdminNickname = saveAdminNickname;
window.kickAgent = kickAgent;
window.nukeAgent = nukeAgent;
window.resetMyDeskLock = resetMyDeskLock;
window.forceCloseAllDesks = forceCloseAllDesks;
window.nukeTodaysLedger = nukeTodaysLedger;
window.fixPastManagerDrops = fixPastManagerDrops;
window.exportLedgerCSV = exportLedgerCSV;
window.openAuditModal = openAuditModal;
window.fetchAuditLogs = fetchAuditLogs;
window.openForceReallocate = openForceReallocate;
window.executeForceTransfer = executeForceTransfer;
window.openDevNotes = openDevNotes;
window.addDevNote = addDevNote;
window.editDevNote = editDevNote;
window.toggleDevNote = toggleDevNote;
window.deleteDevNote = deleteDevNote;

// Global User State
const userCurrency = 'Tk';

function showAuditTrail(txId) {
    let tx = transactions.find(t => t.id == txId) || trashTransactions.find(t => t.id == txId);
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

// --- GLOBAL DATABASE STRUCTURE ---

const defaultInventoryGroups = ['Regular Kit', 'Skitto Kit', 'eSIM', 'Skitto eSIM', 'Power Prime', 'Recycle SIM', 'No. 1 Plan', 'Prime', 'Djuice'];

const defaultCatalog = {
    "sim_no1": { name: 'No. 1 Plan', display: 'No. 1 Plan', price: 497, cat: 'new-sim', trackAs: 'No. 1 Plan', isActive: true, order: 1 },
    "sim_prime": { name: 'Prime', display: 'Prime', price: 400, cat: 'new-sim', trackAs: 'Prime', isActive: true, order: 2 },
    "sim_djuice": { name: 'Djuice', display: 'Djuice', price: 400, cat: 'new-sim', trackAs: 'Djuice', isActive: true, order: 3 },
    "sim_skitto": { name: 'Skitto', display: 'Skitto', price: 400, cat: 'new-sim', trackAs: 'Skitto Kit', isActive: true, order: 4 },
    "sim_esim_pre": { name: 'eSIM Prepaid', display: 'eSIM Prepaid', price: 400, cat: 'new-sim', trackAs: 'eSIM', isActive: true, order: 5 },
    "sim_esim_post": { name: 'eSIM Postpaid', display: 'eSIM Postpaid', price: 400, cat: 'new-sim', trackAs: 'eSIM', isActive: true, order: 6 },
    "sim_power": { name: 'Power Prime', display: 'Power Prime', price: 1499, cat: 'new-sim', trackAs: 'Power Prime', isActive: true, order: 7 },
    "sim_recycle": { name: 'Recycle SIM', display: 'Recycle SIM', price: 400, cat: 'new-sim', trackAs: 'Recycle SIM', isActive: true, order: 8 },
    "sim_my": { name: 'My SIM', display: 'My SIM', price: 400, cat: 'new-sim', trackAs: 'Regular Kit', isActive: true, order: 9 },
    "rep_regular": { name: 'Regular Replacement', display: 'Regular', price: 400, cat: 'paid-rep', trackAs: 'Regular Kit', isActive: true, order: 10 },
    "rep_skitto": { name: 'Skitto Replacement', display: 'Skitto', price: 400, cat: 'paid-rep', trackAs: 'Skitto Kit', isActive: true, order: 11 },
    "rep_esim": { name: 'eSIM Replacement', display: 'eSIM', price: 349, cat: 'paid-rep', trackAs: 'eSIM', isActive: true, order: 12 },
    "rep_skitto_esim": { name: 'Skitto eSIM Replacement', display: 'Skitto eSIM', price: 349, cat: 'paid-rep', trackAs: 'Skitto eSIM', isActive: true, order: 13 },
    "foc_regular": { name: 'FOC Regular', display: 'Regular', price: 0, cat: 'foc', trackAs: 'Regular Kit', isActive: true, order: 14 },
    "foc_skitto": { name: 'FOC Skitto', display: 'Skitto', price: 0, cat: 'foc', trackAs: 'Skitto Kit', isActive: true, order: 15 },
    "foc_esim": { name: 'FOC eSIM', display: 'eSIM', price: 0, cat: 'foc', trackAs: 'eSIM', isActive: true, order: 16 },
    "foc_skitto_esim": { name: 'FOC Skitto eSIM', display: 'Skitto eSIM', price: 0, cat: 'foc', trackAs: 'Skitto eSIM', isActive: true, order: 17 },
    "srv_recycle": { name: 'Recycle SIM Reissue', display: 'Recycle SIM Reissue', price: 115, cat: 'service', trackAs: '', isActive: true, order: 18 },
    "srv_itemized": { name: 'Itemized Bill', display: 'Itemized Bill', price: 230, cat: 'service', trackAs: '', isActive: true, order: 19 },
    "srv_owner": { name: 'Ownership Transfer', display: 'Ownership Transfer', price: 115, cat: 'service', trackAs: '', isActive: true, order: 20 },
    "srv_mnp": { name: 'MNP', display: 'MNP', price: 457.50, cat: 'service', trackAs: '', isActive: true, order: 21 },
    "foc_corp": { name: 'Corporate Replacement', display: 'Corporate Replacement', price: 0, cat: 'free-action', trackAs: '', isActive: true, order: 22 }
};

let txListenerUnsubscribe = null;
Object.defineProperty(window, 'txListenerUnsubscribe', {
    get: () => txListenerUnsubscribe,
    set: (v) => txListenerUnsubscribe = v
});

// --- AUTHENTICATION LOGIC ---
let isInitialLoad = true;

initAuth(
    (user) => {
        AppState.currentUser = user;
        AppState.userDisplayName = user.displayName || 'User';
        initUserData();
    },
    () => {
        AppState.currentUser = null;
        if (isInitialLoad) { 
            document.getElementById('splash-screen').classList.remove('active'); 
            isInitialLoad = false; 
        }
    }
);

// ==========================================
//    CLOSE DESK & RECONCILIATION
// ==========================================
let expectedClosingStats = { cash: 0, inventory: {} };
let actualClosingStats = { cash: 0, inventory: {} };

async function initiateCloseDesk() {
    if (!currentSessionId) { showAppAlert("Error", "You are not assigned to an open desk."); return; }

    const sessionSnap = await getDoc(doc(db, 'sessions', currentSessionId));
    if (!sessionSnap.exists()) return;

    const sessionData = sessionSnap.data();
    let expectedCash = parseFloat(sessionData.openingBalances.cash) || 0;
    let expectedMfs = 0;
    let expectedInv = { ...(sessionData.openingBalances.inventory || {}) };

    const txSnap = await getDocs(query(collection(db, 'transactions'), where('sessionId', '==', currentSessionId), where('isDeleted', '==', false)));

    txSnap.forEach(docSnap => {
        let tx = docSnap.data();
        expectedCash += (tx.cashAmt || 0); 
        expectedMfs += (tx.mfsAmt !== undefined ? tx.mfsAmt : (tx.payment === 'MFS' ? tx.amount : 0));
        
        let change = getInventoryChange(tx);
        if (change !== 0) {
            expectedInv[tx.trackAs] = (expectedInv[tx.trackAs] || 0) + change;
        }
    });

    expectedClosingStats = { cash: expectedCash, mfs: expectedMfs, inventory: expectedInv };

    let invHTML = '';
    let itemsToCount = Object.keys(expectedInv);
    
    if(itemsToCount.length === 0) invHTML = '<p style="text-align:center; color: var(--text-secondary);">No physical inventory tracked today.</p>';
    else {
        itemsToCount.forEach(itemName => {
            invHTML += `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; border-bottom:1px solid #e2e8f0; padding-bottom:8px;">
                    <label class="admin-label" style="margin:0; font-size:0.85rem; color:#334155;">${itemName}</label>
                    <input type="number" class="actual-inv-input settings-input" data-name="${itemName}" style="width:80px; text-align:center; padding:8px; border-color:#cbd5e1;" placeholder="0">
                </div>
            `;
        });
    }

    const modalContent = `
        <div style="background-color: var(--surface-color); padding: calc(16px + env(safe-area-inset-top)) 20px 16px 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); position: sticky; top: 0; z-index: 10;">
            <h3 style="margin: 0; font-size: 1.25rem; font-weight: 800; color: var(--text-primary);">Close Shift</h3>
            <button style="background: none; border: none; color: #ef4444; font-weight: 600; font-size: 1rem; padding: 4px 0; cursor: pointer;" onclick="closeModal('modal-close-desk')">Cancel</button>
        </div>

        <div style="flex: 1; overflow-y: auto; padding: 24px 20px; padding-bottom: calc(24px + env(safe-area-inset-bottom));">
      <div style="background: var(--warning-bg); border: 1px solid var(--warning-border); padding: 12px; border-radius: 8px; margin-bottom: 24px;">
        <p style="color: var(--warning-text); font-size: 0.85rem; margin: 0; font-weight: 600; line-height: 1.4;">Blind Count: Count your physical cash and stock. Enter the totals below to submit your report to the manager.</p>
      </div>
     
      <div class="admin-form-card" style="margin-bottom: 24px; padding: 20px; border: 2px solid var(--info-border); background: var(--info-bg);">
        <label style="display: block; font-size: 0.85rem; font-weight: 700; color: var(--info-text); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px;">1. Actual Cash in Drawer</label>
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
          <span style="font-size: 1.75rem; font-weight: bold; color: var(--info-text);">Tk</span>
          <input type="number" id="actual-cash-input" class="settings-input" style="font-size: 1.75rem; font-weight: 800; padding: 12px 16px; border-color: var(--info-border); color: var(--info-text); background: transparent;" placeholder="0" oninput="calculateBlindRetained()">
        </div>

        <label style="display: block; font-size: 0.85rem; font-weight: 700; color: var(--purple-text); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; border-top: 1px dashed var(--border-color); padding-top: 16px;">2. Manager Drop</label>
        <div style="display: flex; align-items: center; gap: 12px;">
          <span style="font-size: 1.5rem; font-weight: bold; color: var(--purple-text);">Tk</span>
          <input type="number" id="manager-drop-input" class="settings-input" style="font-size: 1.5rem; font-weight: 800; padding: 10px 16px; border-color: var(--purple-border); color: var(--purple-text); background: var(--purple-bg);" placeholder="0" oninput="calculateBlindRetained()">
        </div>
                <div style="margin-top: 16px; font-size: 0.95rem; color: #475569; display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: 600;">Retained Float (For Tomorrow):</span> 
                    <strong id="retained-float-display" style="color: #0f172a; font-size: 1.1rem;">0 Tk</strong>
                </div>
            </div>

            <div style="font-size: 0.85rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px;">3. Physical Inventory Count</div>
            <div class="admin-form-card" style="padding: 16px; margin-bottom: 32px;">
                ${invHTML}
            </div>

            <button class="btn-primary-full" style="padding: 16px; font-size: 1.1rem; background-color: #10b981; display: flex; justify-content: center; align-items: center; gap: 8px;" onclick="submitClosingReport()">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                SUBMIT TO MANAGER
            </button>
        </div>
    `;
    document.getElementById('close-desk-content').innerHTML = modalContent;
    openModal('modal-close-desk');
}

function calculateBlindRetained() {
    let actual = parseFloat(document.getElementById('actual-cash-input').value) || 0;
    let drop = parseFloat(document.getElementById('manager-drop-input').value) || 0;
    let retained = actual - drop;
    
    let displayEl = document.getElementById('retained-float-display');
    if (drop > actual) displayEl.innerHTML = `<span style="color: #ef4444;">Error: Exceeds Drawer Total</span>`;
    else displayEl.innerText = retained + " Tk";
}

async function submitClosingReport() {
    let actualCash = parseFloat(document.getElementById('actual-cash-input').value);
    let dropAmount = parseFloat(document.getElementById('manager-drop-input').value) || 0;

    if (isNaN(actualCash) || actualCash < 0) { showAppAlert("Invalid Input", "Please enter your total physical cash."); return; }
    if (dropAmount < 0 || dropAmount > actualCash) { 
        showAppAlert("Error", "Manager drop cannot exceed your total physical cash."); 
        return; 
    }

    actualClosingStats.cash = actualCash;
    actualClosingStats.inventory = {};

    document.querySelectorAll('.actual-inv-input').forEach(input => {
        let itemName = input.getAttribute('data-name');
        actualClosingStats.inventory[itemName] = parseInt(input.value) || 0;
    });

    let variance = actualCash - expectedClosingStats.cash;
    let retainedFloat = actualCash - dropAmount;

    try {
        // Sets status to pending to await Manager Approval
        await updateDoc(doc(db, 'sessions', currentSessionId), {
            closedBy: userNickname || userDisplayName, 
            closedByUid: currentUser.uid, 
            closedAt: serverTimestamp(), 
            status: 'pending', 
            expectedClosing: expectedClosingStats, 
            actualClosing: actualClosingStats, 
            variance: variance,
            hasDiscrepancy: variance !== 0, 
            managerDrop: dropAmount, 
            retainedFloat: retainedFloat
        });
        
        // Lock the agent out of the desk
        await setDoc(doc(db, 'desks', currentDeskId), { status: 'closed', currentSessionId: null }, { merge: true });
        await setDoc(doc(db, 'users', currentUser.uid), { assignedDeskId: null, assignedDate: null }, { merge: true });
    } catch (e) { 
        showFlashMessage("Offline: Report queued for sync."); 
    } finally {
        currentDeskId = null; 
        currentSessionId = null; 
        currentDeskName = '';
        closeModal('modal-close-desk');
        showFlashMessage("Report Submitted! See Manager.");
        loadFloorMap();
    }
}

// --- RENDER FLOOR MAP & PEEK AT DESK ---
async function renderLiveFloorTab() {
    const container = document.getElementById('live-floor-container');
    container.innerHTML = '<div class="spinner" style="align-self: center; margin-top: 40px;"></div>';

    try {
        const activeSessionsSnap = await getDocs(query(collection(db, 'sessions'), where('status', '==', 'open')));
        if (activeSessionsSnap.empty) { container.innerHTML = '<p class="placeholder-text">No desks open.</p>'; return; }

        let docsArray = [...activeSessionsSnap.docs];
        
        // 1. Sort all desks numerically (Desk 1, Desk 2, Desk 3...)
        docsArray.sort((a, b) => a.data().deskId.localeCompare(b.data().deskId, undefined, { numeric: true }));
        
        // 2. If the current user has a desk, pin it to the very top (Index 0)
        let myIndex = docsArray.findIndex(doc => doc.id === currentSessionId);
        if (myIndex > 0) {
            let myDoc = docsArray.splice(myIndex, 1)[0];
            docsArray.unshift(myDoc);
        }

        let floorHTML = '';
        for (const docSnap of docsArray) {
            const session = docSnap.data(); const sid = docSnap.id;
            const txSnap = await getDocs(query(collection(db, 'transactions'), where('sessionId', '==', sid), where('isDeleted', '==', false)));

            let liveCash = parseFloat(session.openingBalances.cash) || 0;
      let liveInv = { ...(session.openingBalances.inventory || {}) };
      let liveServicesCount = 0;

      txSnap.forEach(txDoc => {
        let tx = txDoc.data();
        liveCash += (tx.cashAmt || 0);
       
        let change = getInventoryChange(tx);
        if (change !== 0) {
          liveInv[tx.trackAs] = (liveInv[tx.trackAs] || 0) + change;
        } else if (tx.cat === 'service' || tx.cat === 'free-action') {
          liveServicesCount += Math.abs(tx.qty);
        }
      });

      let invDisplay = '';
      for (const [name, qty] of Object.entries(liveInv)) {
        if (qty !== 0) {
          let color = qty < 3 ? '#ef4444' : '#475569';
          invDisplay += `<span style="display:inline-block; background:#f1f5f9; padding:4px 8px; border-radius:4px; font-size:0.8rem; margin:2px; color:${color}; font-weight:600;">${name}: ${qty}</span>`;
        }
      }
      if (liveServicesCount > 0) {
        invDisplay += `<span style="display:inline-block; background:#fef3c7; padding:4px 8px; border-radius:4px; font-size:0.8rem; margin:2px; color:#92400e; font-weight:600;">Services: ${liveServicesCount}</span>`;
      }
      if(!invDisplay) invDisplay = '<span style="font-size:0.8rem; color:#94a3b8;">No physical stock.</span>';

            const isMyDesk = sid === currentSessionId;

            let displayDeskName = session.deskId.replace('_', ' ').toUpperCase();
            if (session.deskId.startsWith('personal_')) {
                if (isMyDesk) {
                    displayDeskName = "My Drawer";
                } else {
                    displayDeskName = `${session.openedBy.split(' ')[0]}'s Drawer`;
                }
            }

            // ESCAPE THE APOSTROPHE so it doesn't break the HTML onclick tag
            let safeDeskName = displayDeskName.replace(/'/g, "\\'");

            let actionBtn = isMyDesk 
                ? `<button class="btn-primary-full" style="width: 100%; background: #0ea5e9; padding: 10px; margin-top: 12px; box-shadow: 0 4px 12px rgba(14, 165, 233, 0.2);" onclick="openMyDeskDashboard()">Open My Drawer</button>`
                : `<button class="btn-outline" style="width: 100%; color: #8b5cf6; border-color: #8b5cf6; background: transparent; padding: 10px; margin-top: 12px;" onclick="peekAtDesk('${session.deskId}', '${safeDeskName}')">View Details</button>`;

            let agentNamesStr = 'Loading...';
            try {
                const agentsSnap = await getDocs(query(collection(db, 'users'), where('assignedDeskId', '==', session.deskId)));
                let names = [];
                agentsSnap.forEach(aDoc => { names.push(aDoc.data().nickname || aDoc.data().displayName || aDoc.data().email?.split('@')[0] || 'Agent'); });
                agentNamesStr = names.length > 0 ? names.join(', ') : 'Empty';
            } catch(e) { agentNamesStr = 'Unknown'; }

            let cardStyle = isMyDesk 
                ? `margin-bottom: 0; padding: 16px; background: #f0f9ff; border: 1px solid #bae6fd; border-left: 4px solid #0ea5e9; border-radius: 12px; box-shadow: 0 4px 12px rgba(14, 165, 233, 0.1);`
                : `margin-bottom: 0; padding: 16px; background: var(--surface-color); border: 1px solid var(--border-color); border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);`;

            floorHTML += `
                <div style="${cardStyle}">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid ${isMyDesk ? '#bae6fd' : 'var(--border-color)'}; padding-bottom: 12px;">
                        <h4 style="margin: 0; color: ${isMyDesk ? '#0369a1' : 'var(--text-primary)'}; font-size: 1.15rem; font-weight: 700; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 12px; min-width: 0; flex: 1;">
                            ${displayDeskName}
                        </h4>
                        <div style="font-size: 0.85rem; color: ${isMyDesk ? '#0284c7' : 'var(--text-secondary)'}; font-weight: 600; text-align: right; max-width: 50%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-shrink: 0;">
                            ${agentNamesStr}
                        </div>
                    </div>
                    
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                        <span style="font-size: 0.85rem; font-weight: bold; color: ${isMyDesk ? '#0284c7' : 'var(--text-secondary)'};">Live Cash:</span>
                        <span style="font-size: 1.1rem; font-weight: bold; color: #10b981;">${liveCash} Tk</span>
                    </div>

                    <div style="margin-bottom: 16px; padding-top: 12px; border-top: 1px dashed ${isMyDesk ? '#bae6fd' : 'var(--border-color)'};">
                        <span style="display: block; font-size: 0.8rem; font-weight: bold; color: ${isMyDesk ? '#0284c7' : 'var(--text-secondary)'}; margin-bottom: 6px;">Remaining Physical Stock:</span>
                        <div>${invDisplay}</div>
                    </div>
                    
                    ${actionBtn}
                </div>
            `;
        }
        container.innerHTML = floorHTML;
    } catch (e) { container.innerHTML = '<p class="placeholder-text" style="color: #ef4444;">Offline: Could not load.</p>'; }
}

function openMyDeskDashboard() {
    document.getElementById('desk-peek-header').style.display = 'none';
    document.getElementById('desk-action-buttons').style.display = 'block';
    document.getElementById('desk-dashboard-title').innerText = currentDeskName + ' (My Drawer)';
    switchTab('desk', currentDeskName);
    renderDeskDashboard(currentDeskId);
}

function peekAtDesk(targetDeskId, targetDeskName) {
    if (targetDeskId === currentDeskId) {
        openMyDeskDashboard(); 
    } else {
        document.getElementById('desk-action-buttons').style.display = 'none';
        document.getElementById('desk-peek-header').style.display = 'flex';
        document.getElementById('desk-dashboard-title').innerText = targetDeskName;
        switchTab('desk', targetDeskName + ' (Peek)');
        renderDeskDashboard(targetDeskId);
    }
}

// ==========================================
//    EDIT, SPLIT PAYMENT, & TRASH
// ==========================================
let currentEditTxId = null;

function openEditTx(id) {
    let tx = transactions.find(t => t.id === id);
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

function toggleEditSplitFields() {
    if (document.getElementById('edit-tx-payment').value === 'Split') {
        document.getElementById('edit-split-fields').style.display = 'flex';
        document.getElementById('edit-tx-cash').value = parseFloat(document.getElementById('edit-tx-amount').value) || 0;
        document.getElementById('edit-tx-mfs').value = 0;
    } else document.getElementById('edit-split-fields').style.display = 'none';
}

function updateSplitTotal() {}

function saveTxEdit() {
    let txIndex = transactions.findIndex(t => t.id === currentEditTxId);
    if(txIndex === -1) return;

    let tx = transactions[txIndex];
    let newQty = parseInt(document.getElementById('edit-tx-qty').value) || 0;
    let newAmount = parseFloat(document.getElementById('edit-tx-amount').value) || 0;
    let method = document.getElementById('edit-tx-payment').value;
    let finalCash = 0, finalMfs = 0;

    let diff = newQty - tx.qty; 
    if (diff > 0 && !passStockFirewall(tx.name, diff)) return; 

    if (method === 'Cash') finalCash = newAmount;
    else if (method === 'MFS') finalMfs = newAmount;
    else if (method === 'Split') {
        finalCash = parseFloat(document.getElementById('edit-tx-cash').value) || 0;
        finalMfs = parseFloat(document.getElementById('edit-tx-mfs').value) || 0;
        if (finalCash + finalMfs !== newAmount) { showAppAlert("Error", "Cash + MFS must equal Total Tk."); return; }
    }

    let prevTxState = {
        qty: tx.qty, amount: tx.amount, payment: tx.payment, cashAmt: tx.cashAmt, mfsAmt: tx.mfsAmt,
        editedAt: new Date().toISOString(), editedBy: userNickname || userDisplayName, editedByUid: currentUser.uid
    };
    let updatedEditHistory = tx.editHistory ? [...tx.editHistory, prevTxState] : [prevTxState];

    closeModal('modal-edit-tx');
    
    if (currentDeskId === 'sandbox') {
        tx.qty = newQty; tx.amount = newAmount; tx.payment = method === 'Split' ? 'Split' : method; tx.cashAmt = finalCash; tx.mfsAmt = finalMfs; tx.isEdited = true; tx.editHistory = updatedEditHistory;
        renderPersonalReport(); if (document.getElementById('tab-desk').classList.contains('active')) renderDeskDashboard();
        showFlashMessage("Sandbox Transaction Updated!"); return;
    }

    if (tx.docId) {
        let msg = `${tx.name} Updated!`;
        updateDoc(doc(db, 'transactions', tx.docId), { qty: newQty, amount: newAmount, payment: method === 'Split' ? 'Split' : method, cashAmt: finalCash, mfsAmt: finalMfs, isEdited: true, editHistory: updatedEditHistory }).catch(e => console.error(e));
        showFlashMessage(navigator.onLine ? msg : "Offline: Edit queued");
    }
}

function deleteTransaction(docId, localId) {
    showAppAlert("Delete Item", "Are you sure you want to move this transaction to the trash?", true, () => {
        let nowStr = new Date().toISOString();
        let agentStr = userNickname || userDisplayName;

        if (currentDeskId === 'sandbox') {
            let tx = transactions.find(t => t.id === localId);
            if(tx) { 
                tx.isDeleted = true; 
                tx.deletedBy = agentStr; tx.deletedByUid = currentUser.uid; tx.deletedAt = nowStr;
                trashTransactions.push(tx); 
                renderPersonalReport(); if (document.getElementById('tab-desk').classList.contains('active')) renderDeskDashboard();
                showFlashMessage("Moved to Sandbox Trash!"); 
            }
            return;
        }

        if(docId) {
            updateDoc(doc(db, 'transactions', docId), { isDeleted: true, deletedBy: agentStr, deletedByUid: currentUser.uid, deletedAt: nowStr }).catch(e => console.error(e));
            showFlashMessage(navigator.onLine ? "Moved to Trash!" : "Offline: Trash queued");
        }
    }, "Move to Trash");
}

function openTrash() { renderTrash(); openModal('modal-trash'); }

function renderTrash() {
    let html = '';
    if(trashTransactions.length === 0) html = '<p class="placeholder-text">Trash is empty</p>';
    else {
        trashTransactions.sort((a,b) => b.id - a.id).forEach(tx => {
            html += `
                <div style="border:1px solid var(--border-color); padding:12px; margin-bottom:8px; border-radius:8px; background: var(--surface-color);">
                    <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                        <strong style="color: var(--text-primary); text-decoration: line-through;">${tx.qty}x ${tx.name}</strong> 
                        <span style="font-weight:bold; color:#ef4444;">${tx.amount} Tk</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:0.8rem; color:var(--text-secondary);">${tx.time} | ${tx.payment}</span>
                        <div style="display:flex; gap: 8px;">
                            <button class="btn-outline" style="padding:6px 12px; font-size:0.85rem; height:auto; color: #10b981; gap: 6px;" onclick="restoreTx('${tx.docId}', ${tx.id})">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg> Restore
                            </button>
                            <button class="btn-outline" style="padding:6px 12px; font-size:0.85rem; height:auto; color: #ef4444; gap: 6px; background: #fef2f2;" onclick="permanentlyDeleteTx('${tx.docId}', ${tx.id})">
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

function restoreTx(docId, localId) {
    let nowStr = new Date().toISOString();
    let agentStr = userNickname || userDisplayName;

    if (currentDeskId === 'sandbox') {
        let txIndex = trashTransactions.findIndex(t => t.id === localId);
        if (txIndex > -1) {
            let tx = trashTransactions[txIndex];
            if (!passStockFirewall(tx.name, tx.qty)) return;
            tx.isDeleted = false; tx.isRestored = true;
            tx.restoredBy = agentStr; tx.restoredByUid = currentUser.uid; tx.restoredAt = nowStr;
            trashTransactions.splice(txIndex, 1);
            renderPersonalReport(); if (document.getElementById('tab-desk').classList.contains('active')) renderDeskDashboard();
            showFlashMessage("Sandbox Transaction Restored!");
            setTimeout(() => { renderTrash(); if(trashTransactions.length === 0) closeModal('modal-trash'); }, 500);
        }
        return;
    }

    if(docId) {
        try {
            let tx = trashTransactions.find(t => t.docId === docId);
            if (tx && !passStockFirewall(tx.name, tx.qty)) return;

            updateDoc(doc(db, 'transactions', docId), { isDeleted: false, isRestored: true, restoredBy: agentStr, restoredByUid: currentUser.uid, restoredAt: nowStr }).catch(e => console.error(e));
            showFlashMessage(navigator.onLine ? (tx ? `${tx.name} Restored!` : "Transaction Restored!") : "Offline: Restore queued");
            setTimeout(() => { renderTrash(); if(trashTransactions.length === 0) closeModal('modal-trash'); }, 500);
        } catch(e) {
            showAppAlert("Restore Failed", "Could not restore. Please check your connection.");
            console.error("Restore error:", e);
        }
    }
}

function permanentlyDeleteTx(docId, localId) {
    showAppAlert("Permanent Delete", "This transaction will be permanently erased. This cannot be undone.", true, () => {
        if(docId) { 
            deleteDoc(doc(db, 'transactions', docId)).catch(e => console.error(e)); 
            showFlashMessage(navigator.onLine ? "Permanently Deleted!" : "Offline: Delete queued"); 
        }
    }, "Delete Forever");
}

function emptyTrash() {
    if(trashTransactions.length === 0) return;
    showAppAlert("Empty Trash", "Are you sure you want to permanently delete ALL items in the trash?", true, () => {
        const idsToDelete = trashTransactions.map(t => t.docId).filter(id => id);
        closeModal('modal-trash');
        for (const id of idsToDelete) { 
            deleteDoc(doc(db, 'transactions', id)).catch(e => console.error(`Error deleting trash item ${id}:`, e)); 
        }
        trashTransactions = [];
        renderTrash();
        showFlashMessage("Trash Emptied!");
    }, "Empty Trash");
}

// ==========================================
//    UI NAVIGATION & CORE APP LOGIC
// ==========================================
function switchTab(tabId, title) {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));

    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.getElementById('tab-' + tabId).classList.add('active');
    
    // Fix: Robust Navigation Highlighting
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    const navBtns = document.querySelectorAll('.nav-item');
    if (navBtns.length >= 5) {
        if (tabId === 'ers') navBtns[0].classList.add('active');
        else if (tabId === 'store') navBtns[1].classList.add('active');
        else if (tabId === 'desk') navBtns[2].classList.add('active');
        else if (tabId === 'floor') navBtns[3].classList.add('active');
        else if (tabId === 'report') navBtns[4].classList.add('active');
    }
    
    document.getElementById('header-title').innerText = tabId === 'ers' ? (currentDeskName || userNickname || userDisplayName) : title;
    if(tabId === 'floor') renderLiveFloorTab();
}

function updateCurrencyUI() { document.querySelectorAll('.ers-currency').forEach(el => { if(!el.innerText.includes('Qty')) el.innerText = userCurrency; }); }

// --- SIMS & MODALS LOGIC ---

function toggleMFS() {
    AppState.isMfs = !AppState.isMfs;
    document.querySelectorAll('.sync-cash').forEach(el => el.classList.toggle('active', !AppState.isMfs));
    document.querySelectorAll('.sync-mfs').forEach(el => el.classList.toggle('active', AppState.isMfs));
}

window.addEventListener('click', (event) => {
    if (event.target.classList.contains('modal-overlay') && !['modal-auth', 'splash-screen', 'modal-desk-select', 'modal-nicknames', 'modal-app-alert'].includes(event.target.id)) {
        closeModal(event.target.id);
    }
});

// --- NATIVE BOTTOM SHEET DRAG PHYSICS ---
function setupBottomSheetDrag() {
    document.querySelectorAll('.bottom-sheet').forEach(sheet => {
        let startY = 0;
        let currentY = 0;
        let isDragging = false;

        sheet.addEventListener('touchstart', (e) => {
            // Only allow the sheet to be dragged if the user is scrolled to the very top
            if (sheet.scrollTop > 0) return; 
            
            startY = e.touches[0].clientY;
            isDragging = true;
            
            // Remove CSS animation transitions so the sheet sticks to the thumb perfectly 1:1
            sheet.style.transition = 'none'; 
        }, { passive: true });

        sheet.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            currentY = e.touches[0].clientY;
            let delta = currentY - startY;

            // Only allow dragging downwards (positive delta)
            if (delta > 0) {
                sheet.style.transform = `translateY(${delta}px)`;
            }
        }, { passive: true });

        sheet.addEventListener('touchend', (e) => {
            if (!isDragging) return;
            isDragging = false;
            
            let delta = currentY - startY;
            let threshold = sheet.offsetHeight * 0.25; // 25% threshold to trigger a close

            // Re-apply the smooth bezier transition for the snap-back or close animation
            sheet.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)';

            if (delta > threshold) {
                // User dragged far enough -> Slide it completely off screen
                sheet.style.transform = `translateY(100%)`;
                
                // Wait for the animation to finish, then safely remove it from the DOM
                setTimeout(() => {
                    let modal = sheet.closest('.modal-overlay');
                    if (modal) closeModal(modal.id);
                    
                    // Reset the inline styles so it works normally the next time it's opened
                    setTimeout(() => { sheet.style.transform = ''; sheet.style.transition = ''; }, 50);
                }, 250);
            } else {
                // User didn't drag far enough -> Snap it smoothly back into place
                sheet.style.transform = 'translateY(0)';
                setTimeout(() => { sheet.style.transform = ''; sheet.style.transition = ''; }, 250);
            }
        });
    });
}

// Initialize the drag listeners once the DOM is fully loaded
document.addEventListener('DOMContentLoaded', setupBottomSheetDrag);

// --- DATE FILTER LOGIC ---

async function fetchTransactionsForDate() {
    if (!currentUser) return;
    
    const datePicker = document.getElementById('report-date-picker');
    if (!datePicker.value) {
        const t = new Date(); 
        datePicker.value = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
    }
    const targetDateStr = formatToGBDate(datePicker.value);
    const isToday = targetDateStr === getStrictDate();
    const dateLabel = isToday ? 'Today' : targetDateStr;

    if (txListenerUnsubscribe) { txListenerUnsubscribe(); txListenerUnsubscribe = null; }

    try {
        txListenerUnsubscribe = onSnapshot(
            query(collection(db, 'transactions'), where('dateStr', '==', targetDateStr)),
            { includeMetadataChanges: true },
            (txSnapshot) => {
            transactions = []; trashTransactions = []; 
            txSnapshot.forEach(doc => {
                let tx = doc.data(); tx.docId = doc.id; 
                tx.isPending = doc.metadata.hasPendingWrites;
                if (!tx.isDeleted) {
                    transactions.push(tx);
                } else if (tx.agentId === currentUser.uid) {
                    trashTransactions.push(tx); 
                }
            });
            
            transactions.sort((a, b) => a.id - b.id);
            trashTransactions.sort((a, b) => a.id - b.id);
            
            renderPersonalReport();
            
            if (document.getElementById('tab-desk').classList.contains('active')) {
                renderDeskDashboard();
            } else if (currentDeskId) {
                renderDeskDashboard(currentDeskId); 
            }
            
            const financialLabel = document.getElementById('financial-date-label');
            if (financialLabel) financialLabel.innerHTML = `${dateLabel}`;
            if (document.getElementById('tab-floor').classList.contains('active')) renderLiveFloorTab();
        });
    } catch (e) { console.error(e); }
}

// --- UI RENDERING FOR CATALOG ---
function renderAppUI() {
    document.querySelectorAll('.dynamic-item').forEach(el => el.remove());
    Object.values(globalCatalog).sort((a, b) => (a.order || 0) - (b.order || 0)).forEach(item => {
        if (!item.isActive) return;
        let safePrice = parseFloat(item.price) || 0;
        let containerId = "";
        let iconSVG = "";

        if (item.cat === 'new-sim') {
            containerId = 'container-new-sim';
            iconSVG = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`;
        }
        else if (item.cat === 'paid-rep') {
            containerId = 'container-paid-rep';
            iconSVG = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`;
        }
        else if (item.cat === 'foc' || item.cat === 'free-action') {
            containerId = item.cat === 'foc' ? 'container-foc' : 'container-free-actions';
            iconSVG = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
        }
        else if (item.cat === 'service') {
            containerId = 'container-services';
            iconSVG = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`;
        }

        let container = document.getElementById(containerId);
        if (!container) return;

        let row = document.createElement('div');
        row.className = 'dynamic-item';
        row.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid var(--border-color); cursor: pointer; user-select: none; transition: background-color 0.1s;';
        
        let pressTimer;
        let isLongPress = false;
        let isCancelled = false;

        const startPress = (e) => {
            if (e.button && e.button !== 0) return; 
            isLongPress = false;
            isCancelled = false;
            row.style.backgroundColor = 'var(--bg-color)'; 
            pressTimer = setTimeout(() => {
                isLongPress = true;
                if (navigator.vibrate) navigator.vibrate([50]); 
                selectItem(item.name, safePrice); 
                row.style.backgroundColor = 'transparent';
            }, 500); 
        };

        const cancelPress = () => {
            isCancelled = true;
            row.style.backgroundColor = 'transparent';
            clearTimeout(pressTimer);
        };

        const endPress = (e) => {
            clearTimeout(pressTimer);
            row.style.backgroundColor = 'transparent';
            if (!isLongPress && !isCancelled) {
                instantSaveItem(item.name, safePrice);
            }
        };

        row.addEventListener('pointerdown', startPress);
        row.addEventListener('pointerup', endPress);
        row.addEventListener('pointerleave', cancelPress);
        row.addEventListener('pointercancel', cancelPress);
        row.oncontextmenu = (e) => { e.preventDefault(); return false; };
        
        let priceDisplay = safePrice > 0 ? `<span style="font-size: 0.9rem; font-weight: 700; color: var(--text-secondary);">${safePrice} ${userCurrency}</span>` : `<span style="font-size: 0.9rem; font-weight: 700; color: #10b981;">Free</span>`;

        row.innerHTML = `
            <div style="display: flex; align-items: center; gap: 14px; min-width: 0; flex: 1;">
                <div style="flex-shrink: 0;">${iconSVG}</div>
                <span style="font-weight: 600; color: var(--text-primary); font-size: 1.05rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.display || item.name}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 12px; flex-shrink: 0; padding-left: 12px;">
                ${priceDisplay}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
            </div>
        `;
        container.appendChild(row);
    });
}

// ==========================================
//        FIRESTORE CLOUD DATA LOGIC
// ==========================================
async function initUserData() {
    if(!currentUser) return;
    try {
        await performLazyAutoClose(); 

        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDocSnap = await getDoc(userDocRef);
        const todayStr = getStrictDate();

        let userData = {};
        if (userDocSnap.exists()) {
      userData = userDocSnap.data();
      currentUserRole = userData.role || 'user';
      userNickname = userData.nickname || '';
      if (userData.devNotesQueue) {
        devNotesQueue = userData.devNotesQueue;
      }
    } else {
            currentUserRole = 'user'; 
        }

        await setDoc(userDocRef, { email: currentUser.email, displayName: userDisplayName, role: currentUserRole }, { merge: true });

        const globalDoc = await getDoc(doc(db, 'global', 'settings'));
        if (globalDoc.exists() && globalDoc.data().catalog) {
            globalCatalog = globalDoc.data().catalog;
            globalInventoryGroups = globalDoc.data().inventoryGroups || defaultInventoryGroups;
        } else {
            globalCatalog = defaultCatalog;
            globalInventoryGroups = defaultInventoryGroups;
            if (currentUserRole === 'admin') await setDoc(doc(db, 'global', 'settings'), { catalog: globalCatalog, inventoryGroups: globalInventoryGroups }, { merge: true });
        }

        document.getElementById('report-user-name').innerText = userDisplayName;
        if (currentUser.email) document.getElementById('report-user-email').innerText = currentUser.email;
        let toggleWrapper = document.getElementById('admin-report-toggle-wrapper');
        if (toggleWrapper) toggleWrapper.style.display = currentUserRole === 'admin' ? 'flex' : 'none';
        if (currentUser.photoURL) {
            document.getElementById('report-user-photo').src = currentUser.photoURL;
            document.getElementById('header-user-photo').src = currentUser.photoURL;
    }
    if(document.getElementById('tab-ers').classList.contains('active')) document.getElementById('header-title').innerText = userNickname || userDisplayName;

    if (currentUserRole === 'admin') {
      document.getElementById('dev-note-fab').style.display = 'flex';
    } else {
      document.getElementById('dev-note-fab').style.display = 'none';
    }

    updateCurrencyUI(); renderAppUI();
        
        const t = new Date(); 
        document.getElementById('report-date-picker').value = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
        
        if (userData.assignedDate === todayStr && userData.assignedDeskId) {
            currentDeskId = userData.assignedDeskId;
            
            const deskSnap = await getDoc(doc(db, 'desks', currentDeskId));
            if (deskSnap.exists() && deskSnap.data().status === 'open') {
                currentSessionId = deskSnap.data().currentSessionId;
                currentDeskName = deskSnap.data().name;
                document.getElementById('header-title').innerText = `${currentDeskName}`;
                try {
                    const sessionSnap = await getDoc(doc(db, 'sessions', currentSessionId));
                    if (sessionSnap.exists() && sessionSnap.data().openingBalances) {
                        currentOpeningCash = parseFloat(sessionSnap.data().openingBalances.cash) || 0;
                        currentOpeningInv = sessionSnap.data().openingBalances.inventory || {}; 
                    }
                } catch(e) {
                    console.error("Failed to recover session balances on app load:", e);
                }
            } else {
                currentDeskName = deskSnap.exists() ? deskSnap.data().name : currentDeskId;
                document.getElementById('header-title').innerText = `${currentDeskName} (Closed)`;
                currentSessionId = null; 
            }
            document.getElementById('modal-desk-select').classList.remove('active');
            await fetchTransactionsForDate();
        } else {
            await loadFloorMap();
        }
    } catch(e) { console.error(e); } finally {
        if (isInitialLoad) { document.getElementById('splash-screen').classList.remove('active'); isInitialLoad = false; }
    }
    setTimeout(setupBottomSheetDrag, 300); // Failsafe to attach drag physics
}

// ==========================================
//    USER PROFILE HUB LOGIC
// ==========================================
window.openProfileHub = function() {
    if (!currentUser) return;
    
    document.getElementById('hub-user-photo').src = currentUser.photoURL || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23666666'%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E";
    document.getElementById('hub-user-name').innerText = userNickname || userDisplayName;
    document.getElementById('hub-user-email').innerText = currentUser.email || 'No Email Linked';
    
    let roleBadge = document.getElementById('hub-user-role');
    if (currentUserRole === 'admin') {
        roleBadge.innerText = 'Center Admin';
        roleBadge.style.background = '#e0f2fe';
        roleBadge.style.color = '#0284c7';
        document.getElementById('hub-admin-section').style.display = 'block';
    } else {
        roleBadge.innerText = 'Floor Agent';
        roleBadge.style.background = '#f1f5f9';
        roleBadge.style.color = '#475569';
        document.getElementById('hub-admin-section').style.display = 'none';
    }
    
    openModal('modal-profile-hub');
}

// ==========================================
//    NETWORK STATUS ENGINE
// ==========================================
function updateNetworkStatus() {
    const banner = document.getElementById('offline-banner');
    if (!banner) return;
    
    if (!navigator.onLine) {
        banner.style.display = 'block';
    } else {
        // Only show the back online message if the banner was actually visible
        if (banner.style.display === 'block') {
            showFlashMessage("Back Online! Syncing...");
        }
        banner.style.display = 'none';
    }
}

// Listen for network changes in real-time
window.addEventListener('online', updateNetworkStatus);
window.addEventListener('offline', updateNetworkStatus);

// Run a check immediately when the app loads
updateNetworkStatus();

// --- VITE EXPORTS ---
window.signInWithGoogle = signInWithGoogle; window.logout = logout; window.switchTab = switchTab;
window.openDevNotes = openDevNotes; window.addDevNote = addDevNote; window.toggleDevNote = toggleDevNote; window.deleteDevNote = deleteDevNote;
window.ersKeyPress = ersKeyPress; window.ersBackspace = ersBackspace; window.saveErs = saveErs;
window.toggleMFS = toggleMFS; window.openModal = openModal; window.closeModal = closeModal;
window.selectItem = selectItem; window.qtyKeyPress = qtyKeyPress; window.qtyBackspace = qtyBackspace;
window.saveQuantity = saveQuantity; window.openSettings = openSettings; window.removeRow = removeRow;
window.addNewItem = addNewItem; window.saveSettings = saveSettings; window.shareReport = shareReport;
window.fetchTransactionsForDate = fetchTransactionsForDate; window.filterAdminCatalog = filterAdminCatalog; window.toggleAddForm = toggleAddForm;
window.loadFloorMap = loadFloorMap; window.handleDeskSelect = handleDeskSelect; window.confirmOpenDesk = confirmOpenDesk;
window.initiateCloseDesk = initiateCloseDesk; window.calculateBlindRetained = calculateBlindRetained; window.submitClosingReport = submitClosingReport; window.approveAndSealSession = approveAndSealSession;
window.openManagerCashModal = openManagerCashModal; window.saveManagerCash = saveManagerCash;
window.openMainStockModal = openMainStockModal; window.saveMainStock = saveMainStock;
window.openReturnStockModal = openReturnStockModal; window.saveReturnStock = saveReturnStock;
window.openDeskTransfer = openDeskTransfer; window.executeDeskTransfer = executeDeskTransfer;
window.renderLiveFloorTab = renderLiveFloorTab; window.openTransferModal = openTransferModal; window.executeTransfer = executeTransfer;
window.openEditTx = openEditTx; window.toggleEditSplitFields = toggleEditSplitFields; window.updateSplitTotal = updateSplitTotal; window.showAuditTrail = showAuditTrail;
window.saveTxEdit = saveTxEdit; window.deleteTransaction = deleteTransaction; window.openTrash = openTrash;
window.restoreTx = restoreTx; window.emptyTrash = emptyTrash; window.permanentlyDeleteTx = permanentlyDeleteTx;
window.addInventoryGroup = addInventoryGroup; window.removeInventoryGroup = removeInventoryGroup;
window.adminBypass = adminBypass; window.enterSandboxMode = enterSandboxMode; window.peekAtDesk = peekAtDesk; window.openMyDeskDashboard = openMyDeskDashboard;
window.resetMyDeskLock = resetMyDeskLock; window.forceCloseAllDesks = forceCloseAllDesks; window.nukeTodaysLedger = nukeTodaysLedger; window.fixPastManagerDrops = fixPastManagerDrops;
window.kickAgent = kickAgent; window.nukeAgent = nukeAgent;
window.openNicknameManager = openNicknameManager; window.saveAdminNickname = saveAdminNickname;
window.shareDeskReport = shareDeskReport;
window.exportLedgerCSV = exportLedgerCSV; window.openAuditModal = openAuditModal; window.fetchAuditLogs = fetchAuditLogs;
window.renderPersonalReport = renderPersonalReport; window.renderDeskDashboard = renderDeskDashboard;
window.toggleReportMode = toggleReportMode;
window.openHistoricalSession = openHistoricalSession;
window.switchStoreCategory = switchStoreCategory; window.handleMyDrawerNav = handleMyDrawerNav;
window.openProfileHub = openProfileHub;