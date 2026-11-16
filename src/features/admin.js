// src/features/admin.js
import { collection, doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, query, where, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from '../config/firebase.js';
import { AppState } from '../core/state.js';
import { getStrictDate, formatToGBDate, generateReceiptNo, formatLocalISODate, escapeHtml, escapeJsSingleQuote, formatUserIdentifier } from '../utils/helpers.js';
import { showAppAlert, showFlashMessage, openModal, closeModal, refreshCustomDropdowns, setButtonLoading, markInputError, clearInputError } from '../utils/ui-helpers.js';
import { getPhysicalItems, getInventoryChange, getNormalizedTrackAs } from './inventory.js';

let isSaving = false;
let cachedUsersForManagement = [];
let activeUserRoleFilter = 'all';
let activeAdminCatalogCategory = 'all';

// ==========================================
//   ADMIN CATALOG & INVENTORY SETTINGS
// ==========================================
function syncCatalogDraftFromDom() {
    let orderCounter = 1;
    document.querySelectorAll('.admin-row').forEach(row => {
        const key = row.getAttribute('data-key');
        if (AppState.globalCatalog[key]) {
            if (row.classList.contains('deleted-row')) {
                AppState.globalCatalog[key].isActive = false;
            } else {
                const nameVal = row.querySelector('.i-name')?.value ?? AppState.globalCatalog[key].name;
                AppState.globalCatalog[key].name = nameVal;
                AppState.globalCatalog[key].display = nameVal;
                AppState.globalCatalog[key].price = parseFloat(row.querySelector('.i-price')?.value) || 0;
                AppState.globalCatalog[key].cat = row.querySelector('.i-cat')?.value || AppState.globalCatalog[key].cat;
                AppState.globalCatalog[key].trackAs = row.querySelector('.i-track')?.value ?? AppState.globalCatalog[key].trackAs;
                AppState.globalCatalog[key].managerOnly = row.querySelector('.i-manager-only') ? row.querySelector('.i-manager-only').checked : false;
                AppState.globalCatalog[key].order = orderCounter++;
            }
        }
    });
}

export function clearAdminSearch() {
    const input = document.getElementById('admin-search');
    if (input) {
        input.value = '';
        if (typeof input.focus === 'function') input.focus();
    }
    const clearBtn = document.getElementById('admin-search-clear');
    if (clearBtn) clearBtn.classList.remove('visible');
    filterAdminCatalog();
}

export function filterAdminCatalogByCategory(cat = 'all', pillEl = null) {
    activeAdminCatalogCategory = cat || 'all';
    document.querySelectorAll('#modal-settings [data-admin-cat]').forEach(p => {
        const isMatch = pillEl ? (p === pillEl) : (p.getAttribute('data-admin-cat') === activeAdminCatalogCategory);
        p.classList.toggle('active', isMatch);
        p.setAttribute('aria-pressed', isMatch ? 'true' : 'false');
    });
    filterAdminCatalog();
}

export function resetAdminCatalogFilters() {
    const input = document.getElementById('admin-search');
    if (input) input.value = '';
    const clearBtn = document.getElementById('admin-search-clear');
    if (clearBtn) clearBtn.classList.remove('visible');
    filterAdminCatalogByCategory('all');
}

export function filterAdminCatalog() {
    const input = document.getElementById('admin-search');
    const text = input ? input.value.toLowerCase().trim() : '';
    const clearBtn = document.getElementById('admin-search-clear');
    if (clearBtn) clearBtn.classList.toggle('visible', text.length > 0);

    const container = document.getElementById('settings-list-container');
    if (!container) return;

    let visibleCount = 0;
    let totalActiveCount = 0;
    const children = Array.from(container.children);
    let currentGroupHeader = null;
    let currentGroupVisibleCount = 0;

    children.forEach(el => {
        if (el.getAttribute && el.getAttribute('data-catalog-group') === 'true') {
            if (currentGroupHeader) {
                currentGroupHeader.style.display = currentGroupVisibleCount > 0 ? 'flex' : 'none';
            }
            currentGroupHeader = el;
            currentGroupVisibleCount = 0;
        } else if (el.classList && el.classList.contains('admin-row-card')) {
            if (el.classList.contains('deleted-row')) {
                el.style.display = 'none';
                return;
            }
            totalActiveCount++;
            const rowCat = el.querySelector('.i-cat')?.value || el.getAttribute('data-cat') || '';
            const matchesCat = activeAdminCatalogCategory === 'all' || rowCat === activeAdminCatalogCategory;
            const nameVal = el.querySelector('.i-name')?.value?.toLowerCase() || '';
            const trackVal = el.querySelector('.i-track')?.value?.toLowerCase() || '';
            const priceVal = String(el.querySelector('.i-price')?.value || '').toLowerCase();
            const matchesSearch = !text || nameVal.includes(text) || trackVal.includes(text) || priceVal.includes(text);
            const matches = matchesCat && matchesSearch;
            el.style.display = matches ? 'flex' : 'none';
            if (matches) {
                visibleCount++;
                currentGroupVisibleCount++;
            }
        }
    });

    if (currentGroupHeader) {
        currentGroupHeader.style.display = currentGroupVisibleCount > 0 ? 'flex' : 'none';
    }

    const isFiltered = activeAdminCatalogCategory !== 'all' || text.length > 0;
    const countBar = document.getElementById('admin-catalog-count-bar');
    if (countBar) {
        if (totalActiveCount === 0) {
            countBar.style.display = 'none';
        } else {
            countBar.style.display = 'flex';
            countBar.innerHTML = isFiltered
                ? `<span>Showing ${visibleCount} of ${totalActiveCount} catalog item${totalActiveCount === 1 ? '' : 's'}</span><button type="button" class="ledger-reset-link" onclick="Amolnama.resetAdminCatalogFilters()">Reset</button>`
                : `<span>${totalActiveCount} active catalog item${totalActiveCount === 1 ? '' : 's'}</span>`;
        }
    }

    const emptyEl = document.getElementById('admin-catalog-empty');
    if (emptyEl) {
        emptyEl.style.display = (visibleCount === 0 && isFiltered) ? 'block' : 'none';
    }
}

export function toggleAddForm() { 
    const f = document.getElementById('admin-add-form'); 
    if (!f) return;
    f.style.display = f.style.display === 'none' ? 'block' : 'none'; 
}

export function renderInventoryGroupsAdmin() {
    const groupsEl = document.getElementById('admin-inventory-groups');
    if (groupsEl) {
        if (AppState.globalInventoryGroups.length === 0) {
            groupsEl.innerHTML = `<span style="font-size: 0.8rem; color: var(--text-secondary);">No physical SKUs defined yet.</span>`;
        } else {
            let html = '';
            AppState.globalInventoryGroups.forEach((group, index) => {
                html += `<span class="admin-sku-chip">
                    ${escapeHtml(group)} 
                    <button type="button" class="admin-sku-remove-btn" onclick="removeInventoryGroup(${index})" title="Remove SKU" aria-label="Remove SKU ${escapeHtml(group)}">✕</button>
                </span>`;
            });
            groupsEl.innerHTML = html;
        }
    }
    populateTrackAsDropdowns();
}

export function addInventoryGroup() {
    const input = document.getElementById('new-inv-group-name');
    if (!input) return;
    clearInputError(input);
    const val = input.value.trim();
    if (!val) {
        markInputError(input);
        showAppAlert("Invalid Input", "Please enter a SKU name before adding.");
        return;
    }
    if (AppState.globalInventoryGroups.includes(val)) {
        markInputError(input);
        showAppAlert("Duplicate SKU", `"${val}" already exists in the Master Physical SKUs list.`);
        return;
    }
    AppState.globalInventoryGroups.push(val);
    input.value = '';
    renderInventoryGroupsAdmin();
    showFlashMessage("SKU added! Click Publish to save.");
}

export function removeInventoryGroup(index) {
    showAppAlert("Confirm Removal", "Remove this physical item from the Master List? Menu buttons tied to it will need to be reassigned.", true, () => {
        AppState.globalInventoryGroups.splice(index, 1);
        renderInventoryGroupsAdmin();
        showFlashMessage("SKU removed. Click Publish to save.");
    });
}

function buildTrackOptionsHtml(selectedVal = '') {
    let options = `<option value="" ${selectedVal === '' ? 'selected' : ''}>None (Digital/Service)</option>`;
    AppState.globalInventoryGroups.forEach(g => {
        const sel = selectedVal === g ? 'selected' : '';
        options += `<option value="${escapeHtml(g)}" ${sel}>${escapeHtml(g)}</option>`;
    });
    return options;
}

function populateTrackAsDropdowns() {
    const newSelect = document.getElementById('new-item-track');
    if (newSelect) {
        const prev = newSelect.value || '';
        newSelect.innerHTML = buildTrackOptionsHtml(prev);
        refreshCustomDropdowns(newSelect);
    }
    document.querySelectorAll('.admin-row .i-track').forEach(sel => {
        const prev = sel.value || '';
        sel.innerHTML = buildTrackOptionsHtml(prev);
        sel.value = AppState.globalInventoryGroups.includes(prev) ? prev : '';
        refreshCustomDropdowns(sel);
    });
}

export function openSettings() {
    if (AppState.currentUserRole !== 'admin') { 
        showAppAlert("Access Denied", "Admin clearance required."); 
        return; 
    }
    const container = document.getElementById('settings-list-container');
    container.innerHTML = '';
    const searchInput = document.getElementById('admin-search');
    if (searchInput) searchInput.value = '';
    const clearBtn = document.getElementById('admin-search-clear');
    if (clearBtn) clearBtn.classList.remove('visible');
    activeAdminCatalogCategory = 'all';
    document.querySelectorAll('#modal-settings [data-admin-cat]').forEach(p => {
        const isAll = p.getAttribute('data-admin-cat') === 'all';
        p.classList.toggle('active', isAll);
        p.setAttribute('aria-pressed', isAll ? 'true' : 'false');
    });
    const addForm = document.getElementById('admin-add-form');
    if (addForm) addForm.style.display = 'none';
    
    renderInventoryGroupsAdmin();
    renderUserManagementAdmin(); 
    populateAdminTransferSection();
    
    const agentsCountInput = document.getElementById('admin-transfer-agents-count');
    if (agentsCountInput) agentsCountInput.value = AppState.globalTransferAgentsCount || 6;

    const categories = [
        { id: 'new-sim', title: 'New SIMs', color: 'var(--success-text)' },
        { id: 'paid-rep', title: 'Paid Replacements', color: 'var(--warning-text)' },
        { id: 'cards', title: 'Cards', color: 'var(--purple-text)' },
        { id: 'foc', title: 'Free of Cost', color: 'var(--info-text)' },
        { id: 'service', title: 'Services', color: 'var(--accent-color)' },
        { id: 'free-action', title: 'Free Actions', color: 'var(--text-secondary)' }
    ];

    const activeItems = Object.entries(AppState.globalCatalog).map(([key, item]) => ({key, ...item})).filter(i => i.isActive).sort((a, b) => (a.order || 0) - (b.order || 0));

    categories.forEach(cat => {
        const catItems = activeItems.filter(i => i.cat === cat.id);
        if(catItems.length > 0) {
            const catHeader = document.createElement('div');
            catHeader.className = 'admin-group-title';
            catHeader.setAttribute('data-catalog-group', 'true');
            catHeader.style.color = cat.color;
            catHeader.innerText = cat.title;
            container.appendChild(catHeader);

            catItems.forEach(item => {
                const trackOptions = buildTrackOptionsHtml(item.trackAs || '');
                const userCurrency = 'Tk';
                const safeKey = escapeHtml(item.key);
                const row = document.createElement('div');
                row.className = 'admin-row-card admin-row';
                row.setAttribute('data-key', item.key);
                row.setAttribute('data-cat', item.cat || '');
                row.innerHTML = `
                    <div class="admin-row-header">
                        <span class="drag-handle" title="Drag to reorder">⋮⋮</span>
                        <input type="text" class="settings-input i-name" style="flex:1; border:none; background:transparent; font-weight:800; font-size:1.02rem; color:var(--text-primary); padding:0; min-width:0; box-shadow:none;" value="${escapeHtml(item.name)}">
                        <button type="button" class="delete-btn" style="color: var(--danger-text); padding: 6px; border-radius: 8px; font-size: 1.1rem; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: var(--danger-bg); border: 1px solid var(--danger-border);" onclick="removeRow(this)" title="Delete Item" aria-label="Delete ${escapeHtml(item.name)}">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                        </button>
                    </div>
                    <div class="admin-row-body">
                        <div style="min-width: 0;">
                            <label class="admin-label">Price (${userCurrency})</label>
                            <input type="number" class="settings-input i-price" style="padding: 10px 12px; width: 100%; box-sizing: border-box; border-radius: 12px;" value="${escapeHtml(item.price)}">
                        </div>
                        <div style="min-width: 0;">
                            <label class="admin-label">Category</label>
                            <select class="settings-input i-cat" style="padding: 10px 12px; width: 100%; box-sizing: border-box; border-radius: 12px;">
                                <option value="new-sim" ${item.cat==='new-sim'?'selected':''}>New SIM</option>
                                <option value="paid-rep" ${item.cat==='paid-rep'?'selected':''}>Paid Rep</option>
                                <option value="cards" ${item.cat==='cards'?'selected':''}>Cards</option>
                                <option value="foc" ${item.cat==='foc'?'selected':''}>FOC</option>
                                <option value="service" ${item.cat==='service'?'selected':''}>Service</option>
                                <option value="free-action" ${item.cat==='free-action'?'selected':''}>Free Action</option>
                            </select>
                        </div>
                        <div style="grid-column: 1 / -1;">
                            <label class="admin-label">Deducts from Physical Inventory:</label>
                            <select class="settings-input i-track" style="padding: 10px 12px; width: 100%; box-sizing: border-box; border-radius: 12px;">
                                ${trackOptions}
                            </select>
                        </div>
                        <div style="grid-column: 1 / -1; display: flex; align-items: center; gap: 8px; margin-top: 4px; padding-top: 8px; border-top: 1px dashed var(--border-color);">
                            <input type="checkbox" class="i-manager-only" id="mgr_${safeKey}" ${item.managerOnly ? 'checked' : ''} style="width: 18px; height: 18px; cursor: pointer; accent-color: var(--danger-text);">
                            <label for="mgr_${safeKey}" class="admin-label" style="margin: 0; color: var(--danger-text); font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                                Restricted (Center Manager Only)
                            </label>
                        </div>
                    </div>
                `;
                container.appendChild(row); setupDragAndDrop(row); 
            });
        }
    });

    const emptyNotice = document.createElement('div');
    emptyNotice.id = 'admin-catalog-empty';
    emptyNotice.className = 'empty-state';
    emptyNotice.style.display = 'none';
    emptyNotice.style.padding = '36px 16px';
    emptyNotice.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <p>No catalog items matched</p>
        <span>Try another keyword or reset the category filter to view all items.</span>
        <button type="button" class="btn-outline" style="height: auto; padding: 8px 16px; font-size: 0.82rem; margin-top: 10px;" onclick="Amolnama.resetAdminCatalogFilters()">Reset Filters</button>
    `;
    container.appendChild(emptyNotice);

    if (typeof window.initCustomDropdowns === 'function') window.initCustomDropdowns();
    refreshCustomDropdowns();
    filterAdminCatalog();
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
        const row = btn.closest('.admin-row');
        if (row) {
            row.style.display = 'none';
            row.classList.add('deleted-row');
            filterAdminCatalog();
        }
    });
}

export function addNewItem() {
    const nameInput = document.getElementById('new-item-name');
    const priceInput = document.getElementById('new-item-price');
    clearInputError(nameInput);
    clearInputError(priceInput);

    const nameVal = nameInput ? nameInput.value.trim() : '';
    const priceVal = parseFloat(priceInput ? priceInput.value : '');
    const catVal = document.getElementById('new-item-category').value;
    const trackVal = document.getElementById('new-item-track').value;

    if (!nameVal || isNaN(priceVal) || priceVal < 0) {
        if (!nameVal) markInputError(nameInput);
        if (isNaN(priceVal) || priceVal < 0) markInputError(priceInput);
        showAppAlert("Error", "Please enter a valid name and non-negative price.");
        return;
    }

    syncCatalogDraftFromDom();
    const newKey = "item_" + Date.now();
    const newOrder = Object.keys(AppState.globalCatalog).length + 1;
    AppState.globalCatalog[newKey] = { name: nameVal, display: nameVal, price: priceVal, cat: catVal, trackAs: trackVal, isActive: true, order: newOrder };
    if (nameInput) nameInput.value = '';
    if (priceInput) priceInput.value = '';
    if (typeof window.renderAppUI === 'function') window.renderAppUI(); 
    openSettings();
    showFlashMessage("Item Added! Click Publish to save.");
}

export async function saveSettings() {
    if (!AppState.currentUser) return;
    syncCatalogDraftFromDom();
    const saveBtn = document.getElementById('admin-save-settings-btn');
    setButtonLoading(saveBtn, true, 'Publishing...');
    try {
        const agentsCountInput = document.getElementById('admin-transfer-agents-count');
        if (agentsCountInput) {
            AppState.globalTransferAgentsCount = parseInt(agentsCountInput.value, 10) || 6;
        }

        if (['admin', 'owner'].includes(AppState.currentUserRole)) {
            await setDoc(doc(db, 'global', 'settings'), {
                catalog: AppState.globalCatalog,
                inventoryGroups: AppState.globalInventoryGroups,
                transferAgentsCount: AppState.globalTransferAgentsCount
            }, { merge: true });
        }
        if (typeof window.renderAppUI === 'function') window.renderAppUI(); 
        closeModal('modal-settings');
        showFlashMessage("Settings Saved & Synced!");
    } catch(e) {
        showAppAlert("Error", "Error saving settings.");
    } finally {
        setButtonLoading(saveBtn, false);
    }
}

// ==========================================
//  NICKNAME & USER MANAGEMENT
// ==========================================
function matchesRoleFilter(role, filterKey) {
    if (!filterKey || filterKey === 'all') return true;
    if (filterKey === 'user') return role === 'user';
    if (filterKey === 'managers') return role === 'manager' || role === 'center_manager';
    if (filterKey === 'admin') return role === 'admin' || role === 'owner';
    return role === filterKey;
}

export function filterUsersList() {
    renderUsersList();
}

export function clearUsersSearch() {
    const input = document.getElementById('users-search');
    if (input) {
        input.value = '';
        if (typeof input.focus === 'function') input.focus();
    }
    const clearBtn = document.getElementById('users-search-clear');
    if (clearBtn) clearBtn.classList.remove('visible');
    renderUsersList();
}

export function filterUsersByRole(roleFilter = 'all', pillEl = null) {
    activeUserRoleFilter = roleFilter || 'all';
    document.querySelectorAll('#modal-nicknames [data-role-filter]').forEach(p => {
        p.classList.toggle('active', p.getAttribute('data-role-filter') === activeUserRoleFilter);
    });
    if (pillEl) pillEl.classList.add('active');
    renderUsersList();
}

export function resetUsersFilters() {
    const input = document.getElementById('users-search');
    if (input) input.value = '';
    const clearBtn = document.getElementById('users-search-clear');
    if (clearBtn) clearBtn.classList.remove('visible');
    filterUsersByRole('all');
}

export function renderUsersList(usersOverride = null) {
    if (Array.isArray(usersOverride)) {
        cachedUsersForManagement = usersOverride;
    }
    const container = document.getElementById('nickname-list-container');
    if (!container) return;

    const searchInput = document.getElementById('users-search');
    const queryText = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const clearBtn = document.getElementById('users-search-clear');
    if (clearBtn) clearBtn.classList.toggle('visible', queryText.length > 0);

    const filteredUsers = cachedUsersForManagement.filter(u => {
        const currentRole = u.role || 'user';
        if (!matchesRoleFilter(currentRole, activeUserRoleFilter)) return false;
        if (!queryText) return true;
        const userIdentifier = u.email ? formatUserIdentifier(u.email) : 'No contact linked';
        const haystack = [
            u.nickname || '',
            u.displayName || '',
            userIdentifier,
            u.id || '',
            currentRole
        ].join(' ').toLowerCase();
        return haystack.includes(queryText);
    });

    const isFiltered = activeUserRoleFilter !== 'all' || queryText.length > 0;
    const countBar = document.getElementById('users-count-bar');
    if (countBar) {
        if (cachedUsersForManagement.length === 0) {
            countBar.style.display = 'none';
        } else {
            countBar.style.display = 'flex';
            countBar.innerHTML = isFiltered
                ? `<span>Showing ${filteredUsers.length} of ${cachedUsersForManagement.length} staff</span><button type="button" class="ledger-reset-link" onclick="Amolnama.filterUsersByRole('all'); Amolnama.clearUsersSearch();">Reset</button>`
                : `<span>${cachedUsersForManagement.length} registered staff</span>`;
        }
    }

    if (cachedUsersForManagement.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="padding: 32px 16px;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                <p>No staff or users registered yet</p>
            </div>
        `;
        return;
    }

    if (filteredUsers.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="padding: 32px 16px;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                <p>No matching staff found</p>
                <span>No accounts matched your search or selected role filter.</span>
                <button type="button" class="btn-outline" style="height: auto; padding: 8px 16px; font-size: 0.82rem; margin-top: 10px;" onclick="document.getElementById('users-search').value=''; Amolnama.filterUsersByRole('all');">Reset Filters</button>
            </div>
        `;
        return;
    }

    let html = '';
    filteredUsers.forEach(u => {
        const uid = u.id;
        const safeUidAttr = escapeHtml(uid);
        const safeUidJs = escapeJsSingleQuote(uid);
        const userIdentifier = u.email ? formatUserIdentifier(u.email) : 'No contact linked';
        const currentNick = u.nickname || '';
        const currentRole = u.role || 'user';
        const canPerformCashActions = Boolean(u.canPerformCashActions);

        const roleSelectHTML = `
            <select id="role_${safeUidAttr}" class="settings-input" onchange="const w = document.getElementById('cash_perm_wrapper_${safeUidJs}'); if (w) w.style.display = this.value === 'manager' ? 'flex' : 'none';" style="padding: 8px; width: 100%; box-sizing: border-box; font-size: 0.85rem; height: 40px; border: 1px solid var(--border-color); border-radius: 10px; background: var(--surface-color); color: var(--text-primary);">
                <option value="user" ${currentRole === 'user' ? 'selected' : ''}>Floor Agent</option>
                <option value="manager" ${currentRole === 'manager' ? 'selected' : ''}>Floor Manager (Observer)</option>
                <option value="center_manager" ${currentRole === 'center_manager' ? 'selected' : ''}>Center Manager</option>
                <option value="admin" ${currentRole === 'admin' ? 'selected' : ''}>Center Admin</option>
                <option value="owner" ${currentRole === 'owner' ? 'selected' : ''}>System Owner (Observer)</option>
            </select>
        `;

        html += `
            <div id="user_card_${safeUidAttr}" class="user-mgmt-card" data-init-nick="${escapeHtml(currentNick)}" data-init-role="${escapeHtml(currentRole)}" data-init-cash="${canPerformCashActions ? '1' : '0'}">
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">
                    <div style="font-size: 0.9rem; font-weight: 800; color: var(--info-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; flex: 1;">${escapeHtml(userIdentifier)}</div>
                    <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
                        <span class="user-dirty-badge">Unsaved</span>
                        <span class="tabular-nums" style="font-size: 0.72rem; color: var(--text-secondary); font-weight: 700;">UID: ${escapeHtml(uid.substring(0, 6))}</span>
                    </div>
                </div>
                <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; align-items: end;">
                    <div style="min-width: 0;">
                        <label class="admin-label" for="nick_${safeUidAttr}" style="font-size: 0.74rem; margin-bottom: 4px;">Nickname</label>
                        <input type="text" id="nick_${safeUidAttr}" class="settings-input" style="padding: 8px 10px; width: 100%; box-sizing: border-box; font-size: 0.85rem; height: 40px;" placeholder="Set nickname..." value="${escapeHtml(currentNick)}">
                    </div>
                    <div style="min-width: 0;">
                        <label class="admin-label" for="role_${safeUidAttr}" style="font-size: 0.74rem; margin-bottom: 4px;">Role</label>
                        ${roleSelectHTML}
                    </div>
                </div>
                <div id="cash_perm_wrapper_${safeUidAttr}" class="user-cash-perm-box" style="display: ${currentRole === 'manager' ? 'flex' : 'none'};">
                    <div style="display: flex; flex-direction: column; min-width: 0; flex: 1;">
                        <span style="font-size: 0.82rem; font-weight: 800; color: var(--success-text);">Allow Cash Actions</span>
                        <span style="font-size: 0.72rem; color: var(--text-secondary);">Enable floor manager to perform cash & handset transactions</span>
                    </div>
                    <label style="position: relative; display: inline-flex; align-items: center; cursor: pointer;">
                        <input type="checkbox" id="cash_perm_${safeUidAttr}" ${canPerformCashActions ? 'checked' : ''} style="width: 18px; height: 18px; accent-color: var(--success-text); cursor: pointer;">
                    </label>
                </div>
                <div style="display: flex; justify-content: flex-end;">
                    <button type="button" class="user-save-btn" onclick="saveUserConfig('${safeUidJs}', 'nick_${safeUidJs}', 'role_${safeUidJs}', this)">Save User</button>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;

    // Bind live dirty state listeners
    filteredUsers.forEach(u => {
        const uid = u.id;
        const card = document.getElementById(`user_card_${uid}`);
        const nickEl = document.getElementById(`nick_${uid}`);
        const roleEl = document.getElementById(`role_${uid}`);
        const permEl = document.getElementById(`cash_perm_${uid}`);
        if (!card) return;

        const updateDirty = () => {
            const curNick = (nickEl?.value || '').trim();
            const curRole = roleEl?.value || 'user';
            const curCash = Boolean(permEl?.checked && curRole === 'manager');
            const isDirty = (
                curNick !== (card.getAttribute('data-init-nick') || '') ||
                curRole !== (card.getAttribute('data-init-role') || 'user') ||
                (curCash ? '1' : '0') !== (card.getAttribute('data-init-cash') || '0')
            );
            card.classList.toggle('is-dirty', isDirty);
        };

        nickEl?.addEventListener('input', updateDirty);
        roleEl?.addEventListener('change', updateDirty);
        permEl?.addEventListener('change', updateDirty);
    });

    if (typeof window.initCustomDropdowns === 'function') window.initCustomDropdowns();
    refreshCustomDropdowns(Array.from(container.querySelectorAll('select.settings-input')));
}

export async function openNicknameManager() {
  if (AppState.currentUserRole !== 'admin') { 
    showAppAlert("Access Denied", "Only Center Admins can manage users and roles."); 
    return; 
  }
  const searchInput = document.getElementById('users-search');
  if (searchInput) searchInput.value = '';
  const clearBtn = document.getElementById('users-search-clear');
  if (clearBtn) clearBtn.classList.remove('visible');
  activeUserRoleFilter = 'all';
  document.querySelectorAll('#modal-nicknames [data-role-filter]').forEach(p => {
      p.classList.toggle('active', p.getAttribute('data-role-filter') === 'all');
  });

  openModal('modal-nicknames');
  const container = document.getElementById('nickname-list-container');
  container.innerHTML = '<div class="spinner" style="margin: 0 auto; border-top-color: var(--purple-text);"></div>';
    
  try {
      const usersSnap = await getDocs(collection(db, 'users'));
      const loaded = [];
      usersSnap.forEach(docSnap => {
          loaded.push({ id: docSnap.id, ...docSnap.data() });
      });
      loaded.sort((a, b) => {
          const nameA = (a.nickname || a.displayName || a.email || '').toLowerCase();
          const nameB = (b.nickname || b.displayName || b.email || '').toLowerCase();
          return nameA.localeCompare(nameB);
      });
      cachedUsersForManagement = loaded;
      renderUsersList();
  } catch(e) {
      container.innerHTML = '<p style="color: var(--danger-text); font-size: 0.9rem; font-weight: 600; text-align: center; padding: 20px;">Error loading users.</p>';
  }
}

export async function saveUserConfig(uid, nickInputId, roleSelectId, btnEl = null) {
    if (AppState.currentUserRole !== 'admin') {
        showAppAlert("Access Denied", "Only Center Admins can manage users and roles.");
        return;
    }
    const nickEl = document.getElementById(nickInputId);
    const roleEl = document.getElementById(roleSelectId);
    const newNick = nickEl ? nickEl.value.trim() : '';
    const newRole = roleEl ? roleEl.value : 'user';
    const permCheckbox = document.getElementById('cash_perm_' + uid);
    const canPerformCashActions = Boolean(permCheckbox && permCheckbox.checked && newRole === 'manager');

    setButtonLoading(btnEl, true, 'Saving...');

    try {
        await updateDoc(doc(db, 'users', uid), { 
            nickname: newNick, 
            role: newRole,
            canPerformCashActions: canPerformCashActions
        });
        showFlashMessage("User updated successfully!");

        // Update cached user in-memory and clear dirty flag without losing scroll position
        const cachedIdx = cachedUsersForManagement.findIndex(u => u.id === uid);
        if (cachedIdx > -1) {
            cachedUsersForManagement[cachedIdx] = {
                ...cachedUsersForManagement[cachedIdx],
                nickname: newNick,
                role: newRole,
                canPerformCashActions
            };
        }

        const card = document.getElementById(`user_card_${uid}`);
        if (card) {
            card.setAttribute('data-init-nick', newNick);
            card.setAttribute('data-init-role', newRole);
            card.setAttribute('data-init-cash', canPerformCashActions ? '1' : '0');
            card.classList.remove('is-dirty');
        }
        
        if (uid === AppState.currentUser?.uid) {
            AppState.userNickname = newNick;
            AppState.currentUserRole = newRole;
            AppState.canPerformCashActions = canPerformCashActions;

            const floorMgrCashBar = document.getElementById('floor-manager-cash-bar');
            if (floorMgrCashBar) {
                const showCashBar = AppState.currentUserRole === 'manager' && Boolean(AppState.canPerformCashActions);
                floorMgrCashBar.style.display = showCashBar ? 'block' : 'none';
            }

            const rName = document.getElementById('report-user-name');
            if (rName) rName.innerText = AppState.userNickname || AppState.userDisplayName;
            
            const roleBadge = document.getElementById('hub-user-role');
            if (roleBadge) {
                let displayRole = 'Floor Agent';
                if (newRole === 'manager') displayRole = 'Floor Manager';
                if (newRole === 'center_manager') displayRole = 'Center Manager';
                if (newRole === 'admin') displayRole = 'Center Admin';
                if (newRole === 'owner') displayRole = 'System Owner';
                
                roleBadge.innerText = displayRole;
                roleBadge.style.background = newRole === 'user' ? 'var(--bg-color)' : 'var(--info-bg)';
                roleBadge.style.color = newRole === 'user' ? 'var(--text-secondary)' : 'var(--info-text)';
                roleBadge.style.borderColor = newRole === 'user' ? 'var(--border-color)' : 'var(--info-border)';
            }

            const hubAdmin = document.getElementById('hub-admin-section');
            if (hubAdmin) {
                hubAdmin.style.display = newRole === 'admin' ? 'flex' : 'none';
            }
        }
        
        if (AppState.currentDeskId && window.renderDeskDashboard) window.renderDeskDashboard(AppState.currentDeskId);
        if (document.getElementById('tab-floor')?.classList.contains('active') && window.renderLiveFloorTab) window.renderLiveFloorTab();
        renderUserManagementAdmin();

        const scrollBody = document.getElementById('nicknames-scroll-body');
        const prevScroll = scrollBody ? scrollBody.scrollTop : 0;
        renderUsersList();
        if (scrollBody) scrollBody.scrollTop = prevScroll;
    } catch(e) {
        showAppAlert("Error", "Error saving user settings.");
    } finally {
        setButtonLoading(btnEl, false);
    }
}

export async function saveAdminNickname(uid, inputId) {
    // Keep legacy helper for compatibility, delegates to config
    const newNick = document.getElementById(inputId).value.trim();
    try {
        await updateDoc(doc(db, 'users', uid), { nickname: newNick });
        showFlashMessage("Nickname saved!");
        
        if (uid === AppState.currentUser.uid) {
            AppState.userNickname = newNick;
            const rName = document.getElementById('report-user-name');
            if (rName) rName.innerText = AppState.userNickname || AppState.userDisplayName;
        }
        if (AppState.currentDeskId && window.renderDeskDashboard) window.renderDeskDashboard(AppState.currentDeskId);
        if (document.getElementById('tab-floor').classList.contains('active') && window.renderLiveFloorTab) window.renderLiveFloorTab();
        renderUserManagementAdmin();
    } catch(e) { showAppAlert("Error", "Error saving nickname."); }
}

export async function renderUserManagementAdmin() {
    const container = document.getElementById('admin-user-management-list');
    if (!container) return;
    container.innerHTML = '<div class="spinner" style="width: 24px; height: 24px; border-width: 3px; margin: 0 auto; border-top-color: var(--warning-text);"></div>';

    const agentSelect = document.getElementById('admin-delete-data-agent');

    try {
        const usersSnap = await getDocs(collection(db, 'users'));
        const users = [];
        usersSnap.forEach(docSnap => {
            users.push({ id: docSnap.id, ...docSnap.data() });
        });

        // Sort agents alphabetically for a better UX
        users.sort((a, b) => {
            const nameA = (a.nickname || a.displayName || a.email?.split('@')[0] || '').toLowerCase();
            const nameB = (b.nickname || b.displayName || b.email?.split('@')[0] || '').toLowerCase();
            return nameA.localeCompare(nameB);
        });

        let html = ''; 
        let activeCount = 0;
        let agentSelectHTML = '<option value="">-- Select Agent --</option>';

        users.forEach(u => {
            const uid = u.id;
            const formattedContact = u.email ? formatUserIdentifier(u.email) : 'No email';
            const displayName = u.nickname || u.displayName || (u.email ? formatUserIdentifier(u.email) : 'Unknown');
            
            agentSelectHTML += `<option value="${escapeHtml(uid)}">${escapeHtml(displayName)} (${escapeHtml(formattedContact)})</option>`;

            if (u.assignedDeskId) {
                activeCount++;
                const deskName = u.assignedDeskId.replace('_', ' ').toUpperCase();

                html += `
                    <div style="background: var(--surface-color); border: 1px solid var(--border-color); padding: 12px 14px; border-radius: 14px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; box-shadow: 0 1px 4px rgba(0,0,0,0.02);">
                        <div style="min-width: 0; flex: 1;">
                            <strong style="color: var(--text-primary); font-size: 0.95rem; font-weight: 800; display: block; overflow-wrap: anywhere;">${escapeHtml(displayName)}</strong>
                            <div style="font-size: 0.8rem; color: var(--warning-text); font-weight: 700; overflow-wrap: anywhere;">
                                Active on ${escapeHtml(deskName)}
                            </div>
                        </div>
                        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                            <button type="button" class="btn-outline" style="padding: 6px 12px; font-size: 0.8rem; height: 34px; border-color: var(--warning-border); color: var(--warning-text); border-radius: 10px; font-weight: 700;" onclick="kickAgent('${escapeJsSingleQuote(uid)}')">Kick</button>
                            <button type="button" class="btn-outline" style="padding: 6px 12px; font-size: 0.8rem; height: 34px; border-color: var(--danger-border); color: var(--danger-text); background: var(--danger-bg); border-radius: 10px; font-weight: 700;" onclick="nukeAgent('${escapeJsSingleQuote(uid)}', '${escapeJsSingleQuote(displayName)}')">Nuke & Kick</button>
                        </div>
                    </div>
                `;
            }
        });

        if (agentSelect) {
            agentSelect.innerHTML = agentSelectHTML;
            refreshCustomDropdowns(agentSelect);
        }

        container.innerHTML = activeCount > 0 ? html : `
            <div class="empty-state" style="padding: 24px 12px; opacity: 0.8;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 44px; height: 44px; margin-bottom: 8px; color: var(--text-secondary);"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                <p style="font-size: 0.95rem; font-weight: 700; color: var(--text-secondary);">No agents currently locked to a desk</p>
            </div>
        `;
    } catch (e) { container.innerHTML = '<p style="color: var(--danger-text); font-size: 0.85rem; font-weight: 600; text-align: center; padding: 20px;">Offline: Cannot fetch active floor locks.</p>'; }
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

export function deleteAgentDateData() {
    if (AppState.currentUserRole !== 'admin') { showAppAlert("Access Denied", "Admin clearance required."); return; }

    const agentSelect = document.getElementById('admin-delete-data-agent');
    const dateInput = document.getElementById('admin-delete-data-date');
    clearInputError(agentSelect);
    clearInputError(dateInput);
    
    if (!agentSelect || !agentSelect.value) {
        markInputError(agentSelect);
        showAppAlert("Invalid Input", "Please select an agent.");
        return;
    }
    if (!dateInput || !dateInput.value) {
        markInputError(dateInput);
        showAppAlert("Invalid Input", "Please select a date.");
        return;
    }

    const uid = agentSelect.value;
    const agentName = agentSelect.options[agentSelect.selectedIndex].text.split(' (')[0];
    const rawDate = dateInput.value;
    const dateStr = formatToGBDate(rawDate);

    showAppAlert(
        "Confirm Delete Data", 
        `Are you sure you want to permanently delete all transactions for ${agentName} on ${dateStr}? This cannot be undone!`, 
        true, 
        async () => {
            if (isSaving) return;
            isSaving = true;
            try {
                const txSnap = await getDocs(query(
                    collection(db, 'transactions'), 
                    where('agentId', '==', uid), 
                    where('dateStr', '==', dateStr)
                ));

                if (txSnap.empty) {
                    showAppAlert("No Data Found", `No transactions found for ${agentName} on ${dateStr}.`);
                    return;
                }

                await Promise.all(txSnap.docs.map(t => deleteDoc(doc(db, 'transactions', t.id))));
                showFlashMessage(`Deleted ${txSnap.size} transaction(s) for ${agentName} on ${dateStr}!`);
                
                // Reset fields
                dateInput.value = '';
                agentSelect.value = '';
                refreshCustomDropdowns(agentSelect);
            } catch(e) { 
                showAppAlert("Error", "Error executing delete request."); 
                console.error(e);
            } finally {
                isSaving = false;
            }
        }, 
        "Delete Data"
    );
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
    document.getElementById('audit-date').value = formatLocalISODate(new Date());
    fetchAuditLogs();
}

export async function fetchAuditLogs() {
    const dateEl = document.getElementById('audit-date');
    const val = dateEl ? dateEl.value : '';
    if (!val) return;
    const targetDateStr = formatToGBDate(val);
    const container = document.getElementById('audit-results');
    if (!container) return;
    container.innerHTML = '<div class="spinner" style="margin: 20px auto; border-top-color: var(--warning-text);"></div>';

    const emptyAuditHtml = `
        <div class="empty-state" style="padding: 40px 20px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            <p>No closed sessions on this date</p>
            <span>Try picking another date above to review closing reports and cash variance.</span>
        </div>
    `;

    try {
        const snap = await getDocs(query(collection(db, 'sessions'), where('dateStr', '==', targetDateStr)));
        if (snap.empty) {
            container.innerHTML = emptyAuditHtml;
            return;
        }

        let closedCount = 0;
        let balancedCount = 0;
        let varianceCount = 0;
        let cardsHtml = '';

        snap.forEach(docSnap => {
            const s = docSnap.data();
            if (s.status !== 'closed' && s.status !== 'pending' && s.status !== 'closed_by_system') return;

            closedCount++;
            const varianceNum = Number(s.variance || 0);
            let badgeClass = 'is-balanced';
            let vText = 'Balanced';
            if (varianceNum < 0) {
                badgeClass = 'is-shortage';
                vText = `Shortage: ${varianceNum} Tk`;
                varianceCount++;
            } else if (varianceNum > 0) {
                badgeClass = 'is-overage';
                vText = `Overage: +${varianceNum} Tk`;
                varianceCount++;
            } else {
                balancedCount++;
            }

            cardsHtml += `
                <div class="admin-form-card" style="padding: 16px; margin-bottom: 0;">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom: 12px; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">
                        <h4 style="margin:0; color:var(--text-primary); font-size: 1.05rem; font-weight: 800; min-width: 0; overflow-wrap: anywhere;">${escapeHtml((s.deskId || 'Unknown').replace('_',' ').toUpperCase())}</h4>
                        <span style="font-size:0.78rem; color:var(--text-secondary); font-weight: 600; min-width: 0; overflow-wrap: anywhere;">Closed by: ${escapeHtml(s.closedBy || 'Unknown')}</span>
                    </div>
                    <div class="tabular-nums" style="display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 12px; font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 12px;">
                        <div style="min-width: 0; overflow-wrap: anywhere;">Morning Open: <strong style="color: var(--text-primary);">${s.openingBalances?.cash || 0} Tk</strong></div>
                        <div style="min-width: 0; overflow-wrap: anywhere;">Mid-Day Drop: <strong style="color: var(--accent-color);">${s.managerDrop || 0} Tk</strong></div>
                        <div style="min-width: 0; overflow-wrap: anywhere;">Expected Cash: <strong style="color: var(--success-text);">${s.expectedClosing?.cash || 0} Tk</strong></div>
                        <div style="min-width: 0; overflow-wrap: anywhere;">Actual Count: <strong style="color: var(--text-primary);">${s.actualClosing?.cash || 0} Tk</strong></div>
                    </div>
                    <div style="padding-top: 10px; border-top: 1px dashed var(--border-color); display: flex; justify-content: center;">
                        <span class="audit-status-badge ${badgeClass}">${vText}</span>
                    </div>
                </div>
            `;
        });

        if (closedCount === 0) {
            container.innerHTML = emptyAuditHtml;
            return;
        }

        const summaryHtml = `
            <div class="audit-summary-strip">
                <div class="audit-summary-box">
                    <span class="audit-summary-label">Closed Desks</span>
                    <span class="audit-summary-val">${closedCount}</span>
                </div>
                <div class="audit-summary-box">
                    <span class="audit-summary-label" style="color: var(--success-text);">Balanced</span>
                    <span class="audit-summary-val" style="color: var(--success-text);">${balancedCount}</span>
                </div>
                <div class="audit-summary-box">
                    <span class="audit-summary-label" style="color: ${varianceCount > 0 ? 'var(--warning-text)' : 'var(--text-secondary)'};">With Variance</span>
                    <span class="audit-summary-val" style="color: ${varianceCount > 0 ? 'var(--warning-text)' : 'var(--text-secondary)'};">${varianceCount}</span>
                </div>
            </div>
        `;

        container.innerHTML = summaryHtml + cardsHtml;
    } catch(e) {
        container.innerHTML = `<p style="color: var(--danger-text); font-weight: 600; text-align: center; padding: 20px;">Error loading logs.</p>`;
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
                                trueOpeningInv = {};
                                if (s.openingBalances?.inventory) {
                                    Object.entries(s.openingBalances.inventory).forEach(([k, v]) => {
                                        let normKey = getNormalizedTrackAs(k);
                                        trueOpeningInv[normKey] = (trueOpeningInv[normKey] || 0) + v;
                                    });
                                }
                            }
                        }
                    });

                    let carryOverInv = { ...trueOpeningInv };

                    // 5. Add ALL transactions from that past date to calculate the final leftovers
                    const txSnap = await getDocs(query(collection(db, 'transactions'), where('deskId', '==', deskId), where('dateStr', '==', latestPastDateStr), where('isDeleted', '==', false)));

                    txSnap.forEach(tDoc => {
                        let tx = tDoc.data();
                        let change = getInventoryChange(tx);
                        let normTrackAs = getNormalizedTrackAs(tx.trackAs);
                        if (change !== 0 && normTrackAs) carryOverInv[normTrackAs] = (carryOverInv[normTrackAs] || 0) + change;
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

export async function healDeskTransfers() {
    if (AppState.currentUserRole !== 'admin') { showAppAlert("Access Denied", "Admin clearance required."); return; }
    if (!navigator.onLine) { showAppAlert("Offline", "You must be online to heal the database."); return; }

    showAppAlert("Heal Transfers", "This will search today's transactions and re-align any desk-to-desk transfers that were sent to outdated or ghost sessions. Proceed?", true, async () => {
        const todayStr = getStrictDate();
        showFlashMessage("Scanning transfers...");
        
        try {
            // 1. Fetch all of today's sessions
            const sessSnap = await getDocs(query(collection(db, 'sessions'), where('dateStr', '==', todayStr)));
            
            // 2. Identify the active (latest opened) session ID for each desk
            let activeSessionMap = new Map(); // deskId -> { id, time, openedByUid }
            sessSnap.docs.forEach(docSnap => {
                const s = docSnap.data();
                if (s.status === 'open') {
                    const newTime = (s.openedAt && typeof s.openedAt.toMillis === 'function') ? s.openedAt.toMillis() : (s.openedAt?.seconds ? s.openedAt.seconds * 1000 : 0);
                    const existing = activeSessionMap.get(s.deskId);
                    if (!existing || newTime > existing.time) {
                        activeSessionMap.set(s.deskId, { id: docSnap.id, time: newTime, openedByUid: s.openedByUid });
                    }
                }
            });

            // 3. Fetch all of today's remote transfer_in transactions
            const txSnap = await getDocs(query(
                collection(db, 'transactions'), 
                where('dateStr', '==', todayStr), 
                where('type', '==', 'transfer_in'),
                where('isRemoteTransfer', '==', true)
            ));

            let fixedCount = 0;
            const batch = writeBatch(db);

            txSnap.docs.forEach(docSnap => {
                const tx = docSnap.data();
                const activeSession = activeSessionMap.get(tx.deskId);
                if (activeSession) {
                    let updates = {};
                    if (tx.sessionId !== activeSession.id) {
                        updates.sessionId = activeSession.id;
                    }
                    if (activeSession.openedByUid && activeSession.openedByUid !== 'system' && tx.agentId !== activeSession.openedByUid) {
                        updates.agentId = activeSession.openedByUid;
                    }
                    if (Object.keys(updates).length > 0) {
                        batch.update(doc(db, 'transactions', docSnap.id), updates);
                        fixedCount++;
                    }
                }
            });

            if (fixedCount > 0) {
                await batch.commit();
                showFlashMessage(`Healed ${fixedCount} transfer(s)!`);
                setTimeout(() => window.location.reload(), 1500);
            } else {
                showAppAlert("No Errors Found", "All of today's desk transfers are correctly linked to active sessions.", false, null, "Great");
            }
            
        } catch (e) {
            console.error(e);
            showAppAlert("Error", "Could not complete healing process. Check console.");
        }
    }, "Heal Transfers");
}

export async function healDuplicateSessions() {
    if (AppState.currentUserRole !== 'admin') { showAppAlert("Access Denied", "Admin clearance required."); return; }
    if (!navigator.onLine) { showAppAlert("Offline", "You must be online to heal the database."); return; }

    showAppAlert("Heal Duplicate Sessions", "This will merge transactions and clean up duplicate session documents in today's ledger. Proceed?", true, async () => {
        const todayStr = getStrictDate();
        showFlashMessage("Scanning for duplicates...");

        try {
            // 1. Fetch all of today's sessions
            const sessSnap = await getDocs(query(collection(db, 'sessions'), where('dateStr', '==', todayStr)));
            
            // Group by deskId
            const deskSessionsMap = new Map(); // deskId -> array of docSnaps
            sessSnap.docs.forEach(docSnap => {
                const s = docSnap.data();
                if (!deskSessionsMap.has(s.deskId)) {
                    deskSessionsMap.set(s.deskId, []);
                }
                deskSessionsMap.get(s.deskId).push(docSnap);
            });

            let desksWithDuplicates = [];
            for (const [deskId, sessions] of deskSessionsMap.entries()) {
                if (sessions.length > 1) {
                    desksWithDuplicates.push({ deskId, sessions });
                }
            }

            if (desksWithDuplicates.length === 0) {
                showAppAlert("No Duplicates Found", "All desks have at most one session for today.", false, null, "Great");
                return;
            }

            // 2. Fetch all of today's transactions to count references
            const txSnap = await getDocs(query(collection(db, 'transactions'), where('dateStr', '==', todayStr)));
            const txCountMap = {};
            txSnap.docs.forEach(docSnap => {
                const tx = docSnap.data();
                if (tx.sessionId) {
                    txCountMap[tx.sessionId] = (txCountMap[tx.sessionId] || 0) + 1;
                }
            });

            let mergedTxCount = 0;
            let deletedSessionCount = 0;
            const batch = writeBatch(db);

            for (const { deskId, sessions } of desksWithDuplicates) {
                // Sort sessions:
                // - Deterministic ID format (starts with "sess_") first
                // - Transaction count descending
                // - Status is "open" first
                // - Earliest openedAt first
                sessions.sort((a, b) => {
                    const aDet = a.id.startsWith('sess_');
                    const bDet = b.id.startsWith('sess_');
                    if (aDet && !bDet) return -1;
                    if (!aDet && bDet) return 1;

                    const aCount = txCountMap[a.id] || 0;
                    const bCount = txCountMap[b.id] || 0;
                    if (aCount !== bCount) return bCount - aCount;

                    const aOpen = a.data().status === 'open' ? 1 : 0;
                    const bOpen = b.data().status === 'open' ? 1 : 0;
                    if (aOpen !== bOpen) return bOpen - aOpen;

                    const aTime = (a.data().openedAt && typeof a.data().openedAt.toMillis === 'function') ? a.data().openedAt.toMillis() : (a.data().openedAt?.seconds ? a.data().openedAt.seconds * 1000 : 0);
                    const bTime = (b.data().openedAt && typeof b.data().openedAt.toMillis === 'function') ? b.data().openedAt.toMillis() : (b.data().openedAt?.seconds ? b.data().openedAt.seconds * 1000 : 0);
                    return aTime - bTime;
                });

                const primarySession = sessions[0];
                const secondarySessions = sessions.slice(1);

                // Move transactions from secondary sessions to primary
                txSnap.docs.forEach(docSnap => {
                    const tx = docSnap.data();
                    if (secondarySessions.some(s => s.id === tx.sessionId)) {
                        batch.update(doc(db, 'transactions', docSnap.id), { sessionId: primarySession.id });
                        mergedTxCount++;
                    }
                });

                // Merge opening balances if primary doesn't have them but a secondary does
                const pData = primarySession.data();
                let mergedOpeningBalances = pData.openingBalances || { cash: 0, inventory: {} };
                let balancesUpdated = false;

                secondarySessions.forEach(secSnap => {
                    const secData = secSnap.data();
                    if (secData.openingBalances) {
                        // If primary inventory is empty but secondary has inventory, copy it
                        if ((!mergedOpeningBalances.inventory || Object.keys(mergedOpeningBalances.inventory).length === 0) && secData.openingBalances.inventory && Object.keys(secData.openingBalances.inventory).length > 0) {
                            mergedOpeningBalances.inventory = secData.openingBalances.inventory;
                            balancesUpdated = true;
                        }
                        // If primary cash is 0 but secondary has cash, copy it
                        if ((!mergedOpeningBalances.cash || parseFloat(mergedOpeningBalances.cash) === 0) && secData.openingBalances.cash && parseFloat(secData.openingBalances.cash) > 0) {
                            mergedOpeningBalances.cash = secData.openingBalances.cash;
                            balancesUpdated = true;
                        }
                    }
                    // Delete the secondary session
                    batch.delete(doc(db, 'sessions', secSnap.id));
                    deletedSessionCount++;
                });

                if (balancesUpdated) {
                    batch.update(doc(db, 'sessions', primarySession.id), { openingBalances: mergedOpeningBalances });
                }

                // Update the desk pointer to point to the primary session
                batch.update(doc(db, 'desks', deskId), { currentSessionId: primarySession.id });
            }

            await batch.commit();
            showFlashMessage(`Healed duplicate sessions: merged ${mergedTxCount} txs, deleted ${deletedSessionCount} duplicate sessions.`);
            setTimeout(() => window.location.reload(), 1500);

        } catch (e) {
            console.error(e);
            showAppAlert("Error", "Could not complete healing process. Check console.");
        }
    }, "Heal Duplicate Sessions");
}

export async function populateAdminTransferSection() {
    const srcSelect = document.getElementById('admin-transfer-source');
    const destSelect = document.getElementById('admin-transfer-dest');
    const itemSelect = document.getElementById('admin-transfer-item');
    if (!srcSelect || !destSelect || !itemSelect) return;

    srcSelect.innerHTML = '<option value="">Loading...</option>';
    destSelect.innerHTML = '<option value="">Loading...</option>';
    itemSelect.innerHTML = '';

    // Populate items
    getPhysicalItems().forEach(itemName => {
        let opt = document.createElement('option'); opt.value = itemName; opt.innerText = itemName;
        itemSelect.appendChild(opt);
    });

    try {
        const activeSessionsSnap = await getDocs(query(collection(db, 'sessions'), where('status', '==', 'open')));
        let optionsHTML = '<option value="">-- Select Drawer --</option>';
        
        let uniqueDesks = new Map();
        activeSessionsSnap.docs.forEach(doc => {
            const data = doc.data();
            if (data.dateStr !== getStrictDate()) return;
            if (uniqueDesks.has(data.deskId)) {
                const existingOpenedAt = uniqueDesks.get(data.deskId).data().openedAt;
                const newOpenedAt = data.openedAt;
                const existingTime = (existingOpenedAt && typeof existingOpenedAt.toMillis === 'function') ? existingOpenedAt.toMillis() : (existingOpenedAt?.seconds ? existingOpenedAt.seconds * 1000 : 0);
                const newTime = (newOpenedAt && typeof newOpenedAt.toMillis === 'function') ? newOpenedAt.toMillis() : (newOpenedAt?.seconds ? newOpenedAt.seconds * 1000 : 0);
                if (newTime > existingTime) {
                    uniqueDesks.set(data.deskId, doc);
                }
            } else {
                uniqueDesks.set(data.deskId, doc);
            }
        });

        for (const docSnap of uniqueDesks.values()) {
            let deskData = docSnap.data();
            let sid = docSnap.id;
            let displayName = deskData.deskId.replace('_', ' ').toUpperCase();
            
            try {
                const deskSnap = await getDoc(doc(db, 'desks', deskData.deskId));
                if (deskSnap.exists() && deskSnap.data().name) {
                    displayName = deskSnap.data().name;
                }
            } catch(e) { console.error(e); }

            optionsHTML += `<option value="${escapeHtml(deskData.deskId)}|${escapeHtml(docSnap.id)}|${escapeHtml(deskData.openedByUid || '')}|${escapeHtml((deskData.openedBy || '').replace(/\|/g, ''))}">${escapeHtml(displayName)}</option>`;
        }

        srcSelect.innerHTML = optionsHTML;
        destSelect.innerHTML = optionsHTML;
        refreshCustomDropdowns([srcSelect, destSelect, itemSelect]);
    } catch (e) {
        console.error("Error populating admin transfers:", e);
        srcSelect.innerHTML = '<option value="">Error loading</option>';
        destSelect.innerHTML = '<option value="">Error loading</option>';
        refreshCustomDropdowns([srcSelect, destSelect, itemSelect]);
    }
}

export async function getDeskSessionStock(deskId, sessionId, itemName) {
    let catItem = Object.values(AppState.globalCatalog).find(c => c.name === itemName);
    let trackAs = catItem ? (catItem.trackAs === '' ? '' : (catItem.trackAs || itemName)) : itemName;
    let normTarget = getNormalizedTrackAs(trackAs);

    if (!AppState.globalInventoryGroups.includes(normTarget)) return Infinity;

    try {
        const sessionSnap = await getDoc(doc(db, 'sessions', sessionId));
        if (!sessionSnap.exists()) return 0;
        const sessionData = sessionSnap.data();
        let stock = 0;
        if (sessionData.openingBalances?.inventory) {
            Object.entries(sessionData.openingBalances.inventory).forEach(([k, v]) => {
                if (getNormalizedTrackAs(k) === normTarget) stock += v;
            });
        }

        // Fetch all transactions for this session
        const txSnap = await getDocs(query(
            collection(db, 'transactions'), 
            where('sessionId', '==', sessionId), 
            where('isDeleted', '==', false)
        ));

        txSnap.forEach(docSnap => {
            const tx = docSnap.data();
            if (getNormalizedTrackAs(tx.trackAs) === normTarget) {
                stock += getInventoryChange(tx);
            }
        });
        return stock;
    } catch (e) {
        console.error("Error checking desk session stock:", e);
        return 0;
    }
}

export async function executeAdminDrawerTransfer() {
    const srcSelect = document.getElementById('admin-transfer-source');
    const destSelect = document.getElementById('admin-transfer-dest');
    const itemSelect = document.getElementById('admin-transfer-item');
    const qtyInput = document.getElementById('admin-transfer-qty');

    if (!srcSelect || !destSelect || !itemSelect || !qtyInput) return;

    clearInputError(srcSelect);
    clearInputError(destSelect);
    clearInputError(itemSelect);
    clearInputError(qtyInput);

    const srcVal = srcSelect.value;
    const destVal = destSelect.value;
    const itemName = itemSelect.value;
    const qty = parseInt(qtyInput.value, 10) || 0;

    if (!srcVal) { markInputError(srcSelect); showAppAlert("Error", "Please select source drawer."); return; }
    if (!destVal) { markInputError(destSelect); showAppAlert("Error", "Please select destination drawer."); return; }
    if (srcVal === destVal) { markInputError(destSelect); showAppAlert("Error", "Source and destination drawers cannot be the same."); return; }
    if (qty <= 0) { markInputError(qtyInput); showAppAlert("Error", "Please enter a valid quantity."); return; }
    if (!itemName) { markInputError(itemSelect); showAppAlert("Error", "Please select an item."); return; }

    let [srcDeskId, srcSessionId, srcAgentId, srcAgentName] = srcVal.split('|');
    let [destDeskId, destSessionId, destAgentId, destAgentName] = destVal.split('|');
    let srcDeskName = srcSelect.options[srcSelect.selectedIndex].text;
    let destDeskName = destSelect.options[destSelect.selectedIndex].text;

    showFlashMessage("Verifying source stock...");
    let available = await getDeskSessionStock(srcDeskId, srcSessionId, itemName);
    if (available < qty) {
        showAppAlert("Insufficient Stock", `Source drawer (${srcDeskName}) only has ${available}x ${itemName} available. Transfer aborted.`);
        return;
    }

    let timeStr = new Date().toLocaleTimeString('en-GB', {hour: '2-digit', minute:'2-digit'});
    let dateStr = getStrictDate();
    let transferGroupId = 'tr_' + Date.now();

    let senderTx = { id: Date.now(), receiptNo: generateReceiptNo(), type: 'transfer_out', name: itemName, trackAs: itemName, amount: 0, qty: qty, payment: `Sent to ${destDeskName}`, cashAmt: 0, mfsAmt: 0, isDeleted: false, time: timeStr, dateStr: dateStr, deskId: srcDeskId, sessionId: srcSessionId, agentId: srcAgentId || AppState.currentUser.uid, agentName: AppState.userNickname || AppState.userDisplayName, transferGroupId: transferGroupId, timestamp: serverTimestamp() };
    let receiverTx = { id: Date.now() + 1, receiptNo: generateReceiptNo(), type: 'transfer_in', name: itemName, trackAs: itemName, amount: 0, qty: qty, payment: `Received from ${srcDeskName}`, cashAmt: 0, mfsAmt: 0, isDeleted: false, time: timeStr, dateStr: dateStr, deskId: destDeskId, sessionId: destSessionId, agentId: destAgentId || AppState.currentUser.uid, agentName: AppState.userNickname || AppState.userDisplayName, isRemoteTransfer: true, transferGroupId: transferGroupId, timestamp: serverTimestamp() };

    try {
        const batch = writeBatch(db);
        batch.set(doc(collection(db, 'transactions')), senderTx);
        batch.set(doc(collection(db, 'transactions')), receiverTx);

        await batch.commit();
        qtyInput.value = '';
        srcSelect.value = '';
        destSelect.value = '';
        refreshCustomDropdowns([srcSelect, destSelect]);
        showFlashMessage(`Transferred ${qty}x ${itemName} from ${srcDeskName} to ${destDeskName}!`);
        
        // Refresh UI if necessary
        if (typeof window.renderDeskDashboard === 'function' && AppState.currentDeskId) {
            window.renderDeskDashboard(AppState.currentDeskId);
        }
        if (document.getElementById('tab-floor').classList.contains('active') && window.renderLiveFloorTab) {
            window.renderLiveFloorTab();
        }
        // Refresh selects
        await populateAdminTransferSection();
    } catch (e) {
        console.error("Admin transfer failed:", e);
        showAppAlert("Transfer Failed", "Could not complete transfer in database.");
    }
}
