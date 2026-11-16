import { collection, query, where, getDocs, onSnapshot, doc, getDoc } from "firebase/firestore";
import { renderLiveFloorTab } from './desk.js';
import { db } from '../config/firebase.js';
import { AppState } from '../core/state.js';
import { getStrictDate, formatToGBDate, formatLocalISODate, isViewingHistoricalDate, escapeHtml, escapeJsSingleQuote } from '../utils/helpers.js';
import { showAppAlert, showFlashMessage, openModal } from '../utils/ui-helpers.js';
import { getPhysicalItems, getNormalizedTrackAs } from './inventory.js';
import { priorityItemSortOrder, priorityInventorySortOrder } from '../core/constants.js';
import {
    createDefaultLedgerFilters,
    matchesLedgerFilters,
    sortLedgerTransactions,
    countActiveAdvancedFilters,
    isLedgerFiltered,
    computeFilteredLedgerTotal,
    extractLedgerAgents
} from '../utils/ledger-filters.js';

const userCurrency = 'Tk';
const fmt = (num) => Number(num || 0).toLocaleString('en-IN');
const getTsMillis = (ts, fallback = 0) => (ts && typeof ts.toMillis === 'function') ? ts.toMillis() : (ts?.seconds ? ts.seconds * 1000 : fallback);

function getOnboardingBadge(tx) {
    if (!tx.onboarding) return '';
    
    const fc = tx.onboarding.firstCall ? '✓ FC' : '✕ FC';
    const listB = ['Skitto', 'eSIM Skitto'];
    const isSkitto = listB.includes(tx.name);
    const appLabel = isSkitto ? 'Skitto' : 'MyGP';
    const app = tx.onboarding.appReg ? `✓ ${appLabel}` : `✕ ${appLabel}`;
    
    return `
        <div style="display: flex; align-items: center; gap: 4px; flex-shrink: 0; margin-left: 2px;">
            <span style="font-size: 0.65rem; font-weight: 700; background: ${tx.onboarding.firstCall ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)'}; color: ${tx.onboarding.firstCall ? '#10b981' : '#ef4444'}; padding: 2px 6px; border-radius: 4px; border: 1px solid ${tx.onboarding.firstCall ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'};" title="First Call Status">${fc}</span>
            <span style="font-size: 0.65rem; font-weight: 700; background: ${tx.onboarding.appReg ? 'rgba(51,144,236,0.08)' : 'rgba(239,68,68,0.08)'}; color: ${tx.onboarding.appReg ? '#3390ec' : '#ef4444'}; padding: 2px 6px; border-radius: 4px; border: 1px solid ${tx.onboarding.appReg ? 'rgba(51,144,236,0.15)' : 'rgba(239,68,68,0.15)'};" title="App Registration Status">${app}</span>
        </div>
    `;
}

let centerCashActionsExpanded = false;
let centerCashCategoriesExpanded = {
    drop_manager: false,
    expense: false,
    handset_cash: false,
    receive_float: false
};

export function toggleCenterCashActions() {
    centerCashActionsExpanded = !centerCashActionsExpanded;
    const accordion = document.getElementById('center-cash-accordion');
    const chevron = document.getElementById('center-cash-chevron');
    const trigger = document.querySelector('[onclick="toggleCenterCashActions()"]');
    if (accordion) {
        accordion.style.display = centerCashActionsExpanded ? 'flex' : 'none';
    }
    if (chevron) {
        chevron.style.transform = centerCashActionsExpanded ? 'rotate(180deg)' : 'rotate(0deg)';
    }
    if (trigger) {
        trigger.setAttribute('aria-expanded', centerCashActionsExpanded ? 'true' : 'false');
    }
}

export function toggleCenterCashCategory(catKey) {
    centerCashCategoriesExpanded[catKey] = !centerCashCategoriesExpanded[catKey];
    const drill = document.getElementById(`center-cat-${catKey}-drill`);
    const chevron = document.getElementById(`center-cat-${catKey}-chevron`);
    const trigger = document.querySelector(`[onclick="toggleCenterCashCategory('${catKey}')"]`);
    if (drill) {
        drill.style.display = centerCashCategoriesExpanded[catKey] ? 'flex' : 'none';
    }
    if (chevron) {
        chevron.style.transform = centerCashCategoriesExpanded[catKey] ? 'rotate(180deg)' : 'rotate(0deg)';
    }
    if (trigger) {
        trigger.setAttribute('aria-expanded', centerCashCategoriesExpanded[catKey] ? 'true' : 'false');
    }
}

if (typeof window !== 'undefined') {
    window.toggleCenterCashActions = toggleCenterCashActions;
    window.toggleCenterCashCategory = toggleCenterCashCategory;
}

function classifyCashAction(tx) {
    if (tx.type !== 'adjustment') return null;
    const name = (tx.name || '').toLowerCase();
    const pay = (tx.payment || '').toLowerCase();
    if (name.includes('handset') || tx.handsetModel) return 'handset_cash';
    if (name.includes('expense') || name.includes('donation') || pay.includes('cash out')) return 'expense';
    if (name.includes('float') || name.includes('receive cash') || pay.includes('float') || pay.includes('cash in')) return 'receive_float';
    if (name.includes('drop') || name.includes('handover') || pay.includes('drop')) return 'drop_manager';
    return (tx.cashAmt !== undefined && tx.cashAmt >= 0) ? 'receive_float' : 'drop_manager';
}

const ledgerFiltersByScope = {
    desk: createDefaultLedgerFilters(),
    personal: createDefaultLedgerFilters()
};

function getScopeDomPrefix(scope) {
    return scope === 'desk' ? 'desk' : 'personal';
}

export function getLedgerFilterState(scope = 'personal') {
    const key = scope === 'desk' ? 'desk' : 'personal';
    const base = ledgerFiltersByScope[key];
    if (typeof document !== 'undefined') {
        const hiddenCat = document.getElementById(`${key}-history-filter`)?.value;
        if (hiddenCat) base.category = hiddenCat;
    }
    return { ...base };
}

