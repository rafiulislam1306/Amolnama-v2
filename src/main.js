// ==========================================
//    1. IMPORTS & CONFIGURATION
// ==========================================
import { showAppAlert, executeAlertConfirm, showFlashMessage, openModal, closeModal, showTooltip, initNetworkStatus, setupBottomSheetDrag } from './utils/ui-helpers.js';
import { initPWA } from './features/pwa.js';
import { initAuth, signInWithGoogle, logout, openProfileHub } from './features/auth.js';
import { AppState } from './core/state.js';
import { ersKeyPress, ersBackspace, saveErs, selectItem, qtyKeyPress, qtyBackspace, saveQuantity, instantSaveItem, openEditTx, saveTxEdit, toggleEditSplitFields, updateSplitTotal, cancelTxEdit, autoCalcEditTotal, deleteTransaction, openTrash, restoreTx, permanentlyDeleteTx, emptyTrash, showAuditTrail } from './features/transactions.js';
import { getPhysicalItems, getInventoryChange, passStockFirewall, switchStoreCategory } from './features/inventory.js';
import { loadFloorMap, adminBypass, enterSandboxMode, handleDeskSelect, confirmOpenDesk, renderLiveFloorTab, openMyDeskDashboard, peekAtDesk, handleMyDrawerNav, initiateCloseDesk, calculateBlindRetained, submitClosingReport } from './features/desk.js';
import { toggleReportMode, renderPersonalReport, shareReport, shareDeskReport, renderDeskDashboard, fetchTransactionsForDate, getTxListenerUnsubscribe, setTxListenerUnsubscribe } from './features/reports.js';
import { openManagerCashModal, saveManagerCash, openMainStockModal, saveMainStock, openReturnStockModal, saveReturnStock, openDeskTransfer, executeDeskTransfer, openTransferModal, executeTransfer } from './features/transfers.js';
import { filterAdminCatalog, toggleAddForm, addInventoryGroup, removeInventoryGroup, openSettings, removeRow, addNewItem, saveSettings, openNicknameManager, saveAdminNickname, kickAgent, nukeAgent, resetMyDeskLock, forceCloseAllDesks, nukeTodaysLedger, fixPastManagerDrops, exportLedgerCSV, openAuditModal, fetchAuditLogs, openForceReallocate, executeForceTransfer } from './features/admin.js';
import { openDevNotes, addDevNote, editDevNote, toggleDevNote, deleteDevNote } from './features/devNotes.js';
import { renderAppUI } from './features/catalog.js';
import { initUserData } from './core/app-init.js';

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
window.fetchTransactionsForDate = fetchTransactionsForDate;

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

Object.defineProperty(window, 'txListenerUnsubscribe', {
    get: () => getTxListenerUnsubscribe(),
    set: (v) => setTxListenerUnsubscribe(v)
});

// --- AUTHENTICATION LOGIC ---
let isInitialLoad = true;

initAuth(
    (user) => {
        AppState.currentUser = user;
        AppState.userDisplayName = user.displayName || 'User';
        initUserData(() => {
            if (isInitialLoad) { 
                document.getElementById('splash-screen').classList.remove('active'); 
                isInitialLoad = false; 
            }
        });
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
    
    document.getElementById('header-title').innerText = tabId === 'ers' ? (AppState.currentDeskName || AppState.userNickname || AppState.userDisplayName) : title;
    if(tabId === 'floor') renderLiveFloorTab();
}

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

// Initialize the drag listeners once the DOM is fully loaded
document.addEventListener('DOMContentLoaded', setupBottomSheetDrag);

// ==========================================
//    NETWORK STATUS ENGINE
// ==========================================
initNetworkStatus();