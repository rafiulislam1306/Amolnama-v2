// ==========================================
//    1. FIREBASE CONFIGURATION & IMPORTS
// ==========================================
import { auth, db } from './config/firebase.js';
import { collection, doc, setDoc, getDoc, addDoc, updateDoc, deleteDoc, query, where, getDocs, orderBy, limit, serverTimestamp, onSnapshot } from "firebase/firestore";
import { getStrictDate, generateReceiptNo, formatToGBDate } from './utils/helpers.js';
import { showAppAlert, executeAlertConfirm, showFlashMessage, openModal, closeModal, showTooltip, initNetworkStatus, setupBottomSheetDrag } from './utils/ui-helpers.js';
import { initPWA } from './features/pwa.js';
import { initAuth, signInWithGoogle, logout, openProfileHub } from './features/auth.js';
import { AppState } from './core/state.js';
import { defaultInventoryGroups, defaultCatalog } from './core/constants.js';
import { ersKeyPress, ersBackspace, saveErs, selectItem, qtyKeyPress, qtyBackspace, saveQuantity, instantSaveItem, addTransactionToCloud, openEditTx, saveTxEdit, toggleEditSplitFields, updateSplitTotal, cancelTxEdit, autoCalcEditTotal, deleteTransaction, openTrash, restoreTx, permanentlyDeleteTx, emptyTrash, showAuditTrail } from './features/transactions.js';
import { getPhysicalItems, getInventoryChange, getAvailableStock, passStockFirewall, switchStoreCategory } from './features/inventory.js';
import { performLazyAutoClose, loadFloorMap, adminBypass, enterSandboxMode, handleDeskSelect, confirmOpenDesk, renderLiveFloorTab, openMyDeskDashboard, peekAtDesk, handleMyDrawerNav, initiateCloseDesk, calculateBlindRetained, submitClosingReport } from './features/desk.js';
import { toggleReportMode, renderPersonalReport, shareReport, shareDeskReport, renderDeskDashboard } from './features/reports.js';
import { openManagerCashModal, saveManagerCash, openMainStockModal, saveMainStock, openReturnStockModal, saveReturnStock, openDeskTransfer, executeDeskTransfer, openTransferModal, executeTransfer } from './features/transfers.js';
import { filterAdminCatalog, toggleAddForm, addInventoryGroup, removeInventoryGroup, openSettings, removeRow, addNewItem, saveSettings, openNicknameManager, saveAdminNickname, kickAgent, nukeAgent, resetMyDeskLock, forceCloseAllDesks, nukeTodaysLedger, fixPastManagerDrops, exportLedgerCSV, openAuditModal, fetchAuditLogs, openForceReallocate, executeForceTransfer } from './features/admin.js';
import { openDevNotes, addDevNote, editDevNote, toggleDevNote, deleteDevNote } from './features/devNotes.js';
import { renderAppUI } from './features/catalog.js';

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
    isMfs: { get: () => AppState.isMfs, set: (v) => AppState.isMfs = v },
    devNotesQueue: { get: () => AppState.devNotesQueue, set: (v) => AppState.devNotesQueue = v }
});

// Initialize Service Worker & PWA Install Prompts
initPWA();

// Bind UI Helpers to the window so HTML buttons can click them
window.signInWithGoogle = signInWithGoogle;
window.logout = logout;
window.openProfileHub = openProfileHub;
window.executeAlertConfirm = executeAlertConfirm;
window.showTooltip = showTooltip;
window.openModal = openModal;
window.closeModal = closeModal;
window.showAppAlert = showAppAlert;
window.showFlashMessage = showFlashMessage;
window.switchTab = switchTab;
window.handleMyDrawerNav = handleMyDrawerNav;
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
window.renderLiveFloorTab = renderLiveFloorTab;
window.openMyDeskDashboard = openMyDeskDashboard;
window.initiateCloseDesk = initiateCloseDesk;
window.calculateBlindRetained = calculateBlindRetained;
window.submitClosingReport = submitClosingReport;
window.renderAppUI = renderAppUI;
// --- EDIT, TRASH & AUDIT BINDINGS ---
window.openEditTx = openEditTx;
window.saveTxEdit = saveTxEdit;
window.toggleEditSplitFields = toggleEditSplitFields;
window.updateSplitTotal = updateSplitTotal;
window.cancelTxEdit = cancelTxEdit;
window.autoCalcEditTotal = autoCalcEditTotal;
window.deleteTransaction = deleteTransaction;
window.openTrash = openTrash;
window.restoreTx = restoreTx;
window.permanentlyDeleteTx = permanentlyDeleteTx;
window.emptyTrash = emptyTrash;
window.showAuditTrail = showAuditTrail;

// Global User State
const userCurrency = 'Tk';

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
    if (event.target.classList.contains('modal-overlay') && !['modal-auth', 'splash-screen', 'modal-desk-select', 'modal-nicknames', 'modal-app-alert', 'modal-open-desk', 'modal-close-desk', 'modal-edit-tx'].includes(event.target.id)) {
        closeModal(event.target.id);
    }
});

// --- NATIVE BOTTOM SHEET DRAG PHYSICS ---
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
        // Build base query
        let txQuery = query(collection(db, 'transactions'), where('dateStr', '==', targetDateStr));
        
        // If the user is just a floor agent, DO NOT download the entire floor's ledger
        if (currentUserRole !== 'admin' && toggleReportMode !== 'floor') {
            txQuery = query(collection(db, 'transactions'), where('dateStr', '==', targetDateStr), where('agentId', '==', currentUser.uid));
        }

        txListenerUnsubscribe = onSnapshot(
            txQuery,
            { includeMetadataChanges: true },
            (txSnapshot) => {
            transactions = []; trashTransactions = []; 
            // Preserve local sandbox items from being overwritten by cloud syncs
            let localSandboxTxs = currentDeskId === 'sandbox' ? transactions.filter(t => t.docId && t.docId.startsWith('local_')) : [];
            let localSandboxTrash = currentDeskId === 'sandbox' ? trashTransactions.filter(t => t.docId && t.docId.startsWith('local_')) : [];

            txSnapshot.forEach(doc => {
                let tx = doc.data(); tx.docId = doc.id; 
                tx.isPending = doc.metadata.hasPendingWrites;
                if (!tx.isDeleted) {
                    transactions.push(tx);
                } else if (tx.agentId === currentUser.uid) {
                    trashTransactions.push(tx); 
                }
            });

            if (currentDeskId === 'sandbox') {
                transactions.push(...localSandboxTxs);
                trashTransactions.push(...localSandboxTrash);
            }
            
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
//    NETWORK STATUS ENGINE
// ==========================================
initNetworkStatus();