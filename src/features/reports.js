// src/features/reports.js
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from '../config/firebase.js';
import { AppState } from '../core/state.js';
import { getStrictDate, formatToGBDate } from '../utils/helpers.js';
import { showAppAlert, showFlashMessage } from '../utils/ui-helpers.js';
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
            sessSnap.forEach(docSnap => {
                let s = docSnap.data();
                floorOpeningCash += parseFloat(s.openingBalances?.cash) || 0;
                let inv = s.openingBalances?.inventory || {};
                for (let [item, qty] of Object.entries(inv)) {
                    if (floorInvStats[item]) {
                        floorInvStats[item].open += qty;
                        floorInvStats[item].rem += qty;
                    }
                }
                
                if (s.status === 'closed' || s.status === 'pending') {
                    let agentName = s.openedBy ? s.openedBy.split(' ')[0] : 'Agent';
                    let statusLabel = s.status === 'pending' ? 'Pending' : 'Sealed';
                    let badgeColor = s.status === 'pending' ? '#f59e0b' : '#10b981';
                    
                    vaultButtonsHTML += `
                        <button class="btn-outline" style="flex-shrink: 0; border-color: ${badgeColor}; color: ${badgeColor}; background: ${s.status === 'pending' ? '#fffbeb' : '#ecfdf5'}; font-size: 0.85rem; padding: 8px 14px; border-radius: 10px; display: flex; align-items: center; gap: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);" onclick="openHistoricalSession('${docSnap.id}')">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                            ${agentName} (${statusLabel})
                        </button>
                    `;
                }
            });
        } catch(e) { console.error("Could not fetch floor sessions", e); }
    }

    [...AppState.transactions].reverse().forEach(tx => {
        if (tx.isDeleted) return;
        if (currentReportMode === 'personal' && tx.agentId !== AppState.currentUser.uid) return;
        if (currentReportMode === 'personal' && tx.isRemoteTransfer) return; 

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
        let agentBadge = currentReportMode === 'floor' ? `<span style="font-size: 0.7rem; background: #e0f2fe; color: #0284c7; padding: 4px 8px; border-radius: 12px; font-weight: 700; letter-spacing: 0.5px;">${tx.agentName.split(' ')[0]}</span>` : '';

        let actionBtns = '';
        if (currentReportMode === 'personal' || AppState.currentUserRole === 'admin') {
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

        historyHTML += `
            <div class="history-item" style="cursor: pointer; flex-direction: column; align-items: stretch; transition: background-color 0.15s;" onclick="const actions = this.querySelector('.tx-actions'); if(actions) { actions.style.display = actions.style.display === 'none' ? 'flex' : 'none'; }">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; width: 100%;">
                    <div class="history-info" style="flex: 1; padding-right: 12px;">
                        <div style="display: flex; align-items: center; flex-wrap: wrap; margin-bottom: 2px;">
                            <span class="history-title" style="margin-right: 8px;">${tx.qty}x ${tx.name}</span>
                            ${badges}
                        </div>
                        <span class="history-meta">${tx.receiptNo || tx.id} • ${tx.time} • ${tx.amount} ${userCurrency} • ${payLabel}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px; flex-shrink: 0; padding-top: 2px;">
                        ${agentBadge}
                    </div>
                </div>
                ${actionBtns}
            </div>
        `;
    });

    if (currentReportMode === 'floor') {
        document.getElementById('report-user-name').innerText = "Consolidated Floor Report";
        document.getElementById('report-user-email').innerText = `Floor Opening Cash: ${floorOpeningCash} Tk | Manager Drops: ${floorManagerDrops} Tk`;
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

    let finalInventoryListHTML = invHTML || '<div class="report-row" style="color: var(--text-secondary); font-style: italic; padding: 12px 4px;">No items sold yet</div>';

    if (currentReportMode === 'floor') {
        let liveStockHTML = `
            <div style="margin-top: 24px; font-size: 0.95rem; font-weight: 800; color: var(--text-primary); margin-bottom: 8px; padding: 0 4px; border-bottom: 2px solid var(--border-color); padding-bottom: 8px;">Consolidated Floor Stock</div>
            <div style="display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 1.2fr; gap: 4px; padding: 12px 4px 8px 4px; border-bottom: 2px solid var(--border-color); font-size: 0.7rem; font-weight: 800; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">
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
        finalInventoryListHTML += liveStockHTML;
        
        if (vaultButtonsHTML !== '') {
            finalInventoryListHTML += `
                <div style="margin-top: 28px; font-size: 0.95rem; font-weight: 800; color: #b91c1c; margin-bottom: 12px; padding: 0 4px; border-bottom: 2px solid #fecaca; padding-bottom: 8px; display: flex; align-items: center; gap: 6px;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    Closed Shift Vault
                </div>
                <div style="display: flex; gap: 10px; overflow-x: auto; padding: 4px 4px 16px 4px; scrollbar-width: none; -ms-overflow-style: none; -webkit-overflow-scrolling: touch;">
                    ${vaultButtonsHTML}
                </div>
            `;
        }
    }

    document.getElementById('inventory-list').innerHTML = finalInventoryListHTML;
    
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
        else { 
            stats[trackAs].sold += q; 
            stats[trackAs].rem -= q; 
            stats[trackAs].rev += (tx.amount || 0); 
        }
    });

    if (!hasItems) return "None\n";

    let text = "";
    for (const [item, data] of Object.entries(stats)) {
        if (data.open === 0 && data.in === 0 && data.sold === 0 && data.out === 0) continue;
        text += `> ${item}\n`;
        text += `  Opened: ${data.open} | In: ${data.in} | Out: ${data.out} | Sold: ${data.sold}\n`;
        text += `  Remaining: ${data.rem} | Revenue: ${data.rev} Tk\n\n`;
    }
    return text;
}

export function fallbackCopy(text) {
    try {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
        showFlashMessage("Report Copied!");
    } catch (err) {
        showAppAlert("Error", "Could not copy report to clipboard.");
    }
}

export function shareReport() {
    let dateStr = formatToGBDate(document.getElementById('report-date-picker').value);
    let totalRevenue = document.getElementById('report-total-all') ? document.getElementById('report-total-all').innerText : "0 Tk";
    let totalMfs = document.getElementById('tot-mfs').innerText;
    let totalCash = document.getElementById('tot-cash-sales').innerText;
    let totalErs = document.getElementById('tot-ers').innerText;
    
    let reportText = "";
    
    if (currentReportMode === 'floor') {
        reportText = `CONSOLIDATED FLOOR REPORT: ${dateStr}\n\nSALES SUMMARY\nTotal Revenue: ${totalRevenue}\nCash Collected: ${totalCash}\nMFS Collected: ${totalMfs}\nERS Disbursed: ${totalErs}\n\n`;
    } else {
        reportText = `My Daily Report: ${dateStr}\nAgent: ${AppState.userNickname || AppState.userDisplayName}\n\nPERSONAL SALES SUMMARY\nTotal Revenue: ${totalRevenue}\nCash Collected: ${totalCash}\nMFS Collected: ${totalMfs}\nERS Disbursed: ${totalErs}\n\nPHYSICAL INVENTORY LIFECYCLE\n`;
        let myTx = AppState.transactions.filter(t => t.agentId === AppState.currentUser.uid);
        reportText += buildLifecycleText(myTx, AppState.currentOpeningInv);
    }

    if (navigator.share) navigator.share({ title: 'Report', text: reportText }).catch(e => console.log(e));
    else { try { navigator.clipboard.writeText(reportText).then(() => showFlashMessage("Report Copied!")).catch(() => fallbackCopy(reportText)); } catch (e) { fallbackCopy(reportText); } }
}

export function shareDeskReport() {
    let dateStr = formatToGBDate(document.getElementById('report-date-picker').value);
    let deskTitle = document.getElementById('desk-dashboard-title').innerText;
    let activeAgents = document.getElementById('desk-logged-agents').innerText;

    let opening = document.getElementById('desk-tot-opening').innerText;
    let cashSales = document.getElementById('desk-tot-cash-sales').innerText;
    let mgrDrop = document.getElementById('desk-tot-manager').innerText;
    let expected = document.getElementById('desk-tot-expected-cash').innerText;
    
    let deskTx = AppState.transactions.filter(t => t.deskId === AppState.currentDeskId && t.dateStr === dateStr);
    let deskMfs = 0;
    deskTx.forEach(tx => {
        if(!tx.isDeleted) {
            deskMfs += (tx.mfsAmt !== undefined ? tx.mfsAmt : (tx.payment === 'MFS' ? tx.amount : 0));
        }
    });

    let reportText = `Desk Report: ${dateStr}\n${deskTitle}\nAgents: ${activeAgents}\n\nDRAWER SUMMARY\nOpening Cash: ${opening}\nCash Sales: ${cashSales}\nManager Drops: ${mgrDrop}\n------------------------\nExpected Cash: ${expected}\nExpected MFS: ${deskMfs} Tk\n\nPHYSICAL INVENTORY LIFECYCLE\n`;

    reportText += buildLifecycleText(deskTx, AppState.currentOpeningInv);

    if (navigator.share) navigator.share({ title: 'Desk Report', text: reportText }).catch(e => console.log(e));
    else { try { navigator.clipboard.writeText(reportText).then(() => showFlashMessage("Desk Report Copied!")).catch(() => fallbackCopy(reportText)); } catch (e) { fallbackCopy(reportText); } }
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
                <div style="text-align: center; color: var(--text-secondary); font-weight: 600;">${d.open}</div>
                <div style="text-align: center; color: ${inOutColor}; font-weight: 700;">${inOutStr}</div>
                <div style="text-align: center; color: #f59e0b; font-weight: 700;">${d.sold}</div>
                <div style="text-align: center; color: #0ea5e9; font-weight: 800; font-size: 1rem;">${d.rem}</div>
            </div>
        `;
    }

    if (!invRows) invRows = `<div style="padding: 20px; text-align: center; color: var(--text-secondary); font-size: 0.85rem; font-style: italic;">No physical stock recorded today</div>`;
    
    let summaryText = activeItemCount > 0 ? `Physical Stock: ${activeItemCount} Active Items` : 'Physical Stock: No Movement';
    let summaryColor = activeItemCount > 0 ? '#0ea5e9' : '#64748b';
    let summaryBg = activeItemCount > 0 ? '#f0f9ff' : '#f8fafc';
    let summaryBorder = activeItemCount > 0 ? '#bae6fd' : 'var(--border-color)';

    let itemsHTML = '';
    for (const [name, qty] of Object.entries(deskItemsSold)) {
        itemsHTML += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 14px 4px; border-bottom: 1px solid var(--border-color);">
                <span style="font-weight: 600; color: var(--text-primary); font-size: 1rem; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 12px;">${name}</span>
                <span style="font-weight: 800; color: var(--text-secondary); font-size: 1.1rem; flex-shrink: 0;">${qty}x</span>
            </div>
        `;
    }
    if (!itemsHTML) itemsHTML = '<div style="color: var(--text-secondary); font-style: italic; padding: 12px 4px;">No items or services sold yet</div>';

    let formattedAdjustments = adjustments !== 0 ? (adjustments > 0 ? `+${adjustments}` : adjustments) : '0';
    
    let adjBreakdownHTML = '';
    if (Object.keys(adjustmentLog).length > 0) {
        for (const [name, val] of Object.entries(adjustmentLog)) {
            adjBreakdownHTML += `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px; padding-left: 12px; font-size: 0.85rem;">
                    <span style="color: var(--text-secondary);">${name}</span>
                    <strong style="color: ${val < 0 ? '#ef4444' : '#10b981'};">${val > 0 ? '+' : ''}${val} Tk</strong>
                </div>
            `;
        }
    }

    return `
        <div class="admin-form-card" style="padding: 16px; margin-bottom: 16px; background: var(--bg-color); border: 1px solid var(--border-color); box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);">
      <div style="font-size: 0.75rem; font-weight: 800; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 16px;">Physical Cash Formula</div>
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
        <span style="font-size: 0.95rem; color: var(--text-secondary); font-weight: 500;">Opening Float</span>
        <strong style="font-size: 1.05rem; color: var(--text-primary);">${opening} Tk</strong>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
        <span style="font-size: 0.95rem; color: var(--text-secondary); font-weight: 500;">+ Cash Sales</span>
        <strong style="font-size: 1.05rem; color: var(--success-text);">+${sales} Tk</strong>
      </div>
      <div style="margin-bottom: 16px; border-bottom: 1px dashed var(--border-color); padding-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; cursor: pointer; padding: 4px 0;" onclick="const breakdown = this.nextElementSibling; const icon = this.querySelector('svg'); if(breakdown.style.display === 'none') { breakdown.style.display = 'block'; icon.style.transform = 'rotate(180deg)'; } else { breakdown.style.display = 'none'; icon.style.transform = 'rotate(0deg)'; }">
          <span style="font-size: 0.95rem; color: var(--text-secondary); font-weight: 500; display: flex; align-items: center; gap: 6px;">
            +/- Cash Actions
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.2s;"><polyline points="6 9 12 15 18 9"/></svg>
          </span>
          <strong style="font-size: 1.05rem; color: ${adjustments < 0 ? 'var(--danger-text)' : 'var(--success-text)'};">${formattedAdjustments} Tk</strong>
        </div>
        <div style="display: none; padding-top: 8px; border-top: 1px solid var(--border-color); margin-top: 8px;">
          ${adjBreakdownHTML || '<div style="font-size: 0.85rem; color: var(--text-secondary); text-align: right; font-style: italic;">No actions recorded</div>'}
        </div>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 1rem; font-weight: 800; color: var(--info-text); text-transform: uppercase;">Expected Cash</span>
        <strong style="font-size: 1.5rem; font-weight: 800; color: var(--info-text);">${expected} Tk</strong>
      </div>
    </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
      <div style="background: var(--success-bg); border: 1px solid var(--success-border); padding: 16px; border-radius: 12px; text-align: center;">
        <div style="font-size: 0.75rem; font-weight: 800; color: var(--success-text); text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.5px;">Total MFS</div>
        <div style="font-size: 1.35rem; font-weight: 800; color: var(--success-text);">${mfsTotal} Tk</div>
      </div>
      <div style="background: var(--warning-bg); border: 1px solid var(--warning-border); padding: 16px; border-radius: 12px; text-align: center;">
        <div style="font-size: 0.75rem; font-weight: 800; color: var(--warning-text); text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.5px;">ERS Sent (${ersData.count}x)</div>
        <div style="font-size: 1.35rem; font-weight: 800; color: var(--warning-text);">${ersData.total} Tk</div>
      </div>
    </div>

        <div class="admin-form-card" style="padding: 0; margin-bottom: 24px; overflow: hidden; border: 1px solid ${summaryBorder}; box-shadow: 0 2px 8px rgba(0,0,0,0.02);">
            <div style="background: ${summaryBg}; padding: 16px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;" onclick="const c = document.getElementById('inv-grid-content'); const i = document.getElementById('inv-grid-icon'); if(c.style.display==='none'){c.style.display='block'; i.style.transform='rotate(180deg)';}else{c.style.display='none'; i.style.transform='rotate(0deg)';}">
                <div style="font-size: 0.85rem; font-weight: 800; color: ${summaryColor}; text-transform: uppercase; letter-spacing: 0.5px;">
                    ${summaryText}
                </div>
                <svg id="inv-grid-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${summaryColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.2s;"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
            <div id="inv-grid-content" style="display: none; background: #ffffff; border-top: 1px solid ${summaryBorder};">
                <div style="padding: 0 16px;">
                    <div style="display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 1.2fr; gap: 4px; padding: 12px 0; border-bottom: 2px solid var(--border-color); font-size: 0.7rem; font-weight: 800; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">
                        <div>Item</div>
                        <div style="text-align: center;">Start</div>
                        <div style="text-align: center;">In/Out</div>
                        <div style="text-align: center;">Sold</div>
                        <div style="text-align: center; color: #0ea5e9;">Exp.</div>
                    </div>
                    ${invRows}
                </div>
            </div>
        </div>

        <div style="margin-bottom: 24px;">
            <div style="font-size: 0.95rem; font-weight: 800; color: var(--text-primary); margin-bottom: 8px; padding: 0 4px; border-bottom: 2px solid var(--border-color); padding-bottom: 8px;">Desk Items & Services Sold</div>
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
    const isToday = targetDateStr === getStrictDate();

    if (targetDeskId === AppState.currentDeskId && isToday && AppState.currentSessionId) {
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
        let agentBadge = `<span style="font-size: 0.7rem; background: #e0f2fe; color: #0284c7; padding: 4px 8px; border-radius: 12px; font-weight: 700; letter-spacing: 0.5px;">${tx.agentName.split(' ')[0]}</span>`;

        let actionBtns = '';
        
        if (targetDeskId === AppState.currentDeskId || AppState.currentUserRole === 'admin') {
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

        historyHTML += `
            <div class="history-item" style="cursor: pointer; flex-direction: column; align-items: stretch; transition: background-color 0.15s;" onclick="const actions = this.querySelector('.tx-actions'); if(actions) { actions.style.display = actions.style.display === 'none' ? 'flex' : 'none'; }">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; width: 100%;">
                    <div class="history-info" style="flex: 1; padding-right: 12px;">
                        <div style="display: flex; align-items: center; flex-wrap: wrap; margin-bottom: 2px;">
                            <span class="history-title" style="margin-right: 8px;">${tx.qty}x ${tx.name}</span>
                            ${badges}
                        </div>
                        <span class="history-meta">${tx.receiptNo || tx.id} • ${tx.time} • ${tx.amount} ${userCurrency} • ${payLabel}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px; flex-shrink: 0; padding-top: 2px;">
                        ${agentBadge}
                    </div>
                </div>
                ${actionBtns}
            </div>
        `;
    });

    let cashMath = { opening: deskOpeningCash, sales: deskCashSales, adjustments: deskAdjustments, adjustmentLog: deskAdjustmentLog, expected: (deskOpeningCash + deskCashSales + deskAdjustments) };
    let ersData = { count: deskErsCount, total: deskErsTotal };

    document.getElementById('live-dashboard-wrapper').innerHTML = generateDashboardHTML(cashMath, deskMfs, ersData, invStats, deskItemsSold);
    document.getElementById('desk-history-log').innerHTML = historyHTML || '<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg><p>Drawer is empty</p></div>';

    try {
        const agentsSnap = await getDocs(query(collection(db, 'users'), where('assignedDeskId', '==', targetDeskId)));
        let names = [];
        agentsSnap.forEach(doc => { names.push(doc.data().nickname || doc.data().displayName || doc.data().email?.split('@')[0] || 'Agent'); });
        document.getElementById('desk-logged-agents').innerText = names.length > 0 ? names.join(', ') : 'None';
    } catch(e) { document.getElementById('desk-logged-agents').innerText = 'Unknown'; }
}