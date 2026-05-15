// src/utils/helpers.js

export function getStrictDate() { 
    const t = new Date(); 
    return `${String(t.getDate()).padStart(2,'0')}/${String(t.getMonth()+1).padStart(2,'0')}/${t.getFullYear()}`; 
}

export function generateReceiptNo() {
    const date = new Date();
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `TXN-${d}${m}-${random}`;
}

export function formatToGBDate(iso) { 
    if(!iso) return null; 
    if(iso.includes('/')) return iso; 
    // Defensive check to prevent undefined/undefined/undefined errors
    if(!iso.includes('-')) return iso; 
    
    const [y,m,d] = iso.split('-'); 
    return `${d}/${m}/${y}`; 
}