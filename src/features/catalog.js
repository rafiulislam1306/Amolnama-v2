// src/features/catalog.js
import { AppState } from '../core/state.js';
import { selectItem, instantSaveItem, canSelectMultiQty } from './transactions.js';
import { priorityItemSortOrder } from '../core/constants.js';
import { getAvailableStock } from './inventory.js';
import { escapeHtml } from '../utils/helpers.js';
import { resolveItemLowStockThreshold, getItemStockStatus } from '../utils/stock-alerts.js';

let storeInStockOnly = false;

export function toggleStoreInStockFilter() {
    storeInStockOnly = !storeInStockOnly;
    const btn = document.getElementById('store-instock-toggle');
    if (btn) {
        btn.classList.toggle('active', storeInStockOnly);
        btn.setAttribute('aria-pressed', storeInStockOnly ? 'true' : 'false');
    }
    filterStoreCatalog();
}

export function resetStoreFilters() {
    storeInStockOnly = false;
    const btn = document.getElementById('store-instock-toggle');
    if (btn) {
        btn.classList.remove('active');
        btn.setAttribute('aria-pressed', 'false');
    }
    const searchInput = document.getElementById('store-search');
    if (searchInput) searchInput.value = '';
    const clearBtn = document.getElementById('store-search-clear');
    if (clearBtn) {
        clearBtn.classList.remove('visible');
        clearBtn.style.display = 'none';
    }
    filterStoreCatalog();
}

export function filterStoreCatalog(overrideCatId = null) {
    const text = document.getElementById('store-search')?.value.toLowerCase().trim() || '';
    const pillsContainer = document.getElementById('store-pills-container');
    const noResults = document.getElementById('store-no-results');
    const clearBtn = document.getElementById('store-search-clear');
    const countBar = document.getElementById('store-count-bar');
    const activeCatEl = document.getElementById('store-active-category');
    const selectedCat = overrideCatId || activeCatEl?.value || 'cat-new-sim';

    // Toggle X Clear Button visibility
    if (clearBtn) {
        clearBtn.classList.toggle('visible', text.length > 0);
        clearBtn.style.display = text.length > 0 ? 'inline-flex' : 'none';
    }

    const searchAcrossAll = text.length > 0 && !overrideCatId;
    if (pillsContainer) {
        pillsContainer.style.display = searchAcrossAll ? 'none' : 'flex';
    }

    let matchedCount = 0;
    let totalInScope = 0;

    document.querySelectorAll('.store-cat-group').forEach(group => {
        const isGroupInScope = searchAcrossAll || selectedCat === 'cat-all' || group.id === selectedCat;
        let hasMatchInGroup = false;

        group.querySelectorAll('.store-item-row').forEach(card => {
            const displayName = card.querySelector('.store-item-name')?.innerText.toLowerCase() || '';
            const rawName = (card.getAttribute('data-item-name') || '').toLowerCase();
            const trackAs = (card.getAttribute('data-track-as') || '').toLowerCase();
            const priceStr = (card.getAttribute('data-price') || '').toLowerCase();
            const isOOS = card.classList.contains('is-locked');

            const matchesSearch = !text || displayName.includes(text) || rawName.includes(text) || trackAs.includes(text) || priceStr.includes(text);
            const matchesStock = !storeInStockOnly || !isOOS;

            if (isGroupInScope) totalInScope++;

            if (isGroupInScope && matchesSearch && matchesStock) {
                card.style.display = 'flex';
                hasMatchInGroup = true;
                matchedCount++;
            } else {
                card.style.display = 'none';
            }
        });

        group.style.display = (isGroupInScope && hasMatchInGroup) ? 'block' : 'none';
    });

    if (noResults) {
        noResults.style.display = matchedCount > 0 ? 'none' : 'block';
        const hintEl = document.getElementById('store-no-results-hint');
        if (hintEl && matchedCount === 0) {
            if (storeInStockOnly && text.length === 0) {
                hintEl.innerText = 'No in-stock items in this category right now. Reset filters to view all items.';
            } else if (storeInStockOnly && text.length > 0) {
                hintEl.innerText = 'No in-stock items matched your search. Try resetting filters.';
            } else {
                hintEl.innerText = 'Double check your spelling or try another keyword.';
            }
        }
    }

    if (countBar) {
        const showBar = text.length > 0 || storeInStockOnly || selectedCat === 'cat-all';
        if (showBar) {
            countBar.style.display = 'flex';
            const scopeText = (text.length > 0 || storeInStockOnly)
                ? `Showing ${matchedCount} of ${totalInScope} item${totalInScope === 1 ? '' : 's'}${storeInStockOnly ? ' (In Stock)' : ''}`
                : `${matchedCount} catalog item${matchedCount === 1 ? '' : 's'}`;
            countBar.innerHTML = `<span>${scopeText}</span>${(text.length > 0 || storeInStockOnly) ? '<button type="button" class="ledger-reset-link" onclick="resetStoreFilters()">Reset</button>' : ''}`;
        } else {
            countBar.style.display = 'none';
        }
    }
}

