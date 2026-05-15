// src/features/catalog.js
import { AppState } from '../core/state.js';
import { selectItem, instantSaveItem } from './transactions.js';
import { priorityItemSortOrder } from '../core/constants.js';

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
                iconSVG = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`;
            }
            else if (item.cat === 'paid-rep') {
                containerId = 'container-paid-rep';
                iconSVG = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`;
            }
            else if (item.cat === 'foc' || item.cat === 'free-action') {
                containerId = item.cat === 'foc' ? 'container-foc' : 'container-free-actions';
                iconSVG = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
            }
            else if (item.cat === 'service') {
                containerId = 'container-services';
                iconSVG = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`;
            } else {
                return; // Safety catch: Skip items with undefined categories
            }
            
            let container = document.getElementById(containerId);
            if (!container) return; // Skip if category HTML container doesn't exist
            
            // STRICT RULE: Death TOF and Govt. FOC are ONLY visible to center_manager
            if ((item.name === 'Death TOF' || item.name === 'Govt. FOC') && AppState.currentUserRole !== 'center_manager') {
                return; // Hide entirely
            }

            let isLocked = item.managerOnly && !['manager', 'center_manager', 'admin', 'owner'].includes(AppState.currentUserRole);
            
            // Completely hide other restricted items from standard floor agents
            if (isLocked) return;

            let row = document.createElement('div');
            row.className = `dynamic-item store-item-row${isLocked ? ' is-locked' : ''}`;
            
            let pressTimer;
            let isLongPress = false;
            let isCancelled = false;
            
            const startPress = (e) => {
                if (e.button && e.button !== 0) return; 
                if (isLocked) {
                    isCancelled = true;
                    if (typeof window.showAppAlert === 'function') window.showAppAlert("Access Denied", "🔒 Only a Center Manager can process this item.");
                    return;
                }
                isLongPress = false;
                isCancelled = false;
                row.style.backgroundColor = 'var(--bg-color)'; 
                row.style.transform = 'scale(0.98)'; // Add tactile scale physics
                pressTimer = setTimeout(() => {
                    isLongPress = true;
                    if (navigator.vibrate) navigator.vibrate([50]); 
                    selectItem(item.name, safePrice); 
                    row.style.backgroundColor = 'transparent';
                    row.style.transform = 'scale(1)';
                }, 500); 
            };
            
            const cancelPress = () => {
                isCancelled = true;
                row.style.backgroundColor = 'transparent';
                row.style.transform = 'scale(1)';
                clearTimeout(pressTimer);
            };
            
            const endPress = (e) => {
                clearTimeout(pressTimer);
                row.style.backgroundColor = 'transparent';
                row.style.transform = 'scale(1)';
                if (!isLongPress && !isCancelled) {
                    instantSaveItem(item.name, safePrice);
                }
            };
            
            row.addEventListener('pointerdown', startPress);
            row.addEventListener('pointerup', endPress);
            row.addEventListener('pointerleave', cancelPress);
            row.addEventListener('pointercancel', cancelPress);
            row.oncontextmenu = (e) => { e.preventDefault(); return false; };
            
            let priceDisplay = safePrice > 0 
                ? `<span class="store-item-price">${safePrice} <span>${userCurrency}</span></span>` 
                : `<span class="store-item-free">FREE</span>`;
            
            let actionIcon = isLocked 
                ? `<div class="store-item-action is-danger"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>`
                : `<div class="store-item-action"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></div>`;

            let subText = isLocked 
                ? `<span style="font-size: 0.75rem; color: #ef4444; font-weight: 600; margin-top: 4px;">🔒 Center Manager Only</span>` 
                : ``; // Remove redundant helper text to eliminate visual clutter

            row.innerHTML = `
                <div class="store-item-main">
                    <div class="store-item-icon">${iconSVG}</div>
                    <div class="store-item-copy">
                        <span class="store-item-name">${item.display || item.name}</span>
                        ${subText}
                    </div>
                </div>
                <div class="store-item-meta">
                    ${priceDisplay}
                    ${actionIcon}
                </div>
            `;
            container.appendChild(row);
        });
    } catch (e) {
        console.error("Critical error in renderAppUI:", e);
        if (typeof window.showAppAlert === 'function') {
            window.showAppAlert("Display Error", "Could not load the catalog. Please refresh the page or contact support.");
        }
    }
}
