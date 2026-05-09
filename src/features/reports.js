// src/features/reports.js
import { collection, query, where, getDocs, onSnapshot, doc, getDoc } from "firebase/firestore";
import { renderLiveFloorTab } from './desk.js';
import { db } from '../config/firebase.js';
import { AppState } from '../core/state.js';
import { getStrictDate, formatToGBDate } from '../utils/helpers.js';
import { showAppAlert, showFlashMessage, openModal } from '../utils/ui-helpers.js';
import { getPhysicalItems } from './inventory.js';

const userCurrency = 'Tk';
let currentReportMode = 'personal';

export function toggleReportMode(mode) {
    currentReportMode = mode;
    document.getElementById('toggle-personal').classList.toggle('active', mode === 'personal');
    document.getElementById('toggle-floor').classList.toggle('active', mode === 'floor');
    renderPersonalReport();
}

export async function renderPersonalReport() {
    let filterVal = document.getElementById('personal-history-filter') ? document.getElementById('personal-history-filter').value : 'all';
    
    let myCash = 0, myMfs = 0;
    let myErsCount = 0, myErsTotal = 0;
    let myItemsSold = {}; 
    let historyHTML = '';

    let targetDateStr = formatToGBDate(document.getElementById('report-date-picker').value || getStrictDate());

    let floorOpeningCash = 0;
    let floorManagerDrops = 0;
    
    let floorInvStats = {};
    getPhysicalItems().forEach(item => {
        floorInvStats[item] = { open: 0, inOut: 0, sold: 0, rem: 0 };
    });

    let vaultButtonsHTML = ''; 

    if (currentReportMode === 'floor') {
        try {
            const sessSnap = await getDocs(query(collection(db, 'sessions'), where('dateStr', '==', targetDateStr)));
            
            let deskFirstSessions = {};

            for (const docSnap of sessSnap.docs) {
                let s = docSnap.data();
                
                // Group sessions by desk to find the true morning start
                let t = s.openedAt?.toMillis() || 0;
                if (!deskFirstSessions[s.deskId] || t < deskFirstSessions[s.deskId].time) {
                    deskFirstSessions[s.deskId] = { time: t, data: s };
                }
                
                if (s.status === 'closed' || s.status === 'pending' || s.status === 'rolled_over') {
                    let agentName = s.openedBy ? s.openedBy.split(' ')[0] : 'Agent';
                    
                    if (agentName === 'System' && s.deskId.startsWith('personal_')) {
                        try {
                            const deskSnap = await getDoc(doc(db, 'desks', s.deskId));
                            if (deskSnap.exists() && deskSnap.data().name) {
                                agentName = deskSnap.data().name.replace("'s Drawer", "");
                            }
                        } catch(e) {}
                    }
                    
                    let statusLabel = s.status === 'pending' ? 'Pending' : (s.status === 'rolled_over' ? 'Rolled Over' : 'Sealed');
                    let badgeColor = s.status === 'pending' ? '#f59e0b' : (s.status === 'rolled_over' ? '#3b82f6' : '#10b981');
                    let bgCol = s.status === 'pending' ? '#fffbeb' : (s.status === 'rolled_over' ? '#eff6ff' : '#ecfdf5');
                    
                    vaultButtonsHTML += `
                        <button class="btn-outline" style="flex-shrink: 0; border-color: ${badgeColor}; color: ${badgeColor}; background: ${bgCol}; font-size: 0.85rem; padding: 8px 14px; border-radius: 10px; display: flex; align-items: center; gap: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);" onclick="openHistoricalSession('${docSnap.id}')">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                            ${agentName} (${statusLabel})
                        </button>
                    `;
                }
            }

            // Apply the true morning opening balances once per desk
            Object.values(deskFirstSessions).forEach(firstSess => {
                let s = firstSess.data;
                floorOpeningCash += parseFloat(s.openingBalances?.cash) || 0;
                let inv = s.openingBalances?.inventory || {};
                for (let [item, qty] of Object.entries(inv)) {
                    if (floorInvStats[item]) {
                        floorInvStats[item].open += qty;
                        floorInvStats[item].rem += qty;
                    }
                }
            });

        } catch(e) { console.error("Could not fetch floor sessions", e); }
    }

    [...AppState.transactions].reverse().forEach(tx => {
        if (tx.isDeleted) return;
        
        if (currentReportMode === 'personal') {
            let isMyAction = tx.agentId === AppState.currentUser.uid;
            let isMyDeskTransfer = AppState.currentDeskId && tx.deskId === AppState.currentDeskId && (tx.type === 'transfer_in' || tx.type === 'transfer_out');
            
            if (!isMyAction && !isMyDeskTransfer) return;
        }

        let safeCashAmt = tx.cashAmt !== undefined ? tx.cashAmt : (tx.payment === 'Cash' ? tx.amount : 0);
        let safeMfsAmt = tx.mfsAmt !== undefined ? tx.mfsAmt : (tx.payment === 'MFS' ? tx.amount : 0);
        
        if (tx.type === 'adjustment' && tx.name === 'Physical Cash') {
            floorManagerDrops += safeCashAmt;
        } else if (tx.type !== 'adjustment' && tx.type !== 'transfer_out' && tx.type !== 'transfer_in') {
            myCash += safeCashAmt; 
            myMfs += safeMfsAmt;
            
            if (tx.name === 'ERS Flexiload') {
                myErsCount += Math.abs(tx.qty);
                myErsTotal += tx.amount;
            } else if (tx.name !== 'Physical Cash') {
                myItemsSold[tx.name] = (myItemsSold[tx.name] || 0) + Math.abs(tx.qty); 
            }
        }

        if (currentReportMode === 'floor' && AppState.globalInventoryGroups.includes(tx.trackAs)) {
            let trackAs = tx.trackAs;
            let q = Math.abs(tx.qty);
            
            if (tx.type === 'transfer_in') { floorInvStats[trackAs].inOut += q; floorInvStats[trackAs].rem += q; }
            else if (tx.type === 'transfer_out') { floorInvStats[trackAs].inOut -= q; floorInvStats[trackAs].rem -= q; }
            else if (tx.type === 'adjustment') { floorInvStats[trackAs].inOut += q; floorInvStats[trackAs].rem += q; }
            else { 
                floorInvStats[trackAs].sold += q; 
                floorInvStats[trackAs].rem -= q; 
            }
        }
        
        let catItem = Object.values(AppState.globalCatalog).find(c => c.name === tx.name);
        let txCat = catItem ? catItem.cat : null;
        let showTx = false;
        
        if (filterVal === 'all') showTx = true;
        else if (filterVal === 'ers' && tx.name === 'ERS Flexiload') showTx = true;
        else if (filterVal === 'cash_ops' && tx.type === 'adjustment' && tx.name === 'Physical Cash') showTx = true;
        else if (filterVal === 'transfers' && (tx.type === 'transfer_in' || tx.type === 'transfer_out')) showTx = true;
        else if (filterVal === txCat) showTx = true;

        if (!showTx) return;
        
        let payLabel = tx.payment === 'Split' ? `Split (C:${safeCashAmt}/M:${safeMfsAmt})` : tx.payment;
        let badges = '';
        
        if (tx.isPending) badges += '<span style="font-size: 0.7rem; background: #fef08a; color: #854d0e; padding: 2px 6px; border-radius: 10px; margin-left: 8px; font-weight: bold;">Pending</span>';
        if (tx.isEdited) badges += `<span style="font-size: 0.7rem; background: #fef3c7; color: #92400e; padding: 2px 6px; border-radius: 10px; margin-left: 8px; font-weight: bold; cursor: pointer;" onclick="showAuditTrail('${tx.id}')">Edited</span>`;
        let agentBadge = currentReportMode === 'floor' ? ` &bull; <span style="color: var(--text-primary); font-weight: 600;">By ${tx.agentName.split(' ')[0]}</span>` : '';

        let actionBtns = '';
        if (currentReportMode === 'personal' || AppState.currentUserRole === 'admin' || AppState.currentUserRole === 'manager') {
            actionBtns = `
                <div class="tx-actions" style="display: none; width: 100%; padding-top: 12px; margin-top: 12px; border-top: 1px dashed var(--border-color); justify-content: flex-end; gap: 8px;">
                    <button class="btn-outline" style="height: auto; padding: 6px 16px; font-size: 0.85rem; color: var(--accent-color); border-color: var(--accent-color); gap: 6px;" onclick="event.stopPropagation(); openEditTx(${tx.id})">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg> Edit
                    </button>
                    <button class="btn-outline" style="height: auto; padding: 6px 16px; font-size: 0.85rem; color: #ef4444; border-color: #fca5a5; background: #fef2f2; gap: 6px;" onclick="event.stopPropagation(); deleteTransaction('${tx.docId}', ${tx.id})">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg> Trash
                    </button>
                </div>
            `;
        }

        let isOutflow = tx.type === 'adjustment' || tx.type === 'transfer_out';
        let dotColor = '#10b981'; // Default Green (ERS)
        if (tx.type === 'adjustment') dotColor = '#ef4444'; // Red
        else if (tx.type === 'transfer_out' || tx.type === 'transfer_in') dotColor = '#8b5cf6'; // Purple
        else if (tx.name !== 'ERS Flexiload') dotColor = '#3390ec'; // Blue

        let amtColor = isOutflow ? 'var(--danger-text)' : 'var(--text-primary)';
        let amtPrefix = isOutflow ? '− ' : '';

        historyHTML += `
            <div class="history-item" style="display: flex; flex-direction: column; padding: 16px; background: var(--surface-color); border: 1px solid var(--border-color); border-radius: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.02); margin-bottom: 12px; cursor: pointer; transition: transform 0.1s;" onclick="const actions = this.querySelector('.tx-actions'); if(actions) { actions.style.display = actions.style.display === 'none' ? 'flex' : 'none'; }">
                <div style="display: flex; width: 100%; align-items: flex-start; gap: 14px;">
                    <div style="width: 44px; height: 44px; border-radius: 12px; background: ${dotColor}15; color: ${dotColor}; display: flex; align-items: center; justify-content: center; flex-shrink: 0; border: 1px solid ${dotColor}30;">
                        <span style="font-size: 0.95rem; font-weight: 800;">${tx.qty}x</span>
                    </div>
                    <div style="flex: 1; min-width: 0; padding-top: 2px;">
                        <div style="font-size: 1rem; color: var(--text-primary); font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.2; margin-bottom: 6px;">
                            ${tx.name}
                        </div>
                        <div style="font-size: 0.75rem; color: var(--text-secondary); line-height: 1.5; margin-top: 4px;">
                            <span style="font-family: monospace; color: var(--text-primary); opacity: 0.8; font-weight: 600;">${tx.receiptNo || tx.id}</span> &bull; ${tx.time} &bull; ${payLabel}${agentBadge} ${badges}
                        </div>
                    </div>
                    <div style="font-size: 1.1rem; font-weight: 800; color: ${amtColor}; flex-shrink: 0; text-align: right; padding-top: 2px;">
                        ${amtPrefix}${Math.abs(tx.amount || 0)}
                    </div>
                </div>
                ${actionBtns}
            </div>
        `;
    });

    if (currentReportMode === 'floor') {
        document.getElementById('report-user-name').innerText = "Center Report";
        document.getElementById('report-user-email').innerText = `Opening Cash: ${floorOpeningCash} Tk | Manager Drops: ${floorManagerDrops} Tk`;
        document.getElementById('report-user-photo').src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23666666'%3E%3Cpath d='M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V9h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V9h2v2zm0-4H8V5h2v2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10zm-2-8h-2v2h2v-2zm0 4h-2v2h2v-2z'/%3E%3C/svg%3E";
    } else {
        document.getElementById('report-user-name').innerText = AppState.userDisplayName;
        document.getElementById('report-user-email').innerText = AppState.currentUser.email || 'email@example.com';
        if (AppState.currentUser.photoURL) document.getElementById('report-user-photo').src = AppState.currentUser.photoURL;
    }

    if(document.getElementById('report-total-all')) document.getElementById('report-total-all').innerText = (myCash + myMfs) + ' ' + userCurrency;
    if(document.getElementById('tot-cash-sales')) {
        document.getElementById('tot-cash-sales').innerText = myCash + ' ' + userCurrency;
        document.getElementById('tot-cash-sales').style.color = '#0ea5e9';
    }
    if(document.getElementById('tot-mfs')) {
        document.getElementById('tot-mfs').innerText = myMfs + ' ' + userCurrency;
        document.getElementById('tot-mfs').style.color = '#10b981';
    }
    if(document.getElementById('tot-ers')) {
        document.getElementById('tot-ers').innerText = myErsTotal + ' ' + userCurrency;
        document.getElementById('tot-ers').style.color = '#f59e0b';
    }

    let invHTML = '';
    for (const [name, qty] of Object.entries(myItemsSold)) {
        invHTML += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 14px 4px; border-bottom: 1px solid var(--border-color);">
                <span style="font-weight: 600; color: var(--text-primary); font-size: 1rem; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 12px;">${name}</span>
                <span style="font-weight: 800; color: var(--text-secondary); font-size: 1.1rem; flex-shrink: 0;">${qty}x</span>
            </div>
        `;
    }

    document.getElementById('inventory-list').innerHTML = invHTML || '<div class="report-row" style="color: var(--text-secondary); font-style: italic; padding: 12px 4px;">No items sold yet</div>';

    let floorStockSection = document.getElementById('floor-stock-section');
    if (floorStockSection) floorStockSection.style.display = (currentReportMode === 'floor') ? 'block' : 'none';

    if (currentReportMode === 'floor') {
        let liveStockHTML = `
            <div style="display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 1.2fr; gap: 4px; padding: 4px 4px 8px 4px; border-bottom: 2px solid var(--border-color); font-size: 0.7rem; font-weight: 800; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">
                <div>Item</div>
                <div style="text-align: center;">Start</div>
                <div style="text-align: center;">In/Out</div>
                <div style="text-align: center;">Sold</div>
                <div style="text-align: center; color: #0ea5e9;">Exp.</div>
            </div>
        `;
        
        let hasLiveStock = false;
        for (const [item, d] of Object.entries(floorInvStats)) {
            if (d.open === 0 && d.inOut === 0 && d.sold === 0 && d.rem === 0) continue;
            hasLiveStock = true;
            
            let inOutColor = d.inOut > 0 ? '#10b981' : (d.inOut < 0 ? '#ef4444' : 'var(--text-secondary)');
            let inOutStr = d.inOut > 0 ? `+${d.inOut}` : (d.inOut < 0 ? `${d.inOut}` : `0`);

            liveStockHTML += `
                <div style="display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 1.2fr; gap: 4px; align-items: center; padding: 12px 4px; border-bottom: 1px dashed var(--border-color); font-size: 0.85rem;">
                    <div style="font-weight: 700; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 4px; cursor: pointer;" onclick="showTooltip(this, '${item}')">${item}</div>
                    <div style="text-align: center; color: var(--text-secondary); font-weight: 600;">${d.open}</div>
                    <div style="text-align: center; color: ${inOutColor}; font-weight: 700;">${inOutStr}</div>
                    <div style="text-align: center; color: #f59e0b; font-weight: 700;">${d.sold}</div>
                    <div style="text-align: center; color: #0ea5e9; font-weight: 800; font-size: 1rem;">${d.rem}</div>
                </div>
            `;
        }
        
        if (!hasLiveStock) liveStockHTML += '<div style="color: var(--text-secondary); font-style: italic; padding: 12px 4px;">No physical stock recorded today</div>';
        
        if (vaultButtonsHTML !== '') {
            liveStockHTML += `
                <div style="margin-top: 20px; font-size: 0.95rem; font-weight: 800; color: #b91c1c; margin-bottom: 12px; padding: 0 4px; border-bottom: 2px solid #fecaca; padding-bottom: 8px; display: flex; align-items: center; gap: 6px;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    Closed Shift Vault
                </div>
                <div style="display: flex; gap: 10px; overflow-x: auto; padding: 4px 4px 16px 4px; scrollbar-width: none; -ms-overflow-style: none; -webkit-overflow-scrolling: touch;">
                    ${vaultButtonsHTML}
                </div>
            `;
        }
        
        if (document.getElementById('floor-stock-list')) {
            document.getElementById('floor-stock-list').innerHTML = liveStockHTML;
        }
    }
    
    document.getElementById('history-log').innerHTML = historyHTML || `
        <div class="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
            </svg>
            <p>No transactions found</p>
        </div>`;
}

export function buildLifecycleText(txList, openingInv) {
    let stats = {};
    let hasItems = false;
    
    getPhysicalItems().forEach(item => {
        let openQty = openingInv[item] || 0;
        if (openQty > 0) {
            stats[item] = { open: openQty, in: 0, out: 0, sold: 0, rem: openQty, rev: 0 };
            hasItems = true;
        }
    });

    txList.forEach(tx => {
        if (tx.isDeleted || tx.name === 'Physical Cash' || tx.name === 'ERS Flexiload') return;
        let trackAs = tx.trackAs;
        if (!AppState.globalInventoryGroups.includes(trackAs)) return;

        if (!stats[trackAs]) stats[trackAs] = { open: 0, in: 0, out: 0, sold: 0, rem: 0, rev: 0 };
        hasItems = true;
        let q = Math.abs(tx.qty);
        
        if (tx.type === 'transfer_in') { stats[trackAs].in += q; stats[trackAs].rem += q; }
        else if (tx.type === 'transfer_out') { stats[trackAs].out += q; stats[trackAs].rem -= q; }
        else if (tx.type === 'adjustment') { stats[trackAs].in += q; stats[trackAs].rem += q; }
        else { stats[trackAs].sold += q; stats[trackAs].rem -= q; stats[trackAs].rev += (tx.amount || 0); }
    });

    if (!hasItems) return "   No physical items tracked.\n";

    let text = "";
    for (const [item, data] of Object.entries(stats)) {
        if (data.open === 0 && data.in === 0 && data.sold === 0 && data.out === 0) continue;
        text += `- *${item}*\n`;
        text += `   Start: ${data.open} | In: +${data.in} | Out: -${data.out}\n`;
        text += `   Sold: ${data.sold} | Exp. Left: ${data.rem}\n\n`;
    }
    return text;
}

export function fallbackCopy(text) {
    try {
        const textArea = document.createElement("textarea");
        textArea.value = text; document.body.appendChild(textArea); textArea.select();
        document.execCommand("copy"); document.body.removeChild(textArea);
        showFlashMessage("Report Copied to Clipboard!");
    } catch (err) { showAppAlert("Error", "Could not copy report."); }
}

export function shareReport() {
    let dateStr = formatToGBDate(document.getElementById('report-date-picker').value);
    let totalRevenue = document.getElementById('report-total-all') ? document.getElementById('report-total-all').innerText : "0 Tk";
    let totalMfs = document.getElementById('tot-mfs').innerText;
    let totalCash = document.getElementById('tot-cash-sales').innerText;
    let totalErs = document.getElementById('tot-ers').innerText;
    
    let reportText = "";
    
    if (currentReportMode === 'floor') {
        reportText = `=== *CENTER REPORT* ===\nDate: ${dateStr}\n\n`;
        reportText += `[ *SALES SUMMARY* ]\n`;
        reportText += `   Total Revenue:  ${totalRevenue}\n`;
        reportText += `   Cash Collected: ${totalCash}\n`;
        reportText += `   MFS Collected:  ${totalMfs}\n`;
        reportText += `   ERS Disbursed:  ${totalErs}\n\n`;
    } else {
        reportText = `=== *MY DAILY REPORT* ===\nDate: ${dateStr}\nAgent: ${AppState.userNickname || AppState.userDisplayName}\n\n`;
        reportText += `[ *SALES SUMMARY* ]\n`;
        reportText += `   Total Revenue:  ${totalRevenue}\n`;
        reportText += `   Cash Collected: ${totalCash}\n`;
        reportText += `   MFS Collected:  ${totalMfs}\n`;
        reportText += `   ERS Disbursed:  ${totalErs}\n\n`;
        reportText += `[ *PHYSICAL INVENTORY* ]\n`;
        let myTx = AppState.transactions.filter(t => t.agentId === AppState.currentUser.uid);
        reportText += buildLifecycleText(myTx, AppState.currentOpeningInv);
    }

    if (navigator.share) navigator.share({ title: 'Amolnama Report', text: reportText }).catch(e => console.log(e));
    else fallbackCopy(reportText);
}

export function shareDeskReport() {
    let dateStr = formatToGBDate(document.getElementById('report-date-picker').value || getStrictDate());
    let deskTitleNode = document.getElementById('desk-dashboard-title');
    let deskTitle = (deskTitleNode && deskTitleNode.innerText !== 'Desk Name') ? deskTitleNode.innerText : 'My Active Desk';
    let activeAgents = document.getElementById('desk-logged-agents') ? document.getElementById('desk-logged-agents').innerText : 'None';

    let opening = document.getElementById('desk-tot-opening') ? document.getElementById('desk-tot-opening').innerText : '0 Tk';
    let cashSales = document.getElementById('desk-tot-cash-sales') ? document.getElementById('desk-tot-cash-sales').innerText : '0 Tk';
    let mgrDrop = document.getElementById('desk-tot-manager') ? document.getElementById('desk-tot-manager').innerText : '0 Tk';
    let expected = document.getElementById('desk-tot-expected-cash') ? document.getElementById('desk-tot-expected-cash').innerText : '0 Tk';

    let deskTx = AppState.transactions.filter(t => t.deskId === AppState.currentDeskId && t.dateStr === dateStr);
    let deskMfs = 0; let itemsSold = {}; let invStats = {};

    getPhysicalItems().forEach(item => {
        let o = AppState.currentOpeningInv[item] || 0;
        invStats[item] = { open: o, in: 0, out: 0, sold: 0, rem: o };
    });

    deskTx.forEach(tx => {
        if(tx.isDeleted) return;
        deskMfs += (tx.mfsAmt !== undefined ? tx.mfsAmt : (tx.payment === 'MFS' ? tx.amount : 0));

        if (tx.type !== 'adjustment' && tx.type !== 'transfer_out' && tx.type !== 'transfer_in' && tx.name !== 'ERS Flexiload' && tx.name !== 'Physical Cash') {
            itemsSold[tx.name] = (itemsSold[tx.name] || 0) + Math.abs(tx.qty);
        }

        if (AppState.globalInventoryGroups.includes(tx.trackAs)) {
            let trackAs = tx.trackAs; let q = Math.abs(tx.qty);
            if (tx.type === 'transfer_in' || tx.type === 'adjustment') { invStats[trackAs].in += q; invStats[trackAs].rem += q; }
            else if (tx.type === 'transfer_out') { invStats[trackAs].out += q; invStats[trackAs].rem -= q; }
            else { invStats[trackAs].sold += q; invStats[trackAs].rem -= q; }
        }
    });

    let reportText = `=== *DESK REPORT* ===\nDate: ${dateStr}\nDesk: ${deskTitle}\nAgents: ${activeAgents}\n\n`;
    reportText += `[ *CASH FORMULA* ]\n`;
    reportText += `   Opening Cash: ${opening}\n`;
    reportText += `   Cash Sales:   +${cashSales}\n`;
    reportText += `   Mgr Drops:    ${mgrDrop}\n`;
    reportText += `   ----------------------\n`;
    reportText += `   Expected:     ${expected}\n\n`;
    reportText += `[ *DIGITAL SALES* ]\n`;
    reportText += `   Total MFS:    ${deskMfs} Tk\n\n`;

    reportText += `[ *PHYSICAL INVENTORY* ]\n`;
    let hasInv = false;
    for (const [item, data] of Object.entries(invStats)) {
        if (data.open === 0 && data.in === 0 && data.sold === 0 && data.out === 0) continue;
        hasInv = true;
        reportText += `- *${item}*\n`;
        reportText += `   Start: ${data.open} | In: +${data.in} | Out: -${data.out}\n`;
        reportText += `   Sold: ${data.sold} | Exp. Left: ${data.rem}\n\n`;
    }
    if (!hasInv) reportText += "   None\n\n";

    reportText += `[ *ITEMS SOLD* ]\n`;
    let hasItems = false;
    for (const [name, qty] of Object.entries(itemsSold)) {
        hasItems = true; reportText += `   ${qty}x ${name}\n`;
    }
    if (!hasItems) reportText += "   No items sold\n";

    if (navigator.share) navigator.share({ title: 'Desk Report', text: reportText }).catch(e => console.log(e));
    else fallbackCopy(reportText);
}

// === NEW: IMAGE GENERATOR CORE ===
export async function downloadReportAsImage(containerId, prefix) {
    const container = document.getElementById(containerId);
    if (!container || !window.html2canvas) {
        showAppAlert("Error", "Image generation library not loaded or container missing.");
        return;
    }
    showFlashMessage("📸 Generating Image Snapshot...");
    try {
        const canvas = await html2canvas(container, {
            scale: 2, // High resolution
            useCORS: true,
            backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--bg-color') || '#ffffff'
        });
        const link = document.createElement('a');
        link.download = `${prefix}_Report_${getStrictDate().replace(/\//g, '-')}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        showFlashMessage("Image Saved to Device!");
    } catch (error) {
        console.error(error);
        showAppAlert("Error", "Failed to generate image.");
    }
}

// === NEW: INVOICE PDF GENERATOR ===
export async function downloadReportAsPDF(mode, prefix) {
    if (!window.html2pdf) {
        showAppAlert("Error", "PDF library not loaded.");
        return;
    }
    
    showFlashMessage("📄 Generating Official Ledger PDF...");

    // 1. Gather Context Data
    let dateStr = formatToGBDate(document.getElementById('report-date-picker').value || getStrictDate());
    let rawTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    let fileTimeStr = rawTime.replace(/ /g, '').replace(/:/g, '-'); 
    
    let deskName = "Center Ledger";
    let agents = AppState.userNickname || AppState.userDisplayName;

    let opening = "0", cashSales = "0", mgrDrops = "0", expected = "0";
    let mfsTotal = "0", ersTotal = "0";

    if (mode === 'tab-desk') {
        let rawDeskName = document.getElementById('desk-dashboard-title')?.innerText || 'My Active Desk';
        deskName = rawDeskName.replace(/\(My Drawer\)/i, '').trim();
        agents = document.getElementById('desk-logged-agents')?.innerText || 'None';
        
        opening = document.getElementById('desk-tot-opening')?.innerText?.replace(' Tk', '') || "0";
        cashSales = document.getElementById('desk-tot-cash-sales')?.innerText?.replace('+ ', '')?.replace(' Tk', '') || "0";
        mgrDrops = document.getElementById('desk-tot-manager')?.innerText?.replace(' Tk', '') || "0";
        expected = document.getElementById('desk-tot-expected-cash')?.innerText?.replace(' Tk', '') || "0";
        
        const mfsCard = document.evaluate("//div[contains(text(), 'Total MFS')]/following-sibling::div", document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        const ersCard = document.evaluate("//div[contains(text(), 'ERS Sent')]/following-sibling::div", document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        mfsTotal = mfsCard ? mfsCard.innerText.replace(' Tk', '') : "0";
        ersTotal = ersCard ? ersCard.innerText.replace(' Tk', '') : "0";
    } else {
        if (currentReportMode === 'floor') deskName = "Consolidated Center Ledger";
        else deskName = "Personal Agent Ledger";
        
        opening = "N/A"; mgrDrops = "N/A"; expected = "N/A";
        cashSales = document.getElementById('tot-cash-sales')?.innerText?.replace(' Tk', '') || "0";
        mfsTotal = document.getElementById('tot-mfs')?.innerText?.replace(' Tk', '') || "0";
        ersTotal = document.getElementById('tot-ers')?.innerText?.replace(' Tk', '') || "0";
    }

    let safeDeskName = deskName.replace(/'/g, '').replace(/ /g, '_');
    let safeDateStr = dateStr.replace(/\//g, '-');
    let finalFileName = `${safeDeskName}_Ledger_${safeDateStr}_${fileTimeStr}.pdf`;

    // 2. Build Inventory & Items Rows
    let inventoryRowsText = '';
    let itemsRowsText = '';

    let stockRows = document.querySelectorAll(mode === 'tab-desk' ? '#live-dashboard-wrapper > div:nth-child(3) > div:nth-child(2) > div > div:not(:first-child)' : '#floor-stock-list > div:not(:first-child)');
    
    if (stockRows && stockRows.length > 0) {
        stockRows.forEach(row => {
            let cols = row.children;
            if(cols.length === 5) {
                let item = cols[0].innerText.padEnd(22, ' ');
                let start = cols[1].innerText.padStart(5, ' ');
                let inOut = cols[2].innerText.padStart(8, ' ');
                let sold = cols[3].innerText.padStart(6, ' ');
                let exp = cols[4].innerText.padStart(10, ' ');
                inventoryRowsText += `${item}${start}${inOut}${sold}${exp}\n`;
            }
        });
    } else {
        inventoryRowsText = `No physical stock recorded.\n`;
    }

    let soldRows = document.querySelectorAll(mode === 'tab-desk' ? '#live-dashboard-wrapper > div:nth-child(4) > div:not(:first-child)' : '#inventory-list > div');
    let hasItems = false;
    if (soldRows && soldRows.length > 0) {
        soldRows.forEach(row => {
            let name = row.children[0]?.innerText;
            let qty = row.children[1]?.innerText;
            if (name && qty && name !== 'No items sold yet' && name !== 'No items or services sold yet') {
                hasItems = true;
                itemsRowsText += `  ${qty.padEnd(4, ' ')} ${name}\n`;
            }
        });
    }
    if (!hasItems) itemsRowsText = `  No items sold\n`;

    // 3. Construct the pure HTML String
    const invoiceContent = `================================================================
                           AMOLNAMA
                         DAILY LEDGER
================================================================
Desk Name:   ${deskName.padEnd(20, ' ')} Date: ${dateStr}
Agents:      ${agents.padEnd(20, ' ')} Time: ${rawTime}
----------------------------------------------------------------

[ 1. CASH FORMULA ]
  Opening Cash Float:                                ${opening.padStart(8, ' ')} Tk
  (+) Cash Sales:                                    ${cashSales.padStart(8, ' ')} Tk
  (+/-) Manager Actions (Drops/Float):               ${mgrDrops.padStart(8, ' ')} Tk
  -----------------------------------------------------------
  EXPECTED DRAWER CASH:                              ${expected.padStart(8, ' ')} Tk

[ 2. DIGITAL & ERS ]
  Total MFS Collected:                               ${mfsTotal.padStart(8, ' ')} Tk
  Total ERS Disbursed:                               ${ersTotal.padStart(8, ' ')} Tk

----------------------------------------------------------------
[ 3. PHYSICAL INVENTORY BALANCE ]
Item                  Start    In/Out    Sold    Expected
----------------------------------------------------------------
${inventoryRowsText}----------------------------------------------------------------
[ 4. ITEMS & SERVICES SOLD ]
${itemsRowsText}================================================================
       Report generated securely by Amolnama on ${dateStr}`;

    const finalHTMLString = `
        <div style="width: 800px; height: auto; background-color: #ffffff; color: #000000; padding: 40px; box-sizing: border-box; font-family: 'Courier New', Courier, monospace; font-size: 14px; line-height: 1.5; white-space: pre;">${invoiceContent}</div>
    `;

    // 4. Measure Exact Height Using Full Scroll Depth
    const heightMeasurer = document.createElement('div');
    heightMeasurer.style.cssText = "position: absolute; visibility: hidden; width: 800px; height: auto; overflow: visible; font-family: 'Courier New', Courier, monospace; font-size: 14px; line-height: 1.5; white-space: pre; padding: 40px; box-sizing: border-box;";
    heightMeasurer.innerHTML = invoiceContent;
    document.body.appendChild(heightMeasurer);
    
    const pxHeight = heightMeasurer.scrollHeight;
    const inHeight = Math.max(8, (pxHeight / 96) + 2); 
    
    document.body.removeChild(heightMeasurer);

    // 5. Generate PDF natively from the string
    const opt = {
        margin:       0.3,
        filename:     finalFileName,
        image:        { type: 'jpeg', quality: 1.0 },
        html2canvas:  { scale: 2, useCORS: true, windowWidth: 800, windowHeight: pxHeight + 200, scrollY: 0 },
        jsPDF:        { unit: 'in', format: [8.5, inHeight], orientation: 'portrait' }
    };

    try {
        const pdfBlob = await html2pdf().set(opt).from(finalHTMLString).output('blob');
        
        // Ensure perfect file formatting for Android/iOS Web Share API compatibility
        const pdfFile = new File([pdfBlob], finalFileName, { 
            type: 'application/pdf', 
            lastModified: new Date().getTime() 
        });

        if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
            
            // 1. Create a pure, native Full-Screen Action Overlay
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); z-index: 999999; display: flex; align-items: center; justify-content: center; flex-direction: column; backdrop-filter: blur(4px);';
            
            const shareBtn = document.createElement('button');
            shareBtn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 10px; vertical-align: middle;"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg> Share Ledger Now';
            shareBtn.style.cssText = 'padding: 16px 32px; font-size: 1.1rem; background: #10b981; color: white; border: none; border-radius: 12px; cursor: pointer; font-weight: bold; box-shadow: 0 8px 24px rgba(16, 185, 129, 0.4); display: flex; align-items: center;';
            
            const closeBtn = document.createElement('button');
            closeBtn.innerText = 'Cancel';
            closeBtn.style.cssText = 'margin-top: 24px; padding: 12px 24px; background: transparent; color: #9ca3af; border: 1px solid #4b5563; border-radius: 8px; cursor: pointer; font-size: 1rem;';

            overlay.appendChild(shareBtn);
            overlay.appendChild(closeBtn);
            document.body.appendChild(overlay);

            // 2. The Share Action (Now guaranteed to have a 0ms delay from the physical tap)
            shareBtn.onclick = async () => {
                try {
                    // Sharing JUST the file. Adding text/titles is known to crash Android Web Views.
                    await navigator.share({ files: [pdfFile] });
                } catch (shareError) {
                    if (shareError.name !== 'AbortError') {
                        showAppAlert("Share Error", "Failed to complete share action.");
                    }
                } finally {
                    // Remove the overlay after sharing is complete or cancelled
                    if (document.body.contains(overlay)) {
                        document.body.removeChild(overlay);
                    }
                }
            };

            // 3. The Cancel Action
            closeBtn.onclick = () => {
                if (document.body.contains(overlay)) {
                    document.body.removeChild(overlay);
                }
            };

        } else {
            showAppAlert("Unsupported", "Your browser or device does not support direct PDF file sharing.");
        }
    } catch (error) {
        console.error("PDF Generation Error:", error);
        showAppAlert("Error", "Failed to generate the PDF ledger.");
    }
}

export function generateDashboardHTML(cashMath, mfsTotal, ersData, invStats, deskItemsSold) {
    let { opening, sales, adjustments, adjustmentLog, expected } = cashMath;
         
    let invRows = '';
    let activeItemCount = 0;
          
    for (const [item, d] of Object.entries(invStats)) {
        if (d.open === 0 && d.inOut === 0 && d.sold === 0 && d.rem === 0) continue;
        activeItemCount++;
                  
        let inOutColor = d.inOut > 0 ? '#10b981' : (d.inOut < 0 ? '#ef4444' : 'var(--text-secondary)');
        let inOutStr = d.inOut > 0 ? `+${d.inOut}` : (d.inOut < 0 ? `${d.inOut}` : `0`);
        invRows += `
            <div style="display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 1.2fr; gap: 4px; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--border-color); font-size: 0.85rem;">
                <div style="font-weight: 700; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 4px; cursor: pointer;" onclick="showTooltip(this, '${item}')">${item}</div>
                <div style="text-align: center; color: var(--text-secondary); font-weight: 500;">${d.open}</div>
                <div style="text-align: center; color: ${inOutColor}; font-weight: 600;">${inOutStr}</div>
                <div style="text-align: center; color: var(--text-primary); font-weight: 500;">${d.sold}</div>
                <div style="text-align: center; color: var(--text-primary); font-weight: 700; font-size: 0.95rem;">${d.rem}</div>
            </div>
        `;
    }
    
    if (!invRows) invRows = `<div style="padding: 20px; text-align: center; color: var(--text-secondary); font-size: 0.85rem; font-style: italic;">No physical stock recorded today</div>`;
         
    let itemsHTML = '';
    let itemRowsArray = Object.entries(deskItemsSold);
    
    itemRowsArray.forEach(([name, qty], index) => {
        let isLast = index === itemRowsArray.length - 1;
        let borderStyle = isLast ? '' : 'border-bottom: 1px solid var(--border-color);';
        itemsHTML += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; ${borderStyle}">
                <span style="font-weight: 500; color: var(--text-primary); font-size: 0.875rem; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 12px;">${name}</span>
                <span style="background: var(--bg-color); color: var(--text-secondary); font-size: 0.8rem; font-weight: 500; padding: 2px 8px; border-radius: 6px; flex-shrink: 0;">${qty}x</span>
            </div>
        `;
    });
    if (!itemsHTML) itemsHTML = '<div style="color: var(--text-secondary); font-style: italic; padding: 14px; font-size: 0.85rem; text-align: center;">No items or services sold yet</div>';

    let formattedAdjustments = adjustments !== 0 ? (adjustments > 0 ? `+${adjustments}` : adjustments) : '0';
         
    let adjBreakdownHTML = '';
    if (Object.keys(adjustmentLog).length > 0) {
        for (const [name, val] of Object.entries(adjustmentLog)) {
            adjBreakdownHTML += `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px; padding-left: 12px; font-size: 0.85rem;">
                    <span style="color: var(--text-secondary);">${name}</span>
                    <strong style="color: ${val < 0 ? '#ef4444' : '#10b981'}; font-weight: 500;">${val > 0 ? '+' : ''}${val} Tk</strong>
                </div>
            `;
        }
    }

    return `
        <!-- 1. Cash Formula Card -->
        <div class="admin-form-card" style="padding: 0; margin-bottom: 16px; background: var(--surface-color); border: 1px solid var(--border-color); box-shadow: 0 1px 2px rgba(0,0,0,0.02); overflow: hidden;">
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 11px 16px;">
                <span style="font-size: 0.9rem; color: var(--text-secondary); font-weight: 500;">Opening Cash</span>
                <span id="desk-tot-opening" style="font-size: 0.95rem; color: var(--text-primary); font-weight: 500;">${opening} Tk</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 11px 16px;">
                <span style="font-size: 0.9rem; color: var(--text-secondary); font-weight: 500;">+ Cash Sales</span>
                <span id="desk-tot-cash-sales" style="font-size: 0.95rem; color: var(--text-primary); font-weight: 500;">+${sales} Tk</span>
            </div>
            <div style="padding: 11px 16px;">
                <div style="display: flex; justify-content: space-between; align-items: center; cursor: pointer;" onclick="const breakdown = this.nextElementSibling; const icon = this.querySelector('svg'); if(breakdown.style.display === 'none') { breakdown.style.display = 'block'; icon.style.transform = 'rotate(180deg)'; } else { breakdown.style.display = 'none'; icon.style.transform = 'rotate(0deg)'; }">
                    <span style="font-size: 0.9rem; color: var(--text-secondary); font-weight: 500; display: flex; align-items: center; gap: 6px;">
                        +/- Cash Actions
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.2s;"><polyline points="6 9 12 15 18 9"/></svg>
                    </span>
                    <span id="desk-tot-manager" style="font-size: 0.95rem; font-weight: 500; color: ${adjustments < 0 ? '#ef4444' : 'var(--text-primary)'};">${formattedAdjustments} Tk</span>
                </div>
                <div style="display: none; padding-top: 8px; border-top: 1px solid var(--border-color); margin-top: 8px;">
                    ${adjBreakdownHTML || '<div style="font-size: 0.85rem; color: var(--text-secondary); text-align: right; font-style: italic;">No actions recorded</div>'}
                </div>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 11px 16px; background: var(--bg-color); border-top: 1px solid var(--border-color);">
                <span style="font-size: 0.7rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Expected Cash</span>
                <span id="desk-tot-expected-cash" style="font-size: 1.4rem; font-weight: 500; color: var(--text-primary);">${expected} Tk</span>
            </div>
        </div>

        <!-- 2. MFS and ERS Cards -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
            <div style="background: var(--surface-color); border: 1px solid var(--border-color); padding: 14px; border-radius: 12px; text-align: left;">
                <div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 4px;">Total MFS</div>
                <div style="font-size: 1.25rem; font-weight: 500; color: var(--text-primary);">${mfsTotal} <span style="font-size: 0.85rem; color: var(--text-secondary); font-weight: normal;">Tk</span></div>
            </div>
            <div style="background: var(--surface-color); border: 1px solid var(--border-color); padding: 14px; border-radius: 12px; text-align: left;">
                <div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 4px;">ERS Sent (${ersData.count}x)</div>
                <div style="font-size: 1.25rem; font-weight: 500; color: var(--text-primary);">${ersData.total} <span style="font-size: 0.85rem; color: var(--text-secondary); font-weight: normal;">Tk</span></div>
            </div>
        </div>

        <!-- 3. Physical Stock Accordion -->
        <div style="background: var(--surface-color); border-radius: 10px; border: 1px solid var(--border-color); margin-bottom: 16px; overflow: hidden;">
            <div style="padding: 11px 14px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;" onclick="const c = this.nextElementSibling; const i = this.querySelector('svg'); if(c.style.display==='none'){c.style.display='block'; i.style.transform='rotate(180deg)';}else{c.style.display='none'; i.style.transform='rotate(0deg)';}">
                <div style="display: flex; align-items: flex-start; gap: 10px;">
                    <div style="width: 7px; height: 7px; border-radius: 50%; background: #10b981; margin-top: 6px; flex-shrink: 0;"></div>
                    <div style="display: flex; flex-direction: column;">
                        <span style="font-size: 0.875rem; font-weight: 500; color: var(--text-primary); line-height: 1.2;">Physical stock</span>
                        <span style="font-size: 0.75rem; color: var(--text-secondary); line-height: 1.2; margin-top: 3px;">${activeItemCount} active items</span>
                    </div>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.2s;"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
            <div style="display: none; background: var(--surface-color); border-top: 1px solid var(--border-color);">
                <div style="padding: 0 16px;">
                    <div style="display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 1.2fr; gap: 4px; padding: 12px 0; border-bottom: 2px solid var(--border-color); font-size: 0.7rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">
                        <div>Item</div>
                        <div style="text-align: center;">Start</div>
                        <div style="text-align: center;">In/Out</div>
                        <div style="text-align: center;">Sold</div>
                        <div style="text-align: center;">Exp.</div>
                    </div>
                    ${invRows}
                </div>
            </div>
        </div>

        <!-- 4. Items & Services Sold List -->
        <div style="background: var(--surface-color); border-radius: 12px; border: 1px solid var(--border-color); overflow: hidden; margin-bottom: 24px;">
            <div style="display: flex; justify-content: space-between; padding: 10px 14px; border-bottom: 1px solid var(--border-color); background: var(--bg-color);">
                <span style="font-size: 0.7rem; font-weight: 600; text-transform: uppercase; color: var(--text-secondary); letter-spacing: 0.5px;">Items & services sold</span>
                <span style="font-size: 0.7rem; font-weight: 500; color: var(--text-secondary);">Today</span>
            </div>
            ${itemsHTML}
        </div>
    `;
}

export async function renderDeskDashboard(targetDeskId = AppState.currentDeskId) {
    if (!targetDeskId) return;
    let filterVal = document.getElementById('desk-history-filter') ? document.getElementById('desk-history-filter').value : 'all';
    let historyHTML = '';
         
    let deskOpeningCash = 0;
    let activeSessionId = null;
    let activeOpeningInv = {};
    const targetDateStr = formatToGBDate(document.getElementById('report-date-picker').value || getStrictDate());
    const isToday = targetDateStr === formatToGBDate(getStrictDate());

    if (targetDeskId === 'sandbox') {
        activeSessionId = 'sandbox_session';
        deskOpeningCash = AppState.currentOpeningCash || 0;
        activeOpeningInv = AppState.currentOpeningInv || {};
    } else if (targetDeskId === AppState.currentDeskId && isToday && AppState.currentSessionId) {
        activeSessionId = AppState.currentSessionId;
        deskOpeningCash = AppState.currentOpeningCash;
        activeOpeningInv = AppState.currentOpeningInv;
    } else {
        try {
            const sessSnap = await getDocs(query(collection(db, 'sessions'), where('dateStr', '==', targetDateStr)));
            let bestSession = null;
            sessSnap.forEach(docSnap => {
                let s = docSnap.data();
                if (s.deskId === targetDeskId) {
                    if (!bestSession || (s.openedAt?.toMillis() || 0) > (bestSession.openedAt?.toMillis() || 0)) {
                        bestSession = { id: docSnap.id, ...s };
                    }
                }
            });
            if (bestSession) {
                activeSessionId = bestSession.id;
                if (bestSession.openingBalances) {
                    deskOpeningCash = parseFloat(bestSession.openingBalances.cash) || 0;
                    activeOpeningInv = bestSession.openingBalances.inventory || {};
                }
            }
        } catch(e) { console.error(e); }
    }

    let deskCashSales = 0, deskAdjustments = 0, deskMfs = 0, deskErsCount = 0, deskErsTotal = 0;
    let deskItemsSold = {}; 
    let deskAdjustmentLog = {}; 
    let invStats = {};
          
    getPhysicalItems().forEach(item => {
        let o = activeOpeningInv[item] || 0;
        invStats[item] = { open: o, inOut: 0, sold: 0, rem: o };
    });

    // --- RE-ADDED THE MISSING TRANSACTION LOOP ---
    [...AppState.transactions].reverse().forEach(tx => {
        if (tx.isDeleted) return;
        if (tx.sessionId !== activeSessionId) return;
        
        let safeCashAmt = tx.cashAmt !== undefined ? tx.cashAmt : (tx.payment === 'Cash' ? tx.amount : 0);
        let safeMfsAmt = tx.mfsAmt !== undefined ? tx.mfsAmt : (tx.payment === 'MFS' ? tx.amount : 0);
                  
        deskMfs += safeMfsAmt;
        
        if (tx.type === 'adjustment') {
            deskAdjustments += safeCashAmt; 
            deskAdjustmentLog[tx.name] = (deskAdjustmentLog[tx.name] || 0) + safeCashAmt;
        } else if (tx.type !== 'transfer_out' && tx.type !== 'transfer_in') {
            deskCashSales += safeCashAmt;
            if (tx.name === 'ERS Flexiload') {
                deskErsCount += Math.abs(tx.qty);
                deskErsTotal += tx.amount;
            } else {
                deskItemsSold[tx.name] = (deskItemsSold[tx.name] || 0) + Math.abs(tx.qty);
            }
        }

        if (AppState.globalInventoryGroups.includes(tx.trackAs)) {
            let trackAs = tx.trackAs;
            let q = Math.abs(tx.qty);
            if (tx.type === 'transfer_in') { invStats[trackAs].inOut += q; invStats[trackAs].rem += q; }
            else if (tx.type === 'transfer_out') { invStats[trackAs].inOut -= q; invStats[trackAs].rem -= q; }
            else if (tx.type === 'adjustment') { invStats[trackAs].inOut += q; invStats[trackAs].rem += q; }
            else { 
                invStats[trackAs].sold += q; 
                invStats[trackAs].rem -= q; 
            }
        }
        
        let catItem = Object.values(AppState.globalCatalog).find(c => c.name === tx.name);
        let txCat = catItem ? catItem.cat : null;
        let showTx = false;
        
        if (filterVal === 'all') showTx = true;
        else if (filterVal === 'ers' && tx.name === 'ERS Flexiload') showTx = true;
        else if (filterVal === 'cash_ops' && tx.type === 'adjustment' && tx.name === 'Physical Cash') showTx = true;
        else if (filterVal === 'transfers' && (tx.type === 'transfer_in' || tx.type === 'transfer_out')) showTx = true;
        else if (filterVal === txCat) showTx = true;
        
        if (!showTx) return;
        
        let payLabel = tx.payment === 'Split' ? `Split (C:${safeCashAmt}/M:${safeMfsAmt})` : tx.payment;
        let badges = '';
        if (tx.isPending) badges += '<span style="font-size: 0.7rem; background: #fef08a; color: #854d0e; padding: 2px 6px; border-radius: 10px; margin-left: 8px; font-weight: bold;">Pending</span>';
        if (tx.isEdited) badges += `<span style="font-size: 0.7rem; background: #fef3c7; color: #92400e; padding: 2px 6px; border-radius: 10px; margin-left: 8px; font-weight: bold; cursor: pointer;" onclick="showAuditTrail('${tx.id}')">Edited</span>`;
        
        let actionBtns = '';
        if (targetDeskId === AppState.currentDeskId || AppState.currentUserRole === 'admin' || AppState.currentUserRole === 'manager') {
            actionBtns = `
                <div class="tx-actions" style="display: none; width: 100%; padding-top: 12px; margin-top: 12px; border-top: 1px dashed var(--border-color); justify-content: flex-end; gap: 8px;">
                    <button class="btn-outline" style="height: auto; padding: 6px 16px; font-size: 0.85rem; color: var(--accent-color); border-color: var(--accent-color); gap: 6px;" onclick="event.stopPropagation(); openEditTx(${tx.id})">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg> Edit
                    </button>
                    <button class="btn-outline" style="height: auto; padding: 6px 16px; font-size: 0.85rem; color: #ef4444; border-color: #fca5a5; background: #fef2f2; gap: 6px;" onclick="event.stopPropagation(); deleteTransaction('${tx.docId}', ${tx.id})">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg> Trash
                    </button>
                </div>
            `;
        }

        // --- NEW LEDGER ITEM UI (Safely inside the loop!) ---
        let isOutflow = tx.type === 'adjustment' || tx.type === 'transfer_out';
        let dotColor = '#10b981'; // Default Green (ERS)
        if (tx.type === 'adjustment') dotColor = '#ef4444'; // Red
        else if (tx.type === 'transfer_out' || tx.type === 'transfer_in') dotColor = '#8b5cf6'; // Purple
        else if (tx.name !== 'ERS Flexiload') dotColor = '#3390ec'; // Blue

        let amtColor = isOutflow ? 'var(--danger-text)' : 'var(--text-primary)';
        let amtPrefix = isOutflow ? '− ' : '';

        historyHTML += `
            <div class="history-item" style="display: flex; flex-direction: column; padding: 16px; background: var(--surface-color); border: 1px solid var(--border-color); border-radius: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.02); margin-bottom: 12px; cursor: pointer; transition: transform 0.1s;" onclick="const actions = this.querySelector('.tx-actions'); if(actions) { actions.style.display = actions.style.display === 'none' ? 'flex' : 'none'; }">
                <div style="display: flex; width: 100%; align-items: flex-start; gap: 14px;">
                    <div style="width: 44px; height: 44px; border-radius: 12px; background: ${dotColor}15; color: ${dotColor}; display: flex; align-items: center; justify-content: center; flex-shrink: 0; border: 1px solid ${dotColor}30;">
                        <span style="font-size: 0.95rem; font-weight: 800;">${tx.qty}x</span>
                    </div>
                    <div style="flex: 1; min-width: 0; padding-top: 2px;">
                        <div style="font-size: 1rem; color: var(--text-primary); font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.2; margin-bottom: 6px;">
                            ${tx.name}
                        </div>
                        <div style="font-size: 0.75rem; color: var(--text-secondary); line-height: 1.5; margin-top: 4px;">
                            ${tx.time} &bull; ${payLabel} &bull; <span style="color: var(--text-primary); font-weight: 600;">By ${tx.agentName.split(' ')[0]}</span> ${badges}
                        </div>
                    </div>
                    <div style="font-size: 1.1rem; font-weight: 800; color: ${amtColor}; flex-shrink: 0; text-align: right; padding-top: 2px;">
                        ${amtPrefix}${Math.abs(tx.amount || 0)}
                    </div>
                </div>
                ${actionBtns}
            </div>
        `;
    }); // <-- END OF TRANSACTION LOOP

    let cashMath = { opening: deskOpeningCash, sales: deskCashSales, adjustments: deskAdjustments, adjustmentLog: deskAdjustmentLog, expected: (deskOpeningCash + deskCashSales + deskAdjustments) };
    let ersData = { count: deskErsCount, total: deskErsTotal };
    
    document.getElementById('live-dashboard-wrapper').innerHTML = generateDashboardHTML(cashMath, deskMfs, ersData, invStats, deskItemsSold);
    
    let emptyState = `
        <div style="padding: 40px 20px; text-align: center; color: var(--text-secondary);">
            <div style="width: 48px; height: 48px; border-radius: 50%; background: var(--bg-color); display: flex; align-items: center; justify-content: center; margin: 0 auto 12px auto;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            </div>
            <div style="font-size: 0.9rem; font-weight: 500;">No transactions yet</div>
        </div>`;

    document.getElementById('desk-history-log').innerHTML = historyHTML || emptyState;

    try {
        const agentsSnap = await getDocs(query(collection(db, 'users'), where('assignedDeskId', '==', targetDeskId)));
        let names = [];
        agentsSnap.forEach(doc => { names.push(doc.data().nickname || doc.data().displayName || doc.data().email?.split('@')[0] || 'Agent'); });
        document.getElementById('desk-logged-agents').innerText = names.length > 0 ? names.join(', ') : 'None';
    } catch(e) { document.getElementById('desk-logged-agents').innerText = 'Unknown'; }
}

// ==========================================
//    DATE FILTER & REAL-TIME SYNC LOGIC
// ==========================================
let txListenerUnsubscribe = null;

export function getTxListenerUnsubscribe() { return txListenerUnsubscribe; }
export function setTxListenerUnsubscribe(val) { txListenerUnsubscribe = val; }

export async function fetchTransactionsForDate() {
    if (!AppState.currentUser) return;

    // Force Center/Floor mode for Managers and Admins and hide the whole banner
    if (AppState.currentUserRole === 'admin' || AppState.currentUserRole === 'manager') {
        currentReportMode = 'floor';
        if (document.getElementById('data-scope-banner')) document.getElementById('data-scope-banner').style.display = 'none';
    }
    
    const datePicker = document.getElementById('report-date-picker');
    if (!datePicker.value) {
        const t = new Date(); 
        datePicker.value = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
    }
    const targetDateStr = formatToGBDate(datePicker.value);
    const isToday = targetDateStr === formatToGBDate(getStrictDate());
    const dateLabel = isToday ? 'Today' : targetDateStr;

    if (txListenerUnsubscribe) { txListenerUnsubscribe(); txListenerUnsubscribe = null; }

    try {
                let txQuery = query(collection(db, 'transactions'), where('dateStr', '==', targetDateStr));
                
                if (AppState.currentUserRole !== 'admin' && AppState.currentUserRole !== 'manager' && currentReportMode !== 'floor') {
                    // FIX: If the agent is at a desk, load ALL transactions for that desk so they see inbound manager transfers.
                    if (AppState.currentDeskId && AppState.currentDeskId !== 'sandbox') {
                        txQuery = query(collection(db, 'transactions'), where('dateStr', '==', targetDateStr), where('deskId', '==', AppState.currentDeskId));
                    } else {
                        txQuery = query(collection(db, 'transactions'), where('dateStr', '==', targetDateStr), where('agentId', '==', AppState.currentUser.uid));
                    }
                }

        txListenerUnsubscribe = onSnapshot(
            txQuery,
            { includeMetadataChanges: true },
            (txSnapshot) => {
            AppState.transactions = []; AppState.trashTransactions = []; 
            let localSandboxTxs = AppState.currentDeskId === 'sandbox' ? AppState.transactions.filter(t => t.docId && t.docId.startsWith('local_')) : [];
            let localSandboxTrash = AppState.currentDeskId === 'sandbox' ? AppState.trashTransactions.filter(t => t.docId && t.docId.startsWith('local_')) : [];

            txSnapshot.forEach(doc => {
                let tx = doc.data(); tx.docId = doc.id; 
                tx.isPending = doc.metadata.hasPendingWrites;
                if (!tx.isDeleted) {
                    AppState.transactions.push(tx);
                } else if (tx.agentId === AppState.currentUser.uid) {
                    AppState.trashTransactions.push(tx); 
                }
            });

            if (AppState.currentDeskId === 'sandbox') {
                AppState.transactions.push(...localSandboxTxs);
                AppState.trashTransactions.push(...localSandboxTrash);
            }
            
            AppState.transactions.sort((a, b) => a.id - b.id);
            AppState.trashTransactions.sort((a, b) => a.id - b.id);
            
            renderPersonalReport();
            
            if (document.getElementById('tab-desk').classList.contains('active')) {
                renderDeskDashboard();
            } else if (AppState.currentDeskId) {
                renderDeskDashboard(AppState.currentDeskId); 
            }
            
            const financialLabel = document.getElementById('financial-date-label');
            if (financialLabel) financialLabel.innerHTML = `${dateLabel}`;
            if (document.getElementById('tab-floor').classList.contains('active')) renderLiveFloorTab();
        });
    } catch (e) { console.error(e); }
}

// ==========================================
//   HISTORICAL SESSION VIEWER
// ==========================================
export async function openHistoricalSession(sessionId) {
    openModal('modal-historical');
    const container = document.getElementById('historical-content');
    container.innerHTML = '<div class="spinner" style="margin: 40px auto; border-top-color: #b91c1c;"></div>';

    try {
        const sessionSnap = await getDoc(doc(db, 'sessions', sessionId));
        if (!sessionSnap.exists()) {
            container.innerHTML = '<p class="placeholder-text" style="color: #ef4444;">Session not found.</p>';
            return;
        }

        const session = sessionSnap.data();
        let agentName = session.openedBy || 'Unknown Agent';
        let deskName = (session.deskId || '').replace('_', ' ').toUpperCase();
        
        // FIX: Grab the official name, and override "System" as the agent
        try {
            const deskSnap = await getDoc(doc(db, 'desks', session.deskId));
            if (deskSnap.exists() && deskSnap.data().name) {
                deskName = deskSnap.data().name;
            }
        } catch(e) {}

        if (agentName.startsWith('System') && deskName.includes("'s Drawer")) {
            agentName = deskName.replace("'s Drawer", "");
        }
        
        let deskOpeningCash = parseFloat(session.openingBalances?.cash) || 0;
        let activeOpeningInv = session.openingBalances?.inventory || {};
        
        let deskCashSales = 0, deskAdjustments = 0, deskMfs = 0, deskErsCount = 0, deskErsTotal = 0;
        let deskItemsSold = {}; 
        let deskAdjustmentLog = {}; 
        let invStats = {};
        
        getPhysicalItems().forEach(item => {
            let o = activeOpeningInv[item] || 0;
            invStats[item] = { open: o, inOut: 0, sold: 0, rem: o };
        });

        const txSnap = await getDocs(query(collection(db, 'transactions'), where('sessionId', '==', sessionId), where('isDeleted', '==', false)));
        
        let txList = [];
        txSnap.forEach(docSnap => txList.push({ id: docSnap.id, ...docSnap.data() }));
        txList.sort((a, b) => b.id - a.id);

        let historyHTML = '';

        txList.forEach(tx => {
            let safeCashAmt = tx.cashAmt !== undefined ? tx.cashAmt : (tx.payment === 'Cash' ? tx.amount : 0);
            let safeMfsAmt = tx.mfsAmt !== undefined ? tx.mfsAmt : (tx.payment === 'MFS' ? tx.amount : 0);
            
            deskMfs += safeMfsAmt;
            
            if (tx.type === 'adjustment') {
                deskAdjustments += safeCashAmt; 
                deskAdjustmentLog[tx.name] = (deskAdjustmentLog[tx.name] || 0) + safeCashAmt;
            } else if (tx.type !== 'transfer_out' && tx.type !== 'transfer_in') {
                deskCashSales += safeCashAmt;
                if (tx.name === 'ERS Flexiload') {
                    deskErsCount += Math.abs(tx.qty);
                    deskErsTotal += tx.amount;
                } else {
                    deskItemsSold[tx.name] = (deskItemsSold[tx.name] || 0) + Math.abs(tx.qty);
                }
            }

            if (AppState.globalInventoryGroups.includes(tx.trackAs)) {
                let trackAs = tx.trackAs;
                let q = Math.abs(tx.qty);
                if (tx.type === 'transfer_in') { invStats[trackAs].inOut += q; invStats[trackAs].rem += q; }
                else if (tx.type === 'transfer_out') { invStats[trackAs].inOut -= q; invStats[trackAs].rem -= q; }
                else if (tx.type === 'adjustment') { invStats[trackAs].inOut += q; invStats[trackAs].rem += q; }
                else { 
                    invStats[trackAs].sold += q; 
                    invStats[trackAs].rem -= q; 
                }
            }

            let isOutflow = tx.type === 'adjustment' || tx.type === 'transfer_out';
            let dotColor = '#10b981';
            if (tx.type === 'adjustment') dotColor = '#ef4444';
            else if (tx.type === 'transfer_out' || tx.type === 'transfer_in') dotColor = '#8b5cf6';
            else if (tx.name !== 'ERS Flexiload') dotColor = '#3390ec';

            let amtColor = isOutflow ? 'var(--danger-text)' : 'var(--text-primary)';
            let amtPrefix = isOutflow ? '− ' : '';
            let payLabel = tx.payment === 'Split' ? `Split (C:${safeCashAmt}/M:${safeMfsAmt})` : tx.payment;
            let badges = tx.isEdited ? `<span style="font-size: 0.7rem; background: #fef3c7; color: #92400e; padding: 2px 6px; border-radius: 10px; margin-left: 8px; font-weight: bold;">Edited</span>` : '';

            historyHTML += `
                <div style="display: flex; flex-direction: column; padding: 16px; background: var(--surface-color); border: 1px solid var(--border-color); border-radius: 16px; margin-bottom: 12px;">
                    <div style="display: flex; width: 100%; align-items: flex-start; gap: 14px;">
                        <div style="width: 44px; height: 44px; border-radius: 12px; background: ${dotColor}15; color: ${dotColor}; display: flex; align-items: center; justify-content: center; flex-shrink: 0; border: 1px solid ${dotColor}30;">
                            <span style="font-size: 0.95rem; font-weight: 800;">${tx.qty}x</span>
                        </div>
                        <div style="flex: 1; min-width: 0; padding-top: 2px;">
                            <div style="font-size: 1rem; color: var(--text-primary); font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.2; margin-bottom: 6px;">
                                ${tx.name}
                            </div>
                            <div style="font-size: 0.75rem; color: var(--text-secondary); line-height: 1.5; margin-top: 4px;">
                                ${tx.time} &bull; ${payLabel} &bull; <span style="color: var(--text-primary); font-weight: 600;">By ${tx.agentName?.split(' ')[0] || 'Unknown'}</span> ${badges}
                            </div>
                        </div>
                        <div style="font-size: 1.1rem; font-weight: 800; color: ${amtColor}; flex-shrink: 0; text-align: right; padding-top: 2px;">
                            ${amtPrefix}${Math.abs(tx.amount || 0)}
                        </div>
                    </div>
                </div>
            `;
        });

        let cashMath = { opening: deskOpeningCash, sales: deskCashSales, adjustments: deskAdjustments, adjustmentLog: deskAdjustmentLog, expected: (deskOpeningCash + deskCashSales + deskAdjustments) };
        let ersData = { count: deskErsCount, total: deskErsTotal };

        let dashboardHTML = generateDashboardHTML(cashMath, deskMfs, ersData, invStats, deskItemsSold);

        // Fetch EOD Snapshot if it exists
        let eodHTML = '';
        try {
            const eodSnap = await getDocs(query(collection(db, 'eod_reports'), where('sessionId', '==', sessionId)));
            if (!eodSnap.empty) {
                let eodData = eodSnap.docs[0].data();
                let varianceColor = eodData.variance < 0 ? '#ef4444' : (eodData.variance > 0 ? '#10b981' : '#475569');
                let variancePrefix = eodData.variance > 0 ? '+' : '';

                let invDiffHTML = '';
                for (const [item, actual] of Object.entries(eodData.actualClosing?.inventory || {})) {
                    let expected = eodData.expectedClosing?.inventory?.[item] || 0;
                    let diff = actual - expected;
                    if (diff !== 0) {
                        let dColor = diff < 0 ? '#ef4444' : '#10b981';
                        let dPref = diff > 0 ? '+' : '';
                        invDiffHTML += `<div style="display:flex; justify-content:space-between; font-size:0.8rem; padding:4px 0; border-bottom: 1px dashed #e2e8f0;"><span>${item}</span> <span>Exp: ${expected} | Act: ${actual} <strong style="color:${dColor}; margin-left: 4px;">(${dPref}${diff})</strong></span></div>`;
                    }
                }

                eodHTML = `
                    <div style="background: #f8fafc; border: 2px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
                        <h4 style="margin: 0 0 12px 0; font-size: 1rem; color: #0f172a; display: flex; align-items: center; gap: 8px;">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                            Official EOD Snapshot
                        </h4>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                            <div style="background: #fff; padding: 10px; border-radius: 8px; border: 1px solid #cbd5e1;">
                                <div style="font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase; font-weight: 700;">System Expected</div>
                                <div style="font-size: 1.15rem; font-weight: 800; color: #0f172a;">${eodData.expectedClosing.cash} Tk</div>
                            </div>
                            <div style="background: #fff; padding: 10px; border-radius: 8px; border: 1px solid #cbd5e1;">
                                <div style="font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase; font-weight: 700;">Actual Counted</div>
                                <div style="font-size: 1.15rem; font-weight: 800; color: #0f172a;">${eodData.actualClosing.cash} Tk</div>
                            </div>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: #fff; border-radius: 8px; border: 1px solid #cbd5e1; margin-bottom: 12px;">
                            <span style="font-weight: 700; font-size: 0.85rem; color: var(--text-secondary); text-transform: uppercase;">Manager Drop</span>
                            <span style="font-weight: 800; font-size: 1.1rem; color: #8b5cf6;">${eodData.managerDrop || 0} Tk</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: #fff; border-radius: 8px; border: 1px solid #cbd5e1; margin-bottom: ${invDiffHTML ? '12px' : '0'};">
                            <span style="font-weight: 700; font-size: 0.85rem; color: var(--text-secondary); text-transform: uppercase;">Cash Variance</span>
                            <span style="font-weight: 800; font-size: 1.1rem; color: ${varianceColor};">${variancePrefix}${eodData.variance} Tk</span>
                        </div>
                        ${invDiffHTML ? `<div style="background: #fff; padding: 10px 12px; border-radius: 8px; border: 1px solid #cbd5e1;"><div style="font-size: 0.75rem; font-weight: 800; color: #0f172a; margin-bottom: 8px;">STOCK VARIANCES</div>${invDiffHTML}</div>` : ''}
                    </div>
                `;
            }
        } catch(e) { console.error("Failed to load EOD snapshot", e); }
        
        container.innerHTML = `
            <div style="margin-bottom: 20px; text-align: center;">
                <h2 style="margin: 0 0 4px 0; font-size: 1.4rem; color: var(--text-primary);">${deskName}</h2>
                <div style="color: var(--text-secondary); font-size: 0.9rem; font-weight: 600;">Agent: ${agentName} &bull; ${session.dateStr}</div>
            </div>
            ${eodHTML}
            ${dashboardHTML}
            <h3 style="font-size: 1.15rem; font-weight: 800; color: var(--text-primary); margin: 24px 0 12px 0;">Shift Ledger</h3>
            <div style="display: flex; flex-direction: column;">
                ${historyHTML || '<div class="placeholder-text">No transactions recorded during this shift.</div>'}
            </div>
        `;
    } catch (error) {
        console.error(error);
        container.innerHTML = '<p class="placeholder-text" style="color: #ef4444;">Error loading session data.</p>';
    }
}