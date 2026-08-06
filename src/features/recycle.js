// src/features/recycle.js
import { collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, query, serverTimestamp } from "firebase/firestore";
import { db } from '../config/firebase.js';
import { AppState } from '../core/state.js';
import { showAppAlert, showFlashMessage, openModal, closeModal } from '../utils/ui-helpers.js';
import { addTransactionToCloud } from './transactions.js';
import { getStrictDate, generateReceiptNo, formatToGBDate } from '../utils/helpers.js';

let recycleSimsList = [];
let activeFilterStatus = 'all';
let isListenerActive = false;
let unsubscribeRecycle = null;

// Helper to format timestamps to readable DD/MM/YYYY HH:MM
function formatTimestamp(ts) {
    if (!ts) return '';
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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
    const target = new Date(dateStr);
    target.setHours(0, 0, 0, 0);
    const diffTime = target - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
}

export function openRecycleTracker() {
    openModal('modal-recycle-tracker');
    initRecycleListener();
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

    recycleSimsList.forEach(sim => {
        if (sim.status === 'applied') pending++;
        else if (sim.status === 'arrived') arrived++;
        else if (sim.status === 'scheduled') scheduled++;
    });

    const pendingEl = document.getElementById('recycle-summary-pending');
    const arrivedEl = document.getElementById('recycle-summary-arrived');
    const scheduledEl = document.getElementById('recycle-summary-scheduled');

    if (pendingEl) pendingEl.innerText = pending;
    if (arrivedEl) arrivedEl.innerText = arrived;
    if (scheduledEl) scheduledEl.innerText = scheduled;
}

