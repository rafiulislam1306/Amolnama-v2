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

export function formatLocalISODate(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function isViewingHistoricalDate() {
    if (typeof document === 'undefined') return false;
    const datePicker = document.getElementById('report-date-picker');
    if (!datePicker || !datePicker.value) return false;
    return formatToGBDate(datePicker.value) !== getStrictDate();
}

export function escapeHtml(val) {
    if (val === null || val === undefined) return '';
    return String(val)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function escapeJsSingleQuote(val) {
    if (val === null || val === undefined) return '';
    return escapeHtml(
        String(val)
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/\r/g, '\\r')
            .replace(/\n/g, '\\n')
    );
}

export function formatUserIdentifier(email) {
    if (!email) return 'No Email Linked';
    if (email.startsWith('phone_') && email.endsWith('@amolnama.internal')) {
        const phone = email.slice('phone_'.length, -'@amolnama.internal'.length);
        return `Phone: ${phone}`;
    }
    return email;
}