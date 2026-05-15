// src/features/admin.js
import { collection, doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, query, where, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from '../config/firebase.js';
import { AppState } from '../core/state.js';
import { getStrictDate, formatToGBDate, generateReceiptNo } from '../utils/helpers.js';
import { showAppAlert, showFlashMessage, openModal, closeModal } from '../utils/ui-helpers.js';
import { getPhysicalItems, getInventoryChange } from './inventory.js';

// ==========================================
//   ADMIN CATALOG & INVENTORY SETTINGS
// ==========================================
export function filterAdminCatalog() {
    let text = document.getElementById('admin-search').value.toLowerCase();
    document.querySelectorAll('.admin-row-card').forEach(row => { row.style.display = row.querySelector('.i-name').value.toLowerCase().includes(text) ? 'flex' : 'none'; });
}

export function toggleAddForm() { 
    let f = document.getElementById('admin-add-form'); 
    f.style.display = f.style.display === 'none' ? 'block' : 'none'; 
}

export function renderInventoryGroupsAdmin() {
    let html = '';
    AppState.globalInventoryGroups.forEach((group, index) => {
        html += `<span style="background: #f1f5f9; border: 1px solid #cbd5e1; padding: 4px 10px; border-radius: 16px; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 6px;">
            ${group} <button style="background: none; border: none; color: #ef4444; font-weight: bold; cursor: pointer;" onclick="removeInventoryGroup(${index})">✕</button>
        </span>`;
    });
    document.getElementById('admin-inventory-groups').innerHTML = html;
    populateTrackAsDropdowns();
}

export function addInventoryGroup() {
    let val = document.getElementById('new-inv-group-name').value.trim();
    if (val && !AppState.globalInventoryGroups.includes(val)) {
        AppState.globalInventoryGroups.push(val);
        document.getElementById('new-inv-group-name').value = '';
        renderInventoryGroupsAdmin();
        openSettings(); 
    }
}

export function removeInventoryGroup(index) {
    showAppAlert("Confirm Removal", "Remove this physical item from the Master List? Menu buttons tied to it will need to be reassigned.", true, () => {
        AppState.globalInventoryGroups.splice(index, 1);
        renderInventoryGroupsAdmin();
        openSettings();
    });
}

function populateTrackAsDropdowns() {
    let newSelect = document.getElementById('new-item-track');
    if(newSelect) {
        let options = '<option value="">None (Digital/Service)</option>';
        AppState.globalInventoryGroups.forEach(g => options += `<option value="${g}">${g}</option>`);
        newSelect.innerHTML = options;
    }
}

export function openSettings() {
    let container = document.getElementById('settings-list-container');
    container.innerHTML = ''; document.getElementById('admin-search').value = ''; document.getElementById('admin-add-form').style.display = 'none';
    
    renderInventoryGroupsAdmin();
    renderUserManagementAdmin(); 

    const categories = [
        { id: 'new-sim', title: 'New SIMs', color: '#10b981' },
        { id: 'paid-rep', title: 'Paid Replacements', color: '#f59e0b' },
        { id: 'foc', title: 'Free of Cost', color: '#0ea5e9' },
        { id: 'service', title: 'Services', color: '#8b5cf6' },
        { id: 'free-action', title: 'Free Actions', color: '#64748b' }
    ];

    let activeItems = Object.entries(AppState.globalCatalog).map(([key, item]) => ({key, ...item})).filter(i => i.isActive).sort((a, b) => (a.order || 0) - (b.order || 0));

    categories.forEach(cat => {
        let catItems = activeItems.filter(i => i.cat === cat.id);
        if(catItems.length > 0) {
            let catHeader = document.createElement('div');
            catHeader.className = 'admin-group-title';
            catHeader.style.color = cat.color;
            catHeader.innerText = cat.title;
            container.appendChild(catHeader);

            catItems.forEach(item => {
                let trackOptions = '<option value="">None (Digital/Service)</option>';
                AppState.globalInventoryGroups.forEach(g => {
                    let sel = (item.trackAs === g) ? 'selected' : '';
                    trackOptions += `<option value="${g}" ${sel}>${g}</option>`;
                });
                
                let userCurrency = 'Tk';
                let row = document.createElement('div'); row.className = 'admin-row-card admin-row'; row.setAttribute('data-key', item.key);
                row.innerHTML = `
                    <div class="admin-row-header">
                        <span class="drag-handle">⋮⋮</span>
                        <input type="text" class="settings-input i-name" style="flex:1; border:none; background:transparent; font-weight:700; color:#0f172a; padding:0; min-width:0;" value="${item.name}">
                        <button class="delete-btn" style="color: #ef4444; padding: 4px 8px; font-size: 1.1rem; flex-shrink: 0;" onclick="removeRow(this)">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                        </button>
                    </div>
                    <div class="admin-row-body">
                        <div><label class="admin-label">Price (${userCurrency})</label><input type="number" class="settings-input i-price" style="padding: 10px; width: 100%; box-sizing: border-box;" value="${item.price}"></div>
                        <div>
                            <label class="admin-label">Category</label>
                            <select class="settings-input i-cat" style="padding: 10px; width: 100%; box-sizing: border-box;">
                                <option value="new-sim" ${item.cat==='new-sim'?'selected':''}>New SIM</option>
                                <option value="paid-rep" ${item.cat==='paid-rep'?'selected':''}>Paid Rep</option>
                                <option value="foc" ${item.cat==='foc'?'selected':''}>FOC</option>
                                <option value="service" ${item.cat==='service'?'selected':''}>Service</option>
                                <option value="free-action" ${item.cat==='free-action'?'selected':''}>Free Action</option>
                            </select>
                        </div>
                        <div style="grid-column: span 2;">
                            <label class="admin-label">Deducts from Physical Inventory:</label>
                            <select class="settings-input i-track" style="padding: 10px; width: 100%; box-sizing: border-box;">
                                ${trackOptions}
                            </select>
                        </div>
                        <div style="grid-column: span 2; display: flex; align-items: center; gap: 8px; margin-top: 4px;">
                            <input type="checkbox" class="i-manager-only" id="mgr_${item.key}" ${item.managerOnly ? 'checked' : ''} style="width: 18px; height: 18px; cursor: pointer;">
                            <label for="mgr_${item.key}" class="admin-label" style="margin: 0; color: #ef4444; font-weight: 700; cursor: pointer;">🔒 Restricted (Center Manager Only)</label>
                        </div>
                    </div>
                `;
                container.appendChild(row); setupDragAndDrop(row); 
            });
        }
    });
    if (typeof window.initCustomDropdowns === 'function') window.initCustomDropdowns();
    openModal('modal-settings');
}

let draggedEl = null;
function setupDragAndDrop(row) {
    const handle = row.querySelector('.drag-handle'); row.setAttribute('draggable', 'true');
    row.addEventListener('dragstart', () => { draggedEl = row; setTimeout(() => row.style.opacity = '0.5', 0); });
    row.addEventListener('dragend', () => { draggedEl.style.opacity = '1'; draggedEl = null; });
    row.addEventListener('dragover', (e) => { e.preventDefault(); if (!draggedEl || draggedEl === row) return; const box = row.getBoundingClientRect(); const offset = e.clientY - box.top - box.height / 2; if (offset > 0) row.parentNode.insertBefore(draggedEl, row.nextSibling); else row.parentNode.insertBefore(draggedEl, row); });
    handle.addEventListener('touchstart', () => { draggedEl = row; row.style.opacity = '0.5'; row.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; }, { passive: true });
    handle.addEventListener('touchmove', (e) => { if (!draggedEl) return; e.preventDefault(); const touch = e.touches[0]; const target = document.elementFromPoint(touch.clientX, touch.clientY); const targetRow = target ? target.closest('.admin-row') : null; if (targetRow && targetRow !== draggedEl) { const box = targetRow.getBoundingClientRect(); const offset = touch.clientY - box.top - box.height / 2; if (offset > 0) targetRow.parentNode.insertBefore(draggedEl, targetRow.nextSibling); else targetRow.parentNode.insertBefore(draggedEl, targetRow); } }, { passive: false });
    handle.addEventListener('touchend', () => { if(!draggedEl) return; draggedEl.style.opacity = '1'; draggedEl.style.boxShadow = 'none'; draggedEl = null; });
}

export function removeRow(btn) { 
    showAppAlert("Delete Item", "Are you sure you want to delete this menu button?", true, () => {
        let row = btn.closest('.admin-row'); row.style.display = 'none'; row.classList.add('deleted-row'); 
    });
}

export function addNewItem() {
    let nameVal = document.getElementById('new-item-name').value.trim();
    let priceVal = parseFloat(document.getElementById('new-item-price').value);
    let catVal = document.getElementById('new-item-category').value;
    let trackVal = document.getElementById('new-item-track').value;

    if (nameVal && !isNaN(priceVal) && priceVal >= 0) {
        let newKey = "item_" + Date.now(); let newOrder = Object.keys(AppState.globalCatalog).length + 1;
        AppState.globalCatalog[newKey] = { name: nameVal, display: nameVal, price: priceVal, cat: catVal, trackAs: trackVal, isActive: true, order: newOrder };
        document.getElementById('new-item-name').value = ''; document.getElementById('new-item-price').value = '';
        if (typeof window.renderAppUI === 'function') window.renderAppUI(); 
        openSettings(); showFlashMessage("Item Added! Click Save to publish.");
    } else showAppAlert("Error", "Please enter a valid name and price.");
}

export async function saveSettings() {
    if(!AppState.currentUser) return;
    let orderCounter = 1;
    document.querySelectorAll('.admin-row').forEach(row => {
        let key = row.getAttribute('data-key');
        if (AppState.globalCatalog[key]) {
            if (row.classList.contains('deleted-row')) AppState.globalCatalog[key].isActive = false; 
            else {
                AppState.globalCatalog[key].name = row.querySelector('.i-name').value;
                AppState.globalCatalog[key].display = row.querySelector('.i-name').value; 
                AppState.globalCatalog[key].price = parseFloat(row.querySelector('.i-price').value) || 0;
                AppState.globalCatalog[key].cat = row.querySelector('.i-cat').value;
                AppState.globalCatalog[key].trackAs = row.querySelector('.i-track').value;
                AppState.globalCatalog[key].managerOnly = row.querySelector('.i-manager-only') ? row.querySelector('.i-manager-only').checked : false;
                AppState.globalCatalog[key].order = orderCounter++;
            }
        }
    });
    try {
        if (AppState.currentUserRole === 'admin') await setDoc(doc(db, 'global', 'settings'), { catalog: AppState.globalCatalog, inventoryGroups: AppState.globalInventoryGroups }, { merge: true });
        if (typeof window.renderAppUI === 'function') window.renderAppUI(); 
        closeModal('modal-settings'); showFlashMessage("Settings Saved & Synced!");
    } catch(e) { showAppAlert("Error", "Error saving settings."); }
}

// ==========================================
//  NICKNAME & USER MANAGEMENT
// ==========================================
export async function openNicknameManager() {
  if (AppState.currentUserRole !== 'admin') { 
    showAppAlert("Access Denied", "Only admins can manage nicknames."); 
    return; 
  }
  openModal('modal-nicknames');
  const container = document.getElementById('nickname-list-container');
    container.innerHTML = '<div class="spinner" style="margin: 0 auto; border-top-color: #0ea5e9;"></div>';
    
    try {
        const usersSnap = await getDocs(collection(db, 'users'));
        let html = '';
        usersSnap.forEach(docSnap => {
            const u = docSnap.data();
            const uid = docSnap.id;
            const userEmail = u.email || 'No email linked';
            const currentNick = u.nickname || '';
            
            html += `
                <div class="admin-form-card" style="padding: 12px; margin-bottom: 0; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <div style="flex: 1; min-width: 150px;">
                        <div style="font-size: 0.85rem; font-weight: 600; color: #0ea5e9; margin-bottom: 4px;">${userEmail}</div>
                        <input type="text" id="nick_${uid}" class="settings-input" style="padding: 8px;" placeholder="Set nickname..." value="${currentNick}">
                    </div>
                    <button class="btn-outline" style="height: auto; padding: 8px 16px; border-color: #10b981; color: #10b981; margin-top: auto;" onclick="saveAdminNickname('${uid}', 'nick_${uid}')">Save</button>
                </div>
            `;
        });
        container.innerHTML = html || '<p>No users found in database.</p>';
    } catch(e) {
        container.innerHTML = '<p style="color: #ef4444;">Error loading users.</p>';
    }
}

export async function saveAdminNickname(uid, inputId) {
    const newNick = document.getElementById(inputId).value.trim();
    try {
        await updateDoc(doc(db, 'users', uid), { nickname: newNick });
        showFlashMessage("Nickname saved!");
        
        if (uid === AppState.currentUser.uid) {
            AppState.userNickname = newNick;
            document.getElementById('report-user-name').innerText = AppState.userNickname || AppState.userDisplayName;
            if(!AppState.currentDeskId && document.getElementById('tab-ers').classList.contains('active')) {
                document.getElementById('header-title').innerText = AppState.userNickname || AppState.userDisplayName;
            }
        }
        
        if (AppState.currentDeskId && window.renderDeskDashboard) window.renderDeskDashboard(AppState.currentDeskId);
        if (document.getElementById('tab-floor').classList.contains('active') && window.renderLiveFloorTab) window.renderLiveFloorTab();
        renderUserManagementAdmin();
        
    } catch(e) { showAppAlert("Error", "Error saving nickname."); }
}

export async function renderUserManagementAdmin() {
    const container = document.getElementById('admin-user-management-list');
    if (!container) return;
    container.innerHTML = '<div class="spinner" style="width: 24px; height: 24px; border-width: 3px; margin: 0 auto; border-top-color: #f59e0b;"></div>';

    try {
        const usersSnap = await getDocs(collection(db, 'users'));
        let html = ''; let activeCount = 0;

        usersSnap.forEach(docSnap => {
            const u = docSnap.data(); const uid = docSnap.id;
            if (u.assignedDeskId) {
                activeCount++;
                const deskName = u.assignedDeskId.replace('_', ' ').toUpperCase();
                const displayName = u.nickname || u.displayName || u.email?.split('@')[0] || 'Unknown';

                html += `
                    <div style="background: #ffffff; border: 1px solid #fcd34d; padding: 12px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                        <div>
                            <strong style="color: #92400e; font-size: 0.95rem;">${displayName}</strong>
                            <div style="font-size: 0.8rem; color: #b45309;">${deskName}</div>
                        </div>
                        <div style="display: flex; gap: 6px;">
                            <button class="btn-outline" style="padding: 6px 12px; font-size: 0.8rem; height: auto; border-color: #f59e0b; color: #d97706;" onclick="kickAgent('${uid}')">Kick</button>
                            <button class="btn-outline" style="padding: 6px 12px; font-size: 0.8rem; height: auto; border-color: #ef4444; color: #ef4444; background: #fef2f2;" onclick="nukeAgent('${uid}', '${displayName}')">Nuke & Kick</button>
                        </div>
                    </div>
                `;
            }
        });
        container.innerHTML = activeCount > 0 ? html : '<p style="font-size: 0.85rem; color: #b45309; margin: 0;">No agents currently locked to a desk.</p>';
    } catch (e) { container.innerHTML = '<p style="color: #ef4444; font-size: 0.85rem;">Offline: Cannot fetch users.</p>'; }
}

export function kickAgent(uid) {
    if (AppState.currentUserRole !== 'admin') { showAppAlert("Access Denied", "Admin clearance required."); return; }
    showAppAlert("Kick Agent", "Kick this agent from their desk? Their sales data will remain intact.", true, async () => {
        try {
            await setDoc(doc(db, 'users', uid), { assignedDeskId: null, assignedDate: null }, { merge: true });
            showFlashMessage("Agent Kicked Successfully!");
            renderUserManagementAdmin();
        } catch(e) { showAppAlert("Error", "Error kicking agent."); }
    });
}

export function nukeAgent(uid, agentName) {
    if (AppState.currentUserRole !== 'admin') { showAppAlert("Access Denied", "Admin clearance required."); return; }
    showAppAlert("Burn Notice", `WARNING: You are about to kick ${agentName} AND permanently delete EVERY transaction they made today. Proceed?`, true, async () => {
        try {
            await setDoc(doc(db, 'users', uid), { assignedDeskId: null, assignedDate: null }, { merge: true });
            const targetDateStr = getStrictDate();
            const txSnap = await getDocs(query(collection(db, 'transactions'), where('agentId', '==', uid), where('dateStr', '==', targetDateStr)));
            await Promise.all(txSnap.docs.map(t => deleteDoc(doc(db, 'transactions', t.id))));
            showFlashMessage(`Agent Nixed & Data Erased!`);
            renderUserManagementAdmin();
        } catch(e) { showAppAlert("Error", "Error executing Burn Notice."); }
    }, "Nuke Data");
}

export function resetMyDeskLock() {
    showAppAlert("Release Desk", "Release your desk assignment? You will be sent back to the floor map.", true, async () => {
        try {
            await setDoc(doc(db, 'users', AppState.currentUser.uid), { assignedDeskId: null, assignedDate: null }, { merge: true });
            window.location.reload();
        } catch(e) { showAppAlert("Error", "Could not release desk lock."); }
    });
}

export function forceCloseAllDesks() {
    if (AppState.currentUserRole !== 'admin') { showAppAlert("Access Denied", "Admin clearance required."); return; }
    showAppAlert("Force Close All", "FORCE CLOSE ALL DESKS? This will instantly log out every agent on the floor.", true, async () => {
        try {
            const snap = await getDocs(collection(db, 'desks'));
            await Promise.all(snap.docs.map(d => setDoc(doc(db, 'desks', d.id), { status: 'closed', currentSessionId: null }, { merge: true })));
            const sSnap = await getDocs(query(collection(db, 'sessions'), where('status', '==', 'open')));
            await Promise.all(sSnap.docs.map(s => updateDoc(doc(db, 'sessions', s.id), { status: 'closed', closedBy: 'Admin Override' })));
            window.location.reload();
        } catch(e) { showAppAlert("Error", "Could not force close desks."); }
    }, "Force Close");
}

export function nukeTodaysLedger() {
    if (AppState.currentUserRole !== 'admin') { showAppAlert("Access Denied", "Admin clearance required."); return; }
    showAppAlert("Delete Ledger", "PERMANENTLY DELETE TODAY'S LEDGER? This cannot be undone!", true, async () => {
        try {
            const targetDateStr = getStrictDate();
            const snap = await getDocs(query(collection(db, 'transactions'), where('dateStr', '==', targetDateStr)));
            await Promise.all(snap.docs.map(t => deleteDoc(doc(db, 'transactions', t.id))));
            window.location.reload();
        } catch(e) { showAppAlert("Error", "Could not delete the ledger."); }
    }, "Delete Entire Ledger");
}

export function fixPastManagerDrops() {
    if (AppState.currentUserRole !== 'admin') { showAppAlert("Access Denied", "Admin clearance required."); return; }
    showAppAlert("Fix Drops", "Fix past 0 Tk Manager Drops in the database?", true, async () => {
        try {
            const q = query(collection(db, 'transactions'), where('type', '==', 'adjustment'));
            const snap = await getDocs(q);
            let count = 0;
            
            for (const docSnap of snap.docs) {
                let tx = docSnap.data();
                if (tx.name === 'Physical Cash' && tx.amount === 0 && tx.cashAmt !== 0) {
                    await updateDoc(doc(db, 'transactions', docSnap.id), { amount: Math.abs(tx.cashAmt), qty: 1 });
                    count++;
                }
            }
            showAppAlert("Success", `Successfully fixed ${count} past manager drop(s)! Reloading...`, false, () => {
                window.location.reload();
            }, "Got it");
        } catch (e) {
            showAppAlert("Error", "Error fixing drops: " + e.message);
        }
    }, "Run Fix");
}

// ==========================================
//   ADMIN AUDIT LOGS
// ==========================================

export function openAuditModal() {
    openModal('modal-audit');
    const t = new Date(); 
    document.getElementById('audit-date').value = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
    fetchAuditLogs();
}

export async function fetchAuditLogs() {
    let val = document.getElementById('audit-date').value;
    if(!val) return;
    let targetDateStr = formatToGBDate(val);
    let container = document.getElementById('audit-results');
    container.innerHTML = '<div class="spinner" style="margin: 20px auto; border-top-color: #f59e0b;"></div>';

    try {
        const snap = await getDocs(query(collection(db, 'sessions'), where('dateStr', '==', targetDateStr)));
        if(snap.empty) { container.innerHTML = '<p class="placeholder-text">No closed sessions found for this date.</p>'; return; }

        let html = '';
        snap.forEach(docSnap => {
            let s = docSnap.data();
            if (s.status !== 'closed' && s.status !== 'pending') return;

            let vColor = s.variance < 0 ? '#ef4444' : (s.variance > 0 ? '#22c55e' : '#64748b');
            let vText = s.variance < 0 ? `Shortage: ${s.variance} Tk` : (s.variance > 0 ? `Overage: +${s.variance} Tk` : 'Perfectly Balanced');

            html += `
                <div class="admin-form-card" style="padding: 16px; margin-bottom: 0; border-left: 4px solid ${vColor};">
                    <div style="display:flex; justify-content:space-between; margin-bottom: 12px; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px;">
                        <h4 style="margin:0; color:#0f172a; font-size: 1.1rem;">${(s.deskId || 'Unknown').replace('_',' ').toUpperCase()}</h4>
                        <span style="font-size:0.8rem; color:#64748b; font-weight: 600;">Closed by: ${s.closedBy || 'Unknown'}</span>
                    </div>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.85rem; color: #475569; margin-bottom: 12px;">
                        <div>Morning Open: <strong style="color: #0f172a;">${s.openingBalances?.cash || 0} Tk</strong></div>
                        <div>Mid-Day Drop: <strong style="color: #0ea5e9;">${s.managerDrop || 0} Tk</strong></div>
                        <div>Expected Cash: <strong style="color: #10b981;">${s.expectedClosing?.cash || 0} Tk</strong></div>
                        <div>Actual Count: <strong style="color: #0f172a;">${s.actualClosing?.cash || 0} Tk</strong></div>
                    </div>
                    <div style="padding-top: 12px; border-top: 1px dashed #e2e8f0; font-weight: bold; font-size: 0.95rem; color: ${vColor}; text-align: center;">
                        ${vText}
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
    } catch(e) { container.innerHTML = `<p style="color:#ef4444;">Error loading logs.</p>`; }
}

// ==========================================
//   ADMIN FORCE REALLOCATE & VAULT ACTIONS
// ==========================================
export async function openForceReallocate() {
    if (!navigator.onLine) { showAppAlert("Offline", "Admin tools require an active internet connection."); return; }
    
    let itemSelect = document.getElementById('force-transfer-item');
    itemSelect.innerHTML = '';
    getPhysicalItems().forEach(itemName => {
        let opt = document.createElement('option'); opt.value = itemName; opt.innerText = itemName;
        itemSelect.appendChild(opt);
    });

    document.getElementById('force-transfer-qty').value = '';
    openModal('modal-admin-reallocate');

    try {
        const desksSnap = await getDocs(collection(db, 'desks'));
        let fromHTML = '<option value="">-- Select Source Desk --</option>';
        fromHTML += `<option value="main_vault">Main Vault (Center Stock)</option>`;
        
        desksSnap.forEach(docSnap => {
            let d = docSnap.data();
            let displayName = d.name || docSnap.id.replace('_', ' ').toUpperCase();
            fromHTML += `<option value="${docSnap.id}">${displayName}</option>`;
        });
        document.getElementById('force-transfer-from').innerHTML = fromHTML;

        const activeSnap = await getDocs(query(collection(db, 'sessions'), where('status', '==', 'open')));
        let toHTML = '<option value="">-- Select Active Destination --</option>';
        activeSnap.forEach(docSnap => {
            let s = docSnap.data();
            let agentFirstName = s.openedBy ? s.openedBy.split(' ')[0] : 'Agent';
            let displayName = s.deskId.startsWith('personal_') ? `${agentFirstName}'s Drawer` : s.deskId.replace('_', ' ').toUpperCase();
            
            toHTML += `<option value="${s.deskId}|${docSnap.id}">${displayName}</option>`;
        });
        document.getElementById('force-transfer-to').innerHTML = toHTML || '<option value="">No other desks open</option>';

    } catch(e) { 
        console.error("Error loading reallocation targets:", e); 
        document.getElementById('force-transfer-from').innerHTML = '<option value="">Database Error</option>';
    }
}

export async function executeForceTransfer() {
    if (AppState.currentUserRole !== 'admin') { showAppAlert("Access Denied", "Admin clearance required."); return; }
    
    let qty = parseInt(document.getElementById('force-transfer-qty').value) || 0;
    if (qty <= 0) { showAppAlert("Invalid Input", "Enter a valid quantity to transfer."); return; }

    let fromVal = document.getElementById('force-transfer-from').value;
    let toVal = document.getElementById('force-transfer-to').value;
    let itemName = document.getElementById('force-transfer-item').value;

    if (!fromVal || !toVal) { showAppAlert("Missing Targets", "Please select both a Source and a Destination."); return; }
    
    let [toDeskId, toSessionId] = toVal.split('|');
    if (fromVal === toDeskId) { showAppAlert("Error", "Source and Destination cannot be the same."); return; }

    let fromSelect = document.getElementById('force-transfer-from');
    let toSelect = document.getElementById('force-transfer-to');
    let fromName = fromSelect.options[fromSelect.selectedIndex].text;
    let toName = toSelect.options[toSelect.selectedIndex].text;

    let timeStr = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    let dateStr = getStrictDate();
    let receiptStr = "ADMIN-" + generateReceiptNo();

    const senderTx = { id: Date.now(), receiptNo: receiptStr, type: 'transfer_out', name: itemName, trackAs: itemName, amount: 0, qty: qty, payment: `Admin Reallocated to ${toName}`, cashAmt: 0, mfsAmt: 0, isDeleted: false, time: timeStr, dateStr: dateStr, deskId: fromVal, sessionId: `admin_override_${dateStr}`, agentId: AppState.currentUser.uid, agentName: `Admin (${AppState.userNickname || AppState.userDisplayName})`, timestamp: serverTimestamp() };
    
    const receiverTx = { id: Date.now() + 1, receiptNo: receiptStr, type: 'transfer_in', name: itemName, trackAs: itemName, amount: 0, qty: qty, payment: `Admin Reallocated from ${fromName}`, cashAmt: 0, mfsAmt: 0, isDeleted: false, time: timeStr, dateStr: dateStr, deskId: toDeskId, sessionId: toSessionId, agentId: AppState.currentUser.uid, agentName: `Admin (${AppState.userNickname || AppState.userDisplayName})`, isRemoteTransfer: true, timestamp: serverTimestamp() };

    try {
        const batch = writeBatch(db);
        batch.set(doc(collection(db, 'transactions')), senderTx);
        batch.set(doc(collection(db, 'transactions')), receiverTx);
        
        await batch.commit();
        closeModal('modal-admin-reallocate');
        showFlashMessage(`Successfully pulled ${qty}x ${itemName} from ${fromName}`);
    } catch(e) {
        showAppAlert("Transfer Failed", "Could not complete admin transfer. No stock was moved.");
        console.error(e);
    }
}

export async function healTodaysOpeningStock() {
    if (AppState.currentUserRole !== 'admin') { showAppAlert("Access Denied", "Admin clearance required."); return; }
    if (!navigator.onLine) { showAppAlert("Offline", "You must be online to heal the database."); return; }

    showAppAlert("Sync Today's Stock", "This will securely recalculate today's starting stock from your last open day (e.g., Thursday) WITHOUT deleting any live transactions. Proceed?", true, async () => {
        const todayStr = getStrictDate();
        showFlashMessage("Recalculating stock... Please wait.");
        
        try {
            // 1. Get all of today's active sessions
            const todaysSessionsSnap = await getDocs(query(collection(db, 'sessions'), where('dateStr', '==', todayStr)));

            for (const docSnap of todaysSessionsSnap.docs) {
                const todaySessionId = docSnap.id;
                const deskId = docSnap.data().deskId;

                // 2. Fetch all past sessions for this specific desk
                const pastSnap = await getDocs(query(collection(db, 'sessions'), where('deskId', '==', deskId)));

                let latestPastDateStr = '';
                let maxTime = -1; 

                // 3. Find the most recent date BEFORE today
                pastSnap.forEach(pSnap => {
                    let s = pSnap.data();
                    if (s.dateStr && s.dateStr !== todayStr) {
                        let t = (s.openedAt && typeof s.openedAt.toMillis === 'function') ? s.openedAt.toMillis() : 0;
                        if (t === 0) {
                            let parts = s.dateStr.split('/');
                            if (parts.length === 3) {
                                t = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T00:00:00`).getTime();
                            }
                        }

                        if (t > maxTime) {
                            maxTime = t;
                            latestPastDateStr = s.dateStr;
                        }
                    }
                });

                if (latestPastDateStr) {
                    let earliestTime = Infinity;
                    let trueOpeningInv = {};

                    // 4. Find the EARLIEST session on that past date to get its starting stock
                    pastSnap.forEach(pSnap => {
                        let s = pSnap.data();
                        if (s.dateStr === latestPastDateStr) {
                            let t = (s.openedAt && typeof s.openedAt.toMillis === 'function') ? s.openedAt.toMillis() : 0;
                            if (t === 0) t = Date.now(); 
                            
                            if (t < earliestTime) {
                                earliestTime = t;
                                trueOpeningInv = { ...(s.openingBalances?.inventory || {}) };
                            }
                        }
                    });

                    let carryOverInv = { ...trueOpeningInv };

                    // 5. Add ALL transactions from that past date to calculate the final leftovers
                    const txSnap = await getDocs(query(collection(db, 'transactions'), where('deskId', '==', deskId), where('dateStr', '==', latestPastDateStr), where('isDeleted', '==', false)));

                    txSnap.forEach(tDoc => {
                        let tx = tDoc.data();
                        let change = getInventoryChange(tx);
                        if (change !== 0) carryOverInv[tx.trackAs] = (carryOverInv[tx.trackAs] || 0) + change;
                    });

                    // 6. Safely UPDATE today's session with the correct inventory math
                    await updateDoc(doc(db, 'sessions', todaySessionId), {
                        'openingBalances.inventory': carryOverInv
                    });
                }
            }
            
            showFlashMessage("Stock Recalculated Successfully!");
            setTimeout(() => window.location.reload(), 1500);
            
        } catch (e) {
            console.error(e);
            showAppAlert("Error", "Could not recalculate stock. Check console.");
        }
    }, "Heal Stock");
}

export async function runLedgerDiagnostic() {
    if (AppState.currentUserRole !== 'admin') { showAppAlert("Access Denied", "Admin clearance required."); return; }
    if (!AppState.currentDeskId || AppState.currentDeskId === 'sandbox') {
        showAppAlert("Error", "Please join a live desk first to run its diagnostic.");
        return;
    }

    showFlashMessage("Running diagnostic engine...");
    let log = `=== LEDGER DIAGNOSTIC ===\n`;
    log += `Date: ${getStrictDate()}\n`;
    log += `Desk: ${AppState.currentDeskId} (${AppState.currentDeskName})\n`;
    log += `Session: ${AppState.currentSessionId}\n\n`;

    try {
        log += `[ SESSIONS LOGGED TODAY ]\n`;
        const sessSnap = await getDocs(query(collection(db, 'sessions'), where('dateStr', '==', getStrictDate()), where('deskId', '==', AppState.currentDeskId)));
        
        if (sessSnap.empty) log += `  ERROR: No sessions exist for today!\n`;
        
        sessSnap.forEach(d => {
            let s = d.data();
            let tStr = (s.openedAt && typeof s.openedAt.toMillis === 'function') ? new Date(s.openedAt.toMillis()).toLocaleTimeString() : 'MISSING_TIMESTAMP';
            log += `> Session: ${d.id}\n`;
            log += `  Status: ${s.status} | Opened: ${tStr}\n`;
            log += `  Opening Cash: ${s.openingBalances?.cash || 0}\n`;
            log += `  Opening Inventory Keys: ${Object.keys(s.openingBalances?.inventory || {}).length}\n`;
            log += `  Raw Inv Data: ${JSON.stringify(s.openingBalances?.inventory || {})}\n\n`;
        });

        log += `[ TRANSACTIONS LOGGED TODAY ]\n`;
        const txSnap = await getDocs(query(collection(db, 'transactions'), where('dateStr', '==', getStrictDate()), where('deskId', '==', AppState.currentDeskId)));
        
        let txs = [];
        txSnap.forEach(d => txs.push({docId: d.id, ...d.data()}));
        txs.sort((a,b) => a.id - b.id); 

        log += `Total TX Count: ${txs.length}\n`;
        txs.forEach(t => {
            let delStr = t.isDeleted ? '[DELETED] ' : '';
            log += `  ${t.time} | ${delStr}${t.type} | ${t.name} (Qty: ${t.qty}) | Amt: ${t.amount}\n`;
        });

        const textArea = document.createElement("textarea");
        textArea.value = log;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);

        showAppAlert("Diagnostic Complete", "A raw data log has been copied to your clipboard. Please paste it to your developer.", false, null, "Got it");

    } catch (e) {
        console.error(e);
        showAppAlert("Diagnostic Failed", e.message);
    }
}