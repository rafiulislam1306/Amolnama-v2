// src/features/inventory.js
import { AppState } from '../core/state.js';
import { showAppAlert } from '../utils/ui-helpers.js';

export function getPhysicalItems() { 
    return AppState.globalInventoryGroups; 
}

export function getInventoryChange(tx) {
    if (!tx.trackAs || !AppState.globalInventoryGroups.includes(tx.trackAs)) return 0;
    if (tx.name === 'Physical Cash' || tx.name === 'ERS Flexiload') return 0;
    
    let q = Math.abs(parseInt(tx.qty) || 0); 
    
    if (tx.type === 'transfer_in') return q;           
    if (tx.type === 'transfer_out') return -q;         
    if (tx.type === 'adjustment') return parseInt(tx.qty) || 0; 
    
    return -q; 
}

export function getAvailableStock(itemName) {
    let catItem = Object.values(AppState.globalCatalog).find(c => c.name === itemName);
    let trackAs = catItem ? (catItem.trackAs || itemName) : itemName; 
    
    if (!AppState.globalInventoryGroups.includes(trackAs)) return Infinity; 

    let stock = AppState.currentOpeningInv[trackAs] || 0; 

    AppState.transactions.forEach(tx => {
        // FIX: Use sessionId to perfectly match the current active shift's dashboard!
        if (tx.sessionId === AppState.currentSessionId && !tx.isDeleted && tx.trackAs === trackAs) {
            stock += getInventoryChange(tx); 
        }
    });
    return stock;
}

export function passStockFirewall(itemName, requestedQty) {
    let catItem = Object.values(AppState.globalCatalog).find(c => c.name === itemName);
    let trackAs = catItem ? (catItem.trackAs || itemName) : itemName; 
    
    if (!AppState.globalInventoryGroups.includes(trackAs)) return true; 

    let available = getAvailableStock(itemName);
    if (available < requestedQty) {
        showAppAlert("Insufficient Stock", `You only have ${available}x ${trackAs} available in your drawer. You cannot complete this transaction.`);
        return false; 
    }
    return true; 
}

export function switchStoreCategory(catId, btn) {
    document.querySelectorAll('.store-pill').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    
    document.querySelectorAll('.store-cat-group').forEach(c => c.style.display = 'none');
    document.getElementById(catId).style.display = 'block';
}