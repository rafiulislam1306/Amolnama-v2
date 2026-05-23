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
import { filterAdminCatalog, toggleAddForm, addInventoryGroup, removeInventoryGroup, openSettings, removeRow, addNewItem, saveSettings, openNicknameManager, saveAdminNickname, kickAgent, nukeAgent, resetMyDeskLock, forceCloseAllDesks, nukeTodaysLedger, fixPastManagerDrops, openAuditModal, fetchAuditLogs, openForceReallocate, executeForceTransfer, healTodaysOpeningStock, runLedgerDiagnostic } from './features/admin.js';
import { openDevNotes, addDevNote, editDevNote, cancelInlineEdit, saveInlineEdit, toggleDevNote, deleteDevNote } from './features/devNotes.js';
import { renderAppUI, filterStoreCatalog, clearStoreSearch } from './features/catalog.js';
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
    fixPastManagerDrops, openAuditModal, fetchAuditLogs,
    openForceReallocate, executeForceTransfer, openDevNotes, addDevNote,
    editDevNote, cancelInlineEdit, saveInlineEdit, toggleDevNote, deleteDevNote,
    renderLiveFloorTab, openMyDeskDashboard, peekAtDesk, initiateCloseDesk,
    installPWA, submitClosingReport, renderAppUI, filterStoreCatalog, clearStoreSearch, fetchTransactionsForDate,
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
    if (targetTab) {
        targetTab.classList.add('active');
        // Force scroll to top, wait for next frame to ensure display:block has applied
        requestAnimationFrame(() => {
            targetTab.scrollTop = 0;
        });
    }
    
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

function applyDeskFilter(pill, value) {
    // Update the hidden value store
    const hidden = document.getElementById('desk-history-filter');
    if (hidden) hidden.value = value;
    // Swap active state on pills inside its own container
    pill.parentNode.querySelectorAll('.desk-filter-pill').forEach(p => p.classList.toggle('active', p === pill));
    // Re-render
    if (typeof window.renderDeskDashboard === 'function') window.renderDeskDashboard();
}
window.applyDeskFilter = applyDeskFilter;

function applyPersonalFilter(pill, value) {
    // Update the hidden value store
    const hidden = document.getElementById('personal-history-filter');
    if (hidden) hidden.value = value;
    // Swap active state on pills inside its own container
    pill.parentNode.querySelectorAll('.desk-filter-pill').forEach(p => p.classList.toggle('active', p === pill));
    // Re-render
    if (typeof window.renderPersonalReport === 'function') window.renderPersonalReport();
}
window.applyPersonalFilter = applyPersonalFilter;

window.addEventListener('click', (event) => {
    if (event.target.classList.contains('modal-overlay') && !['modal-auth', 'splash-screen', 'modal-desk-select', 'modal-nicknames', 'modal-app-alert', 'modal-close-desk', 'modal-edit-tx'].includes(event.target.id)) {
        closeModal(event.target.id);
    }
});

// Nuclear escape hatch: if a modal-overlay is "active" but its content is
// invisible (ghost overlay after a failed animation), force-close it on next touch
// so the app never stays frozen.
window.addEventListener('touchstart', () => {
    document.querySelectorAll('.modal-overlay.active').forEach(overlay => {
        const content = overlay.querySelector('.modal-content, .bottom-sheet');
        if (content) {
            const rect = content.getBoundingClientRect();
            const isInvisible = rect.height === 0 || parseFloat(getComputedStyle(content).opacity) < 0.05;
            if (isInvisible) closeModal(overlay.id);
        }
    });
}, { passive: true });

// Global Keyboard Shortcuts for Desktop Power-Users
document.addEventListener('keydown', (event) => {
    // 1. ESC key: Close top-most active bottom-sheet modal
    if (event.key === 'Escape') {
        const activeModals = Array.from(document.querySelectorAll('.modal-overlay.active'));
        if (activeModals.length > 0) {
            const topModal = activeModals[activeModals.length - 1];
            if (!['splash-screen', 'modal-auth', 'modal-desk-select'].includes(topModal.id)) {
                if (typeof closeModal === 'function') {
                    closeModal(topModal.id);
                } else if (typeof window.closeModal === 'function') {
                    window.closeModal(topModal.id);
                } else {
                    topModal.classList.remove('active');
                }
                event.preventDefault();
            }
        }
    }
    
    // 2. '/' or 'Ctrl+F' key: Focus global product search (if no inputs are focused)
    if ((event.key === '/' || (event.ctrlKey && event.key === 'f')) && 
        !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
        const searchInput = document.getElementById('store-search');
        if (searchInput) {
            // Switch to storefront tab if not active
            const storeTab = document.getElementById('tab-store');
            if (storeTab && !storeTab.classList.contains('active')) {
                const storePill = document.querySelector('[onclick*="switchTab"][onclick*="store"]');
                if (storePill) storePill.click();
            }
            searchInput.focus();
            searchInput.select();
            event.preventDefault();
        }
    }
    
    // 3. 'Ctrl+M' key: Toggle Cash vs MFS mode instantly
    if (event.ctrlKey && event.key.toLowerCase() === 'm') {
        if (typeof toggleMFS === 'function') {
            toggleMFS();
        } else if (typeof window.toggleMFS === 'function') {
            window.toggleMFS();
        }
        if (typeof showFlashMessage === 'function') {
            showFlashMessage(`Mode: ${AppState.isMfs ? 'MFS (Mobile Financial Services)' : 'Cash'}`);
        }
        event.preventDefault();
    }
});

document.addEventListener('DOMContentLoaded', setupBottomSheetDrag);
initNetworkStatus();

// Initialize Custom Dropdowns once the UI has loaded
initCustomDropdowns();