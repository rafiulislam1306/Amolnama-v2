// src/main.js
// ==========================================
//    1. IMPORTS & CONFIGURATION
// ==========================================
import { showAppAlert, executeAlertConfirm, showFlashMessage, openModal, closeModal, showTooltip, initNetworkStatus, setupBottomSheetDrag, initCustomDropdowns, markInputError, clearInputError, scrollPillIntoView } from './utils/ui-helpers.js';
import { initPWA, installPWA } from './features/pwa.js';
import { initAuth, signInWithGoogle, logout, openProfileHub, copyActiveSessionId, showPhoneLoginView, hidePhoneLoginView, resetPhoneLoginView, signInWithPhoneAndPin, openLinkPhoneModal, linkPhoneAndPin, togglePinVisibility, initTheme, toggleDarkMode, applyTheme, isDarkModeActive } from './features/auth.js';
import { AppState } from './core/state.js';
import { ersKeyPress, ersBackspace, ersClear, ersAddPreset, saveErs, selectItem, stepQty, onQtySliderChange, onQtyInputChange, saveQuantity, openEditTx, saveTxEdit, setEditPaymentMethod, toggleEditSplitFields, updateSplitTotal, cancelTxEdit, autoCalcEditTotal, deleteTransaction, openTrash, restoreTx, permanentlyDeleteTx, emptyTrash, showAuditTrail, promptSimOnboarding, confirmSimOnboarding, cancelSimOnboarding, toggleOnboardingRow, syncOnboardingCheck } from './features/transactions.js';
import { getPhysicalItems, getInventoryChange, passStockFirewall, switchStoreCategory } from './features/inventory.js';
import { loadFloorMap, handleDeskSelect, executeHandleDeskSelect, renderLiveFloorTab, openMyDeskDashboard, peekAtDesk, handleMyDrawerNav, initiateCloseDesk, submitClosingReport } from './features/desk.js';
import { canUserPerformCashActions, openManagerCashModal, saveManagerCash, openMainStockModal, saveMainStock, openReturnStockModal, saveReturnStock, openDeskTransfer, executeDeskTransfer, openTransferModal, executeTransfer, toggleMgrCashPaymentFields, validateMgrCashSplit } from './features/transfers.js';
import { filterAdminCatalog, filterAdminCatalogByCategory, resetAdminCatalogFilters, clearAdminSearch, toggleAddForm, addInventoryGroup, removeInventoryGroup, openSettings, removeRow, addNewItem, saveSettings, openNicknameManager, filterUsersList, clearUsersSearch, filterUsersByRole, resetUsersFilters, saveAdminNickname, saveUserConfig, kickAgent, nukeAgent, resetMyDeskLock, forceCloseAllDesks, nukeTodaysLedger, fixPastManagerDrops, openAuditModal, fetchAuditLogs, healTodaysOpeningStock, runLedgerDiagnostic, healDeskTransfers, executeAdminDrawerTransfer, deleteAgentDateData, healDuplicateSessions } from './features/admin.js';
import { renderAppUI, filterStoreCatalog, clearStoreSearch, toggleStoreInStockFilter, resetStoreFilters } from './features/catalog.js';
import { initUserData } from './core/app-init.js';
import { renderPersonalReport, renderDeskDashboard, fetchTransactionsForDate, getTxListenerUnsubscribe, setTxListenerUnsubscribe, downloadReportAsPDF, toggleCenterCashActions, toggleCenterCashCategory, syncHistoricalDateBanner, returnToToday, setLedgerFilterField, clearSingleLedgerFilter, resetLedgerFilters } from './features/reports.js';
import { openRecycleTracker, filterRecycleList, clearRecycleSearch, filterRecycleByStatus, resetRecycleFilters, openAddRecycleModal, submitRecycleApplication, openUpdateRecycleStatusModal, onRecycleStatusChangeSelect, onAddRecycleStatusChange, saveRecycleStatusUpdate, deleteRecycleSimEntry, triggerStoreRecycleSale, populateStoreRecycleSaleOptions, onSelectRecycleSaleNumberChange, confirmRecycleSimSale, setRecycleContactTimeToNow, onRecycleContactTimeClick, onRecycleContactTimeManualChange, onRecycleAgentChange, resetRecycleContactTimeToPrevious } from './features/recycle.js';
import { openCallRates, closeCallRates, filterRatesList, filterRatesByType, resetRatesFilters, clearRatesSearch, openManageRates, closeManageRates, renderManageRatesDashboard, clearManageRatesSearch, openPackageForm, closePackageForm, addRateRow, savePackageData, deletePackage, autoCalcRateTax } from './features/rates.js';

