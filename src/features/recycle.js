// src/features/recycle.js
import { collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, query, serverTimestamp, getDocs } from "firebase/firestore";
import { db } from '../config/firebase.js';
import { AppState } from '../core/state.js';
import { showAppAlert, showFlashMessage, openModal, closeModal, refreshCustomDropdowns, setButtonLoading, markInputError, clearInputError, scrollPillIntoView } from '../utils/ui-helpers.js';
import { addTransactionToCloud } from './transactions.js';
import { getStrictDate, generateReceiptNo, formatToGBDate, formatLocalISODate, escapeHtml, escapeJsSingleQuote } from '../utils/helpers.js';
import { passStockFirewall } from './inventory.js';

let recycleSimsList = [];
let activeFilterStatus = 'all';
let isListenerActive = false;
let unsubscribeRecycle = null;
let cachedAgentsList = [];
let recycleContactTimeWasTouched = false;
let initialContactTimeValue = '';
let initialContactAgentValue = '';
let isSavingRecycle = false;
let recycleCheckoutFromStatusUpdate = false;

function getLocalDateTimeString(d = new Date()) {
    const pad = n => String(n).padStart(2, '0');
    const year = d.getFullYear();
    const month = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hours = pad(d.getHours());
    const minutes = pad(d.getMinutes());
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

async function populateAgentSelect(preselectedName = '') {
    const agentSelect = document.getElementById('status-update-agent');
    if (!agentSelect) return;

    if (cachedAgentsList.length === 0) {
        try {
            const usersSnap = await getDocs(collection(db, 'users'));
            cachedAgentsList = [];
            usersSnap.forEach(docSnap => {
                const u = docSnap.data();
                const name = u.nickname || u.displayName || (u.email && !u.email.endsWith('@amolnama.internal') ? u.email : '') || 'Agent';
                if (!cachedAgentsList.includes(name)) {
                    cachedAgentsList.push(name);
                }
            });
            cachedAgentsList.sort();
        } catch (e) {
            console.warn("Error fetching user list for agent dropdown:", e);
        }
    }

    const loggedInAgent = AppState.userNickname || AppState.userDisplayName || 'Agent';
    if (loggedInAgent && !cachedAgentsList.includes(loggedInAgent)) {
        cachedAgentsList.unshift(loggedInAgent);
    }

    if (preselectedName && !cachedAgentsList.includes(preselectedName)) {
        cachedAgentsList.unshift(preselectedName);
    }

    let optionsHTML = '';
    if (!preselectedName) {
        optionsHTML += `<option value="" selected>-- Not contacted yet --</option>`;
    }
    cachedAgentsList.forEach(agent => {
        optionsHTML += `<option value="${escapeHtml(agent)}" ${agent === preselectedName ? 'selected' : ''}>${escapeHtml(agent)}</option>`;
    });

    agentSelect.innerHTML = optionsHTML;
    refreshCustomDropdowns(agentSelect);
}

// Helper to format timestamps to readable DD Mon YYYY, hh:mm AM/PM
function formatTimestamp(ts) {
    if (!ts) return '';
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ', ' + 
           date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

// Helper to format date to DD/MM/YYYY
function formatDate(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
}

// Calculate days difference
function getDaysDifference(dateStr) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const parts = String(dateStr || '').split('-');
    const target = parts.length === 3
        ? new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
        : new Date(dateStr);
    target.setHours(0, 0, 0, 0);
    const diffTime = target - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
}

export function getRecycleAttentionCount(list = recycleSimsList) {
    if (!Array.isArray(list) || list.length === 0) return 0;
    return list.filter(sim => {
        if (!sim) return false;
        if (sim.status === 'arrived') return true;
        if (sim.status === 'scheduled' && (!sim.followUpDate || getDaysDifference(sim.followUpDate) <= 0)) return true;
        return simNeedsCall(sim);
    }).length;
}

export function openRecycleTracker() {
    openModal('modal-recycle-tracker');
    if (isListenerActive) {
        renderRecycleList();
        renderRecycleSummary();
    } else {
        initRecycleListener();
    }
}

export function initRecycleListener() {
    if (isListenerActive) return;
    isListenerActive = true;

    const q = query(collection(db, 'recycle_sims'));
    unsubscribeRecycle = onSnapshot(q, (snapshot) => {
        recycleSimsList = [];
        snapshot.forEach((docSnap) => {
            recycleSimsList.push({ id: docSnap.id, ...docSnap.data() });
        });
        
        // Sort: pending first, then by applied date descending
        recycleSimsList.sort((a, b) => {
            const statusOrder = { arrived: 1, scheduled: 2, applied: 3, completed: 4, cancelled: 5 };
            const orderA = statusOrder[a.status] || 99;
            const orderB = statusOrder[b.status] || 99;
            if (orderA !== orderB) return orderA - orderB;
            
            const timeA = a.appliedAt?.toMillis ? a.appliedAt.toMillis() : (a.id || 0);
            const timeB = b.appliedAt?.toMillis ? b.appliedAt.toMillis() : (b.id || 0);
            return timeB - timeA;
        });

        renderRecycleList();
        renderRecycleSummary();
        populateStoreRecycleSaleOptions();
    }, (error) => {
        console.error("Error syncing recycle SIMs:", error);
        showAppAlert("Sync Error", "Could not sync Recycle SIM database from cloud.");
    });
}

export function renderRecycleSummary() {
    let pending = 0;
    let arrived = 0;
    let scheduled = 0;
    let needsFollowUp = 0;

    recycleSimsList.forEach(sim => {
        if (sim.status === 'applied') pending++;
        else if (sim.status === 'arrived') arrived++;
        else if (sim.status === 'scheduled') scheduled++;
        if (simNeedsCall(sim)) needsFollowUp++;
    });

    const pendingEl = document.getElementById('recycle-summary-pending');
    const arrivedEl = document.getElementById('recycle-summary-arrived');
    const scheduledEl = document.getElementById('recycle-summary-scheduled');
    const followUpCountEl = document.getElementById('recycle-followup-count');

    if (pendingEl) pendingEl.innerText = pending;
    if (arrivedEl) arrivedEl.innerText = arrived;
    if (scheduledEl) scheduledEl.innerText = scheduled;
    if (followUpCountEl) {
        followUpCountEl.innerText = needsFollowUp > 0 ? String(needsFollowUp) : '';
        followUpCountEl.style.display = needsFollowUp > 0 ? 'inline-flex' : 'none';
    }
}

// Helper to get the last confirmed customer contact time
export function getLastContactTime(sim) {
    if (!sim) return null;

    // 1. Direct lastContactedAt field (preferred)
    if (sim.lastContactedAt) {
        const d = sim.lastContactedAt.toDate ? sim.lastContactedAt.toDate() : new Date(sim.lastContactedAt);
        if (!isNaN(d.getTime())) return d;
    }

    // 2. Backward compatibility: Scan history items backwards
    if (Array.isArray(sim.history) && sim.history.length > 0) {
        for (let i = sim.history.length - 1; i >= 0; i--) {
            const item = sim.history[i];
            if (!item) continue;

            const note = (item.note || '').trim();

            // Skip initial entry creation
            if (note === 'Recycle SIM entry created.' || note.startsWith('Entry created:')) {
                continue;
            }

            // Skip initial arrival transition from applied to arrived with default status note
            if (note === 'Status changed from applied to arrived.' || note.toLowerCase() === 'status changed from applied to arrived.') {
                continue;
            }

            // Any other history entry (status unchanged / follow-up, scheduled, custom note, call note) counts as a contact
            const d = item.timestamp?.toDate ? item.timestamp.toDate() : new Date(item.timestamp);
            if (!isNaN(d.getTime())) {
                return d;
            }
        }
    }

    // 3. Fallback: Check updatedAt if updated after creation
    if (sim.updatedAt && sim.appliedAt) {
        const updatedTime = sim.updatedAt.toDate ? sim.updatedAt.toDate() : new Date(sim.updatedAt);
        const appliedTime = sim.appliedAt.toDate ? sim.appliedAt.toDate() : new Date(sim.appliedAt);
        if (!isNaN(updatedTime.getTime()) && !isNaN(appliedTime.getTime()) && (updatedTime.getTime() - appliedTime.getTime() > 60000)) {
            return updatedTime;
        }
    }

    return null;
}

export function simNeedsCall(sim) {
    if (!['arrived', 'scheduled'].includes(sim.status)) {
        return false;
    }

    const lastContactTimestamp = getLastContactTime(sim);

    // If never contacted since arrival, it needs a call
    if (!lastContactTimestamp) {
        return true;
    }

    // Check if the last contact was more than 7 days ago
    const daysSinceLastContact = (Date.now() - lastContactTimestamp.getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceLastContact >= 7;
}

export function renderRecycleList() {
    const container = document.getElementById('recycle-list-container');
    if (!container) return;

    const searchInput = document.getElementById('recycle-search');
    const searchQuery = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const clearBtn = document.getElementById('recycle-search-clear');
    if (clearBtn) {
        clearBtn.classList.toggle('visible', searchQuery.length > 0);
    }
    
    const filteredList = recycleSimsList.filter(sim => {
        const matchesStatus = activeFilterStatus === 'all'
            ? true
            : (activeFilterStatus === 'needs_call' ? simNeedsCall(sim) : sim.status === activeFilterStatus);
        const statusLabel = simNeedsCall(sim) ? `${sim.status || ''} follow up needs call` : (sim.status || '');
        const matchesSearch = (
            !searchQuery ||
            sim.recycledNumber?.toLowerCase().includes(searchQuery) ||
            sim.alternativeNumber?.toLowerCase().includes(searchQuery) ||
            sim.notes?.toLowerCase().includes(searchQuery) ||
            sim.appliedBy?.toLowerCase().includes(searchQuery) ||
            sim.lastContactedBy?.toLowerCase().includes(searchQuery) ||
            sim.soldBy?.toLowerCase().includes(searchQuery) ||
            statusLabel.toLowerCase().includes(searchQuery)
        );
        return matchesStatus && matchesSearch;
    });

    const isFiltered = activeFilterStatus !== 'all' || searchQuery.length > 0;
    const countBar = document.getElementById('recycle-count-bar');
    if (countBar) {
        if (recycleSimsList.length === 0) {
            countBar.style.display = 'none';
        } else {
            countBar.style.display = 'flex';
            countBar.innerHTML = isFiltered
                ? `<span>Showing ${filteredList.length} of ${recycleSimsList.length} entries</span><button type="button" class="ledger-reset-link" onclick="Amolnama.resetRecycleFilters()">Reset</button>`
                : `<span>${recycleSimsList.length} tracked SIM${recycleSimsList.length === 1 ? '' : 's'}</span>`;
        }
    }

    if (filteredList.length === 0) {
        container.innerHTML = isFiltered ? `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                <p>No matching recycle entries</p>
                <span>No SIM records matched the active status filter or search query.</span>
                <button type="button" class="btn-outline" style="height: auto; padding: 8px 16px; font-size: 0.82rem; margin-top: 12px;" onclick="Amolnama.resetRecycleFilters()">Reset Filters</button>
            </div>` : `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                <p>No recycle SIM entries yet</p>
                <span>Tap + Add SIM to log your first recycled number application.</span>
                <button type="button" class="btn-primary-full" style="width: auto; min-height: 40px; padding: 8px 18px; margin-top: 12px;" onclick="Amolnama.openAddRecycleModal()">+ Add SIM</button>
            </div>`;
        return;
    }

    const validStatuses = ['applied', 'arrived', 'scheduled', 'completed', 'cancelled'];
    const statusLabels = {
        applied: 'Applied',
        arrived: 'Arrived',
        scheduled: 'Scheduled',
        completed: 'Completed',
        cancelled: 'Cancelled'
    };

    let html = '';
    filteredList.forEach(sim => {
        const safeStatus = validStatuses.includes(sim.status) ? sim.status : 'applied';
        const statusLabel = statusLabels[safeStatus] || 'Applied';
        const statusBadge = `<span class="recycle-status-chip is-${safeStatus}">${statusLabel}</span>`;

        // Calculate expected arrival date or scheduled pickup countdown
        let dateMsg = '';
        if (sim.status === 'applied') {
            const appliedDate = sim.appliedAt?.toDate ? sim.appliedAt.toDate() : new Date();
            const expectedDate = new Date(appliedDate);
            expectedDate.setDate(expectedDate.getDate() + 32); // Average of 30-35 days
            const daysLeft = Math.ceil((expectedDate - new Date()) / (1000 * 60 * 60 * 24));
            
            if (daysLeft > 0) {
                dateMsg = `<span style="font-size: 0.75rem; font-weight: 600; color: var(--text-secondary);">Expected in ~${daysLeft} days (${expectedDate.toLocaleDateString('en-GB', {day: 'numeric', month:'short'})})</span>`;
            } else {
                dateMsg = `<span style="font-size: 0.75rem; font-weight: 700; color: var(--warning-text);">Arrival window reached — follow up</span>`;
            }
        } else if (sim.status === 'scheduled' && sim.followUpDate) {
            const days = getDaysDifference(sim.followUpDate);
            const dateStr = formatDate(sim.followUpDate);
            if (days === 0) {
                dateMsg = `<span style="font-size: 0.75rem; font-weight: 800; color: var(--purple-text);">Scheduled pickup is TODAY (${dateStr})</span>`;
            } else if (days > 0) {
                dateMsg = `<span style="font-size: 0.75rem; font-weight: 600; color: var(--purple-text);">Pickup scheduled in ${days} day${days === 1 ? '' : 's'} (${dateStr})</span>`;
            } else {
                dateMsg = `<span style="font-size: 0.75rem; font-weight: 800; color: var(--danger-text);">Overdue pickup by ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} (${dateStr})</span>`;
            }
        } else if (sim.status === 'completed' && sim.completedAt) {
            dateMsg = `<span style="font-size: 0.75rem; font-weight: 600; color: var(--text-secondary);">Sold on ${formatTimestamp(sim.completedAt)}</span>`;
        }

        const detailNotes = sim.notes ? `<div class="rate-note-banner" style="margin-top: 4px;">${escapeHtml(sim.notes)}</div>` : '';
        
        let callButton = '';
        if (sim.alternativeNumber) {
            const pulseClass = simNeedsCall(sim) ? ' new-pulse' : '';
            callButton = `
                <a href="tel:${escapeHtml(sim.alternativeNumber)}" onclick="event.stopPropagation();" onkeydown="event.stopPropagation();" class="recycle-call-action-btn${pulseClass}" title="Call Customer" aria-label="Call customer ${escapeHtml(sim.alternativeNumber)}">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                </a>
            `;
        }

        const safeIdJs = escapeJsSingleQuote(sim.id);

        html += `
            <div class="recycle-card" role="button" tabindex="0" onclick="Amolnama.openUpdateRecycleStatusModal('${safeIdJs}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();Amolnama.openUpdateRecycleStatusModal('${safeIdJs}');}">
                <!-- Card Header -->
                <div class="recycle-card-header">
                    <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
                        <div class="recycle-sim-icon is-${safeStatus}">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/></svg>
                        </div>
                        <span class="recycle-phone-num tabular-nums">${escapeHtml(sim.recycledNumber)}</span>
                    </div>
                    ${statusBadge}
                </div>

                <!-- Contact & Direct Call Strip -->
                <div class="recycle-contact-strip">
                    <div style="display: flex; flex-direction: column; gap: 2px; min-width: 0;">
                        <span class="recycle-grid-label">Alternative Contact</span>
                        <span class="recycle-phone-alt tabular-nums">${escapeHtml(sim.alternativeNumber || 'None provided')}</span>
                    </div>
                    ${callButton}
                </div>

                <!-- Audit & Timeline Grid (Registered vs Last Contacted / Sold By) -->
                <div class="recycle-card-grid">
                    <div class="recycle-grid-item">
                        <span class="recycle-grid-label">Registered By</span>
                        <span class="recycle-grid-val">${escapeHtml(sim.appliedBy || 'System')}</span>
                        <span class="recycle-grid-subval">${formatTimestamp(sim.appliedAt) || 'Initial record'}</span>
                    </div>
                    ${sim.status === 'completed' ? `
                    <div class="recycle-grid-item">
                        <span class="recycle-grid-label">Sold By</span>
                        <span class="recycle-grid-val">${escapeHtml(sim.soldBy || sim.completedBy || sim.updatedBy || 'Agent')}</span>
                        <span class="recycle-grid-subval">${sim.completedAt ? formatTimestamp(sim.completedAt) : (formatTimestamp(sim.updatedAt) || 'Completed')}</span>
                    </div>
                    ` : `
                    <div class="recycle-grid-item">
                        <span class="recycle-grid-label">Last Contacted</span>
                        <span class="recycle-grid-val">${escapeHtml(sim.lastContactedBy || (getLastContactTime(sim) ? (sim.updatedBy || 'Agent') : 'Not contacted yet'))}</span>
                        <span class="recycle-grid-subval">${getLastContactTime(sim) ? formatTimestamp(getLastContactTime(sim)) : 'Pending first follow-up'}</span>
                    </div>
                    `}
                </div>

                <!-- Notes Banner (If any) -->
                ${detailNotes}

                <!-- Card Footer (Countdown & Tracking Status - only rendered when date alert exists) -->
                ${dateMsg ? `
                <div class="recycle-card-footer">
                    <div style="display: flex; align-items: center; gap: 6px; width: 100%; min-width: 0; flex-wrap: wrap;">
                        ${dateMsg}
                    </div>
                </div>` : ''}
            </div>
        `;
    });

    container.innerHTML = html;
}

export function filterRecycleList() {
    renderRecycleList();
}

export function clearRecycleSearch() {
    const input = document.getElementById('recycle-search');
    if (input) {
        input.value = '';
        if (typeof input.focus === 'function') input.focus();
    }
    const clearBtn = document.getElementById('recycle-search-clear');
    if (clearBtn) clearBtn.classList.remove('visible');
    renderRecycleList();
}

export function resetRecycleFilters() {
    const input = document.getElementById('recycle-search');
    if (input) input.value = '';
    const clearBtn = document.getElementById('recycle-search-clear');
    if (clearBtn) clearBtn.classList.remove('visible');
    activeFilterStatus = 'all';
    document.querySelectorAll('#modal-recycle-tracker .store-pill').forEach(p => {
        const isAll = p.id === 'recycle-pill-all' || p.getAttribute('data-recycle-status') === 'all';
        p.classList.toggle('active', isAll);
        p.setAttribute('aria-pressed', isAll ? 'true' : 'false');
    });
    renderRecycleList();
}

export function filterRecycleByStatus(status, pill) {
    activeFilterStatus = status || 'all';
    document.querySelectorAll('#modal-recycle-tracker .store-pill').forEach(p => {
        const isMatch = pill ? (p === pill) : (p.getAttribute('data-recycle-status') === activeFilterStatus);
        p.classList.toggle('active', isMatch);
        p.setAttribute('aria-pressed', isMatch ? 'true' : 'false');
    });
    if (pill) scrollPillIntoView(pill);
    renderRecycleList();
}

// Add Application
export function openAddRecycleModal() {
    clearInputError('add-recycle-number');
    clearInputError('add-recycle-alt');
    clearInputError('add-recycle-date');
    document.getElementById('add-recycle-number').value = '';
    document.getElementById('add-recycle-alt').value = '';
    document.getElementById('add-recycle-notes').value = '';
    const statusSelect = document.getElementById('add-recycle-status');
    if (statusSelect) {
        statusSelect.value = 'applied';
        refreshCustomDropdowns(statusSelect);
    }
    const dateInput = document.getElementById('add-recycle-date');
    if (dateInput) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        dateInput.value = formatLocalISODate(tomorrow);
    }
    onAddRecycleStatusChange();
    openModal('modal-add-recycle-sim');
}

export function onAddRecycleStatusChange() {
    const statusSelect = document.getElementById('add-recycle-status');
    const dateWrapper = document.getElementById('add-recycle-date-wrapper');
    if (statusSelect && dateWrapper) {
        dateWrapper.style.display = statusSelect.value === 'scheduled' ? 'block' : 'none';
    }
}

export async function submitRecycleApplication() {
    if (isSavingRecycle) return;

    const numberEl = document.getElementById('add-recycle-number');
    const altEl = document.getElementById('add-recycle-alt');
    const notesEl = document.getElementById('add-recycle-notes');
    const dateEl = document.getElementById('add-recycle-date');
    clearInputError(numberEl);
    clearInputError(altEl);
    clearInputError(dateEl);

    const number = numberEl.value.trim();
    const alt = altEl.value.trim();
    const notes = notesEl.value.trim();
    const initialStatus = document.getElementById('add-recycle-status')?.value || 'applied';
    const followUpDate = dateEl?.value || null;

    if (!number || !alt) {
        if (!number) markInputError(numberEl);
        if (!alt) markInputError(altEl);
        showAppAlert("Missing Input", "Both Recycled Number and Alternative Contact Number are required.");
        return;
    }

    if (initialStatus === 'scheduled' && !followUpDate) {
        markInputError(dateEl);
        showAppAlert("Missing Input", "Please select a scheduled pickup date.");
        return;
    }

    // Basic Validation: must be valid mobile numbers (e.g. 11 digits)
    const mobileRegex = /^01[3-9]\d{8}$/;
    if (!mobileRegex.test(number)) {
        markInputError(numberEl);
        showAppAlert("Invalid Number", "The recycled SIM number must be a valid 11-digit mobile number starting with 01.");
        return;
    }
    if (!mobileRegex.test(alt)) {
        markInputError(altEl);
        showAppAlert("Invalid Number", "The alternative contact number must be a valid 11-digit mobile number starting with 01.");
        return;
    }

    const docData = {
        recycledNumber: number,
        alternativeNumber: alt,
        notes: notes,
        status: initialStatus,
        followUpDate: initialStatus === 'scheduled' ? followUpDate : null,
        appliedBy: AppState.userNickname || AppState.userDisplayName,
        appliedById: AppState.currentUser?.uid || '',
        appliedAt: serverTimestamp(),
        lastContactedAt: initialStatus === 'scheduled' ? serverTimestamp() : null,
        lastContactedBy: initialStatus === 'scheduled' ? (AppState.userNickname || AppState.userDisplayName) : null,
        updatedBy: AppState.userNickname || AppState.userDisplayName,
        updatedById: AppState.currentUser?.uid || '',
        updatedAt: serverTimestamp(),
        history: [{
            status: initialStatus,
            timestamp: new Date().toISOString(),
            by: AppState.userNickname || AppState.userDisplayName,
            note: notes ? `Entry created: ${notes}` : 'Recycle SIM entry created.'
        }]
    };

    const saveBtn = document.querySelector('#modal-add-recycle-sim .btn-primary-full');
    isSavingRecycle = true;
    setButtonLoading(saveBtn, true, 'Saving...');

    try {
        await addDoc(collection(db, 'recycle_sims'), docData);
        closeModal('modal-add-recycle-sim');
        showFlashMessage("Recycle SIM entry saved!");
    } catch (e) {
        console.error("Error creating recycle SIM record:", e);
        showAppAlert("Database Error", "Failed to save recycle entry. Check rules/connection.");
    } finally {
        isSavingRecycle = false;
        setButtonLoading(saveBtn, false);
    }
}

function renderRecycleHistoryTimeline(sim) {
    const historySection = document.getElementById('status-update-history-section');
    const historyListEl = document.getElementById('status-update-history-list');
    if (!historySection || !historyListEl) return;

    const history = Array.isArray(sim?.history) ? sim.history : [];
    if (history.length === 0) {
        historySection.style.display = 'none';
        historyListEl.innerHTML = '';
        return;
    }

    const itemsHtml = [...history].reverse().map(entry => {
        const timeText = entry?.timestamp ? formatTimestamp(entry.timestamp) : '';
        const statusText = entry?.status ? String(entry.status).toUpperCase() : 'UPDATE';
        const byText = entry?.by || 'System';
        const noteText = entry?.note || '';
        return `
            <div class="recycle-history-item">
                <div class="recycle-history-meta">
                    <span>${escapeHtml(statusText)} · ${escapeHtml(byText)}</span>
                    <span>${escapeHtml(timeText)}</span>
                </div>
                ${noteText ? `<div style="color: var(--text-primary); line-height: 1.35;">${escapeHtml(noteText)}</div>` : ''}
            </div>
        `;
    }).join('');

    historyListEl.innerHTML = itemsHtml;
    historySection.style.display = 'block';
}

// Update Status Modal
export function openUpdateRecycleStatusModal(id) {
    const sim = recycleSimsList.find(s => s.id === id);
    if (!sim) return;

    recycleContactTimeWasTouched = false;
    clearInputError('status-update-date');

    document.getElementById('status-update-id').value = id;
    const phoneEl = document.getElementById('status-update-number');
    if (phoneEl) phoneEl.innerText = sim.recycledNumber;
    const altEl = document.getElementById('status-update-alt-number');
    if (altEl) altEl.innerText = sim.alternativeNumber || 'None';
    const callLink = document.getElementById('status-update-call-link');
    if (callLink) {
        if (sim.alternativeNumber) {
            callLink.href = `tel:${sim.alternativeNumber}`;
            callLink.setAttribute('aria-label', `Call customer ${sim.alternativeNumber}`);
            callLink.style.display = 'inline-flex';
        } else {
            callLink.style.display = 'none';
        }
    }

    const statusSelect = document.getElementById('status-update-select');
    if (statusSelect) {
        statusSelect.value = sim.status;
        refreshCustomDropdowns(statusSelect);
    }
    document.getElementById('status-update-note').value = sim.notes || '';
    
    // Determine existing contact info
    const lastContactTimestamp = getLastContactTime(sim);
    const existingAgent = sim.lastContactedBy || (lastContactTimestamp ? (sim.updatedBy || '') : '');

    initialContactTimeValue = lastContactTimestamp ? getLocalDateTimeString(lastContactTimestamp) : '';
    initialContactAgentValue = existingAgent;

    // Populate agent dropdown with previous agent
    populateAgentSelect(existingAgent);

    // Populate Contacted Time input with existing timestamp or leave blank if never contacted
    const timeInput = document.getElementById('status-update-contacted-at');
    if (timeInput) {
        timeInput.value = initialContactTimeValue;
    }
    
    updateContactTimeIndicator();

    const dateInput = document.getElementById('status-update-date');
    if (sim.followUpDate) {
        dateInput.value = sim.followUpDate;
    } else {
        // Default tomorrow
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        dateInput.value = formatLocalISODate(tomorrow);
    }

    onRecycleStatusChangeSelect();
    renderRecycleHistoryTimeline(sim);
    
    const deleteBtn = document.getElementById('btn-delete-recycle-sim');
    if (deleteBtn) {
        deleteBtn.style.display = ['admin', 'owner'].includes(AppState.currentUserRole) ? 'block' : 'none';
    }

    openModal('modal-recycle-status-update');
}

export function setRecycleContactTimeToNow() {
    const timeInput = document.getElementById('status-update-contacted-at');
    if (timeInput) {
        timeInput.value = getLocalDateTimeString();
    }
    const currentAgent = AppState.userNickname || AppState.userDisplayName || 'Agent';
    const agentSelect = document.getElementById('status-update-agent');
    if (agentSelect) {
        if (!cachedAgentsList.includes(currentAgent)) {
            cachedAgentsList.unshift(currentAgent);
            populateAgentSelect(currentAgent);
        } else {
            agentSelect.value = currentAgent;
            refreshCustomDropdowns(agentSelect);
        }
    }
    recycleContactTimeWasTouched = true;
    updateContactTimeIndicator();
}

export function onRecycleContactTimeClick() {
    if (!recycleContactTimeWasTouched) {
        setRecycleContactTimeToNow();
    }
}

export function onRecycleContactTimeManualChange() {
    recycleContactTimeWasTouched = true;
    const agentSelect = document.getElementById('status-update-agent');
    if (agentSelect && !agentSelect.value) {
        agentSelect.value = AppState.userNickname || AppState.userDisplayName || 'Agent';
        refreshCustomDropdowns(agentSelect);
    }
    updateContactTimeIndicator();
}

export function onRecycleAgentChange() {
    recycleContactTimeWasTouched = true;
    const timeInput = document.getElementById('status-update-contacted-at');
    if (timeInput && !timeInput.value) {
        timeInput.value = getLocalDateTimeString();
    }
    updateContactTimeIndicator();
}

export function resetRecycleContactTimeToPrevious() {
    const timeInput = document.getElementById('status-update-contacted-at');
    if (timeInput) {
        timeInput.value = initialContactTimeValue;
    }
    const agentSelect = document.getElementById('status-update-agent');
    if (agentSelect) {
        agentSelect.value = initialContactAgentValue;
        refreshCustomDropdowns(agentSelect);
    }
    recycleContactTimeWasTouched = false;
    updateContactTimeIndicator();
}

function updateContactTimeIndicator() {
    const hintEl = document.getElementById('status-update-contact-hint');
    if (!hintEl) return;
    if (recycleContactTimeWasTouched) {
        hintEl.innerHTML = `<span style="color: var(--success-text); font-weight: 700;">✓ Will update contact time & agent on save</span> <a href="javascript:void(0)" onclick="Amolnama.resetRecycleContactTimeToPrevious()" style="color: var(--text-secondary); text-decoration: underline; margin-left: 8px; font-weight: normal; cursor: pointer;">(Revert)</a>`;
    } else {
        const timeInput = document.getElementById('status-update-contacted-at');
        if (timeInput && timeInput.value) {
            hintEl.innerHTML = `<span style="color: var(--text-secondary); opacity: 0.85;">Keeping existing contact info (Click time or "Set Now" to update)</span>`;
        } else {
            hintEl.innerHTML = `<span style="color: var(--text-secondary); opacity: 0.85;">Not contacted yet (Click time or "Set Now" to log contact)</span>`;
        }
    }
}

export function onRecycleStatusChangeSelect() {
    const selectVal = document.getElementById('status-update-select').value;
    const dateWrapper = document.getElementById('status-update-date-wrapper');
    if (dateWrapper) {
        dateWrapper.style.display = selectVal === 'scheduled' ? 'block' : 'none';
    }
}

export async function saveRecycleStatusUpdate() {
    if (isSavingRecycle) return;
    const id = document.getElementById('status-update-id').value;
    const newStatus = document.getElementById('status-update-select').value;
    const dateInput = document.getElementById('status-update-date');
    const followUpDate = dateInput ? dateInput.value : '';
    const note = document.getElementById('status-update-note').value.trim();
    clearInputError(dateInput);
    
    const sim = recycleSimsList.find(s => s.id === id);
    if (!sim) return;

    if (newStatus === 'scheduled' && !followUpDate) {
        markInputError(dateInput);
        showAppAlert("Missing Input", "Please select a follow-up/pickup date.");
        return;
    }

    if (newStatus === 'completed') {
        // Direct checkout to prevent status mismatch
        closeModal('modal-recycle-status-update');
        openRecycleSaleCheckoutForSIM(sim.id);
        return;
    }

    const currentAgentName = AppState.userNickname || AppState.userDisplayName || 'Agent';
    const agentSelect = document.getElementById('status-update-agent');
    const selectedAgent = agentSelect ? agentSelect.value : '';

    const timeInput = document.getElementById('status-update-contacted-at');
    const customTimeStr = timeInput ? timeInput.value : '';

    let historyNote = note;
    if (!historyNote) {
        if (newStatus !== sim.status) {
            if (newStatus === 'scheduled') {
                historyNote = `Scheduled pickup for ${followUpDate ? formatDate(followUpDate) : 'upcoming date'}.`;
            } else {
                historyNote = `Status changed from ${sim.status} to ${newStatus}.`;
            }
        } else if (recycleContactTimeWasTouched) {
            historyNote = `Customer contact logged by ${selectedAgent || currentAgentName}.`;
        } else {
            historyNote = `Record updated by ${currentAgentName}.`;
        }
    }

    const now = new Date();
    const historyItem = {
        status: newStatus,
        timestamp: now.toISOString(),
        by: currentAgentName,
        note: historyNote
    };

    const updateData = {
        status: newStatus,
        updatedBy: currentAgentName,
        updatedById: AppState.currentUser?.uid || '',
        updatedAt: serverTimestamp(),
        notes: note,
        history: [...(sim.history || []), historyItem]
    };

    // ONLY update lastContactedAt and lastContactedBy if user clicked or modified the contact fields!
    if (recycleContactTimeWasTouched) {
        if (customTimeStr) {
            updateData.lastContactedAt = new Date(customTimeStr);
            updateData.lastContactedBy = selectedAgent || currentAgentName;
        } else {
            updateData.lastContactedAt = null;
            updateData.lastContactedBy = null;
        }
    }

    if (newStatus === 'scheduled') {
        updateData.followUpDate = followUpDate;
    } else {
        // If status changed from scheduled, delete followUpDate
        updateData.followUpDate = null;
    }

    const saveBtn = document.getElementById('btn-save-recycle-status');
    isSavingRecycle = true;
    setButtonLoading(saveBtn, true, 'Saving...');

    try {
        await updateDoc(doc(db, 'recycle_sims', id), updateData);
        closeModal('modal-recycle-status-update');
        showFlashMessage("Status updated successfully!");
    } catch (e) {
        console.error("Error updating status:", e);
        showAppAlert("Save Failed", "Could not update status in cloud.");
    } finally {
        isSavingRecycle = false;
        setButtonLoading(saveBtn, false);
    }
}

export async function deleteRecycleSimEntry() {
    const id = document.getElementById('status-update-id').value;
    const sim = recycleSimsList.find(s => s.id === id);
    if (!sim) return;

    if (!['admin', 'owner'].includes(AppState.currentUserRole)) {
        showAppAlert("Access Denied", "🔒 Only an Admin or System Owner can delete recycle SIM entries.");
        return;
    }

    showAppAlert(
        "Delete Entry",
        `Are you sure you want to permanently delete the entry for Recycle SIM ${sim.recycledNumber}? This cannot be undone.`,
        true,
        async () => {
            try {
                await deleteDoc(doc(db, 'recycle_sims', id));
                closeModal('modal-recycle-status-update');
                showFlashMessage("Recycle SIM entry deleted!");
            } catch (e) {
                console.error("Error deleting recycle SIM entry:", e);
                showAppAlert("Delete Failed", "Could not delete entry from cloud.");
            }
        },
        "Delete Entry"
    );
}

// Store Checkout Trigger
export function triggerStoreRecycleSale() {
    recycleCheckoutFromStatusUpdate = false;
    const statusNoteEl = document.getElementById('status-update-note');
    if (statusNoteEl) statusNoteEl.value = '';
    populateStoreRecycleSaleOptions();
    const paySelect = document.getElementById('recycle-sale-payment');
    if (paySelect) refreshCustomDropdowns(paySelect);
    openModal('modal-select-recycle-sim');
}

export function populateStoreRecycleSaleOptions(extraSimId = null) {
    const select = document.getElementById('recycle-select-sale-number');
    if (!select) return;

    // Filter SIMs with status 'arrived' or 'scheduled', or the extra one
    const eligibleSims = recycleSimsList.filter(sim => 
        ['arrived', 'scheduled'].includes(sim.status) || sim.id === extraSimId
    );

    let html = '';
    eligibleSims.forEach(sim => {
        html += `<option value="${escapeHtml(sim.id)}">${escapeHtml(sim.recycledNumber)}</option>`;
    });

    // Add direct untracked option
    html += `<option value="untracked">-- Untracked/Direct Sale --</option>`;

    select.innerHTML = html;
    refreshCustomDropdowns(select);
    onSelectRecycleSaleNumberChange();
}

export function onSelectRecycleSaleNumberChange() {
    const val = document.getElementById('recycle-select-sale-number').value;
    const manualWrapper = document.getElementById('recycle-sale-untracked-number-wrapper');
    if (manualWrapper) {
        manualWrapper.style.display = val === 'untracked' ? 'block' : 'none';
    }
}

function openRecycleSaleCheckoutForSIM(simId) {
    const sim = recycleSimsList.find(s => s.id === simId);
    if (!sim) return;

    recycleCheckoutFromStatusUpdate = true;
    populateStoreRecycleSaleOptions(simId);

    const select = document.getElementById('recycle-select-sale-number');
    if (select) {
        select.value = simId;
        refreshCustomDropdowns([select, document.getElementById('recycle-sale-payment')]);
        onSelectRecycleSaleNumberChange();
    }
    openModal('modal-select-recycle-sim');
}

export async function confirmRecycleSimSale() {
    if (isSavingRecycle) return;

    const selectVal = document.getElementById('recycle-select-sale-number').value;
    const payment = document.getElementById('recycle-sale-payment').value;
    
    // Prevent sales while viewing historical dates
    const datePicker = document.getElementById('report-date-picker');
    if (datePicker && datePicker.value && formatToGBDate(datePicker.value) !== getStrictDate()) {
        showAppAlert("Action Blocked", "You cannot process new transactions while viewing a past date. Please return to 'Today'.");
        return;
    }

    if (!AppState.currentSessionId) {
        showAppAlert("Desk Closed", "You must open your desk and verify your float before making transactions.");
        return;
    }

    let finalRecycleNumber = '';
    let simId = null;

    if (selectVal === 'untracked') {
        const manualEl = document.getElementById('recycle-sale-untracked-number');
        clearInputError(manualEl);
        const manualNum = manualEl ? manualEl.value.trim() : '';
        if (!manualNum) {
            markInputError(manualEl);
            showAppAlert("Missing Input", "Please enter the Recycled SIM Number.");
            return;
        }
        const mobileRegex = /^01[3-9]\d{8}$/;
        if (!mobileRegex.test(manualNum)) {
            markInputError(manualEl);
            showAppAlert("Invalid Number", "The SIM number must be a valid 11-digit mobile number starting with 01.");
            return;
        }
        finalRecycleNumber = manualNum;
    } else {
        const sim = recycleSimsList.find(s => s.id === selectVal);
        if (!sim) return;
        simId = sim.id;
        finalRecycleNumber = sim.recycledNumber;
    }

    let customNote = '';
    const statusNoteEl = recycleCheckoutFromStatusUpdate ? document.getElementById('status-update-note') : null;
    if (statusNoteEl && statusNoteEl.value.trim()) {
        customNote = statusNoteEl.value.trim();
    }

    const catalogItem = AppState.globalCatalog["sim_recycle"] || { name: 'Recycle SIM', price: 400 };
    const price = catalogItem.price || 400;
    const note = `Recycle SIM: ${finalRecycleNumber}` + (customNote ? ` (${customNote})` : '');

    if (!passStockFirewall(catalogItem.name, 1)) return;

    isSavingRecycle = true;

    // Prompt onboarding before saving
    if (typeof window.Amolnama?.promptSimOnboarding === 'function') {
        window.Amolnama.promptSimOnboarding(catalogItem.name, async (firstCall, appReg) => {
            if (firstCall === null) {
                isSavingRecycle = false;
                showFlashMessage("Sale aborted.");
                return;
            }

            try {
                // 1. Log transaction in cloud with onboarding and recycle metadata
                addTransactionToCloudWithRecycleDetails('Item', catalogItem.name, price, 1, payment, note, { firstCall, appReg }, simId, finalRecycleNumber);

                // 2. Update status of the tracking SIM to Completed
                if (simId) {
                    const sim = recycleSimsList.find(s => s.id === simId);
                    const timestamp = new Date().toISOString();
                    const agentName = AppState.userNickname || AppState.userDisplayName || 'Agent';

                    const historyItem = {
                        status: 'completed',
                        timestamp: timestamp,
                        by: agentName,
                        note: customNote ? `Completed: ${customNote}` : 'Completed via direct Store Checkout sale.'
                    };

                    const updateData = {
                        status: 'completed',
                        previousStatus: sim ? (sim.status || 'arrived') : 'arrived',
                        completedAt: serverTimestamp(),
                        completedBy: agentName,
                        soldBy: agentName,
                        updatedBy: agentName,
                        updatedById: AppState.currentUser?.uid || '',
                        updatedAt: serverTimestamp(),
                        history: [...((sim && sim.history) || []), historyItem]
                    };

                    try {
                        await updateDoc(doc(db, 'recycle_sims', simId), updateData);
                    } catch (e) {
                        console.error("Error updating recycle status to completed:", e);
                    }
                }

                recycleCheckoutFromStatusUpdate = false;
                closeModal('modal-select-recycle-sim');
                showFlashMessage(`Logged Recycle SIM (${finalRecycleNumber}) Sale!`);
            } finally {
                isSavingRecycle = false;
            }
        });
    } else {
        // Fallback
        try {
            addTransactionToCloudWithRecycleDetails('Item', catalogItem.name, price, 1, payment, note, { firstCall: false, appReg: false }, simId, finalRecycleNumber);
            if (simId) {
                const sim = recycleSimsList.find(s => s.id === simId);
                const timestamp = new Date().toISOString();
                const agentName = AppState.userNickname || AppState.userDisplayName || 'Agent';

                const historyItem = {
                    status: 'completed',
                    timestamp: timestamp,
                    by: agentName,
                    note: customNote ? `Completed: ${customNote}` : 'Completed via direct Store Checkout sale.'
                };

                const updateData = {
                    status: 'completed',
                    previousStatus: sim ? (sim.status || 'arrived') : 'arrived',
                    completedAt: serverTimestamp(),
                    completedBy: agentName,
                    soldBy: agentName,
                    updatedBy: agentName,
                    updatedById: AppState.currentUser?.uid || '',
                    updatedAt: serverTimestamp(),
                    history: [...((sim && sim.history) || []), historyItem]
                };

                try {
                    await updateDoc(doc(db, 'recycle_sims', simId), updateData);
                } catch (e) {
                    console.error("Error updating recycle status to completed:", e);
                }
            }
            recycleCheckoutFromStatusUpdate = false;
            closeModal('modal-select-recycle-sim');
            showFlashMessage(`Logged Recycle SIM (${finalRecycleNumber}) Sale!`);
        } finally {
            isSavingRecycle = false;
        }
    }
}

// Special wrapper to ensure note field is populated with the recycle number
function addTransactionToCloudWithRecycleDetails(type, name, amount, qty, payment, notesStr, onboarding = null, recycleSimId = null, recycledNumber = '') {
    if(!AppState.currentUser) return;
    if (!AppState.currentSessionId) return;

    let cashAmt = payment === 'Cash' ? amount : 0;
    let mfsAmt = payment === 'MFS' ? amount : 0;

    let catItem = Object.values(AppState.globalCatalog).find(c => c.name === name);
    let trackAs = catItem ? (catItem.trackAs === '' ? '' : (catItem.trackAs || name)) : name; 
    let cat = catItem ? catItem.cat : 'unknown';

    const tx = {
        id: Date.now(), 
        receiptNo: generateReceiptNo(), 
        type: type, 
        name: name, 
        trackAs: trackAs, 
        cat: cat, 
        amount: amount, 
        qty: qty,
        payment: payment, 
        cashAmt: cashAmt, 
        mfsAmt: mfsAmt, 
        isDeleted: false,
        time: new Date().toLocaleTimeString('en-GB', {hour: '2-digit', minute:'2-digit'}),
        dateStr: getStrictDate(),
        deskId: AppState.currentDeskId, 
        sessionId: AppState.currentSessionId, 
        agentId: AppState.currentUser.uid, 
        agentName: AppState.userNickname || AppState.userDisplayName,
        notes: notesStr, // Save the recycle number inside the transaction notes!
        recycleSimId: recycleSimId,
        recycledNumber: recycledNumber,
        isRecycleSale: true,
        timestamp: serverTimestamp()
    };

    if (onboarding) {
        tx.onboarding = onboarding;
    }

    // Optimistic UI updates
    AppState.transactions.push({ ...tx, isPending: true });
    
    if (typeof window.renderDeskDashboard === 'function') window.renderDeskDashboard(AppState.currentDeskId);
    if (typeof window.renderPersonalReport === 'function') window.renderPersonalReport();
    if (typeof window.renderAppUI === 'function') window.renderAppUI();

    addDoc(collection(db, 'transactions'), tx).then(() => {
        // Success
    }).catch(e => {
        console.warn("Offline error queuing transaction", e);
        // Fallback local storage
        const localTxIndex = AppState.transactions.findIndex(t => t.id === tx.id);
        if (localTxIndex > -1) {
            AppState.transactions[localTxIndex].isPending = false;
            AppState.transactions[localTxIndex].isOffline = true;
        }
        let offlineTxs = JSON.parse(localStorage.getItem('amolnama_offline_txs') || '[]');
        const safeTx = { ...tx };
        delete safeTx.timestamp;
        offlineTxs.push(safeTx);
        localStorage.setItem('amolnama_offline_txs', JSON.stringify(offlineTxs));
        showFlashMessage("Saved Offline (Pending Sync)");
    });
}