export function renderRecycleList() {
    const container = document.getElementById('recycle-list-container');
    if (!container) return;

    const searchQuery = document.getElementById('recycle-search')?.value.toLowerCase().trim() || '';
    
    let filteredList = recycleSimsList.filter(sim => {
        const matchesStatus = (activeFilterStatus === 'all' || sim.status === activeFilterStatus);
        const matchesSearch = (
            sim.recycledNumber?.toLowerCase().includes(searchQuery) ||
            sim.alternativeNumber?.toLowerCase().includes(searchQuery) ||
            sim.notes?.toLowerCase().includes(searchQuery)
        );
        return matchesStatus && matchesSearch;
    });

    if (filteredList.length === 0) {
        container.innerHTML = `
            <div style="padding: 40px 20px; text-align: center; color: var(--text-secondary);">
                <div style="font-size: 2.2rem; margin-bottom: 12px;">♻️</div>
                <div style="font-weight: 700; color: var(--text-primary);">No applications found</div>
                <div style="font-size: 0.8rem; margin-top: 4px; opacity: 0.8;">Use search or filters above, or add a new application.</div>
            </div>`;
        return;
    }

    let html = '';
    filteredList.forEach(sim => {
        let statusBadge = '';
        let dotColor = '#3390ec';
        
        switch (sim.status) {
            case 'applied':
                statusBadge = `<span style="font-size: 0.72rem; font-weight: 700; background: rgba(51, 144, 236, 0.08); color: var(--accent-color); padding: 4px 10px; border-radius: 20px; border: 1px solid rgba(51, 144, 236, 0.15);">Applied</span>`;
                dotColor = '#3390ec';
                break;
            case 'arrived':
                statusBadge = `<span style="font-size: 0.72rem; font-weight: 700; background: var(--success-bg); color: var(--success-text); padding: 4px 10px; border-radius: 20px; border: 1px solid var(--success-border);">Arrived</span>`;
                dotColor = '#10b981';
                break;
            case 'scheduled':
                statusBadge = `<span style="font-size: 0.72rem; font-weight: 700; background: var(--purple-bg); color: var(--purple-text); padding: 4px 10px; border-radius: 20px; border: 1px solid var(--purple-border);">Scheduled</span>`;
                dotColor = '#7c3aed';
                break;
            case 'completed':
                statusBadge = `<span style="font-size: 0.72rem; font-weight: 700; background: var(--border-color); color: var(--text-secondary); padding: 4px 10px; border-radius: 20px; border: 1px solid var(--border-color);">Completed</span>`;
                dotColor = '#64748b';
                break;
            case 'cancelled':
                statusBadge = `<span style="font-size: 0.72rem; font-weight: 700; background: var(--danger-bg); color: var(--danger-text); padding: 4px 10px; border-radius: 20px; border: 1px solid var(--danger-border);">Cancelled</span>`;
                dotColor = '#ef4444';
                break;
        }

        // Calculate expected arrival date or scheduled pickup countdown
        let dateMsg = '';
        if (sim.status === 'applied') {
            const appliedDate = sim.appliedAt?.toDate ? sim.appliedAt.toDate() : new Date();
            const expectedDate = new Date(appliedDate);
            expectedDate.setDate(expectedDate.getDate() + 32); // Average of 30-35 days
            const daysLeft = Math.ceil((expectedDate - new Date()) / (1000 * 60 * 60 * 24));
            
            if (daysLeft > 0) {
                dateMsg = `<span style="font-size: 0.75rem; font-weight: 600; color: var(--text-secondary);">⏳ Expected in ~${daysLeft} days (${expectedDate.toLocaleDateString('en-GB', {day: 'numeric', month:'short'})})</span>`;
            } else {
                dateMsg = `<span style="font-size: 0.75rem; font-weight: 700; color: #f59e0b;">⏳ Pending pickup (overdue)</span>`;
            }
        } else if (sim.status === 'scheduled' && sim.followUpDate) {
            const days = getDaysDifference(sim.followUpDate);
            const dateStr = formatDate(sim.followUpDate);
            if (days === 0) {
                dateMsg = `<span style="font-size: 0.75rem; font-weight: 800; color: #7c3aed;">🔔 Scheduled pickup is TODAY (${dateStr})</span>`;
            } else if (days > 0) {
                dateMsg = `<span style="font-size: 0.75rem; font-weight: 600; color: var(--purple-text);">🗓️ Pickup scheduled in ${days} days (${dateStr})</span>`;
            } else {
                dateMsg = `<span style="font-size: 0.75rem; font-weight: 800; color: #ef4444;">⚠️ Overdue pickup by ${Math.abs(days)} days (${dateStr})</span>`;
            }
        } else if (sim.status === 'completed' && sim.completedAt) {
            dateMsg = `<span style="font-size: 0.75rem; font-weight: 600; color: var(--text-secondary);">Sold on ${formatTimestamp(sim.completedAt)}</span>`;
        } else {
            dateMsg = `<span style="font-size: 0.75rem; font-weight: 600; color: var(--text-secondary);">Registered on ${formatTimestamp(sim.appliedAt)}</span>`;
        }

        let detailNotes = sim.notes ? `<div class="rate-note-banner" style="margin-top: 4px; border-left-color: ${dotColor};">💬 ${sim.notes}</div>` : '';
        
        let callButton = '';
        if (sim.alternativeNumber) {
            callButton = `
                <a href="tel:${sim.alternativeNumber}" onclick="event.stopPropagation();" class="recycle-call-action-btn" title="Call Customer">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                </a>
            `;
        }

        html += `
            <div class="recycle-card" onclick="Amolnama.openUpdateRecycleStatusModal('${sim.id}')">
                <!-- Card Header -->
                <div class="recycle-card-header">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div class="hub-menu-icon-wrapper" style="width: 32px; height: 32px; border-radius: 8px; background: ${dotColor}0c; color: ${dotColor}; display: flex; align-items: center; justify-content: center;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/></svg>
                        </div>
                        <span class="recycle-phone-num">${sim.recycledNumber}</span>
                    </div>
                    ${statusBadge}
                </div>

                <!-- Card Grid Info -->
                <div class="recycle-card-grid">
                    <div class="recycle-grid-item">
                        <span class="recycle-grid-label">Alternative Contact</span>
                        <span class="recycle-grid-val mono">${sim.alternativeNumber || 'N/A'}</span>
                    </div>
                    <div class="recycle-grid-item">
                        <span class="recycle-grid-label">Registered Agent</span>
                        <span class="recycle-grid-val">${sim.appliedBy || 'System'}</span>
                    </div>
                </div>

                <!-- Notes Banner (If any) -->
                ${detailNotes}

                <!-- Card Footer (Countdown & Call Action) -->
                <div class="recycle-card-footer">
                    <div style="display: flex; align-items: center; gap: 6px;">
                        ${dateMsg}
                    </div>
                    ${callButton}
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

export function filterRecycleList() {
    renderRecycleList();
}

export function filterRecycleByStatus(status, pill) {
    activeFilterStatus = status;
    document.querySelectorAll('#modal-recycle-tracker .store-pill').forEach(p => p.classList.remove('active'));
    if (pill) pill.classList.add('active');
    renderRecycleList();
}

// Add Application
export function openAddRecycleModal() {
    document.getElementById('add-recycle-number').value = '';
    document.getElementById('add-recycle-alt').value = '';
    document.getElementById('add-recycle-notes').value = '';
    openModal('modal-add-recycle-sim');
}

export async function submitRecycleApplication() {
    const numberEl = document.getElementById('add-recycle-number');
    const altEl = document.getElementById('add-recycle-alt');
    const notesEl = document.getElementById('add-recycle-notes');

    const number = numberEl.value.trim();
    const alt = altEl.value.trim();
    const notes = notesEl.value.trim();

    if (!number || !alt) {
        showAppAlert("Missing Input", "Both Recycled Number and Alternative Contact Number are required.");
        return;
    }

    // Basic Validation: must be valid mobile numbers (e.g. 11 digits)
    const mobileRegex = /^01[3-9]\d{8}$/;
    if (!mobileRegex.test(number)) {
        showAppAlert("Invalid Number", "The recycled SIM number must be a valid 11-digit mobile number starting with 01.");
        return;
    }
    if (!mobileRegex.test(alt)) {
        showAppAlert("Invalid Number", "The alternative contact number must be a valid 11-digit mobile number starting with 01.");
        return;
    }

    const docData = {
        recycledNumber: number,
        alternativeNumber: alt,
        notes: notes,
        status: 'applied',
        appliedBy: AppState.userNickname || AppState.userDisplayName,
        appliedById: AppState.currentUser?.uid || '',
        appliedAt: serverTimestamp(),
        updatedBy: AppState.userNickname || AppState.userDisplayName,
        updatedById: AppState.currentUser?.uid || '',
        updatedAt: serverTimestamp(),
        history: [{
            status: 'applied',
            timestamp: new Date().toISOString(),
            by: AppState.userNickname || AppState.userDisplayName,
            note: 'Recycle SIM entry created.'
        }]
    };

    try {
        await addDoc(collection(db, 'recycle_sims'), docData);
        closeModal('modal-add-recycle-sim');
        showFlashMessage("Recycle SIM entry saved!");
    } catch (e) {
        console.error("Error creating recycle SIM record:", e);
        showAppAlert("Database Error", "Failed to save recycle entry. Check rules/connection.");
    }
}

// Update Status Modal
export function openUpdateRecycleStatusModal(id) {
    const sim = recycleSimsList.find(s => s.id === id);
    if (!sim) return;

    document.getElementById('status-update-id').value = id;
    document.getElementById('status-update-title').innerText = "Update Status";
    document.getElementById('status-update-number').innerText = `Recycle SIM: ${sim.recycledNumber} (Alt: ${sim.alternativeNumber})`;
    document.getElementById('status-update-select').value = sim.status;
    document.getElementById('status-update-note').value = '';
    
    const dateInput = document.getElementById('status-update-date');
    if (sim.followUpDate) {
        dateInput.value = sim.followUpDate;
    } else {
        // Default tomorrow
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        dateInput.value = tomorrow.toISOString().split('T')[0];
    }

    onRecycleStatusChangeSelect();
    
    const deleteBtn = document.getElementById('btn-delete-recycle-sim');
    if (deleteBtn) {
        deleteBtn.style.display = ['admin', 'owner'].includes(AppState.currentUserRole) ? 'block' : 'none';
    }

    openModal('modal-recycle-status-update');
}

export function onRecycleStatusChangeSelect() {
    const selectVal = document.getElementById('status-update-select').value;
    const dateWrapper = document.getElementById('status-update-date-wrapper');
    if (dateWrapper) {
        dateWrapper.style.display = selectVal === 'scheduled' ? 'block' : 'none';
    }
}

export async function saveRecycleStatusUpdate() {
    const id = document.getElementById('status-update-id').value;
    const newStatus = document.getElementById('status-update-select').value;
    const followUpDate = document.getElementById('status-update-date').value;
    const note = document.getElementById('status-update-note').value.trim();

    const sim = recycleSimsList.find(s => s.id === id);
    if (!sim) return;

    const timestamp = new Date().toISOString();
    const agentName = AppState.userNickname || AppState.userDisplayName;

    const historyItem = {
        status: newStatus,
        timestamp: timestamp,
        by: agentName,
        note: note || `Status changed from ${sim.status} to ${newStatus}.`
    };

    const updateData = {
        status: newStatus,
        updatedBy: agentName,
        updatedById: AppState.currentUser?.uid || '',
        updatedAt: serverTimestamp(),
        history: [...(sim.history || []), historyItem]
    };

    if (newStatus === 'scheduled') {
        if (!followUpDate) {
            showAppAlert("Missing Input", "Please select a follow-up/pickup date.");
            return;
        }
        updateData.followUpDate = followUpDate;
    } else {
        // If status changed from scheduled, delete followUpDate
        updateData.followUpDate = null;
    }

    if (newStatus === 'completed') {
        updateData.completedAt = serverTimestamp();
        
        // INTERACTIVE BRIDGE: Ask if they want to log the sale transaction now
        closeModal('modal-recycle-status-update');
        
        showAppAlert("Log Sale", `Would you like to log the sale of Recycle SIM ${sim.recycledNumber} to today's ledger?`, true, () => {
            // Open Checkout Modal
            openRecycleSaleCheckoutForSIM(sim.id);
        }, "Log Sale");
    }

    try {
        await updateDoc(doc(db, 'recycle_sims', id), updateData);
        if (newStatus !== 'completed') {
            closeModal('modal-recycle-status-update');
        }
        showFlashMessage("Status updated successfully!");
    } catch (e) {
        console.error("Error updating status:", e);
        showAppAlert("Save Failed", "Could not update status in cloud.");
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
    // When click Recycle SIM in Store catalog:
    // Open select modal
    populateStoreRecycleSaleOptions();
    openModal('modal-select-recycle-sim');
}