// ==========================================
//    TEMPORARY REFACTORING BRIDGE
// ==========================================
Object.defineProperties(window, {
    currentUser: { get: () => AppState.currentUser, set: (v) => AppState.currentUser = v },
    userDisplayName: { get: () => AppState.userDisplayName, set: (v) => AppState.userDisplayName = v },
    userNickname: { get: () => AppState.userNickname, set: (v) => AppState.userNickname = v },
    currentUserRole: { get: () => AppState.currentUserRole, set: (v) => AppState.currentUserRole = v },
    canPerformCashActions: { get: () => AppState.canPerformCashActions, set: (v) => AppState.canPerformCashActions = v },
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
});

initTheme();
initPWA();

// ==========================================
//   GLOBAL NAMESPACE & UI BINDINGS
// ==========================================
window.Amolnama = {
    signInWithGoogle, logout, openProfileHub, copyActiveSessionId, toggleDarkMode, applyTheme, isDarkModeActive, executeAlertConfirm, showTooltip,
    openModal, closeModal, showAppAlert, showFlashMessage, switchTab, markInputError, clearInputError,
    handleMyDrawerNav, ersKeyPress, ersBackspace, ersClear, ersAddPreset, saveErs, selectItem,
    stepQty, onQtySliderChange, onQtyInputChange, saveQuantity, toggleMFS, getPhysicalItems,
    getInventoryChange, passStockFirewall, switchStoreCategory, loadFloorMap,
    handleDeskSelect, executeHandleDeskSelect, renderPersonalReport,
    renderDeskDashboard, applyDeskFilter, resetDeskFilter, applyPersonalFilter, resetPersonalFilter, syncHistoricalDateBanner, returnToToday,
    setLedgerSearch, clearLedgerSearch, toggleLedgerFilters, setLedgerPaymentFilter, setLedgerStatusFilter, setLedgerAgentFilter, setLedgerSortFilter, clearLedgerFacet,
    canUserPerformCashActions, openManagerCashModal, saveManagerCash, openMainStockModal, toggleMgrCashPaymentFields, validateMgrCashSplit,
    saveMainStock, openReturnStockModal, saveReturnStock, openDeskTransfer,
    executeDeskTransfer, openTransferModal, executeTransfer, filterAdminCatalog, filterAdminCatalogByCategory, resetAdminCatalogFilters, clearAdminSearch,
    toggleAddForm, addInventoryGroup, removeInventoryGroup, openSettings,
    removeRow, addNewItem, saveSettings, openNicknameManager, filterUsersList, clearUsersSearch, filterUsersByRole, resetUsersFilters, saveAdminNickname, saveUserConfig,
    kickAgent, nukeAgent, resetMyDeskLock, forceCloseAllDesks, nukeTodaysLedger,
    fixPastManagerDrops, openAuditModal, fetchAuditLogs,
    renderLiveFloorTab, openMyDeskDashboard, peekAtDesk, initiateCloseDesk,
    installPWA, submitClosingReport, renderAppUI, filterStoreCatalog, clearStoreSearch, toggleStoreInStockFilter, resetStoreFilters, fetchTransactionsForDate,
    openEditTx, saveTxEdit, setEditPaymentMethod, toggleEditSplitFields, updateSplitTotal, cancelTxEdit,
    autoCalcEditTotal, deleteTransaction, openTrash, restoreTx, permanentlyDeleteTx,
    emptyTrash, showAuditTrail, healTodaysOpeningStock,
    runLedgerDiagnostic, downloadReportAsPDF, initCustomDropdowns, healDeskTransfers, executeAdminDrawerTransfer, deleteAgentDateData, healDuplicateSessions,
    openRecycleTracker, filterRecycleList, clearRecycleSearch, filterRecycleByStatus, resetRecycleFilters, openAddRecycleModal, submitRecycleApplication, openUpdateRecycleStatusModal, onRecycleStatusChangeSelect, onAddRecycleStatusChange, saveRecycleStatusUpdate, deleteRecycleSimEntry, triggerStoreRecycleSale, populateStoreRecycleSaleOptions, onSelectRecycleSaleNumberChange, confirmRecycleSimSale, setRecycleContactTimeToNow, onRecycleContactTimeClick, onRecycleContactTimeManualChange, onRecycleAgentChange, resetRecycleContactTimeToPrevious,
    promptSimOnboarding, confirmSimOnboarding, cancelSimOnboarding, toggleOnboardingRow, syncOnboardingCheck,
    openCallRates, closeCallRates, filterRatesList, filterRatesByType, resetRatesFilters, clearRatesSearch, openManageRates, closeManageRates, renderManageRatesDashboard, clearManageRatesSearch, openPackageForm, closePackageForm, addRateRow, savePackageData, deletePackage, autoCalcRateTax,
    showPhoneLoginView, hidePhoneLoginView, resetPhoneLoginView, signInWithPhoneAndPin, openLinkPhoneModal, linkPhoneAndPin, togglePinVisibility,
    toggleCenterCashActions, toggleCenterCashCategory
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
            if (navigator.onLine && window.syncOfflineTransactions) {
                window.syncOfflineTransactions();
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
export function switchTab(tabId, title) {
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
    
    const activeDeskName = (AppState.currentDeskName && AppState.currentDeskName !== 'undefined') ? AppState.currentDeskName : '';
    document.getElementById('header-title').innerText = tabId === 'ers' ? (activeDeskName || AppState.userNickname || AppState.userDisplayName) : title;
    syncHistoricalDateBanner();
    
    // Switch to floor ensures the live floor map renders fresh data reliably
    if (tabId === 'floor') {
        if (typeof window.renderLiveFloorTab === 'function') {
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
    document.getElementById('tab-store')?.classList.toggle('is-mfs-active', AppState.isMfs);
    document.querySelector('#tab-store .toggle-switch')?.setAttribute('aria-checked', AppState.isMfs ? 'true' : 'false');
}

function rerenderLedgerScope(scope) {
    if (scope === 'desk') {
        if (typeof window.renderDeskDashboard === 'function') window.renderDeskDashboard();
    } else {
        if (typeof window.renderPersonalReport === 'function') window.renderPersonalReport();
    }
}

function applyDeskFilter(pill, value) {
    setLedgerFilterField('desk', 'category', value || 'all');
    if (pill && pill.parentNode) {
        pill.parentNode.querySelectorAll('.desk-filter-pill').forEach(p => {
            const isMatch = p === pill;
            p.classList.toggle('active', isMatch);
            p.setAttribute('aria-pressed', isMatch ? 'true' : 'false');
        });
        scrollPillIntoView(pill);
    }
    rerenderLedgerScope('desk');
}
window.applyDeskFilter = applyDeskFilter;

function resetDeskFilter() {
    resetLedgerFilters('desk');
    rerenderLedgerScope('desk');
}
window.resetDeskFilter = resetDeskFilter;

function applyPersonalFilter(pill, value) {
    setLedgerFilterField('personal', 'category', value || 'all');
    if (pill && pill.parentNode) {
        pill.parentNode.querySelectorAll('.desk-filter-pill').forEach(p => {
            const isMatch = p === pill;
            p.classList.toggle('active', isMatch);
            p.setAttribute('aria-pressed', isMatch ? 'true' : 'false');
        });
        scrollPillIntoView(pill);
    }
    rerenderLedgerScope('personal');
}
window.applyPersonalFilter = applyPersonalFilter;

function resetPersonalFilter() {
    resetLedgerFilters('personal');
    rerenderLedgerScope('personal');
}
window.resetPersonalFilter = resetPersonalFilter;

function setLedgerSearch(scope, value) {
    setLedgerFilterField(scope, 'search', value || '');
    rerenderLedgerScope(scope);
}
window.setLedgerSearch = setLedgerSearch;

function clearLedgerSearch(scope) {
    const key = scope === 'desk' ? 'desk' : 'personal';
    const input = document.getElementById(`${key}-ledger-search`);
    if (input) {
        input.value = '';
        if (typeof input.focus === 'function') input.focus();
    }
    setLedgerFilterField(key, 'search', '');
    rerenderLedgerScope(key);
}
window.clearLedgerSearch = clearLedgerSearch;

function toggleLedgerFilters(scope) {
    const key = scope === 'desk' ? 'desk' : 'personal';
    const panel = document.getElementById(`${key}-advanced-filters`);
    const btn = document.getElementById(`${key}-filter-toggle`);
    if (!panel) return;
    const isHidden = panel.style.display === 'none' || !panel.style.display;
    panel.style.display = isHidden ? 'block' : 'none';
    if (btn) {
        btn.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
        btn.classList.toggle('is-open', isHidden);
    }
}
window.toggleLedgerFilters = toggleLedgerFilters;

function setLedgerPaymentFilter(scope, payment, btn = null) {
    setLedgerFilterField(scope, 'payment', payment || 'all');
    if (btn && btn.parentNode) {
        btn.parentNode.querySelectorAll('[data-pay-filter]').forEach(el => {
            const isMatch = el === btn;
            el.classList.toggle('active', isMatch);
            el.setAttribute('aria-pressed', isMatch ? 'true' : 'false');
        });
    }
    rerenderLedgerScope(scope);
}
window.setLedgerPaymentFilter = setLedgerPaymentFilter;

function setLedgerStatusFilter(scope, status, btn = null) {
    setLedgerFilterField(scope, 'status', status || 'all');
    if (btn && btn.parentNode) {
        btn.parentNode.querySelectorAll('[data-status-filter]').forEach(el => {
            const isMatch = el === btn;
            el.classList.toggle('active', isMatch);
            el.setAttribute('aria-pressed', isMatch ? 'true' : 'false');
        });
    }
    rerenderLedgerScope(scope);
}
window.setLedgerStatusFilter = setLedgerStatusFilter;

function setLedgerAgentFilter(scope, agent) {
    setLedgerFilterField(scope, 'agent', agent || 'all');
    rerenderLedgerScope(scope);
}
window.setLedgerAgentFilter = setLedgerAgentFilter;

function setLedgerSortFilter(scope, sort) {
    setLedgerFilterField(scope, 'sort', sort || 'newest');
    rerenderLedgerScope(scope);
}
window.setLedgerSortFilter = setLedgerSortFilter;

function clearLedgerFacet(scope, field) {
    clearSingleLedgerFilter(scope, field);
    rerenderLedgerScope(scope);
}
window.clearLedgerFacet = clearLedgerFacet;

window.addEventListener('click', (event) => {
    if (event.target.classList.contains('modal-overlay') && !['modal-auth', 'splash-screen', 'modal-desk-select', 'modal-nicknames', 'modal-app-alert', 'modal-close-desk', 'modal-edit-tx', 'modal-sim-onboarding', 'modal-select-recycle-sim'].includes(event.target.id)) {
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
        return;
    }

    // 4. Desktop numeric keypad shortcuts for active ERS tab (with no modal or input focused)
    const activeEl = document.activeElement;
    const activeTag = activeEl?.tagName || '';
    const activeRole = activeEl?.getAttribute?.('role');
    const isInputFocused = ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTag) || activeRole === 'combobox';
    const hasActiveModal = document.querySelectorAll('.modal-overlay.active').length > 0;
    const isErsActive = document.getElementById('tab-ers')?.classList.contains('active');

    if (isErsActive && !hasActiveModal && !isInputFocused && !event.ctrlKey && !event.metaKey && !event.altKey) {
        if (/^[0-9]$/.test(event.key)) {
            event.preventDefault();
            ersKeyPress(event.key);
        } else if (event.key === 'Backspace') {
            event.preventDefault();
            ersBackspace();
        } else if (event.key === 'Delete' || event.key.toLowerCase() === 'c') {
            event.preventDefault();
            ersClear();
        } else if (event.key === 'Enter') {
            if ((parseInt(AppState.ui.currentErsAmount, 10) || 0) > 0) {
                event.preventDefault();
                saveErs('Cash');
            }
        }
    }
});

if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        setupBottomSheetDrag();
        initCustomDropdowns();
    });
}
initNetworkStatus();