export function syncLedgerFilterUI(scope = 'personal') {
    if (typeof document === 'undefined') return;
    const key = getScopeDomPrefix(scope);
    const state = ledgerFiltersByScope[key];
    const tabId = key === 'desk' ? 'tab-desk' : 'tab-report';
    const tabEl = document.getElementById(tabId);

    const hiddenCat = document.getElementById(`${key}-history-filter`);
    if (hiddenCat) hiddenCat.value = state.category;

    const searchInput = document.getElementById(`${key}-ledger-search`);
    if (searchInput && searchInput.value !== state.search) {
        searchInput.value = state.search;
    }
    const clearBtn = document.getElementById(`${key}-ledger-search-clear`);
    if (clearBtn) {
        clearBtn.classList.toggle('visible', (state.search || '').trim().length > 0);
    }

    if (tabEl) {
        tabEl.querySelectorAll('.desk-filter-pill').forEach(p => {
            const val = p.getAttribute('data-filter') || '';
            const isActive = val === state.category;
            p.classList.toggle('active', isActive);
            p.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
        tabEl.querySelectorAll('[data-pay-filter]').forEach(btn => {
            const isActive = btn.getAttribute('data-pay-filter') === state.payment;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
        tabEl.querySelectorAll('[data-status-filter]').forEach(btn => {
            const isActive = btn.getAttribute('data-status-filter') === state.status;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
    }

    const agentSelect = document.getElementById(`${key}-agent-filter`);
    if (agentSelect && Array.from(agentSelect.options).some(o => o.value === state.agent)) {
        agentSelect.value = state.agent;
    }
    const sortSelect = document.getElementById(`${key}-sort-filter`);
    if (sortSelect) {
        sortSelect.value = state.sort || 'newest';
    }

    const activeAdvCount = countActiveAdvancedFilters(state);
    const badgeEl = document.getElementById(`${key}-filter-badge`);
    if (badgeEl) {
        badgeEl.innerText = String(activeAdvCount);
        badgeEl.style.display = activeAdvCount > 0 ? 'inline-flex' : 'none';
    }
    const toggleBtn = document.getElementById(`${key}-filter-toggle`);
    if (toggleBtn) {
        toggleBtn.classList.toggle('has-active', activeAdvCount > 0);
    }
}

export function setLedgerFilterField(scope, field, value) {
    const key = getScopeDomPrefix(scope);
    if (field in ledgerFiltersByScope[key]) {
        ledgerFiltersByScope[key][field] = value;
    }
    syncLedgerFilterUI(key);
}

export function resetLedgerFilters(scope = 'personal') {
    const key = getScopeDomPrefix(scope);
    ledgerFiltersByScope[key] = createDefaultLedgerFilters();
    syncLedgerFilterUI(key);
}

function populateLedgerAgentSelect(scope, scopeTxs) {
    if (typeof document === 'undefined') return;
    const key = getScopeDomPrefix(scope);
    const selectEl = document.getElementById(`${key}-agent-filter`);
    if (!selectEl) return;

    const agents = extractLedgerAgents(scopeTxs);
    const current = ledgerFiltersByScope[key].agent || 'all';
    const options = [`<option value="all">All Agents</option>`];
    agents.forEach(name => {
        options.push(`<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`);
    });
    selectEl.innerHTML = options.join('');

    const stillExists = agents.some(a => a.toLowerCase() === current.toLowerCase());
    if (stillExists) {
        const matched = agents.find(a => a.toLowerCase() === current.toLowerCase());
        ledgerFiltersByScope[key].agent = matched;
        selectEl.value = matched;
    } else {
        ledgerFiltersByScope[key].agent = 'all';
        selectEl.value = 'all';
    }
}

export async function renderPersonalReport() {
    let myCash = 0, myMfs = 0;
    let myErsCount = 0, myErsTotal = 0;
    let myItemsSold = {}; 
    let historyHTML = '';
    const personalScopeTxs = [];

    let targetDateStr = formatToGBDate(document.getElementById('report-date-picker').value || getStrictDate());

    let floorOpeningCash = 0;
    let floorManagerDrops = 0;
    let cashActionCategories = {
        drop_manager: { total: 0, items: [] },
        expense: { total: 0, items: [] },
        handset_cash: { total: 0, items: [] },
        receive_float: { total: 0, items: [] }
    };
    
    let floorInvStats = {};
    getPhysicalItems().forEach(item => {
        floorInvStats[item] = { open: 0, inOut: 0, sold: 0, rem: 0 };
    });

    try {
        const sessSnap = await getDocs(query(collection(db, 'sessions'), where('dateStr', '==', targetDateStr)));
        
        let deskFirstSessions = {};

        for (const docSnap of sessSnap.docs) {
            let s = docSnap.data();
            
            // Group sessions by desk to find the true morning start
            // FIX: Use Infinity so pending writes (missing timestamps) don't overwrite valid morning sessions
            let t = getTsMillis(s.openedAt, Infinity);
            if (!deskFirstSessions[s.deskId] || t < deskFirstSessions[s.deskId].time) {
                deskFirstSessions[s.deskId] = { time: t, data: s };
            }
        }

        // Apply the true morning opening balances once per desk
        Object.values(deskFirstSessions).forEach(firstSess => {
            let s = firstSess.data;
            floorOpeningCash += parseFloat(s.openingBalances?.cash) || 0;
            let inv = s.openingBalances?.inventory || {};
            for (let [item, qty] of Object.entries(inv)) {
                let normKey = getNormalizedTrackAs(item);
                if (floorInvStats[normKey]) {
                    floorInvStats[normKey].open += qty;
                    floorInvStats[normKey].rem += qty;
                }
            }
        });

    } catch(e) { 
        console.error("Could not fetch floor sessions", e);
    }

    [...AppState.transactions].reverse().forEach(tx => {
        if (tx.isDeleted) return;

        let safeCashAmt = tx.cashAmt !== undefined ? tx.cashAmt : (tx.payment === 'Cash' ? tx.amount : 0);
        let safeMfsAmt = tx.mfsAmt !== undefined ? tx.mfsAmt : (tx.payment === 'MFS' ? tx.amount : 0);
        
        if (tx.type === 'adjustment') {
            floorManagerDrops += safeCashAmt;
            const catKey = classifyCashAction(tx);
            if (catKey && cashActionCategories[catKey]) {
                cashActionCategories[catKey].total += safeCashAmt;
                cashActionCategories[catKey].items.push(tx);
            }
        } else if (tx.type !== 'transfer_out' && tx.type !== 'transfer_in') {
            myCash += safeCashAmt; 
            myMfs += safeMfsAmt;
            
            if (tx.name === 'ERS Flexiload') {
                myErsCount += Math.abs(tx.qty);
                myErsTotal += tx.amount;
            } else if (tx.name !== 'Physical Cash') {
                myItemsSold[tx.name] = (myItemsSold[tx.name] || 0) + Math.abs(tx.qty); 
            }
        }

        let normTrackAs = getNormalizedTrackAs(tx.trackAs);
        if (AppState.globalInventoryGroups.includes(normTrackAs)) {
            let trackAs = normTrackAs;
            let q = Math.abs(tx.qty);
            
            if (tx.type === 'transfer_in') { floorInvStats[trackAs].inOut += q; floorInvStats[trackAs].rem += q; }
            else if (tx.type === 'transfer_out') { floorInvStats[trackAs].inOut -= q; floorInvStats[trackAs].rem -= q; }
            else if (tx.type === 'adjustment') { floorInvStats[trackAs].inOut += q; floorInvStats[trackAs].rem += q; }
            else { 
                floorInvStats[trackAs].sold += q; 
                floorInvStats[trackAs].rem -= q; 
            }
        }
        
        if (!tx.isRemoteTransfer) {
            personalScopeTxs.push(tx);
        }
    });

    populateLedgerAgentSelect('personal', personalScopeTxs);
    syncLedgerFilterUI('personal');
    const personalFilterState = getLedgerFilterState('personal');
    const personalTotalCount = personalScopeTxs.length;
    const filteredPersonalTxs = sortLedgerTransactions(
        personalScopeTxs.filter(tx => matchesLedgerFilters(tx, personalFilterState, AppState.globalCatalog)),
        personalFilterState.sort
    );
    const personalShownCount = filteredPersonalTxs.length;
    const personalFilteredVolume = computeFilteredLedgerTotal(filteredPersonalTxs, personalFilterState.payment);
    const personalIsFiltered = isLedgerFiltered(personalFilterState);

    filteredPersonalTxs.forEach(tx => {
        let safeCashAmt = tx.cashAmt !== undefined ? tx.cashAmt : (tx.payment === 'Cash' ? tx.amount : 0);
        let safeMfsAmt = tx.mfsAmt !== undefined ? tx.mfsAmt : (tx.payment === 'MFS' ? tx.amount : 0);
        let payLabel = tx.payment === 'Split' ? `Split (C:${safeCashAmt}/M:${safeMfsAmt})` : tx.payment;
        let badges = '';
        
        if (tx.isPending) badges += '<span style="font-size: 0.7rem; background: rgba(245, 158, 11, 0.15); color: var(--warning-text, #b45309); padding: 2px 8px; border-radius: 10px; margin-left: 8px; font-weight: 700;">Pending</span>';
        if (tx.isEdited) badges += `<span role="button" tabindex="0" style="font-size: 0.7rem; background: rgba(139, 92, 246, 0.15); color: var(--purple-text, #6d28d9); padding: 2px 8px; border-radius: 10px; margin-left: 8px; font-weight: 700; cursor: pointer;" onclick="event.stopPropagation(); showAuditTrail('${escapeJsSingleQuote(String(tx.id))}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();showAuditTrail('${escapeJsSingleQuote(String(tx.id))}');}">Edited</span>`;
        
        let detailsHTML = '';
        if (tx.handsetModel) {
            detailsHTML += `<div style="font-size: 0.8rem; color: var(--accent-color); font-weight: 700; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 4px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/></svg><span>Model: ${escapeHtml(tx.handsetModel)}</span></div>`;
        }
        if (tx.notes) {
            detailsHTML += `<div style="font-size: 0.78rem; color: var(--text-secondary); font-weight: 600; margin-top: 2px; font-style: italic; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 4px;" title="${escapeHtml(tx.notes)}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span>${escapeHtml(tx.notes)}</span></div>`;
        }

        let actionBtns = `
                <div class="tx-actions" style="display: none; width: 100%; padding-top: 12px; margin-top: 12px; border-top: 1px dashed var(--border-color); justify-content: flex-end; gap: 8px;">
                    <button type="button" class="btn-outline" style="height: 36px; padding: 0 16px; font-size: 0.85rem; color: var(--accent-color); border-color: var(--accent-color); gap: 6px; border-radius: 10px; font-weight: 700;" onclick="event.stopPropagation(); openEditTx('${escapeJsSingleQuote(String(tx.id))}')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg> Edit
                    </button>
                    <button type="button" class="btn-outline" style="height: 36px; padding: 0 16px; font-size: 0.85rem; color: var(--danger-text); border-color: var(--danger-border); background: var(--danger-bg); gap: 6px; border-radius: 10px; font-weight: 700;" onclick="event.stopPropagation(); deleteTransaction('${escapeJsSingleQuote(tx.docId)}', '${escapeJsSingleQuote(String(tx.id))}')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg> Trash
                    </button>
                </div>
            `;

        let isOutflow = (tx.type === 'adjustment' && (tx.cashAmt !== undefined ? tx.cashAmt < 0 : true)) || tx.type === 'transfer_out';
        let dotColor = '#10b981'; // Default Green (ERS)
        if (tx.type === 'adjustment') {
            dotColor = (tx.cashAmt !== undefined ? tx.cashAmt < 0 : true) ? '#ef4444' : '#10b981'; // Red for Outflow, Green for Inflow
        } else if (tx.type === 'transfer_out' || tx.type === 'transfer_in') {
            dotColor = '#8b5cf6'; // Purple
        } else if (tx.name !== 'ERS Flexiload') {
            dotColor = '#3390ec'; // Blue
        }

        let amtColor = isOutflow ? 'var(--danger-text)' : 'var(--text-primary)';
        let amtPrefix = isOutflow ? '− ' : '';

        historyHTML += `
            <div class="history-item" role="button" tabindex="0" onkeydown="if(event.target===this&&(event.key==='Enter'||event.key===' ')){event.preventDefault();this.click();}" style="display: flex; flex-direction: column; padding: 16px; background: var(--surface-strong); border: 1px solid var(--border-color); border-radius: 18px; box-shadow: var(--shadow-soft); margin-bottom: 12px; cursor: pointer; transition: transform 0.4s var(--spring-physics), background-color 0.2s ease;" onpointerdown="this.style.transform='scale(0.975)'" onpointerup="this.style.transform='scale(1)'" onpointerleave="this.style.transform='scale(1)'" onclick="const actions = this.querySelector('.tx-actions'); const chv = this.querySelector('.tx-chevron svg'); if(actions) { const isExp = actions.style.display !== 'none'; actions.style.display = isExp ? 'none' : 'flex'; if(chv) chv.style.transform = isExp ? 'rotate(0deg)' : 'rotate(180deg)'; }">
                <div style="display: flex; width: 100%; align-items: center; gap: 14px;">
                    <div style="width: 44px; height: 44px; border-radius: 12px; background: ${dotColor}0c; color: ${dotColor}; display: flex; align-items: center; justify-content: center; flex-shrink: 0; border: 1px solid ${dotColor}18; box-shadow: 0 2px 6px ${dotColor}08;">
                        <span style="font-size: 0.95rem; font-weight: 900;">${tx.qty}x</span>
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-size: 1rem; color: var(--text-primary); font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.2; margin-bottom: 2px;">
                            ${escapeHtml(tx.name)}
                        </div>
                        ${detailsHTML}
                        <div style="display: flex; align-items: center; gap: 8px; margin-top: 6px; font-size: 0.72rem; color: var(--text-secondary); font-weight: 600; line-height: 1;">
                            <div style="display: flex; align-items: center; background: var(--bg-color); padding: 2px 6px; border-radius: 6px; border: 1px solid var(--border-color); font-family: monospace; color: var(--text-primary); font-weight: 700; font-size: 0.68rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 120px;" title="${escapeHtml(tx.receiptNo || tx.id)}">
                                ${escapeHtml(tx.receiptNo || tx.id)}
                            </div>
                            <div style="display: flex; align-items: center; gap: 4px; flex-shrink: 0;">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="opacity: 0.7;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                <span style="margin-top: 1px;">${escapeHtml(tx.time)}</span>
                            </div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px; margin-top: 5px; font-size: 0.72rem; color: var(--text-secondary); font-weight: 600; line-height: 1; flex-wrap: wrap;">
                            <div style="display: flex; align-items: center; gap: 4px; color: ${tx.payment === 'MFS' ? 'var(--success-text, #15803d)' : 'var(--text-secondary)'}; flex-shrink: 0;">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="opacity: 0.7;"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
                                <span style="margin-top: 1px;">${escapeHtml(payLabel)}</span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 4px; color: var(--text-primary); font-weight: 700; flex-shrink: 0;">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="opacity: 0.7;"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                                <span style="margin-top: 1px;">${escapeHtml((tx.agentName || 'Unknown').split(' ')[0])}</span>
                            </div>
                            ${getOnboardingBadge(tx)}
                            ${badges}
                        </div>
                    </div>
                    <div style="display: flex; flex-direction: column; align-items: flex-end; justify-content: center; gap: 4px; flex-shrink: 0;">
                        <div class="tabular-nums" style="font-size: 1.25rem; font-weight: 900; color: ${amtColor}; text-align: right; font-family: monospace; display: flex; align-items: baseline; gap: 2px;">
                            <span>${amtPrefix}${Math.abs(tx.amount || 0)}</span>
                            <span style="font-size: 0.72rem; font-weight: 700; color: var(--text-secondary); font-family: inherit;">Tk</span>
                        </div>
                        <div class="tx-chevron" style="color: var(--text-secondary); opacity: 0.6; display: flex; align-items: center; justify-content: center;">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.2s ease;"><path d="m6 9 6 6 6-6"/></svg>
                        </div>
                    </div>
                </div>
                ${actionBtns}
            </div>
        `;
    });

    let expectedCenterCash = floorOpeningCash + myCash + floorManagerDrops;
    
    const catConfigs = [
        { key: 'drop_manager', title: 'Cash Drop to Manager' },
        { key: 'expense', title: 'Expense / Donation' },
        { key: 'handset_cash', title: 'Receive Handset Cash' },
        { key: 'receive_float', title: 'Receive Cash from Manager' }
    ];

    function formatSignedTk(val) {
        if (val === 0) return '0 Tk';
        const sign = val > 0 ? '+' : '-';
        return `${sign}${fmt(Math.abs(val))} Tk`;
    }

    const categoriesHTML = catConfigs.map(cfg => {
        const catData = cashActionCategories[cfg.key] || { total: 0, items: [] };
        const catTotal = catData.total;
        const txList = catData.items;
        const isCatExpanded = Boolean(centerCashCategoriesExpanded[cfg.key]);
        const catAmtColor = catTotal > 0 ? 'var(--success-text)' : (catTotal < 0 ? 'var(--danger-text)' : 'var(--text-secondary)');

        let drillHTML = '';
        if (txList.length === 0) {
            drillHTML = `
                <div style="font-size: 0.75rem; color: var(--text-secondary); font-style: italic; padding: 8px 12px; text-align: center; background: var(--surface-color); border: 1px dashed var(--border-color); border-radius: 8px;">
                    No transactions in this category today
                </div>
            `;
        } else {
            drillHTML = txList.map(tx => {
                let safeCash = tx.cashAmt !== undefined ? tx.cashAmt : (tx.payment === 'Cash' ? tx.amount : 0);
                let safeMfs = tx.mfsAmt !== undefined ? tx.mfsAmt : (tx.payment === 'MFS' ? tx.amount : 0);
                let signedCashText = safeCash >= 0 ? `+${fmt(safeCash)} Tk` : `-${fmt(Math.abs(safeCash))} Tk`;
                let signedCashColor = safeCash >= 0 ? 'var(--success-text)' : 'var(--danger-text)';

                if (cfg.key === 'handset_cash') {
                    let splitText = tx.payment === 'Split' ? `<span style="opacity: 0.85; margin-left: 4px;">(Cash: ${fmt(safeCash)}, MFS: ${fmt(safeMfs)})</span>` : '';
                    return `
                        <div style="background: var(--surface-color); border: 1px solid var(--border-color); border-radius: 10px; padding: 10px 12px; display: flex; flex-direction: column; gap: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
                            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; min-width: 0;">
                                <div style="font-weight: 800; font-size: 0.85rem; color: var(--accent-color); overflow-wrap: anywhere; display: flex; align-items: center; gap: 4px; min-width: 0;">
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/></svg>
                                    <span>Model: ${escapeHtml(tx.handsetModel || 'Handset (Model Unspecified)')}</span>
                                </div>
                                <div class="tabular-nums" style="font-weight: 800; font-size: 0.85rem; color: ${signedCashColor}; white-space: nowrap; flex-shrink: 0;">
                                    ${signedCashText}
                                </div>
                            </div>
                            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; color: var(--text-secondary); flex-wrap: wrap; gap: 4px;">
                                <div>Method: <strong>${escapeHtml(tx.payment || 'Cash')}</strong> ${splitText}</div>
                                <div style="font-weight: 600;">${escapeHtml(tx.time || '')}</div>
                            </div>
                            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 4px; font-size: 0.7rem; color: var(--text-secondary); opacity: 0.85; border-top: 1px dashed var(--border-color); padding-top: 4px; margin-top: 2px;">
                                <div style="min-width: 0; overflow-wrap: anywhere;">By ${escapeHtml(tx.agentName || 'Staff')} ${tx.deskId ? `• ${escapeHtml(tx.deskId)}` : '• Floor'}</div>
                                <div>${tx.receiptNo ? `#${escapeHtml(tx.receiptNo)}` : ''}</div>
                            </div>
                            ${tx.notes ? `<div style="font-size: 0.72rem; color: var(--text-secondary); font-style: italic; overflow-wrap: anywhere;">Note: ${escapeHtml(tx.notes)}</div>` : ''}
                        </div>
                    `;
                } else {
                    return `
                        <div style="background: var(--surface-color); border: 1px solid var(--border-color); border-radius: 10px; padding: 10px 12px; display: flex; flex-direction: column; gap: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
                            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; min-width: 0;">
                                <div style="font-weight: 700; font-size: 0.82rem; color: var(--text-primary); overflow-wrap: anywhere; min-width: 0;">
                                    ${escapeHtml(tx.name || cfg.title)}
                                </div>
                                <div class="tabular-nums" style="font-weight: 800; font-size: 0.85rem; color: ${signedCashColor}; white-space: nowrap; flex-shrink: 0;">
                                    ${signedCashText}
                                </div>
                            </div>
                            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; color: var(--text-secondary); flex-wrap: wrap; gap: 4px;">
                                <div style="min-width: 0; overflow-wrap: anywhere;">By ${escapeHtml(tx.agentName || 'Staff')} ${tx.deskId ? `• ${escapeHtml(tx.deskId)}` : '• Floor'}</div>
                                <div style="font-weight: 600;">${escapeHtml(tx.time || '')}</div>
                            </div>
                            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.7rem; color: var(--text-secondary); opacity: 0.85;">
                                <div>${tx.payment ? `Type: ${escapeHtml(tx.payment)}` : ''}</div>
                                <div>${tx.receiptNo ? `#${escapeHtml(tx.receiptNo)}` : ''}</div>
                            </div>
                            ${tx.notes ? `<div style="font-size: 0.72rem; color: var(--text-secondary); font-style: italic; overflow-wrap: anywhere; border-top: 1px dashed var(--border-color); padding-top: 4px; margin-top: 2px;">Note: ${escapeHtml(tx.notes)}</div>` : ''}
                        </div>
                    `;
                }
            }).join('');
        }

        return `
            <div style="background: var(--surface-color); border: 1px solid var(--border-color); border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px;">
                <div role="button" tabindex="0" aria-expanded="${isCatExpanded ? 'true' : 'false'}" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click();}" onclick="toggleCenterCashCategory('${cfg.key}')" style="display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 0.82rem; font-weight: 700; color: var(--text-primary);">${cfg.title}</span>
                        <span style="font-size: 0.7rem; font-weight: 700; background: rgba(99, 102, 241, 0.08); color: #6366f1; padding: 2px 7px; border-radius: 9999px; border: 1px solid rgba(99, 102, 241, 0.2);">${txList.length}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <span class="tabular-nums" style="font-size: 0.95rem; font-weight: 800; color: ${catAmtColor};">${formatSignedTk(catTotal)}</span>
                        <svg id="center-cat-${cfg.key}-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--text-secondary); transition: transform 0.2s ease; transform: ${isCatExpanded ? 'rotate(180deg)' : 'rotate(0deg)'};"><polyline points="6 9 12 15 18 9"/></svg>
                    </div>
                </div>
                <div id="center-cat-${cfg.key}-drill" style="display: ${isCatExpanded ? 'flex' : 'none'}; flex-direction: column; gap: 8px; border-top: 1px dashed var(--border-color); padding-top: 8px;">
                    ${drillHTML}
                </div>
            </div>
        `;
    }).join('');
    
    const cardContainer = document.getElementById('report-profile-card-container');
    if (cardContainer) {
        cardContainer.innerHTML = `
            <div style="background: linear-gradient(135deg, var(--surface-strong), var(--surface-soft)); border: 1px solid var(--border-color); border-radius: 20px; padding: 22px 24px; box-shadow: var(--shadow-soft); display: flex; flex-direction: column; gap: 16px;">
                <!-- 1. Header Section -->
                <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="width: 42px; height: 42px; border-radius: 12px; background: rgba(99, 102, 241, 0.08); color: #6366f1; display: flex; align-items: center; justify-content: center; flex-shrink: 0; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.08);">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>
                        </div>
                        <h3 style="margin: 0; font-size: 1.25rem; font-weight: 900; color: var(--text-primary); letter-spacing: -0.2px;">Center Report</h3>
                    </div>
                    <button type="button" onclick="downloadReportAsPDF('tab-report', 'Center_Report')" style="background: rgba(var(--accent-rgb, 51, 144, 236), 0.08); border: 1px solid rgba(var(--accent-rgb, 51, 144, 236), 0.25); border-radius: 12px; width: 38px; height: 38px; display: flex; align-items: center; justify-content: center; color: var(--accent-color); cursor: pointer; transition: all 0.2s ease;" title="Download PDF" aria-label="Download PDF">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                    </button>
                </div>

                <!-- 2. Ledger Statement List -->
                <div style="display: flex; flex-direction: column; gap: 14px; border-top: 1px dashed var(--border-color); padding-top: 18px;">
                    <!-- Opening Cash -->
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 0.8rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.3px;">Opening Cash</span>
                        <span id="center-tot-opening" class="tabular-nums" style="font-size: 1.4rem; font-weight: 800; color: var(--text-primary);">${fmt(floorOpeningCash)} <span style="font-size: 0.8rem; font-weight: 600; color: var(--text-secondary);">Tk</span></span>
                    </div>
                    
                    <!-- Cash Sales -->
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 0.8rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.3px;">Cash Sales</span>
                        <span class="tabular-nums" style="font-size: 1.4rem; font-weight: 800; color: var(--success-text, #15803d);">+${fmt(myCash)} <span style="font-size: 0.8rem; font-weight: 600; color: var(--text-secondary);">Tk</span></span>
                    </div>
                    
                    <!-- +/- Cash Actions (Interactive Accordion) -->
                    <div role="button" tabindex="0" aria-expanded="${centerCashActionsExpanded ? 'true' : 'false'}" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click();}" style="display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none; padding: 4px 0;" onclick="toggleCenterCashActions()">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-size: 0.8rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.3px;">+/- Cash Actions</span>
                            <svg id="center-cash-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--text-secondary); transition: transform 0.2s ease; transform: ${centerCashActionsExpanded ? 'rotate(180deg)' : 'rotate(0deg)'};"><polyline points="6 9 12 15 18 9"/></svg>
                        </div>
                        <span id="center-tot-drops" class="tabular-nums" style="font-size: 1.4rem; font-weight: 800; color: ${floorManagerDrops >= 0 ? 'var(--success-text, #15803d)' : 'var(--danger-text, #b91c1c)'};">
                            ${floorManagerDrops >= 0 ? '+' : ''}${fmt(floorManagerDrops)} <span style="font-size: 0.8rem; font-weight: 600; color: var(--text-secondary);">Tk</span>
                        </span>
                    </div>

                    <!-- Level 1: Inline Expandable Category Accordion -->
                    <div id="center-cash-accordion" style="display: ${centerCashActionsExpanded ? 'flex' : 'none'}; flex-direction: column; gap: 8px; background: var(--bg-color); border: 1px solid var(--border-color); border-radius: 14px; padding: 10px; margin-top: -4px;">
                        ${categoriesHTML}
                    </div>

                    <div style="border-top: 1px solid var(--border-color); margin: 6px 0;"></div>

                    <!-- Expected Cash Highlight Box -->
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: var(--warning-bg, rgba(245, 158, 11, 0.05)); border: 1.5px solid var(--warning-border); border-radius: 12px;">
                        <span style="font-weight: 900; color: var(--warning-text, #b45309); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.8px; white-space: nowrap; flex-shrink: 0;">Expected Cash</span>
                        <span id="center-tot-expected" class="tabular-nums" style="font-weight: 900; color: var(--warning-text, #b45309); font-size: 1.4rem; white-space: nowrap; display: inline-flex; align-items: baseline; gap: 4px;">${fmt(expectedCenterCash)} <span style="font-size: 0.9rem; font-weight: 800;">Tk</span></span>
                    </div>
                </div>
            </div>
        `;
    }

    if(document.getElementById('report-total-all')) document.getElementById('report-total-all').innerText = (myCash + myMfs) + ' ' + userCurrency;
    if(document.getElementById('tot-cash-sales')) {
        document.getElementById('tot-cash-sales').innerText = fmt(myCash) + ' ' + userCurrency;
        document.getElementById('tot-cash-sales').style.color = 'var(--info-text)';
    }
    if(document.getElementById('tot-mfs')) {
        document.getElementById('tot-mfs').innerText = fmt(myMfs) + ' ' + userCurrency;
        document.getElementById('tot-mfs').style.color = 'var(--success-text)';
    }
    if(document.getElementById('tot-ers')) {
        document.getElementById('tot-ers').innerText = fmt(myErsTotal) + ' ' + userCurrency;
        document.getElementById('tot-ers').style.color = 'var(--warning-text)';
    }



    let invHTML = '';
    let sortedPersonalItems = Object.entries(myItemsSold).sort((a, b) => {
        let indexA = priorityItemSortOrder.indexOf(a[0]);
        let indexB = priorityItemSortOrder.indexOf(b[0]);
        if (indexA !== -1 && indexB !== -1) return indexA - indexB; // Both priority: sort by index
        if (indexA !== -1) return -1; // Only A priority: A goes up
        if (indexB !== -1) return 1;  // Only B priority: B goes up
        return a[0].localeCompare(b[0]); // Neither priority: alphabetical
    });

    for (const [name, qty] of sortedPersonalItems) {
        invHTML += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 14px 4px; border-bottom: 1px solid var(--border-color);">
                <span style="font-weight: 600; color: var(--text-primary); font-size: 1rem; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 12px;">${escapeHtml(name)}</span>
                <span class="tabular-nums" style="font-weight: 800; color: var(--text-secondary); font-size: 1.1rem; flex-shrink: 0;">${qty}x</span>
            </div>
        `;
    }

    document.getElementById('inventory-list').innerHTML = invHTML || '<div class="report-row" style="color: var(--text-secondary); font-style: italic; padding: 12px 4px;">No items sold yet</div>';

    let floorStockSection = document.getElementById('floor-stock-section');
    if (floorStockSection) floorStockSection.style.display = 'block';

    let liveStockHTML = `
            <div style="display: grid; grid-template-columns: minmax(0, 2fr) repeat(3, minmax(0, 1fr)) minmax(0, 1.2fr); gap: 4px; padding: 4px 4px 8px 4px; border-bottom: 2px solid var(--border-color); font-size: 0.7rem; font-weight: 800; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">
                <div style="min-width: 0;">Item</div>
                <div style="text-align: center;">Start</div>
                <div style="text-align: center;">In/Out</div>
                <div style="text-align: center;">Sold</div>
                <div style="text-align: center; color: var(--info-text);">Exp.</div>
            </div>
        `;
        
        let hasLiveStock = false;
        let sortedFloorInv = Object.entries(floorInvStats).sort((a, b) => {
            let indexA = priorityInventorySortOrder.indexOf(a[0]);
            let indexB = priorityInventorySortOrder.indexOf(b[0]);
            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            if (indexA !== -1) return -1;
            if (indexB !== -1) return 1;
            return a[0].localeCompare(b[0]);
        });

        for (const [item, d] of sortedFloorInv) {
            hasLiveStock = true;
            
            let inOutColor = d.inOut > 0 ? 'var(--success-text)' : (d.inOut < 0 ? 'var(--danger-text)' : 'var(--text-secondary)');
            let inOutStr = d.inOut > 0 ? `+${d.inOut}` : (d.inOut < 0 ? `${d.inOut}` : `0`);

            liveStockHTML += `
                <div class="tabular-nums" style="display: grid; grid-template-columns: minmax(0, 2fr) repeat(3, minmax(0, 1fr)) minmax(0, 1.2fr); gap: 4px; align-items: center; padding: 12px 4px; border-bottom: 1px dashed var(--border-color); font-size: 0.85rem;">
                    <div style="min-width: 0; font-weight: 700; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 4px; cursor: pointer;" onclick="showTooltip(this, '${escapeJsSingleQuote(item)}')">${escapeHtml(item)}</div>
                    <div style="text-align: center; color: var(--text-secondary); font-weight: 600;">${d.open}</div>
                    <div style="text-align: center; color: ${inOutColor}; font-weight: 700;">${inOutStr}</div>
                    <div style="text-align: center; color: var(--warning-text); font-weight: 700;">${d.sold}</div>
                    <div style="text-align: center; color: var(--info-text); font-weight: 800; font-size: 1rem;">${d.rem}</div>
                </div>
            `;
        }
        
        if (!hasLiveStock) liveStockHTML += '<div style="color: var(--text-secondary); font-style: italic; padding: 12px 4px;">No physical stock recorded today</div>';
        
        if (document.getElementById('floor-stock-list')) {
            document.getElementById('floor-stock-list').innerHTML = liveStockHTML;
        }
    
    const personalCountLabel = !personalIsFiltered
        ? `Showing ${personalShownCount} transaction${personalShownCount === 1 ? '' : 's'} &middot; ${fmt(personalFilteredVolume)} Tk`
        : `Showing ${personalShownCount} of ${personalTotalCount} &middot; ${fmt(personalFilteredVolume)} Tk`;
    const personalCountBar = historyHTML
        ? `<div class="ledger-count-bar"><span>${personalCountLabel}</span>${personalIsFiltered ? '<button type="button" class="ledger-reset-link" onclick="resetPersonalFilter()">Reset Filters</button>' : ''}</div>`
        : '';

    const personalEmptyHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
                </svg>
                <p>${personalIsFiltered ? 'No matching transactions' : 'No transactions found'}</p>
                ${personalIsFiltered ? '<button type="button" class="btn-outline" style="margin-top:12px;width:auto;height:auto;padding:8px 16px;font-size:0.82rem;color:var(--accent-color);border-color:var(--accent-color);" onclick="resetPersonalFilter()">Reset All Filters</button>' : ''}
            </div>`;

    const historyLogEl = document.getElementById('history-log');
    if (historyLogEl) {
        historyLogEl.innerHTML = historyHTML ? (personalCountBar + historyHTML) : personalEmptyHTML;
    }
}

export function buildLifecycleText(txList, openingInv) {
    let stats = {};
    let hasItems = false;
    
    getPhysicalItems().forEach(item => {
        let openQty = 0;
        Object.entries(openingInv).forEach(([k, v]) => {
            if (getNormalizedTrackAs(k) === item) openQty += v;
        });
        if (openQty > 0) {
            stats[item] = { open: openQty, in: 0, out: 0, sold: 0, rem: openQty, rev: 0 };
            hasItems = true;
        }
    });

    txList.forEach(tx => {
        if (tx.isDeleted || tx.name === 'Physical Cash' || tx.name === 'ERS Flexiload') return;
        let trackAs = getNormalizedTrackAs(tx.trackAs);
        if (!AppState.globalInventoryGroups.includes(trackAs)) return;

        if (!stats[trackAs]) stats[trackAs] = { open: 0, in: 0, out: 0, sold: 0, rem: 0, rev: 0 };
        hasItems = true;
        let q = Math.abs(tx.qty);
        
        if (tx.type === 'transfer_in') { stats[trackAs].in += q; stats[trackAs].rem += q; }
        else if (tx.type === 'transfer_out') { stats[trackAs].out += q; stats[trackAs].rem -= q; }
        else if (tx.type === 'adjustment') { stats[trackAs].in += q; stats[trackAs].rem += q; }
        else { stats[trackAs].sold += q; stats[trackAs].rem -= q; stats[trackAs].rev += (tx.amount || 0); }
    });

    if (!hasItems) return "   No physical items tracked.\n";

    let text = "";
    for (const [item, data] of Object.entries(stats)) {
        if (data.open === 0 && data.in === 0 && data.sold === 0 && data.out === 0) continue;
        text += `- *${item}*\n`;
        text += `   Start: ${data.open} | In: +${data.in} | Out: -${data.out}\n`;
        text += `   Sold: ${data.sold} | Exp. Left: ${data.rem}\n\n`;
    }
    return text;
}

export async function fallbackCopy(text) {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
        } else {
            const textArea = document.createElement("textarea");
            textArea.value = text; document.body.appendChild(textArea); textArea.select();
            document.execCommand("copy"); document.body.removeChild(textArea);
        }
        showFlashMessage("Report Copied to Clipboard!");
    } catch (err) { 
        console.error("Clipboard error:", err);
        showAppAlert("Error", "Could not copy report."); 
    }
}

// === NEW: INVOICE PDF GENERATOR (CONTINUOUS FIXED-WIDTH LAYOUT) ===
export function downloadReportAsPDF(mode, prefix) {
    showAppAlert("Download PDF", "Generate and download the official PDF ledger?", true, () => {
        executeDownloadReportAsPDF(mode, prefix);
    }, "Download");
}

async function executeDownloadReportAsPDF(mode, prefix) {
    if (!window.html2pdf) {
        showAppAlert("Error", "PDF library not loaded.");
        return;
    }
    
    // Inject dynamic glass overlay loader spinner
    const loader = document.createElement('div');
    loader.id = 'pdf-generation-loader';
    loader.style.cssText = `
        position: fixed;
        inset: 0;
        width: 100%;
        height: 100%;
        background: rgba(15, 23, 42, 0.45);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        z-index: 99999;
        color: #ffffff;
        font-family: 'Outfit', 'Inter', sans-serif;
    `;
    loader.innerHTML = `
        <div style="background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 24px; padding: 40px; display: flex; flex-direction: column; align-items: center; box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37); max-width: 90%; width: 340px; text-align: center;">
            <div class="pdf-spinner" style="width: 50px; height: 50px; border: 4px solid rgba(255, 255, 255, 0.1); border-left-color: #0ea5e9; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 20px;"></div>
            <h3 style="margin: 0 0 8px 0; font-size: 1.25rem; font-weight: 700; color: #ffffff;">Generating Ledger</h3>
            <p style="margin: 0; font-size: 0.9rem; color: rgba(255, 255, 255, 0.7); line-height: 1.4;">Preparing continuous PDF ledger... Please wait.</p>
        </div>
    `;
    document.body.appendChild(loader);

    // Yield main thread to allow loader UI/spinner to draw and animate
    await new Promise(resolve => setTimeout(resolve, 250));

    try {
        // 1. Gather Context Data
        let dateStr = formatToGBDate(document.getElementById('report-date-picker').value || getStrictDate());
        let rawTime = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        let fileTimeStr = rawTime.replace(/ /g, '').replace(/:/g, '-'); 
        
        let deskName = "Center Ledger";
        let agents = AppState.userNickname || AppState.userDisplayName;

        let opening = "0", cashSales = "0", mgrDrops = "0", expected = "0";
        let mfsTotal = "0", ersTotal = "0";

        if (mode === 'tab-desk') {
            let rawDeskName = document.getElementById('desk-dashboard-title')?.innerText || 'My Active Desk';
            deskName = rawDeskName.replace(/\(My Drawer\)/i, '').trim();
            agents = document.getElementById('desk-logged-agents')?.innerText || 'None';        
            opening = document.getElementById('desk-tot-opening')?.innerText?.replace(' Tk', '') || "0";
            cashSales = document.getElementById('desk-tot-cash-sales')?.innerText?.replace('+ ', '')?.replace(' Tk', '') || "0";
            mgrDrops = document.getElementById('desk-tot-manager')?.innerText?.replace(' Tk', '') || "0";
            expected = document.getElementById('desk-tot-expected-cash')?.innerText?.replace(' Tk', '') || "0";
            
            const mfsCard = document.getElementById('desk-tot-mfs');
            const ersCard = document.getElementById('desk-tot-ers');
            mfsTotal = mfsCard ? mfsCard.innerText.replace(' Tk', '') : "0";
            ersTotal = ersCard ? ersCard.innerText.replace(' Tk', '') : "0";
        } else {
            deskName = "Consolidated Center Ledger";
            
            opening = document.getElementById('center-tot-opening')?.innerText || "0";
            mgrDrops = document.getElementById('center-tot-drops')?.innerText || "0";
            expected = document.getElementById('center-tot-expected')?.innerText || "0";
            
            cashSales = document.getElementById('tot-cash-sales')?.innerText?.replace(' Tk', '') || "0";
            mfsTotal = document.getElementById('tot-mfs')?.innerText?.replace(' Tk', '') || "0";
            ersTotal = document.getElementById('tot-ers')?.innerText?.replace(' Tk', '') || "0";
        }

        let safeDeskName = deskName.replace(/'/g, '').replace(/ /g, '_');
        let safeDateStr = dateStr.replace(/\//g, '-');
        let finalFileName = `${safeDeskName}_Ledger_${safeDateStr}_${fileTimeStr}.pdf`;

        // 2. Build Inventory Table Rows
        let inventoryRowsText = '';
        let stockRows = document.querySelectorAll(mode === 'tab-desk' ? '#live-dashboard-wrapper > div:nth-child(3) > div:nth-child(2) > div > div:not(:first-child)' : '#floor-stock-list > div:not(:first-child)');
        
        if (stockRows && stockRows.length > 0) {
            stockRows.forEach((row, index) => {
                let cols = row.children;
                if(cols.length === 5) {
                    let bg = index % 2 === 0 ? '#ffffff' : '#f8fafc';
                    inventoryRowsText += `
                        <tr style="background-color: ${bg}; border-bottom: 1px solid #e2e8f0;">
                            <td style="padding: 10px; font-weight: 600; color: #334155;">${escapeHtml(cols[0].innerText)}</td>
                            <td style="padding: 10px; text-align: center; color: #64748b;">${escapeHtml(cols[1].innerText)}</td>
                            <td style="padding: 10px; text-align: center; font-weight: bold; color: ${cols[2].innerText.includes('+') ? '#10b981' : (cols[2].innerText.includes('-') ? '#ef4444' : '#64748b')};">${escapeHtml(cols[2].innerText)}</td>
                            <td style="padding: 10px; text-align: center; color: #f59e0b;">${escapeHtml(cols[3].innerText)}</td>
                            <td style="padding: 10px; text-align: center; font-weight: bold; color: #0ea5e9;">${escapeHtml(cols[4].innerText)}</td>
                        </tr>`;
                }
            });
        } else {
            inventoryRowsText = `<tr><td colspan="5" style="padding: 16px; text-align: center; color: #94a3b8; font-style: italic;">No physical stock recorded today.</td></tr>`;
        }

        // 3. Build Items Sold Table Rows
        let itemsRowsText = '';
        let soldRows = document.querySelectorAll(mode === 'tab-desk' ? '#live-dashboard-wrapper > div:nth-child(4) > div:not(:first-child)' : '#inventory-list > div');
        let hasItems = false;
        
        if (soldRows && soldRows.length > 0) {
            soldRows.forEach((row, index) => {
                let name = row.children[0]?.innerText;
                let qty = row.children[1]?.innerText;
                if (name && qty && name !== 'No items sold yet' && name !== 'No items or services sold yet') {
                    hasItems = true;
                    let bg = index % 2 === 0 ? '#ffffff' : '#f8fafc';
                    itemsRowsText += `
                        <tr style="background-color: ${bg}; border-bottom: 1px solid #e2e8f0;">
                            <td style="padding: 10px 16px; color: #334155; font-weight: 500;">${escapeHtml(name)}</td>
                            <td style="padding: 10px 16px; text-align: right; color: #0f172a; font-weight: bold;">${escapeHtml(qty)}</td>
                        </tr>`;
                }
            });
        }
        if (!hasItems) itemsRowsText = `<tr><td colspan="2" style="padding: 16px; text-align: center; color: #94a3b8; font-style: italic;">No items or services sold.</td></tr>`;

        // 4. Construct Modern HTML Template (Mobile Width: 480px)
        const invoiceContent = `
            <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #0f172a; padding: 20px; width: 480px; box-sizing: border-box; background-color: #ffffff;">
                
                <div style="border-bottom: 3px solid #0ea5e9; padding-bottom: 16px; margin-bottom: 20px; display: flex; flex-direction: column; gap: 12px;">
                    <div>
                        <h1 style="margin: 0; color: #0ea5e9; font-size: 28px; font-weight: 800; letter-spacing: -0.5px;">AMOLNAMA</h1>
                        <h2 style="margin: 4px 0 0 0; color: #475569; font-size: 14px; font-weight: 500; text-transform: uppercase; letter-spacing: 1px;">Daily Ledger Report</h2>
                    </div>
                    <div style="font-size: 13px; color: #64748b; line-height: 1.6;">
                        <strong>Date:</strong> ${escapeHtml(dateStr)} &nbsp;|&nbsp; <strong>Time:</strong> ${escapeHtml(rawTime)}<br>
                        <strong>Desk:</strong> <span style="color: #0f172a; font-weight: bold;">${escapeHtml(deskName)}</span><br>
                        <strong>Agent:</strong> ${escapeHtml(agents)}
                    </div>
                </div>

                <div style="display: flex; flex-direction: column; gap: 16px; margin-bottom: 24px;">
                    
                    <div style="border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
                        <div style="background-color: #f8fafc; padding: 10px 16px; font-weight: bold; color: #334155; border-bottom: 1px solid #e2e8f0; font-size: 13px; text-transform: uppercase;">Cash Reconciliation</div>
                        <div style="padding: 16px; font-size: 14px;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                                <span style="color: #64748b;">Opening Cash:</span>
                                <strong>${opening} Tk</strong>
                            </div>
                            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                                <span style="color: #64748b;">(+) Cash Sales:</span>
                                <strong style="color: #10b981;">${cashSales} Tk</strong>
                            </div>
                            <div style="display: flex; justify-content: space-between; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px dashed #cbd5e1;">
                                <span style="color: #64748b;">(+/-) Manager Actions:</span>
                                <strong style="color: ${mgrDrops.includes('-') ? '#ef4444' : '#0f172a'};">${mgrDrops} Tk</strong>
                            </div>
                            <div style="display: flex; justify-content: space-between; font-size: 16px;">
                                <span style="font-weight: bold; color: #0f172a;">Expected Drawer:</span>
                                <strong style="color: #0ea5e9;">${expected} Tk</strong>
                            </div>
                        </div>
                    </div>

                    <div style="display: flex; gap: 12px;">
                        <div style="flex: 1; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 4px;">
                            <span style="color: #64748b; font-size: 12px; font-weight: bold; text-transform: uppercase;">Total MFS</span>
                            <strong style="font-size: 18px; color: #8b5cf6;">${mfsTotal} Tk</strong>
                        </div>
                        <div style="flex: 1; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 4px;">
                            <span style="color: #64748b; font-size: 12px; font-weight: bold; text-transform: uppercase;">ERS Sent</span>
                            <strong style="font-size: 18px; color: #f59e0b;">${ersTotal} Tk</strong>
                        </div>
                    </div>
                </div>

                <div style="margin-bottom: 24px; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
                    <div style="background-color: #f1f5f9; padding: 10px 16px; font-weight: bold; color: #0f172a; border-bottom: 2px solid #cbd5e1; font-size: 13px; text-transform: uppercase;">Physical Stock</div>
                    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                        <thead>
                            <tr style="color: #475569; border-bottom: 1px solid #cbd5e1; background: #f8fafc;">
                                <th style="padding: 10px; text-align: left;">Item</th>
                                <th style="padding: 10px; text-align: center;">Start</th>
                                <th style="padding: 10px; text-align: center;">In/Out</th>
                                <th style="padding: 10px; text-align: center;">Sold</th>
                                <th style="padding: 10px; text-align: center;">Exp.</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${inventoryRowsText}
                        </tbody>
                    </table>
                </div>

                <div style="margin-bottom: 24px; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
                    <div style="background-color: #f1f5f9; padding: 10px 16px; font-weight: bold; color: #0f172a; border-bottom: 2px solid #cbd5e1; font-size: 13px; text-transform: uppercase;">Items Sold</div>
                    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                        <thead>
                            <tr style="color: #475569; border-bottom: 1px solid #cbd5e1; background: #f8fafc;">
                                <th style="padding: 10px 16px; text-align: left;">Product/Service Name</th>
                                <th style="padding: 10px 16px; text-align: right;">Qty</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsRowsText}
                        </tbody>
                    </table>
                </div>

                <div style="text-align: center; color: #94a3b8; font-size: 11px; padding-top: 16px; border-top: 1px solid #e2e8f0; margin-top: 24px;">
                    Generated securely by Amolnama POS System
                </div>
            </div>
        `;

        // 5. Measure exact dynamic height to prevent page breaks
        const heightMeasurer = document.createElement('div');
        heightMeasurer.style.cssText = "position: fixed; left: -9999px; top: 0; pointer-events: none; visibility: hidden; width: 480px; height: auto; overflow: visible; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;";
        heightMeasurer.innerHTML = invoiceContent;
        document.body.appendChild(heightMeasurer);
        const pxHeight = heightMeasurer.scrollHeight;
        
        // Calculate precise width/height in inches (assuming 96 DPI)
        const inWidth = 480 / 96; 
        const inHeight = Math.max(8, (pxHeight / 96) + 0.2); 
        document.body.removeChild(heightMeasurer);

        // 6. Generate PDF natively
        const opt = {
            margin:       0, // Forced zero margin to snap edge-to-edge
            filename:     finalFileName,
            image:        { type: 'jpeg', quality: 1.0 },
            html2canvas:  { scale: 1.5, useCORS: true, windowWidth: 480, width: 480, windowHeight: pxHeight, scrollY: 0 },
            jsPDF:        { unit: 'in', format: [inWidth, inHeight], orientation: 'portrait' }
        };

        const pdfBlob = await html2pdf().set(opt).from(invoiceContent).output('blob');
        
        // Universal direct download method
        const url = URL.createObjectURL(pdfBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = finalFileName;
        document.body.appendChild(link);
        link.click();
        
        setTimeout(() => {
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }, 100);

        showFlashMessage("PDF Saved to Downloads!");
    } catch (error) {
        console.error("PDF Generation Error:", error);
        showAppAlert("Error", "Failed to generate the PDF ledger.");
    } finally {
        // Clear the overlay spinner loader
        const spinner = document.getElementById('pdf-generation-loader');
        if (spinner) spinner.remove();
    }
}

export function generateDashboardHTML(cashMath, mfsTotal, ersData, invStats, deskItemsSold) {
    let { opening, sales, adjustments, adjustmentLog, expected } = cashMath;
    
    // UX: Format large numbers with commas
    const fmt = (num) => Number(num || 0).toLocaleString('en-IN');
          
    let invRows = '';
    let activeItemCount = 0;
              
    let sortedInvStats = Object.entries(invStats).sort((a, b) => {
        let indexA = priorityInventorySortOrder.indexOf(a[0]);
        let indexB = priorityInventorySortOrder.indexOf(b[0]);
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        return a[0].localeCompare(b[0]);
    });

    for (const [item, d] of sortedInvStats) {
        if (d.open === 0 && d.inOut === 0 && d.sold === 0 && d.rem === 0) continue;
        activeItemCount++;
                  
        let inOutColor = d.inOut > 0 ? 'var(--success-text)' : (d.inOut < 0 ? 'var(--danger-text)' : 'var(--text-secondary)');
        let inOutStr = d.inOut > 0 ? `+${d.inOut}` : (d.inOut < 0 ? `${d.inOut}` : `0`);
        invRows += `
            <div class="tabular-nums" style="display: grid; grid-template-columns: minmax(0, 2fr) repeat(3, minmax(0, 1fr)) minmax(0, 1.2fr); gap: 4px; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--border-color); font-size: 0.85rem;">
                <div style="min-width: 0; font-weight: 700; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 4px; cursor: pointer;" onclick="showTooltip(this, '${escapeJsSingleQuote(item)}')">${escapeHtml(item)}</div>
                <div style="text-align: center; color: var(--text-secondary); font-weight: 500;">${d.open}</div>
                <div style="text-align: center; color: ${inOutColor}; font-weight: 600;">${inOutStr}</div>
                <div style="text-align: center; color: var(--text-primary); font-weight: 500;">${d.sold}</div>
                <div style="text-align: center; color: var(--text-primary); font-weight: 700; font-size: 0.95rem;">${d.rem}</div>
            </div>
        `;
    }
    
    if (!invRows) invRows = `<div style="padding: 20px; text-align: center; color: var(--text-secondary); font-size: 0.85rem; font-style: italic;">No physical stock recorded today</div>`;
          
    let itemsHTML = '';
    let itemRowsArray = Object.entries(deskItemsSold).sort((a, b) => {
        let indexA = priorityItemSortOrder.indexOf(a[0]);
        let indexB = priorityItemSortOrder.indexOf(b[0]);
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        return a[0].localeCompare(b[0]);
    });
    
    itemRowsArray.forEach(([name, qty], index) => {
        let isLast = index === itemRowsArray.length - 1;
        let borderStyle = isLast ? '' : 'border-bottom: 1px solid var(--border-color);';
        itemsHTML += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; ${borderStyle}">
                <span style="font-weight: 500; color: var(--text-primary); font-size: 0.875rem; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 12px;">${escapeHtml(name)}</span>
                <span style="background: var(--bg-color); color: var(--text-secondary); font-size: 0.8rem; font-weight: 500; padding: 2px 8px; border-radius: 6px; flex-shrink: 0;">${qty}x</span>
            </div>
        `;
    });
    if (!itemsHTML) itemsHTML = '<div style="color: var(--text-secondary); font-style: italic; padding: 14px; font-size: 0.85rem; text-align: center;">No items or services sold yet</div>';

    let formattedAdjustments = adjustments !== 0 ? (adjustments > 0 ? `+${fmt(adjustments)}` : fmt(adjustments)) : '0';
          
    let adjBreakdownHTML = '';
    if (Object.keys(adjustmentLog).length > 0) {
        for (const [name, val] of Object.entries(adjustmentLog)) {
            adjBreakdownHTML += `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px; padding-left: 12px; font-size: 0.85rem;">
                    <span style="color: var(--text-secondary);">${escapeHtml(name)}</span>
                    <strong style="color: ${val < 0 ? 'var(--danger-text)' : 'var(--success-text)'}; font-weight: 500;">${val > 0 ? '+' : ''}${fmt(val)} Tk</strong>
                </div>
            `;
        }
    }

    // Expected Cash Drawer Gauge Calculation
    let totalAdded = sales + adjustments;
    let pct = expected > 0 ? Math.min(100, Math.max(0, (totalAdded / Math.max(1, opening)) * 100)) : 0;
    let barColor = totalAdded >= 0 ? '#059669' : '#dc2626';



    return `
        <div class="admin-form-card" style="padding: 0; margin-bottom: 16px; background: var(--surface-strong); border: 1px solid var(--hairline); box-shadow: var(--shadow-card); overflow: hidden; border-radius: var(--radius-card);">
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 18px; border-bottom: 1px solid var(--hairline);">
                <span style="font-size: 0.9rem; color: var(--text-secondary); font-weight: 600;">Opening Cash</span>
                <span id="desk-tot-opening" class="tabular-nums" style="font-size: 1rem; color: var(--text-primary); font-weight: 800;">${fmt(opening)} <span style="font-size: 0.75rem; color: var(--text-secondary);">Tk</span></span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 18px; border-bottom: 1px solid var(--hairline);">
                <span style="font-size: 0.9rem; color: var(--text-secondary); font-weight: 600;">+ Cash Sales</span>
                <span id="desk-tot-cash-sales" class="tabular-nums" style="font-size: 1rem; color: var(--success-text); font-weight: 800;">+${fmt(sales)} <span style="font-size: 0.75rem; color: var(--text-secondary);">Tk</span></span>
            </div>
            <div style="padding: 12px 18px; border-bottom: 1px solid var(--hairline);">
                <div role="button" tabindex="0" aria-expanded="false" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click();}" style="display: flex; justify-content: space-between; align-items: center; cursor: pointer;" onclick="const breakdown = this.nextElementSibling; const icon = this.querySelector('svg'); const expand = breakdown.style.display === 'none'; breakdown.style.display = expand ? 'block' : 'none'; icon.style.transform = expand ? 'rotate(180deg)' : 'rotate(0deg)'; this.setAttribute('aria-expanded', expand ? 'true' : 'false');">
                    <span style="font-size: 0.9rem; color: var(--text-secondary); font-weight: 600; display: flex; align-items: center; gap: 6px;">
                        +/- Cash Actions
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.2s;"><polyline points="6 9 12 15 18 9"/></svg>
                    </span>
                    <span id="desk-tot-manager" class="tabular-nums" style="font-size: 1rem; font-weight: 800; color: ${adjustments < 0 ? 'var(--danger-text)' : 'var(--text-primary)'};">${formattedAdjustments} <span style="font-size: 0.75rem; color: var(--text-secondary);">Tk</span></span>
                </div>
                <div style="display: none; padding-top: 8px; border-top: 1px dashed var(--hairline); margin-top: 8px;">
                    ${adjBreakdownHTML || '<div style="font-size: 0.85rem; color: var(--text-secondary); text-align: right; font-style: italic;">No actions recorded</div>'}
                </div>
            </div>
            <div style="display: flex; flex-direction: column; padding: 14px 18px; background: linear-gradient(135deg, rgba(124, 58, 237, 0.05), rgba(124, 58, 237, 0.12));">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 0.75rem; font-weight: 800; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Expected Cash</span>
                    <span id="desk-tot-expected-cash" class="tabular-nums" style="font-size: 1.55rem; font-weight: 900; color: var(--accent-color); letter-spacing: -0.5px;">${fmt(expected)} <span style="font-size: 1rem; font-weight: 700;">Tk</span></span>
                </div>
                <div style="width: 100%; height: 6px; background: var(--border-color); border-radius: 99px; overflow: hidden; margin-top: 10px;">
                    <div style="width: ${pct}%; height: 100%; background: ${barColor}; border-radius: 99px; transition: width 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275);"></div>
                </div>
            </div>
        </div>



        <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; border: none !important; box-shadow: none !important; background: transparent !important;">
            <div style="min-width: 0; background: var(--surface-strong); border: 1px solid var(--hairline); box-shadow: var(--shadow-soft); padding: 16px; border-radius: var(--radius-card); text-align: left;">
                <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">Total MFS</div>
                <div id="desk-tot-mfs" class="tabular-nums" style="font-size: 1.35rem; font-weight: 900; color: var(--text-primary); overflow-wrap: anywhere;">${fmt(mfsTotal)} <span style="font-size: 0.85rem; color: var(--text-secondary); font-weight: 700;">Tk</span></div>
            </div>
            <div style="min-width: 0; background: var(--surface-strong); border: 1px solid var(--hairline); box-shadow: var(--shadow-soft); padding: 16px; border-radius: var(--radius-card); text-align: left;">
                <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">ERS Sent (${fmt(ersData.count)}x)</div>
                <div id="desk-tot-ers" class="tabular-nums" style="font-size: 1.35rem; font-weight: 900; color: var(--text-primary); overflow-wrap: anywhere;">${fmt(ersData.total)} <span style="font-size: 0.85rem; color: var(--text-secondary); font-weight: 700;">Tk</span></div>
            </div>
        </div>

        <div style="background: var(--surface-strong); border-radius: var(--radius-card); border: 1px solid var(--hairline); box-shadow: var(--shadow-soft); margin-bottom: 16px; overflow: hidden;">
            <div role="button" tabindex="0" aria-expanded="false" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click();}" style="padding: 14px 18px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;" onclick="const c = this.nextElementSibling; const i = this.querySelector('svg'); const expand = c.style.display==='none'; c.style.display = expand ? 'block' : 'none'; i.style.transform = expand ? 'rotate(180deg)' : 'rotate(0deg)'; this.setAttribute('aria-expanded', expand ? 'true' : 'false');">
                <div style="display: flex; align-items: flex-start; gap: 10px;">
                    <div style="width: 8px; height: 8px; border-radius: 50%; background: #10b981; margin-top: 6px; flex-shrink: 0; box-shadow: 0 0 8px rgba(16, 185, 129, 0.4);"></div>
                    <div style="display: flex; flex-direction: column;">
                        <span style="font-size: 0.9rem; font-weight: 800; color: var(--text-primary); line-height: 1.2;">Physical Stock</span>
                        <span style="font-size: 0.75rem; color: var(--text-secondary); line-height: 1.2; margin-top: 3px; font-weight: 600;">${activeItemCount} active items</span>
                    </div>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.2s;"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
            <div style="display: none; background: var(--surface-soft); border-top: 1px solid var(--hairline);">
                <div style="padding: 0 18px;">
                    <div style="display: grid; grid-template-columns: minmax(0, 2fr) repeat(3, minmax(0, 1fr)) minmax(0, 1.2fr); gap: 4px; padding: 12px 0; border-bottom: 2px solid var(--hairline); font-size: 0.7rem; font-weight: 800; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">
                        <div style="min-width: 0;">Item</div>
                        <div style="text-align: center;">Start</div>
                        <div style="text-align: center;">In/Out</div>
                        <div style="text-align: center;">Sold</div>
                        <div style="text-align: center; color: var(--accent-color);">Exp.</div>
                    </div>
                    ${invRows}
                </div>
            </div>
        </div>

        <div style="background: var(--surface-strong); border-radius: var(--radius-card); border: 1px solid var(--hairline); box-shadow: var(--shadow-soft); overflow: hidden; margin-bottom: 24px;">
            <div style="display: flex; justify-content: space-between; padding: 12px 18px; border-bottom: 1px solid var(--hairline); background: var(--surface-soft);">
                <span style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; color: var(--text-secondary); letter-spacing: 0.5px;">Items & services sold</span>
                <span style="font-size: 0.72rem; font-weight: 700; color: var(--text-secondary);">Today</span>
            </div>
            ${itemsHTML}
        </div>
    `;
}

export async function renderDeskDashboard(targetDeskId = AppState.currentDeskId) {
    if (!targetDeskId) return;
    let historyHTML = '';
    const deskScopeTxs = [];
         
    let deskOpeningCash = 0;
    let activeSessionId = null;
    let activeOpeningInv = {};
    const targetDateStr = formatToGBDate(document.getElementById('report-date-picker').value || getStrictDate());
    const isToday = targetDateStr === getStrictDate();

    if (targetDeskId === AppState.currentDeskId && isToday && AppState.currentSessionId) {
        activeSessionId = AppState.currentSessionId;
        deskOpeningCash = AppState.currentOpeningCash;
        activeOpeningInv = AppState.currentOpeningInv;
    } else {
        try {
            const sessSnap = await getDocs(query(collection(db, 'sessions'), where('dateStr', '==', targetDateStr)));
            let bestSession = null;
            sessSnap.forEach(docSnap => {
                let s = docSnap.data();
                if (s.deskId === targetDeskId) {
                    if (!bestSession || getTsMillis(s.openedAt) > getTsMillis(bestSession.openedAt)) {
                        bestSession = { id: docSnap.id, ...s };
                    }
                }
            });
            if (bestSession) {
                activeSessionId = bestSession.id;
                if (bestSession.openingBalances) {
                    deskOpeningCash = parseFloat(bestSession.openingBalances.cash) || 0;
                    activeOpeningInv = bestSession.openingBalances.inventory || {};
                }
            }
        } catch(e) { console.error(e); }
    }

    let deskCashSales = 0, deskAdjustments = 0, deskMfs = 0, deskErsCount = 0, deskErsTotal = 0;
    let deskItemsSold = {}; 
    let deskAdjustmentLog = {}; 
    let invStats = {};
          
    getPhysicalItems().forEach(item => {
        let o = 0;
        Object.entries(activeOpeningInv).forEach(([k, v]) => {
            if (getNormalizedTrackAs(k) === item) o += v;
        });
        invStats[item] = { open: o, inOut: 0, sold: 0, rem: o };
    });

    // --- RE-ADDED THE MISSING TRANSACTION LOOP ---
    [...AppState.transactions].reverse().forEach(tx => {
        if (tx.isDeleted) return;
        if (tx.sessionId !== activeSessionId) return;
        deskScopeTxs.push(tx);
        
        let safeCashAmt = tx.cashAmt !== undefined ? tx.cashAmt : (tx.payment === 'Cash' ? tx.amount : 0);
        let safeMfsAmt = tx.mfsAmt !== undefined ? tx.mfsAmt : (tx.payment === 'MFS' ? tx.amount : 0);
                  
        deskMfs += safeMfsAmt;
        
        if (tx.type === 'adjustment') {
            deskAdjustments += safeCashAmt; 
            deskAdjustmentLog[tx.name] = (deskAdjustmentLog[tx.name] || 0) + safeCashAmt;
        } else if (tx.type !== 'transfer_out' && tx.type !== 'transfer_in') {
            deskCashSales += safeCashAmt;
            if (tx.name === 'ERS Flexiload') {
                deskErsCount += Math.abs(tx.qty);
                deskErsTotal += tx.amount;
            } else {
                deskItemsSold[tx.name] = (deskItemsSold[tx.name] || 0) + Math.abs(tx.qty);
            }
        }

        let normTrackAs = getNormalizedTrackAs(tx.trackAs);
        if (AppState.globalInventoryGroups.includes(normTrackAs)) {
            let trackAs = normTrackAs;
            let q = Math.abs(tx.qty);
            if (tx.type === 'transfer_in') { invStats[trackAs].inOut += q; invStats[trackAs].rem += q; }
            else if (tx.type === 'transfer_out') { invStats[trackAs].inOut -= q; invStats[trackAs].rem -= q; }
            else if (tx.type === 'adjustment') { invStats[trackAs].inOut += q; invStats[trackAs].rem += q; }
            else { 
                invStats[trackAs].sold += q; 
                invStats[trackAs].rem -= q; 
            }
        }
        
    });

    populateLedgerAgentSelect('desk', deskScopeTxs);
    syncLedgerFilterUI('desk');
    const deskFilterState = getLedgerFilterState('desk');
    const deskTotalCount = deskScopeTxs.length;
    const filteredDeskTxs = sortLedgerTransactions(
        deskScopeTxs.filter(tx => matchesLedgerFilters(tx, deskFilterState, AppState.globalCatalog)),
        deskFilterState.sort
    );
    const deskShownCount = filteredDeskTxs.length;
    const deskFilteredVolume = computeFilteredLedgerTotal(filteredDeskTxs, deskFilterState.payment);
    const deskIsFiltered = isLedgerFiltered(deskFilterState);

    filteredDeskTxs.forEach(tx => {
        let safeCashAmt = tx.cashAmt !== undefined ? tx.cashAmt : (tx.payment === 'Cash' ? tx.amount : 0);
        let safeMfsAmt = tx.mfsAmt !== undefined ? tx.mfsAmt : (tx.payment === 'MFS' ? tx.amount : 0);
        let payLabel = tx.payment === 'Split' ? `Split (C:${safeCashAmt}/M:${safeMfsAmt})` : tx.payment;
        let badges = '';
        if (tx.isPending) badges += '<span style="font-size: 0.7rem; background: var(--warning-bg); color: var(--warning-text); padding: 2px 6px; border-radius: 10px; margin-left: 8px; font-weight: bold;">Pending</span>';
        if (tx.isEdited) badges += `<span role="button" tabindex="0" style="font-size: 0.7rem; background: var(--purple-bg); color: var(--purple-text); padding: 2px 6px; border-radius: 10px; margin-left: 8px; font-weight: bold; cursor: pointer;" onclick="event.stopPropagation(); showAuditTrail('${escapeJsSingleQuote(String(tx.id))}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();showAuditTrail('${escapeJsSingleQuote(String(tx.id))}');}">Edited</span>`;

        let detailsHTML = '';
        if (tx.handsetModel) {
            detailsHTML += `<div style="font-size: 0.8rem; color: var(--accent-color); font-weight: 700; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 4px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/></svg><span>Model: ${escapeHtml(tx.handsetModel)}</span></div>`;
        }
        if (tx.notes) {
            detailsHTML += `<div style="font-size: 0.78rem; color: var(--text-secondary); font-weight: 600; margin-top: 2px; font-style: italic; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 4px;" title="${escapeHtml(tx.notes)}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span>${escapeHtml(tx.notes)}</span></div>`;
        }
        
        let actionBtns = '';
        if (targetDeskId === AppState.currentDeskId || ['admin', 'owner', 'manager', 'center_manager'].includes(AppState.currentUserRole)) {
            actionBtns = `
                <div class="tx-actions" style="display: none; width: 100%; padding-top: 12px; margin-top: 12px; border-top: 1px dashed var(--border-color); justify-content: flex-end; gap: 8px;">
                    <button type="button" class="btn-outline" style="height: auto; padding: 6px 16px; font-size: 0.85rem; color: var(--accent-color); border-color: var(--accent-color); gap: 6px;" onclick="event.stopPropagation(); openEditTx('${escapeJsSingleQuote(String(tx.id))}')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg> Edit
                    </button>
                    <button type="button" class="btn-outline" style="height: auto; padding: 6px 16px; font-size: 0.85rem; color: var(--danger-text); border-color: var(--danger-border); background: rgba(239, 68, 68, 0.08); gap: 6px;" onclick="event.stopPropagation(); deleteTransaction('${escapeJsSingleQuote(tx.docId)}', '${escapeJsSingleQuote(String(tx.id))}')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg> Trash
                    </button>
                </div>
            `;
        }

        let isOutflow = (tx.type === 'adjustment' && (tx.cashAmt !== undefined ? tx.cashAmt < 0 : true)) || tx.type === 'transfer_out';
        let dotColor = '#10b981'; // Default Green (ERS)
        if (tx.type === 'adjustment') {
            dotColor = (tx.cashAmt !== undefined ? tx.cashAmt < 0 : true) ? '#ef4444' : '#10b981'; // Red for Outflow, Green for Inflow
        } else if (tx.type === 'transfer_out' || tx.type === 'transfer_in') {
            dotColor = '#8b5cf6'; // Purple
        } else if (tx.name !== 'ERS Flexiload') {
            dotColor = '#3390ec'; // Blue
        }

        let amtColor = isOutflow ? 'var(--danger-text)' : 'var(--text-primary)';
        let amtPrefix = isOutflow ? '− ' : '';

        historyHTML += `
            <div class="history-item" role="button" tabindex="0" onkeydown="if(event.target===this&&(event.key==='Enter'||event.key===' ')){event.preventDefault();this.click();}" style="display: flex; flex-direction: column; padding: 16px; background: var(--surface-strong); border: 1px solid var(--border-color); border-radius: 18px; box-shadow: var(--shadow-soft); margin-bottom: 12px; cursor: pointer; transition: transform 0.4s var(--spring-physics), background-color 0.2s ease;" onpointerdown="this.style.transform='scale(0.975)'" onpointerup="this.style.transform='scale(1)'" onpointerleave="this.style.transform='scale(1)'" onclick="const actions = this.querySelector('.tx-actions'); const chv = this.querySelector('.tx-chevron svg'); if(actions) { const isExp = actions.style.display !== 'none'; actions.style.display = isExp ? 'none' : 'flex'; if(chv) chv.style.transform = isExp ? 'rotate(0deg)' : 'rotate(180deg)'; }">
                <div style="display: flex; width: 100%; align-items: center; gap: 14px;">
                    <div style="width: 44px; height: 44px; border-radius: 12px; background: ${dotColor}0c; color: ${dotColor}; display: flex; align-items: center; justify-content: center; flex-shrink: 0; border: 1px solid ${dotColor}18; box-shadow: 0 2px 6px ${dotColor}08;">
                        <span style="font-size: 0.95rem; font-weight: 900;">${tx.qty}x</span>
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-size: 1rem; color: var(--text-primary); font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.2; margin-bottom: 2px;">
                            ${escapeHtml(tx.name)}
                        </div>
                        ${detailsHTML}
                        <div style="display: flex; align-items: center; gap: 8px; margin-top: 6px; font-size: 0.72rem; color: var(--text-secondary); font-weight: 600; line-height: 1;">
                            <div style="display: flex; align-items: center; background: var(--bg-color); padding: 2px 6px; border-radius: 6px; border: 1px solid var(--border-color); font-family: monospace; color: var(--text-primary); font-weight: 700; font-size: 0.68rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 120px;" title="${escapeHtml(tx.receiptNo || tx.id)}">
                                ${escapeHtml(tx.receiptNo || tx.id)}
                            </div>
                            <div style="display: flex; align-items: center; gap: 4px; flex-shrink: 0;">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="opacity: 0.7;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                <span style="margin-top: 1px;">${escapeHtml(tx.time)}</span>
                            </div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px; margin-top: 5px; font-size: 0.72rem; color: var(--text-secondary); font-weight: 600; line-height: 1; flex-wrap: wrap;">
                            <div style="display: flex; align-items: center; gap: 4px; color: ${tx.payment === 'MFS' ? 'var(--success-text, #15803d)' : 'var(--text-secondary)'}; flex-shrink: 0;">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="opacity: 0.7;"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
                                <span style="margin-top: 1px;">${escapeHtml(payLabel)}</span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 4px; color: var(--text-primary); font-weight: 700; flex-shrink: 0;">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="opacity: 0.7;"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                                <span style="margin-top: 1px;">${escapeHtml((tx.agentName || 'Unknown').split(' ')[0])}</span>
                            </div>
                            ${getOnboardingBadge(tx)}
                            ${badges}
                        </div>
                    </div>
                    <div style="display: flex; flex-direction: column; align-items: flex-end; justify-content: center; gap: 4px; flex-shrink: 0;">
                        <div class="tabular-nums" style="font-size: 1.25rem; font-weight: 900; color: ${amtColor}; text-align: right; font-family: monospace; display: flex; align-items: baseline; gap: 2px;">
                            <span>${amtPrefix}${Math.abs(tx.amount || 0)}</span>
                            <span style="font-size: 0.72rem; font-weight: 700; color: var(--text-secondary); font-family: inherit;">Tk</span>
                        </div>
                        <div class="tx-chevron" style="color: var(--text-secondary); opacity: 0.6; display: flex; align-items: center; justify-content: center;">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.2s ease;"><path d="m6 9 6 6 6-6"/></svg>
                        </div>
                    </div>
                </div>
                ${actionBtns}
            </div>
        `;
    });

    let cashMath = { opening: deskOpeningCash, sales: deskCashSales, adjustments: deskAdjustments, adjustmentLog: deskAdjustmentLog, expected: (deskOpeningCash + deskCashSales + deskAdjustments) };
    let ersData = { count: deskErsCount, total: deskErsTotal };
    
    document.getElementById('live-dashboard-wrapper').innerHTML = generateDashboardHTML(cashMath, deskMfs, ersData, invStats, deskItemsSold);
    
    const deskCountLabel = !deskIsFiltered
        ? `Showing ${deskShownCount} transaction${deskShownCount === 1 ? '' : 's'} &middot; ${fmt(deskFilteredVolume)} Tk`
        : `Showing ${deskShownCount} of ${deskTotalCount} &middot; ${fmt(deskFilteredVolume)} Tk`;
    const deskCountBar = historyHTML
        ? `<div class="ledger-count-bar"><span>${deskCountLabel}</span>${deskIsFiltered ? '<button type="button" class="ledger-reset-link" onclick="resetDeskFilter()">Reset Filters</button>' : ''}</div>`
        : '';

    let emptyState = `
        <div class="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            <p>${deskIsFiltered ? 'No matching transactions' : 'No transactions yet'}</p>
            ${deskIsFiltered ? '<button type="button" class="btn-outline" style="margin-top:12px;width:auto;height:auto;padding:8px 16px;font-size:0.82rem;color:var(--accent-color);border-color:var(--accent-color);" onclick="resetDeskFilter()">Reset All Filters</button>' : ''}
        </div>`;

    document.getElementById('desk-history-log').innerHTML = historyHTML ? (deskCountBar + historyHTML) : emptyState;

    try {
        const agentsSnap = await getDocs(query(collection(db, 'users'), where('assignedDeskId', '==', targetDeskId)));
        let names = [];
        agentsSnap.forEach(doc => { names.push(doc.data().nickname || doc.data().displayName || doc.data().email?.split('@')[0] || 'Agent'); });
        document.getElementById('desk-logged-agents').innerText = names.length > 0 ? names.join(', ') : 'None';
    } catch(e) { document.getElementById('desk-logged-agents').innerText = 'Unknown'; }
}

// ==========================================
//   DATE FILTER & REAL-TIME SYNC LOGIC
// ==========================================
let txListenerUnsubscribe = null;

export function getTxListenerUnsubscribe() { return txListenerUnsubscribe; }
export function setTxListenerUnsubscribe(val) { txListenerUnsubscribe = val; }

export function syncHistoricalDateBanner() {
    if (typeof document === 'undefined') return;
    const picker = document.getElementById('report-date-picker');
    const banner = document.getElementById('historical-date-banner');
    const bannerText = document.getElementById('historical-date-text');
    const todayBtn = document.getElementById('report-today-btn');
    const isHistorical = Boolean(picker && picker.value && isViewingHistoricalDate());

    if (banner) {
        banner.style.display = isHistorical ? 'flex' : 'none';
    }
    if (bannerText && isHistorical) {
        bannerText.innerText = `Viewing past date (${formatToGBDate(picker.value)}) — Read-only`;
    }
    if (todayBtn) {
        todayBtn.style.display = isHistorical ? 'inline-flex' : 'none';
    }
}

export function returnToToday() {
    if (typeof document === 'undefined') return;
    const picker = document.getElementById('report-date-picker');
    if (picker) {
        picker.value = formatLocalISODate(new Date());
    }
    syncHistoricalDateBanner();
    fetchTransactionsForDate();
    showFlashMessage("Switched to Today");
}

export async function fetchTransactionsForDate() {
    if (!AppState.currentUser) return;

    const datePicker = document.getElementById('report-date-picker');
    if (!datePicker.value) {
        datePicker.value = formatLocalISODate(new Date());
    }
    const targetDateStr = formatToGBDate(datePicker.value);
    const isToday = targetDateStr === getStrictDate();
    const dateLabel = isToday ? 'Today' : targetDateStr;

    if (txListenerUnsubscribe) { txListenerUnsubscribe(); txListenerUnsubscribe = null; }

    try {
        let txQuery = query(collection(db, 'transactions'), where('dateStr', '==', targetDateStr));

        const handleRender = () => {
            AppState.transactions.sort((a, b) => a.id - b.id);
            AppState.trashTransactions.sort((a, b) => a.id - b.id);

            const activeDeskTab = document.getElementById('tab-desk').classList.contains('active');
            const activeReportTab = document.getElementById('tab-report').classList.contains('active');
            const activeFloorTab = document.getElementById('tab-floor').classList.contains('active');

            if (activeReportTab) renderPersonalReport();
            else AppState.needsRender.report = true;

            if (activeDeskTab) renderDeskDashboard();
            else if (AppState.currentDeskId) AppState.needsRender.desk = true;

            if (activeFloorTab) renderLiveFloorTab();
            else AppState.needsRender.floor = true;

            const financialLabel = document.getElementById('financial-date-label');
            if (financialLabel) financialLabel.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg> ${dateLabel}`;
            syncHistoricalDateBanner();
        };

        txListenerUnsubscribe = onSnapshot(
            txQuery,
            { includeMetadataChanges: true },
            (txSnapshot) => {
                AppState.transactions = []; AppState.trashTransactions = [];

                txSnapshot.forEach(doc => {
                    let tx = doc.data(); tx.docId = doc.id; 
                    tx.isPending = doc.metadata.hasPendingWrites;
                    if (!tx.isDeleted) {
                        AppState.transactions.push(tx);
                    } else if (tx.agentId === AppState.currentUser.uid) {
                        AppState.trashTransactions.push(tx); 
                    }
                });

                // --- OFFLINE MODE: MERGE LOCAL TRANSACTIONS ---
                let offlineTxs = JSON.parse(localStorage.getItem('amolnama_offline_txs') || '[]');
                if (typeof window.renderOfflineBanner === 'function') window.renderOfflineBanner(offlineTxs.length);
                
                if (offlineTxs.length > 0) {
                    offlineTxs.forEach(tx => {
                        if (tx.dateStr === targetDateStr) {
                            if (!tx.isDeleted) {
                                AppState.transactions.push(tx);
                            } else if (tx.agentId === AppState.currentUser.uid) {
                                AppState.trashTransactions.push(tx);
                            }
                        }
                    });
                }
                
                handleRender();
            },
            (error) => {
                console.warn("Offline Mode Active: Fetching transactions from local storage", error);
                
                // FALLBACK FOR QUOTA EXCEEDED / NO INTERNET
                AppState.transactions = []; AppState.trashTransactions = [];
                let offlineTxs = JSON.parse(localStorage.getItem('amolnama_offline_txs') || '[]');
                if (typeof window.renderOfflineBanner === 'function') window.renderOfflineBanner(offlineTxs.length);
                
                if (offlineTxs.length > 0) {
                    offlineTxs.forEach(tx => {
                        if (tx.dateStr === targetDateStr) {
                            if (!tx.isDeleted) {
                                AppState.transactions.push(tx);
                            } else if (tx.agentId === AppState.currentUser.uid) {
                                AppState.trashTransactions.push(tx);
                            }
                        }
                    });
                }
                
                handleRender();
            }
        );
    } catch (e) { 
        console.error("Critical Sync Error:", e); 
    }
}

// ==========================================
//  HISTORICAL SESSION VIEWER
// ==========================================
export async function openHistoricalSession(sessionId) {
    openModal('modal-historical');
    const container = document.getElementById('historical-content');
    if (!container) return;
    container.innerHTML = '<div class="spinner" style="margin: 40px auto; border-top-color: #b91c1c;"></div>';

    try {
        const sessionSnap = await getDoc(doc(db, 'sessions', sessionId));
        if (!sessionSnap.exists()) {
            container.innerHTML = '<p class="placeholder-text" style="color: var(--danger-text);">Session not found.</p>';
            return;
        }

        const session = sessionSnap.data();
        let agentName = session.openedBy || 'Unknown Agent';
        let deskName = (session.deskId || '').replace('_', ' ').toUpperCase();
        
        // FIX: Grab the official name, and override "System" as the agent
        try {
            const deskSnap = await getDoc(doc(db, 'desks', session.deskId));
            if (deskSnap.exists() && deskSnap.data().name) {
                deskName = deskSnap.data().name;
            }
        } catch(e) {}

        if (agentName.startsWith('System') && deskName.includes("'s Drawer")) {
            agentName = deskName.replace("'s Drawer", "");
        }
        
        let deskOpeningCash = parseFloat(session.openingBalances?.cash) || 0;
        let activeOpeningInv = session.openingBalances?.inventory || {};
        
        let deskCashSales = 0, deskAdjustments = 0, deskMfs = 0, deskErsCount = 0, deskErsTotal = 0;
        let deskItemsSold = {}; 
        let deskAdjustmentLog = {}; 
        let invStats = {};
        
        getPhysicalItems().forEach(item => {
            let o = 0;
            Object.entries(activeOpeningInv).forEach(([k, v]) => {
                if (getNormalizedTrackAs(k) === item) o += v;
            });
            invStats[item] = { open: o, inOut: 0, sold: 0, rem: o };
        });

        const txSnap = await getDocs(query(collection(db, 'transactions'), where('sessionId', '==', sessionId), where('isDeleted', '==', false)));
        
        let txList = [];
        txSnap.forEach(docSnap => txList.push({ id: docSnap.id, ...docSnap.data() }));
        txList.sort((a, b) => b.id - a.id);

        let historyHTML = '';

        txList.forEach(tx => {
            let safeCashAmt = tx.cashAmt !== undefined ? tx.cashAmt : (tx.payment === 'Cash' ? tx.amount : 0);
            let safeMfsAmt = tx.mfsAmt !== undefined ? tx.mfsAmt : (tx.payment === 'MFS' ? tx.amount : 0);
            
            deskMfs += safeMfsAmt;
            
            if (tx.type === 'adjustment') {
                deskAdjustments += safeCashAmt; 
                deskAdjustmentLog[tx.name] = (deskAdjustmentLog[tx.name] || 0) + safeCashAmt;
            } else if (tx.type !== 'transfer_out' && tx.type !== 'transfer_in') {
                deskCashSales += safeCashAmt;
                if (tx.name === 'ERS Flexiload') {
                    deskErsCount += Math.abs(tx.qty);
                    deskErsTotal += tx.amount;
                } else {
                    deskItemsSold[tx.name] = (deskItemsSold[tx.name] || 0) + Math.abs(tx.qty);
                }
            }

            let normTrackAs = getNormalizedTrackAs(tx.trackAs);
            if (AppState.globalInventoryGroups.includes(normTrackAs)) {
                let trackAs = normTrackAs;
                let q = Math.abs(tx.qty);
                if (tx.type === 'transfer_in') { invStats[trackAs].inOut += q; invStats[trackAs].rem += q; }
                else if (tx.type === 'transfer_out') { invStats[trackAs].inOut -= q; invStats[trackAs].rem -= q; }
                else if (tx.type === 'adjustment') { invStats[trackAs].inOut += q; invStats[trackAs].rem += q; }
                else { 
                    invStats[trackAs].sold += q; 
                    invStats[trackAs].rem -= q; 
                }
            }

            let isOutflow = (tx.type === 'adjustment' && (tx.cashAmt !== undefined ? tx.cashAmt < 0 : true)) || tx.type === 'transfer_out';
            let dotColor = '#10b981';
            if (tx.type === 'adjustment') {
                dotColor = (tx.cashAmt !== undefined ? tx.cashAmt < 0 : true) ? '#ef4444' : '#10b981'; // Red for Outflow, Green for Inflow
            } else if (tx.type === 'transfer_out' || tx.type === 'transfer_in') {
                dotColor = '#8b5cf6'; // Purple
            } else if (tx.name !== 'ERS Flexiload') {
                dotColor = '#3390ec'; // Blue
            }

            let amtColor = isOutflow ? 'var(--danger-text)' : 'var(--text-primary)';
            let amtPrefix = isOutflow ? '− ' : '';
            let payLabel = tx.payment === 'Split' ? `Split (C:${safeCashAmt}/M:${safeMfsAmt})` : tx.payment;
            let badges = tx.isEdited ? `<span style="font-size: 0.7rem; background: var(--purple-bg); color: var(--purple-text); padding: 2px 6px; border-radius: 10px; margin-left: 8px; font-weight: bold;">Edited</span>` : '';

            let detailsHTML = '';
            if (tx.handsetModel) {
                detailsHTML += `<div style="font-size: 0.8rem; color: var(--accent-color); font-weight: 700; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 4px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/></svg><span>Model: ${escapeHtml(tx.handsetModel)}</span></div>`;
            }
            if (tx.notes) {
                detailsHTML += `<div style="font-size: 0.78rem; color: var(--text-secondary); font-weight: 600; margin-top: 2px; font-style: italic; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 4px;" title="${escapeHtml(tx.notes)}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span>${escapeHtml(tx.notes)}</span></div>`;
            }

            historyHTML += `
                <div class="history-item" style="display: flex; flex-direction: column; padding: 16px; background: var(--surface-strong); border: 1px solid var(--border-color); border-radius: 18px; box-shadow: var(--shadow-soft); margin-bottom: 12px;">
                    <div style="display: flex; width: 100%; align-items: center; gap: 14px;">
                        <!-- Left: Colour-coded Qty Badge -->
                        <div style="width: 44px; height: 44px; border-radius: 12px; background: ${dotColor}0c; color: ${dotColor}; display: flex; align-items: center; justify-content: center; flex-shrink: 0; border: 1px solid ${dotColor}18; box-shadow: 0 2px 6px ${dotColor}08;">
                            <span style="font-size: 0.95rem; font-weight: 900;">${tx.qty}x</span>
                        </div>

                        <!-- Middle: Name + Metadata chips -->
                        <div style="flex: 1; min-width: 0;">
                            <div style="font-size: 1rem; color: var(--text-primary); font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.2; margin-bottom: 2px;">
                                ${escapeHtml(tx.name)}
                            </div>
                            ${detailsHTML}
                            <!-- Row 1: Receipt + Time (guaranteed single row) -->
                            <div style="display: flex; align-items: center; gap: 8px; margin-top: 6px; font-size: 0.72rem; color: var(--text-secondary); font-weight: 600; line-height: 1;">
                                <!-- Receipt No -->
                                <div style="display: flex; align-items: center; background: var(--bg-color); padding: 2px 6px; border-radius: 6px; border: 1px solid var(--border-color); font-family: monospace; color: var(--text-primary); font-weight: 700; font-size: 0.68rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 120px;" title="${escapeHtml(tx.receiptNo || tx.id)}">
                                    ${escapeHtml(tx.receiptNo || tx.id)}
                                </div>
                                <!-- Time -->
                                <div style="display: flex; align-items: center; gap: 4px; flex-shrink: 0;">
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="opacity: 0.7;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                    <span style="margin-top: 1px;">${escapeHtml(tx.time)}</span>
                                </div>
                            </div>
                            
                            <!-- Row 2: Payment + Agent + Badges -->
                            <div style="display: flex; align-items: center; gap: 8px; margin-top: 5px; font-size: 0.72rem; color: var(--text-secondary); font-weight: 600; line-height: 1; flex-wrap: wrap;">
                                <!-- Payment Mode -->
                                <div style="display: flex; align-items: center; gap: 4px; color: ${tx.payment === 'MFS' ? 'var(--success-text)' : 'var(--text-secondary)'}; flex-shrink: 0;">
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="opacity: 0.7;"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
                                    <span style="margin-top: 1px;">${escapeHtml(payLabel)}</span>
                                </div>
                                
                                <!-- Agent Name -->
                                <div style="display: flex; align-items: center; gap: 4px; color: var(--text-primary); font-weight: 700; flex-shrink: 0;">
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="opacity: 0.7;"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                                    <span style="margin-top: 1px;">${escapeHtml((tx.agentName || 'Unknown').split(' ')[0])}</span>
                                </div>
                                
                                ${getOnboardingBadge(tx)}
                                
                                ${badges}
                            </div>
                        </div>

                        <!-- Right: Amount -->
                        <div class="tabular-nums" style="font-size: 1.25rem; font-weight: 900; color: ${amtColor}; flex-shrink: 0; text-align: right; font-family: monospace; display: flex; align-items: baseline; gap: 2px;">
                            <span>${amtPrefix}${Math.abs(tx.amount || 0)}</span>
                            <span style="font-size: 0.72rem; font-weight: 700; color: var(--text-secondary); font-family: inherit;">Tk</span>
                        </div>
                    </div>
                </div>
            `;
        });

        let cashMath = { opening: deskOpeningCash, sales: deskCashSales, adjustments: deskAdjustments, adjustmentLog: deskAdjustmentLog, expected: (deskOpeningCash + deskCashSales + deskAdjustments) };
        let ersData = { count: deskErsCount, total: deskErsTotal };

        let dashboardHTML = generateDashboardHTML(cashMath, deskMfs, ersData, invStats, deskItemsSold);

        // Fetch EOD Snapshot if it exists
        let eodHTML = '';
        try {
            const eodSnap = await getDocs(query(collection(db, 'eod_reports'), where('sessionId', '==', sessionId)));
            if (!eodSnap.empty) {
                let eodData = eodSnap.docs[0].data();
                let varianceColor = eodData.variance < 0 ? 'var(--danger-text)' : (eodData.variance > 0 ? 'var(--success-text)' : 'var(--text-secondary)');
                let variancePrefix = eodData.variance > 0 ? '+' : '';

                let invDiffHTML = '';
                for (const [item, actual] of Object.entries(eodData.actualClosing?.inventory || {})) {
                    let expected = eodData.expectedClosing?.inventory?.[item] || 0;
                    let diff = actual - expected;
                    if (diff !== 0) {
                        let dColor = diff < 0 ? 'var(--danger-text)' : 'var(--success-text)';
                        let dPref = diff > 0 ? '+' : '';
                        invDiffHTML += `<div style="display:flex; justify-content:space-between; gap: 8px; min-width: 0; font-size:0.8rem; padding:4px 0; border-bottom: 1px dashed var(--border-color);"><span style="min-width: 0; overflow-wrap: anywhere;">${escapeHtml(item)}</span> <span style="color: var(--text-secondary); flex-shrink: 0;">Exp: ${expected} | Act: ${actual} <strong style="color:${dColor}; margin-left: 4px;">(${dPref}${diff})</strong></span></div>`;
                    }
                }

                eodHTML = `
                    <div style="background: var(--bg-color); border: 2px solid var(--border-color); border-radius: 12px; padding: 16px; margin-bottom: 24px;">
                        <h4 style="margin: 0 0 12px 0; font-size: 1rem; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--success-text)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                            Official EOD Snapshot
                        </h4>
                        <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px;">
                            <div style="min-width: 0; background: var(--surface-color); padding: 10px; border-radius: 8px; border: 1px solid var(--border-color);">
                                <div style="font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase; font-weight: 700;">System Expected</div>
                                <div class="tabular-nums" style="font-size: 1.15rem; font-weight: 800; color: var(--text-primary); overflow-wrap: anywhere;">${eodData.expectedClosing.cash} Tk</div>
                            </div>
                            <div style="min-width: 0; background: var(--surface-color); padding: 10px; border-radius: 8px; border: 1px solid var(--border-color);">
                                <div style="font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase; font-weight: 700;">Actual Counted</div>
                                <div class="tabular-nums" style="font-size: 1.15rem; font-weight: 800; color: var(--text-primary); overflow-wrap: anywhere;">${eodData.actualClosing.cash} Tk</div>
                            </div>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: var(--surface-color); border-radius: 8px; border: 1px solid var(--border-color); margin-bottom: 12px;">
                            <span style="font-weight: 700; font-size: 0.85rem; color: var(--text-secondary); text-transform: uppercase;">Manager Drop</span>
                            <span class="tabular-nums" style="font-weight: 800; font-size: 1.1rem; color: var(--purple-text);">${eodData.managerDrop || 0} Tk</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: var(--surface-color); border-radius: 8px; border: 1px solid var(--border-color); margin-bottom: ${invDiffHTML ? '12px' : '0'};">
                            <span style="font-weight: 700; font-size: 0.85rem; color: var(--text-secondary); text-transform: uppercase;">Cash Variance</span>
                            <span class="tabular-nums" style="font-weight: 800; font-size: 1.1rem; color: ${varianceColor};">${variancePrefix}${eodData.variance} Tk</span>
                        </div>
                        ${invDiffHTML ? `<div style="background: var(--surface-color); padding: 10px 12px; border-radius: 8px; border: 1px solid var(--border-color);"><div style="font-size: 0.75rem; font-weight: 800; color: var(--text-primary); margin-bottom: 8px;">STOCK VARIANCES</div>${invDiffHTML}</div>` : ''}
                    </div>
                `;
            }
        } catch(e) { console.error("Failed to load EOD snapshot", e); }
        
        container.innerHTML = `
            <div style="margin-bottom: 20px; text-align: center;">
                <h2 style="margin: 0 0 4px 0; font-size: 1.4rem; color: var(--text-primary);">${escapeHtml(deskName)}</h2>
                <div style="color: var(--text-secondary); font-size: 0.9rem; font-weight: 600;">Agent: ${escapeHtml(agentName)} &bull; ${escapeHtml(session.dateStr)}</div>
            </div>
            ${eodHTML}
            ${dashboardHTML}
            <h3 style="font-size: 1.15rem; font-weight: 800; color: var(--text-primary); margin: 24px 0 12px 0;">Shift Ledger</h3>
            <div style="display: flex; flex-direction: column;">
                ${historyHTML || '<div class="placeholder-text">No transactions recorded during this shift.</div>'}
            </div>
        `;
    } catch (error) {
        console.error(error);
        container.innerHTML = '<p class="placeholder-text" style="color: var(--danger-text);">Error loading session data.</p>';
    }
}
