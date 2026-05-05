// src/features/catalog.js
import { AppState } from '../core/state.js';
import { selectItem, instantSaveItem } from './transactions.js';

export function renderAppUI() {
    try {
        const userCurrency = 'Tk'; 
        
        // Clear existing items
        document.querySelectorAll('.dynamic-item').forEach(el => el.remove());
        
        // Safety check
        if (!AppState.globalCatalog) return;

        Object.values(AppState.globalCatalog).sort((a, b) => (a.order || 0) - (b.order || 0)).forEach(item => {
            // Only hide the item if it is explicitly set to false. Otherwise, assume it is active.
            if (item.isActive === false) return;
            
            let safePrice = parseFloat(item.price) || 0;
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
            
            let row = document.createElement('div');
            row.className = 'dynamic-item';
            row.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid var(--border-color); cursor: pointer; user-select: none; transition: background-color 0.1s;';
            
            let pressTimer;
            let isLongPress = false;
            let isCancelled = false;
            
            const startPress = (e) => {
                if (e.button && e.button !== 0) return; 
                isLongPress = false;
                isCancelled = false;
                row.style.backgroundColor = 'var(--bg-color)'; 
                pressTimer = setTimeout(() => {
                    isLongPress = true;
                    if (navigator.vibrate) navigator.vibrate([50]); 
                    selectItem(item.name, safePrice); 
                    row.style.backgroundColor = 'transparent';
                }, 500); 
            };
            
            const cancelPress = () => {
                isCancelled = true;
                row.style.backgroundColor = 'transparent';
                clearTimeout(pressTimer);
            };
            
            const endPress = (e) => {
                clearTimeout(pressTimer);
                row.style.backgroundColor = 'transparent';
                if (!isLongPress && !isCancelled) {
                    instantSaveItem(item.name, safePrice);
                }
            };
            
            row.addEventListener('pointerdown', startPress);
            row.addEventListener('pointerup', endPress);
            row.addEventListener('pointerleave', cancelPress);
            row.addEventListener('pointercancel', cancelPress);
            row.oncontextmenu = (e) => { e.preventDefault(); return false; };
            
            let priceDisplay = safePrice > 0 ? `<span style="font-size: 0.9rem; font-weight: 700; color: var(--text-secondary);">${safePrice} ${userCurrency}</span>` : `<span style="font-size: 0.9rem; font-weight: 700; color: #10b981;">Free</span>`;
            
            row.innerHTML = `
                <div style="display: flex; align-items: center; gap: 14px; min-width: 0; flex: 1;">
                    <div style="flex-shrink: 0; display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; background: var(--bg-color); border-radius: 10px;">${iconSVG}</div>
                    <div style="display: flex; flex-direction: column; min-width: 0;">
                        <span style="font-weight: 600; color: var(--text-primary); font-size: 1rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.display || item.name}</span>
                        <span style="font-size: 0.75rem; color: var(--text-secondary); font-weight: 500;">Tap to add • Hold for Qty</span>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 12px; flex-shrink: 0; padding-left: 12px;">
                    ${priceDisplay}
                    <div style="background: var(--bg-color); border: 1px solid var(--border-color); border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; color: var(--text-primary);">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    </div>
                </div>
            `;
            container.appendChild(row);
        });
    } catch (e) {
        console.error("Critical error in renderAppUI:", e);
    }
}