export function clearStoreSearch() {
    const searchInput = document.getElementById('store-search');
    if (searchInput) {
        searchInput.value = '';
        if (typeof searchInput.focus === 'function') searchInput.focus();
    }
    filterStoreCatalog();
}

export function renderAppUI() {
    try {
        const userCurrency = 'Tk'; 
        
        // Clear existing items
        document.querySelectorAll('.dynamic-item').forEach(el => el.remove());
        
        // Safety check
        if (!AppState.globalCatalog) return;

        Object.values(AppState.globalCatalog).sort((a, b) => {
            let indexA = priorityItemSortOrder.indexOf(a.name);
            let indexB = priorityItemSortOrder.indexOf(b.name);
            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            if (indexA !== -1) return -1;
            if (indexB !== -1) return 1;
            
            // Fallback to Admin-defined drag-and-drop order before alphabetical
            if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
            if (a.order !== undefined) return -1;
            if (b.order !== undefined) return 1;

            // Safely fallback to empty strings if name is missing to prevent fatal crash
            return (a.name || '').localeCompare(b.name || '');
        }).forEach(item => {
            // Only hide the item if it is explicitly set to false. Otherwise, assume it is active.
            if (item.isActive === false) return;
            
            // Ensure price is never negative
            let safePrice = Math.max(0, parseFloat(item.price) || 0);
            let containerId = "";
            let iconSVG = "";
            
            if (item.cat === 'new-sim') {
                containerId = 'container-new-sim';
                iconSVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`;
            }
            else if (item.cat === 'paid-rep') {
                containerId = 'container-paid-rep';
                iconSVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`;
            }
            else if (item.cat === 'cards') {
                containerId = 'container-cards';
                iconSVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/><path d="M6 14h.01M10 14h.01"/></svg>`;
            }
            else if (item.cat === 'foc' || item.cat === 'free-action') {
                containerId = item.cat === 'foc' ? 'container-foc' : 'container-free-actions';
                iconSVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
            }
            else if (item.cat === 'service') {
                containerId = 'container-services';
                iconSVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`;
            } else {
                return; // Safety catch: Skip items with undefined categories
            }
            
            let container = document.getElementById(containerId);
            if (!container) return; // Skip if category HTML container doesn't exist
            
            // STRICT RULE: Death TOF and Govt. FOC are ONLY visible to center_manager
            if ((item.name === 'Death TOF' || item.name === 'Govt. FOC') && AppState.currentUserRole !== 'center_manager') {
                return; // Hide entirely
            }

            // Completely hide other restricted items from standard floor agents
            if (item.managerOnly && AppState.currentUserRole !== 'center_manager') return;

            // --- REAL-TIME LIVE STOCK CALCULATION ---
            let stockStatusHTML = '';
            let isOutOfStock = false;
            let isLowStock = false;
            let stockLevel = 'untracked';
            let currentStockCount = Infinity;
            let resolvedThreshold = null;
            
            if (item.trackAs && AppState.globalInventoryGroups.includes(item.trackAs)) {
                currentStockCount = getAvailableStock(item.name);
                resolvedThreshold = resolveItemLowStockThreshold(item, AppState.globalLowStockThreshold);
                const status = getItemStockStatus(currentStockCount, resolvedThreshold);
                stockLevel = status.level;
                isOutOfStock = status.isOutOfStock;
                isLowStock = status.isLowStock;

                if (status.level === 'low') {
                    stockStatusHTML = `<span class="store-stock-note is-low tabular-nums"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Low stock · ${currentStockCount} left</span>`;
                } else if (status.level === 'ok') {
                    stockStatusHTML = `<span class="store-stock-note is-ok tabular-nums">${currentStockCount} left</span>`;
                }
            }

            let row = document.createElement('div');
            const stateClass = isOutOfStock ? ' is-locked' : (isLowStock ? ' is-low-stock' : '');
            row.className = `dynamic-item store-item-row is-${item.cat}${stateClass}`;
            if (typeof row.setAttribute === 'function') {
                row.setAttribute('role', 'button');
                row.setAttribute('tabindex', '0');
                row.setAttribute('data-item-name', item.name || '');
                row.setAttribute('data-track-as', item.trackAs || '');
                row.setAttribute('data-price', String(safePrice));
                row.setAttribute('data-stock-status', stockLevel);
                if (resolvedThreshold !== null) {
                    row.setAttribute('data-low-stock-threshold', String(resolvedThreshold));
                }
                const stockAriaSuffix = isOutOfStock
                    ? ', Out of stock'
                    : (isLowStock ? `, Low stock, ${currentStockCount} left` : '');
                row.setAttribute('aria-label', `${item.display || item.name}${safePrice > 0 ? `, ${safePrice} ${userCurrency}` : ', Free'}${stockAriaSuffix}`);
            }
            
            let pressTimer;
            let isLongPress = false;
            let isCancelled = false;
            let startY = 0; // Track finger start position to detect scrolls

            const startPress = (e) => {
                if (e.target && typeof e.target.closest === 'function' && e.target.closest('.store-item-qty-btn')) return;
                if (e.button && e.button !== 0) return;
                // Record where the finger landed — decision is made on pointerup
                startY = e.clientY;
                if (isOutOfStock) {
                    // Don't fire yet — wait to see if user scrolls or actually taps
                    return;
                }
                isLongPress = false;
                isCancelled = false;
                row.classList.add('is-pressed');
                pressTimer = setTimeout(() => {
                    isLongPress = true;
                    if (navigator.vibrate) navigator.vibrate([50]);
                    selectItem(item.name, safePrice);
                    row.classList.remove('is-pressed');
                }, 500);
            };

            const cancelPress = () => {
                isCancelled = true;
                row.classList.remove('is-pressed');
                clearTimeout(pressTimer);
            };

            const endPress = (e) => {
                clearTimeout(pressTimer);
                row.classList.remove('is-pressed');
                if (e.target && typeof e.target.closest === 'function' && e.target.closest('.store-item-qty-btn')) return;

                // If finger moved more than 8px vertically, it was a scroll — ignore entirely
                const didScroll = Math.abs((e.clientY || startY) - startY) > 8;
                if (didScroll) return;

                // Now it's confirmed to be a tap — show OOS alert here, not on pointerdown
                if (isOutOfStock) {
                    if (typeof window.showAppAlert === 'function') window.showAppAlert("Stock Alert", `${item.display || item.name} is currently out of stock in your drawer.`);
                    return;
                }
                if (!isLongPress && !isCancelled) {
                    if (e.cancelable) e.preventDefault();
                    instantSaveItem(item.name, safePrice);
                }
            };

            row.addEventListener('pointerdown', startPress);
            row.addEventListener('pointerup', endPress);
            row.addEventListener('pointerleave', cancelPress);
            row.addEventListener('pointercancel', cancelPress);
            row.addEventListener('keydown', (e) => {
                if (e.target !== row) return;
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (isOutOfStock) {
                        if (typeof window.showAppAlert === 'function') window.showAppAlert("Stock Alert", `${item.display || item.name} is currently out of stock in your drawer.`);
                        return;
                    }
                    instantSaveItem(item.name, safePrice);
                }
            });
            row.oncontextmenu = (e) => { e.preventDefault(); return false; };
            
            let priceDisplay = safePrice > 0 
                ? `<span class="store-item-price">${safePrice} <span>${userCurrency}</span></span>` 
                : `<span class="store-item-free">FREE</span>`;
            
            const showQtyBtn = !isOutOfStock && canSelectMultiQty(item.name);
            let qtyBtnHTML = showQtyBtn
                ? `<button type="button" class="store-item-qty-btn" title="Select quantity" aria-label="Select quantity for ${escapeHtml(item.display || item.name)}">Qty</button>`
                : '';

            let actionIcon = isOutOfStock
                ? `<div class="store-item-action is-danger"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>`
                : `<div class="store-item-action"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></div>`;
 
            let subText = isOutOfStock 
                ? `<span class="store-stock-note is-out">Out of Stock</span>` 
                : stockStatusHTML;

            row.innerHTML = `
                <div class="store-item-main">
                    <div class="store-item-icon">${iconSVG}</div>
                    <div class="store-item-copy">
                        <span class="store-item-name">${escapeHtml(item.display || item.name)}</span>
                        ${subText}
                    </div>
                </div>
                <div class="store-item-meta">
                    ${priceDisplay}
                    ${qtyBtnHTML}
                    ${actionIcon}
                </div>
            `;
            if (showQtyBtn && typeof row.querySelector === 'function') {
                const qtyBtn = row.querySelector('.store-item-qty-btn');
                if (qtyBtn && typeof qtyBtn.addEventListener === 'function') {
                    qtyBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
                    qtyBtn.addEventListener('pointerup', (e) => { e.stopPropagation(); });
                    qtyBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        selectItem(item.name, safePrice);
                    });
                }
            }
            container.appendChild(row);
        });

        // After rendering, hide any category group whose containers all ended up empty and sync its pill
        document.querySelectorAll('.store-cat-group').forEach(group => {
            const containers = Array.from(group.querySelectorAll('[id^="container-"]'));
            const totalChildren = containers.reduce((sum, c) => sum + c.childElementCount, 0);
            const pill = document.querySelector(`#store-pills-container .store-pill[data-store-cat="${group.id}"]`)
                || document.querySelector(`#store-pills-container .store-pill[onclick*="'${group.id}'"]`);
            if (totalChildren === 0) {
                group.style.display = 'none';
                if (pill) pill.style.display = 'none';
            } else {
                if (pill) pill.style.display = '';
            }
        });

        const activePill = document.querySelector('#store-pills-container .store-pill.active');
        if (activePill && activePill.style.display === 'none') {
            const firstVisiblePill = Array.from(document.querySelectorAll('#store-pills-container .store-pill')).find(p => p.style.display !== 'none');
            if (firstVisiblePill) firstVisiblePill.click();
        } else {
            filterStoreCatalog();
        }
    } catch (e) {
        console.error("Critical error in renderAppUI:", e);
        if (typeof window.showAppAlert === 'function') {
            window.showAppAlert("Display Error", "Could not load the catalog. Please refresh the page or contact support.");
        }
    }
}