export function populateStoreRecycleSaleOptions() {
    const select = document.getElementById('recycle-select-sale-number');
    if (!select) return;

    // Filter SIMs with status 'arrived' or 'scheduled'
    const eligibleSims = recycleSimsList.filter(sim => ['arrived', 'scheduled'].includes(sim.status));

    let html = '';
    eligibleSims.forEach(sim => {
        html += `<option value="${sim.id}">${sim.recycledNumber}</option>`;
    });

    // Add direct untracked option
    html += `<option value="untracked">-- Untracked/Direct Sale --</option>`;

    select.innerHTML = html;
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

    const select = document.getElementById('recycle-select-sale-number');
    if (select) {
        select.value = simId;
        onSelectRecycleSaleNumberChange();
    }
    openModal('modal-select-recycle-sim');
}

export async function confirmRecycleSimSale() {
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
        const manualNum = document.getElementById('recycle-sale-untracked-number').value.trim();
        if (!manualNum) {
            showAppAlert("Missing Input", "Please enter the Recycled SIM Number.");
            return;
        }
        const mobileRegex = /^01[3-9]\d{8}$/;
        if (!mobileRegex.test(manualNum)) {
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

    const catalogItem = AppState.globalCatalog["sim_recycle"] || { name: 'Recycle SIM', price: 400 };
    const price = catalogItem.price || 400;
    const note = `Recycle SIM: ${finalRecycleNumber}`;

    // Prompt onboarding before saving
    if (typeof window.Amolnama?.promptSimOnboarding === 'function') {
        window.Amolnama.promptSimOnboarding(catalogItem.name, async (firstCall, appReg) => {
            if (firstCall === null) {
                showFlashMessage("Sale aborted.");
                return;
            }

            // 1. Log transaction in cloud with onboarding
            addTransactionToCloudWithRecycleDetails('Item', catalogItem.name, price, 1, payment, note, { firstCall, appReg });

            // 2. Update status of the tracking SIM to Completed
            if (simId) {
                const sim = recycleSimsList.find(s => s.id === simId);
                const timestamp = new Date().toISOString();
                const agentName = AppState.userNickname || AppState.userDisplayName;

                const historyItem = {
                    status: 'completed',
                    timestamp: timestamp,
                    by: agentName,
                    note: 'Completed via direct Store Checkout sale.'
                };

                const updateData = {
                    status: 'completed',
                    completedAt: serverTimestamp(),
                    updatedBy: agentName,
                    updatedById: AppState.currentUser?.uid || '',
                    updatedAt: serverTimestamp(),
                    history: [...(sim.history || []), historyItem]
                };

                try {
                    await updateDoc(doc(db, 'recycle_sims', simId), updateData);
                } catch (e) {
                    console.error("Error updating recycle status to completed:", e);
                }
            }

            closeModal('modal-select-recycle-sim');
            showFlashMessage(`Logged Recycle SIM (${finalRecycleNumber}) Sale!`);
        });
    } else {
        // Fallback
        addTransactionToCloudWithRecycleDetails('Item', catalogItem.name, price, 1, payment, note, { firstCall: false, appReg: false });
        if (simId) {
            const sim = recycleSimsList.find(s => s.id === simId);
            const timestamp = new Date().toISOString();
            const agentName = AppState.userNickname || AppState.userDisplayName;

            const historyItem = {
                status: 'completed',
                timestamp: timestamp,
                by: agentName,
                note: 'Completed via direct Store Checkout sale.'
            };

            const updateData = {
                status: 'completed',
                completedAt: serverTimestamp(),
                updatedBy: agentName,
                updatedById: AppState.currentUser?.uid || '',
                updatedAt: serverTimestamp(),
                history: [...(sim.history || []), historyItem]
            };

            try {
                await updateDoc(doc(db, 'recycle_sims', simId), updateData);
            } catch (e) {
                console.error("Error updating recycle status to completed:", e);
            }
        }
        closeModal('modal-select-recycle-sim');
        showFlashMessage(`Logged Recycle SIM (${finalRecycleNumber}) Sale!`);
    }
}

// Special wrapper to ensure note field is populated with the recycle number
function addTransactionToCloudWithRecycleDetails(type, name, amount, qty, payment, notesStr, onboarding = null) {
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

