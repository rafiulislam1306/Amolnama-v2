// src/main.js
// ==========================================
//    1. IMPORTS & CONFIGURATION
// ==========================================
import { showAppAlert, executeAlertConfirm, showFlashMessage, openModal, closeModal, showTooltip, initNetworkStatus, setupBottomSheetDrag, initCustomDropdowns } from './utils/ui-helpers.js';
import { initPWA, installPWA } from './features/pwa.js';
import { initAuth, signInWithGoogle, logout, openProfileHub } from './features/auth.js';
import { AppState } from './core/state.js';
import { ersKeyPress, ersBackspace, saveErs, selectItem, qtyKeyPress, qtyBackspace, saveQuantity, openEditTx, saveTxEdit, toggleEditSplitFields, updateSplitTotal, cancelTxEdit, autoCalcEditTotal, deleteTransaction, openTrash, restoreTx, permanentlyDeleteTx, emptyTrash, showAuditTrail } from './features/transactions.js';
import { getPhysicalItems, getInventoryChange, passStockFirewall, switchStoreCategory } from './features/inventory.js';
import { loadFloorMap, handleDeskSelect, renderLiveFloorTab, openMyDeskDashboard, peekAtDesk, handleMyDrawerNav, initiateCloseDesk, submitClosingReport } from './features/desk.js';
import { openManagerCashModal, saveManagerCash, openMainStockModal, saveMainStock, openReturnStockModal, saveReturnStock, openDeskTransfer, executeDeskTransfer, openTransferModal, executeTransfer } from './features/transfers.js';
import { filterAdminCatalog, toggleAddForm, addInventoryGroup, removeInventoryGroup, openSettings, removeRow, addNewItem, saveSettings, openNicknameManager, saveAdminNickname, kickAgent, nukeAgent, resetMyDeskLock, forceCloseAllDesks, nukeTodaysLedger, fixPastManagerDrops, exportLedgerCSV, openAuditModal, fetchAuditLogs, openForceReallocate, executeForceTransfer, healTodaysOpeningStock, runLedgerDiagnostic } from './features/admin.js';
import { openDevNotes, addDevNote, editDevNote, cancelInlineEdit, saveInlineEdit, toggleDevNote, deleteDevNote } from './features/devNotes.js';
import { renderAppUI } from './features/catalog.js';
import { initUserData } from './core/app-init.js';
import { renderPersonalReport, shareReport, shareDeskReport, renderDeskDashboard, fetchTransactionsForDate, getTxListenerUnsubscribe, setTxListenerUnsubscribe, openHistoricalSession, downloadReportAsPDF } from './features/reports.js';

// ==========================================
//    TEMPORARY REFACTORING BRIDGE
// ==========================================
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

initPWA();

// ==========================================
//   GLOBAL NAMESPACE & UI BINDINGS
// ==========================================
window.Amolnama = {
    signInWithGoogle, logout, openProfileHub, executeAlertConfirm, showTooltip,
    openModal, closeModal, showAppAlert, showFlashMessage, switchTab,
    handleMyDrawerNav, ersKeyPress, ersBackspace, saveErs, selectItem,
    qtyKeyPress, qtyBackspace, saveQuantity, toggleMFS, getPhysicalItems,
    getInventoryChange, passStockFirewall, switchStoreCategory, loadFloorMap,
    handleDeskSelect, renderPersonalReport, shareReport, shareDeskReport,
    renderDeskDashboard, openManagerCashModal, saveManagerCash, openMainStockModal,
    saveMainStock, openReturnStockModal, saveReturnStock, openDeskTransfer,
    executeDeskTransfer, openTransferModal, executeTransfer, filterAdminCatalog,
    toggleAddForm, addInventoryGroup, removeInventoryGroup, openSettings,
    removeRow, addNewItem, saveSettings, openNicknameManager, saveAdminNickname,
    kickAgent, nukeAgent, resetMyDeskLock, forceCloseAllDesks, nukeTodaysLedger,
    fixPastManagerDrops, exportLedgerCSV, openAuditModal, fetchAuditLogs,
    openForceReallocate, executeForceTransfer, openDevNotes, addDevNote,
    editDevNote, cancelInlineEdit, saveInlineEdit, toggleDevNote, deleteDevNote,
    renderLiveFloorTab, openMyDeskDashboard, peekAtDesk, initiateCloseDesk,
    installPWA, submitClosingReport, renderAppUI, fetchTransactionsForDate,
    openEditTx, saveTxEdit, toggleEditSplitFields, updateSplitTotal, cancelTxEdit,
    autoCalcEditTotal, deleteTransaction, openTrash, restoreTx, permanentlyDeleteTx,
    emptyTrash, showAuditTrail, openHistoricalSession, healTodaysOpeningStock,
    runLedgerDiagnostic, downloadReportAsPDF, initCustomDropdowns
};

// Dynamically bind all Amolnama functions to the global window object.
// This natively replaces the 80+ manual assignments while keeping legacy HTML onclicks working flawlessly.
Object.keys(window.Amolnama).forEach(key => {
    window[key] = window.Amolnama[key];
});

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
    
    const targetTab = document.getElementById('tab-' + tabId);
    if (targetTab) targetTab.classList.add('active');
    
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
    
    // Only redraw the DOM if the dirty flag is true (meaning new data arrived while tab was hidden)
    if (tabId === 'floor') {
        if (AppState.needsRender.floor && typeof window.renderLiveFloorTab === 'function') {
            window.renderLiveFloorTab();
            AppState.needsRender.floor = false; // Clear the flag
        }
    } else if (tabId === 'desk') {
        if (AppState.needsRender.desk && typeof window.renderDeskDashboard === 'function') {
            window.renderDeskDashboard();
            AppState.needsRender.desk = false; // Clear the flag
        }
    } else if (tabId === 'report') {
        if (AppState.needsRender.report && typeof window.renderPersonalReport === 'function') {
            window.renderPersonalReport();
            AppState.needsRender.report = false; // Clear the flag
        }
    } else if (tabId === 'store') {
        if (typeof window.renderAppUI === 'function') window.renderAppUI();
    }
}

function toggleMFS() {
    AppState.isMfs = !AppState.isMfs;
    document.querySelectorAll('.sync-cash').forEach(el => el.classList.toggle('active', !AppState.isMfs));
    document.querySelectorAll('.sync-mfs').forEach(el => el.classList.toggle('active', AppState.isMfs));
}

window.addEventListener('click', (event) => {
    if (event.target.classList.contains('modal-overlay') && !['modal-auth', 'splash-screen', 'modal-desk-select', 'modal-nicknames', 'modal-app-alert', 'modal-close-desk', 'modal-edit-tx'].includes(event.target.id)) {
        closeModal(event.target.id);
    }
});

document.addEventListener('DOMContentLoaded', setupBottomSheetDrag);
initNetworkStatus();

// Initialize Custom Dropdowns once the UI has loaded
initCustomDropdowns();