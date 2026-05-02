// src/features/desk.js
import { collection, doc, setDoc, getDoc, getDocs, updateDoc, query, where, orderBy, limit, serverTimestamp } from "firebase/firestore";
import { db } from '../config/firebase.js';
import { AppState } from '../core/state.js';
import { getStrictDate } from '../utils/helpers.js';
import { showAppAlert, showFlashMessage, openModal, closeModal } from '../utils/ui-helpers.js';
import { getInventoryChange, getPhysicalItems } from './inventory.js';

// ==========================================
//    THE LAZY AUTO-CLOSE
// ==========================================
export async function performLazyAutoClose() {
    const todayStr = getStrictDate();
    try {
        const activeSessionsSnap = await getDocs(query(collection(db, 'sessions'), where('status', '==', 'open')));
        for (const docSnap of activeSessionsSnap.docs) {
            const sessionData = docSnap.data();
            if (sessionData.dateStr !== todayStr) {
                
                let expectedInv = { ...(sessionData.openingBalances.inventory || {}) };
                const txSnap = await getDocs(query(collection(db, 'transactions'), where('sessionId', '==', docSnap.id), where('isDeleted', '==', false)));
                
                txSnap.forEach(txDoc => {
                    let change = getInventoryChange(txDoc.data());
                    if (change !== 0) {
                        expectedInv[txDoc.data().trackAs] = (expectedInv[txDoc.data().trackAs] || 0) + change;
                    }
                });

                await updateDoc(doc(db, 'sessions', docSnap.id), {
                    status: 'closed', closedBy: 'System Auto-Close', closedByUid: 'system', closedAt: serverTimestamp(),
                    hasDiscrepancy: true, variance: 'Unknown - Auto Closed',
                    expectedClosing: { cash: sessionData.openingBalances.cash, inventory: expectedInv },
                    actualClosing: { cash: 0, inventory: expectedInv }
                });
                
                await setDoc(doc(db, 'desks', sessionData.deskId), { status: 'closed', currentSessionId: null }, { merge: true });
                
                const stuckUsers = await getDocs(query(collection(db, 'users'), where('assignedDeskId', '==', sessionData.deskId)));
                stuckUsers.forEach(async (u) => {
                    await updateDoc(doc(db, 'users', u.id), { assignedDeskId: null, assignedDate: null });
                });
            }
        }
    } catch(e) {
        console.error("System Error: Lazy auto-close failed. Some desks may still appear open.", e);
    }
}

// ==========================================
//    SHIFT & FLOOR MANAGEMENT
// ==========================================
export async function loadFloorMap() {
    const container = document.getElementById('desk-list-container');
    container.innerHTML = '<div class="spinner" style="margin: 0 auto;"></div>';
    document.getElementById('modal-desk-select').classList.add('active');

    try {
        const desksSnapshot = await getDocs(collection(db, 'desks'));
        let sharedDesksHTML = '';
        let personalDeskHTML = '';
        
        const personalDeskId = 'personal_' + AppState.currentUser.uid;
        let foundPersonal = false;

        if (desksSnapshot.empty) {
            await setDoc(doc(db, 'desks', 'desk_1'), { name: 'Desk 1', status: 'closed', currentSessionId: null });
            await setDoc(doc(db, 'desks', 'desk_2'), { name: 'Desk 2', status: 'closed', currentSessionId: null });
            await setDoc(doc(db, 'desks', 'desk_3'), { name: 'Desk 3', status: 'closed', currentSessionId: null });
            loadFloorMap(); return;
        }

        desksSnapshot.forEach(docSnap => {
            const desk = docSnap.data();
            const isOpen = desk.status === 'open';
            const statusDot = isOpen ? '<div style="width: 10px; height: 10px; border-radius: 50%; background-color: #10b981; box-shadow: 0 0 8px rgba(16, 185, 129, 0.4);"></div>' : '<div style="width: 10px; height: 10px; border-radius: 50%; background-color: #94a3b8;"></div>';
            const statusText = isOpen ? '<span style="color: #10b981; font-size: 0.8rem; font-weight: 600;">Open</span>' : '<span style="color: #94a3b8; font-size: 0.8rem; font-weight: 600;">Closed</span>';
            
            if (docSnap.id === personalDeskId) {
                foundPersonal = true;
                personalDeskHTML = `
                    <div style="margin-bottom: 32px;">
                        <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; margin-left: 4px;">My Workspace</div>
                        <div class="admin-form-card" style="padding: 16px; margin-bottom: 0; cursor: pointer; transition: transform 0.1s; display: flex; justify-content: space-between; align-items: center; background: var(--surface-color); border: 1px solid var(--border-color); box-shadow: 0 2px 8px rgba(0,0,0,0.04);" onclick="handleDeskSelect('${docSnap.id}', 'Personal Drawer', '${desk.status}', '${desk.currentSessionId}')">
                            <div style="display: flex; align-items: center; gap: 16px;">
                                <div style="width: 48px; height: 48px; border-radius: 12px; background: #ede9fe; color: #8b5cf6; display: flex; align-items: center; justify-content: center;">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
                                </div>
                                <div>
                                    <h3 style="margin: 0; font-size: 1.15rem; font-weight: 700; color: #0f172a;">Personal Drawer</h3>
                                    <div style="display: flex; align-items: center; gap: 6px; margin-top: 4px;">
                                        ${statusDot} ${statusText}
                                    </div>
                                </div>
                            </div>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                        </div>
                    </div>
                `;
            } else if (!desk.isPersonal && docSnap.id !== 'sandbox') {
                sharedDesksHTML += `
                    <div class="admin-form-card" style="padding: 16px; margin-bottom: 12px; cursor: pointer; transition: transform 0.1s; display: flex; justify-content: space-between; align-items: center; border: 1px solid var(--border-color); box-shadow: 0 2px 8px rgba(0,0,0,0.02);" onclick="handleDeskSelect('${docSnap.id}', '${desk.name}', '${desk.status}', '${desk.currentSessionId}')">
                        <div style="display: flex; align-items: center; gap: 16px;">
                            <div style="width: 48px; height: 48px; border-radius: 12px; background: #f1f5f9; color: #475569; display: flex; align-items: center; justify-content: center;">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
                            </div>
                            <div>
                                <h3 style="margin: 0; font-size: 1.15rem; font-weight: 700; color: #0f172a;">${desk.name}</h3>
                                <div style="display: flex; align-items: center; gap: 6px; margin-top: 4px;">
                                    ${statusDot} ${statusText}
                                </div>
                            </div>
                        </div>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                    </div>
                `;
            }
        });

        if (!foundPersonal) {
            await setDoc(doc(db, 'desks', personalDeskId), { name: 'Personal Drawer', status: 'closed', currentSessionId: null, isPersonal: true });
            personalDeskHTML = `
                <div style="margin-bottom: 32px;">
                    <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; margin-left: 4px;">My Workspace</div>
                    <div class="admin-form-card" style="padding: 16px; margin-bottom: 0; cursor: pointer; transition: transform 0.1s; display: flex; justify-content: space-between; align-items: center; background: var(--surface-color); border: 1px solid var(--border-color); box-shadow: 0 2px 8px rgba(0,0,0,0.04);" onclick="handleDeskSelect('${personalDeskId}', 'Personal Drawer', 'closed', 'null')">
                        <div style="display: flex; align-items: center; gap: 16px;">
                            <div style="width: 48px; height: 48px; border-radius: 12px; background: #ede9fe; color: #8b5cf6; display: flex; align-items: center; justify-content: center;">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
                            </div>
                            <div>
                                <h3 style="margin: 0; font-size: 1.15rem; font-weight: 700; color: #0f172a;">Personal Drawer</h3>
                                <div style="display: flex; align-items: center; gap: 6px; margin-top: 4px;">
                                    <div style="width: 10px; height: 10px; border-radius: 50%; background-color: #94a3b8;"></div> <span style="color: #94a3b8; font-size: 0.8rem; font-weight: 600;">Closed</span>
                                </div>
                            </div>
                        </div>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                    </div>
                </div>
            `;
        }

        if (sharedDesksHTML) {
            sharedDesksHTML = `
                <div style="margin-bottom: 24px;">
                    <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; margin-left: 4px;">Shared Floor Desks</div>
                    ${sharedDesksHTML}
                </div>
            `;
        }
        
        let adminToolsHTML = '';
        if (AppState.currentUserRole === 'admin') {
            adminToolsHTML = `
                <div style="margin-top: auto; padding-top: 24px; display: flex; gap: 16px; justify-content: center; opacity: 0.8;">
                    <button style="border: none; background: transparent; font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); cursor: pointer;" onclick="adminBypass()">Global View</button>
                    <span style="color: var(--border-color);">|</span>
                    <button style="border: none; background: transparent; font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); cursor: pointer;" onclick="enterSandboxMode()">Test Sandbox</button>
                </div>
            `;
        }
        
        container.innerHTML = personalDeskHTML + sharedDesksHTML + adminToolsHTML;
    } catch (e) { container.innerHTML = `<div style="color:#ef4444; padding:16px;">Error loading map. Refresh app.</div>`; }
}

export function adminBypass() {
    document.getElementById('modal-desk-select').classList.remove('active');
    AppState.currentDeskId = null; AppState.currentSessionId = null; AppState.currentDeskName = 'Global Admin Mode';
    document.getElementById('header-title').innerText = 'Global Admin Mode';
    if(window.switchTab) window.switchTab('floor', 'Live Floor Map');
    if(window.fetchTransactionsForDate) window.fetchTransactionsForDate(); 
    showFlashMessage("Admin Mode Activated");
}

export function enterSandboxMode() {
    if (window.txListenerUnsubscribe) { window.txListenerUnsubscribe(); window.txListenerUnsubscribe = null; }
    AppState.currentDeskId = 'sandbox';
    AppState.currentSessionId = 'sandbox_session';
    AppState.currentDeskName = 'Sandbox';
    AppState.currentOpeningCash = 10000; 
    
    AppState.currentOpeningInv = {};
    getPhysicalItems().forEach(item => AppState.currentOpeningInv[item] = 50);
    
    AppState.transactions = [];
    AppState.trashTransactions = [];
    
    document.getElementById('modal-desk-select').classList.remove('active');
    document.getElementById('header-title').innerHTML = `Sandbox <span style="font-size:0.7rem; background:#ef4444; color:#fff; padding:2px 6px; border-radius:8px;">LOCAL</span>`;
    
    if(window.renderPersonalReport) window.renderPersonalReport();
    if (document.getElementById('tab-desk').classList.contains('active') && window.renderDeskDashboard) window.renderDeskDashboard();
    
    showFlashMessage("Entered Sandbox Mode!");
}

export async function handleDeskSelect(deskId, deskName, status, sessionId) {
        AppState.currentDeskId = deskId;
        AppState.currentDeskName = deskName;

        if (status === 'open' && sessionId) {
            AppState.currentSessionId = sessionId;
            const todayStr = getStrictDate();
            try { 
                await setDoc(doc(db, 'users', AppState.currentUser.uid), { assignedDeskId: AppState.currentDeskId, assignedDate: todayStr }, { merge: true }); 
            } catch(e) {
                console.error("Failed to assign desk to user profile:", e);
            }

            document.getElementById('modal-desk-select').classList.remove('active');
            document.getElementById('header-title').innerText = `${deskName}`;
            
            try {
                const sessionSnap = await getDoc(doc(db, 'sessions', sessionId));
                if (sessionSnap.exists() && sessionSnap.data().openingBalances) {
                    AppState.currentOpeningCash = parseFloat(sessionSnap.data().openingBalances.cash) || 0;
                    AppState.currentOpeningInv = sessionSnap.data().openingBalances.inventory || {}; 
                }
            } catch(e) {
                showAppAlert("Sync Warning", "Could not fetch opening balances. Desk data might be incomplete.");
                console.error("Session fetch error:", e);
            }

            if(window.fetchTransactionsForDate) await window.fetchTransactionsForDate(); 
            showFlashMessage(`Joined ${deskName}!`);
    } else {
        document.getElementById('open-desk-title').innerText = `Open ${deskName}`;
        document.getElementById('open-cash-float').value = '';
        document.getElementById('open-desk-inventory-container').innerHTML = '<div class="spinner" style="margin: 0 auto;"></div>';
        openModal('modal-open-desk');

        const sessionsRef = collection(db, 'sessions');
        const q = query(sessionsRef, where('deskId', '==', deskId), orderBy('closedAt', 'desc'), limit(1));
        
        let rolloverStock = {}; 
        try {
            const lastSessionSnap = await getDocs(q);
            if (!lastSessionSnap.empty) {
                const lastSession = lastSessionSnap.docs[0].data();
                if (lastSession.actualClosing && lastSession.actualClosing.inventory) rolloverStock = lastSession.actualClosing.inventory;
            }
        } catch (e) {
            console.error("Could not fetch rollover stock from previous session:", e);
        }

        let rolloverHTML = '';
        const physicalItems = getPhysicalItems(); 
        
        physicalItems.forEach(itemName => {
            let expectedQty = rolloverStock[itemName] || 0;
            rolloverHTML += `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; border-bottom:1px solid #e2e8f0; padding-bottom:8px;">
                    <label class="admin-label" style="margin:0; font-size:0.85rem; color:#334155;">${itemName}</label>
                    <input type="number" class="settings-input open-inv-input" data-name="${itemName}" value="${expectedQty === 0 ? '' : expectedQty}" placeholder="0" style="width:80px; text-align:center; padding:8px; border-color:#cbd5e1;">
                </div>
            `;
        });

        if (!rolloverHTML) rolloverHTML = '<em style="color:#64748b; font-size:0.9rem;">No physical items in catalog.</em>';
        document.getElementById('open-desk-inventory-container').innerHTML = rolloverHTML;
    }
}

let isProcessingDesk = false;
export async function confirmOpenDesk() {
    if (isProcessingDesk) return; 

    let floatAmount = parseFloat(document.getElementById('open-cash-float').value);
    if (isNaN(floatAmount) || floatAmount < 0) { showAppAlert("Invalid Input", "You must enter the exact physical cash float provided by the manager."); return; }

    let verifiedStartingInventory = {};
    document.querySelectorAll('.open-inv-input').forEach(input => {
        let qty = parseInt(input.value) || 0;
        if (qty > 0) verifiedStartingInventory[input.getAttribute('data-name')] = qty;
    });

    isProcessingDesk = true; 

    try {
        const deskRef = doc(db, 'desks', AppState.currentDeskId);
        const deskCheck = await getDoc(deskRef);
        
        if (deskCheck.exists() && deskCheck.data().status === 'open') {
            showAppAlert("Desk Unavailable", "This desk was just opened by another agent. Please refresh the floor map.");
            closeModal('modal-open-desk'); loadFloorMap(); isProcessingDesk = false; return;
        }

        const newSessionRef = doc(collection(db, 'sessions'));
        AppState.currentSessionId = newSessionRef.id;
        AppState.currentOpeningCash = floatAmount;
        AppState.currentOpeningInv = verifiedStartingInventory; 
        const todayStr = getStrictDate();

        const sessionData = {
            deskId: AppState.currentDeskId, dateStr: todayStr, openedBy: AppState.userNickname || AppState.userDisplayName, openedByUid: AppState.currentUser.uid, openedAt: serverTimestamp(),
            status: 'open', openingBalances: { cash: floatAmount, inventory: verifiedStartingInventory }
        };

        await setDoc(newSessionRef, sessionData);
        await setDoc(deskRef, { status: 'open', currentSessionId: AppState.currentSessionId, name: AppState.currentDeskName }, { merge: true });
        await setDoc(doc(db, 'users', AppState.currentUser.uid), { assignedDeskId: AppState.currentDeskId, assignedDate: todayStr }, { merge: true });

        closeModal('modal-open-desk');
        document.getElementById('modal-desk-select').classList.remove('active');
        document.getElementById('header-title').innerText = `${AppState.currentDeskName}`;
        
        AppState.transactions = []; AppState.trashTransactions = [];
        if(window.fetchTransactionsForDate) await window.fetchTransactionsForDate();
        showFlashMessage(`${AppState.currentDeskName} is now OPEN!`);

    } catch (e) { showAppAlert("System Error", e.message); } 
    finally { isProcessingDesk = false; }
}

// ==========================================
//    FLOOR MAP UI & DRAWER ROUTING
// ==========================================
export async function renderLiveFloorTab() {
    const container = document.getElementById('live-floor-container');
    container.innerHTML = '<div class="spinner" style="align-self: center; margin-top: 40px;"></div>';

    try {
        const activeSessionsSnap = await getDocs(query(collection(db, 'sessions'), where('status', '==', 'open')));
        if (activeSessionsSnap.empty) { container.innerHTML = '<p class="placeholder-text">No desks open.</p>'; return; }

        let docsArray = [...activeSessionsSnap.docs];
        docsArray.sort((a, b) => a.data().deskId.localeCompare(b.data().deskId, undefined, { numeric: true }));
        
        let myIndex = docsArray.findIndex(doc => doc.id === AppState.currentSessionId);
        if (myIndex > 0) {
            let myDoc = docsArray.splice(myIndex, 1)[0];
            docsArray.unshift(myDoc);
        }

        let floorHTML = '';
        for (const docSnap of docsArray) {
            const session = docSnap.data(); const sid = docSnap.id;
            const txSnap = await getDocs(query(collection(db, 'transactions'), where('sessionId', '==', sid), where('isDeleted', '==', false)));

            let liveCash = parseFloat(session.openingBalances.cash) || 0;
            let liveInv = { ...(session.openingBalances.inventory || {}) };
            let liveServicesCount = 0;

            txSnap.forEach(txDoc => {
                let tx = txDoc.data();
                liveCash += (tx.cashAmt || 0);
                
                let change = getInventoryChange(tx);
                if (change !== 0) {
                    liveInv[tx.trackAs] = (liveInv[tx.trackAs] || 0) + change;
                } else if (tx.cat === 'service' || tx.cat === 'free-action') {
                    liveServicesCount += Math.abs(tx.qty);
                }
            });

            let invDisplay = '';
            for (const [name, qty] of Object.entries(liveInv)) {
                if (qty !== 0) {
                    let color = qty < 3 ? '#ef4444' : '#475569';
                    invDisplay += `<span style="display:inline-block; background:#f1f5f9; padding:4px 8px; border-radius:4px; font-size:0.8rem; margin:2px; color:${color}; font-weight:600;">${name}: ${qty}</span>`;
                }
            }
            if (liveServicesCount > 0) {
                invDisplay += `<span style="display:inline-block; background:#fef3c7; padding:4px 8px; border-radius:4px; font-size:0.8rem; margin:2px; color:#92400e; font-weight:600;">Services: ${liveServicesCount}</span>`;
            }
            if(!invDisplay) invDisplay = '<span style="font-size:0.8rem; color:#94a3b8;">No physical stock.</span>';

            const isMyDesk = sid === AppState.currentSessionId;

            let displayDeskName = session.deskId.replace('_', ' ').toUpperCase();
            if (session.deskId.startsWith('personal_')) {
                if (isMyDesk) {
                    displayDeskName = "My Drawer";
                } else {
                    displayDeskName = `${session.openedBy.split(' ')[0]}'s Drawer`;
                }
            }

            let safeDeskName = displayDeskName.replace(/'/g, "\\'");

            let actionBtn = isMyDesk 
                ? `<button class="btn-primary-full" style="width: 100%; background: #0ea5e9; padding: 10px; margin-top: 12px; box-shadow: 0 4px 12px rgba(14, 165, 233, 0.2);" onclick="openMyDeskDashboard()">Open My Drawer</button>`
                : `<button class="btn-outline" style="width: 100%; color: #8b5cf6; border-color: #8b5cf6; background: transparent; padding: 10px; margin-top: 12px;" onclick="peekAtDesk('${session.deskId}', '${safeDeskName}')">View Details</button>`;

            let agentNamesStr = 'Loading...';
            try {
                const agentsSnap = await getDocs(query(collection(db, 'users'), where('assignedDeskId', '==', session.deskId)));
                let names = [];
                agentsSnap.forEach(aDoc => { names.push(aDoc.data().nickname || aDoc.data().displayName || aDoc.data().email?.split('@')[0] || 'Agent'); });
                agentNamesStr = names.length > 0 ? names.join(', ') : 'Empty';
            } catch(e) { agentNamesStr = 'Unknown'; }

            let cardStyle = isMyDesk 
                ? `margin-bottom: 0; padding: 16px; background: #f0f9ff; border: 1px solid #bae6fd; border-left: 4px solid #0ea5e9; border-radius: 12px; box-shadow: 0 4px 12px rgba(14, 165, 233, 0.1);`
                : `margin-bottom: 0; padding: 16px; background: var(--surface-color); border: 1px solid var(--border-color); border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);`;

            floorHTML += `
                <div style="${cardStyle}">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid ${isMyDesk ? '#bae6fd' : 'var(--border-color)'}; padding-bottom: 12px;">
                        <h4 style="margin: 0; color: ${isMyDesk ? '#0369a1' : 'var(--text-primary)'}; font-size: 1.15rem; font-weight: 700; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 12px; min-width: 0; flex: 1;">
                            ${displayDeskName}
                        </h4>
                        <div style="font-size: 0.85rem; color: ${isMyDesk ? '#0284c7' : 'var(--text-secondary)'}; font-weight: 600; text-align: right; max-width: 50%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-shrink: 0;">
                            ${agentNamesStr}
                        </div>
                    </div>
                    
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                        <span style="font-size: 0.85rem; font-weight: bold; color: ${isMyDesk ? '#0284c7' : 'var(--text-secondary)'};">Live Cash:</span>
                        <span style="font-size: 1.1rem; font-weight: bold; color: #10b981;">${liveCash} Tk</span>
                    </div>

                    <div style="margin-bottom: 16px; padding-top: 12px; border-top: 1px dashed ${isMyDesk ? '#bae6fd' : 'var(--border-color)'};">
                        <span style="display: block; font-size: 0.8rem; font-weight: bold; color: ${isMyDesk ? '#0284c7' : 'var(--text-secondary)'}; margin-bottom: 6px;">Remaining Physical Stock:</span>
                        <div>${invDisplay}</div>
                    </div>
                    
                    ${actionBtn}
                </div>
            `;
        }
        container.innerHTML = floorHTML;
    } catch (e) { container.innerHTML = '<p class="placeholder-text" style="color: #ef4444;">Offline: Could not load.</p>'; }
}

export function openMyDeskDashboard() {
    const peekHeader = document.getElementById('desk-peek-header');
    if (peekHeader) peekHeader.style.display = 'none';
    
    const actionBtns = document.getElementById('desk-action-buttons');
    if (actionBtns) actionBtns.style.display = 'block';
    
    const deskTitle = document.getElementById('desk-dashboard-title');
    if (deskTitle) deskTitle.innerText = AppState.currentDeskName + ' (My Drawer)';
    
    if (window.switchTab) window.switchTab('desk', AppState.currentDeskName);
    if (window.renderDeskDashboard) window.renderDeskDashboard(AppState.currentDeskId);
}

export function peekAtDesk(targetDeskId, targetDeskName) {
    if (targetDeskId === AppState.currentDeskId) {
        openMyDeskDashboard(); 
    } else {
        const actionBtns = document.getElementById('desk-action-buttons');
        if (actionBtns) actionBtns.style.display = 'none';
        
        const peekHeader = document.getElementById('desk-peek-header');
        if (peekHeader) peekHeader.style.display = 'flex';
        
        const deskTitle = document.getElementById('desk-dashboard-title');
        if (deskTitle) deskTitle.innerText = targetDeskName;

        if (window.switchTab) window.switchTab('desk', targetDeskName + ' (Peek)');
        if (window.renderDeskDashboard) window.renderDeskDashboard(targetDeskId);
    }
}

export function handleMyDrawerNav() {
    if (AppState.currentDeskId) {
        openMyDeskDashboard();
    } else {
        showAppAlert("No Active Desk", "You are not currently assigned to an open desk. Please open or join one from the Live Floor map first.");
        if(window.switchTab) window.switchTab('floor', 'Live Floor Map');
    }
}

// ==========================================
//    CLOSE DESK & RECONCILIATION
// ==========================================
let expectedClosingStats = { cash: 0, inventory: {} };
let actualClosingStats = { cash: 0, inventory: {} };

export async function initiateCloseDesk() {
    if (!AppState.currentSessionId) { showAppAlert("Error", "You are not assigned to an open desk."); return; }

    const sessionSnap = await getDoc(doc(db, 'sessions', AppState.currentSessionId));
    if (!sessionSnap.exists()) return;

    const sessionData = sessionSnap.data();
    let expectedCash = parseFloat(sessionData.openingBalances.cash) || 0;
    let expectedMfs = 0;
    let expectedInv = { ...(sessionData.openingBalances.inventory || {}) };

    const txSnap = await getDocs(query(collection(db, 'transactions'), where('sessionId', '==', AppState.currentSessionId), where('isDeleted', '==', false)));

    txSnap.forEach(docSnap => {
        let tx = docSnap.data();
        expectedCash += (tx.cashAmt || 0); 
        expectedMfs += (tx.mfsAmt !== undefined ? tx.mfsAmt : (tx.payment === 'MFS' ? tx.amount : 0));
        
        let change = getInventoryChange(tx);
        if (change !== 0) {
            expectedInv[tx.trackAs] = (expectedInv[tx.trackAs] || 0) + change;
        }
    });

    expectedClosingStats = { cash: expectedCash, mfs: expectedMfs, inventory: expectedInv };

    let invHTML = '';
    let itemsToCount = Object.keys(expectedInv);
    
    if(itemsToCount.length === 0) invHTML = '<p style="text-align:center; color: var(--text-secondary);">No physical inventory tracked today.</p>';
    else {
        itemsToCount.forEach(itemName => {
            invHTML += `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; border-bottom:1px solid #e2e8f0; padding-bottom:8px;">
                    <label class="admin-label" style="margin:0; font-size:0.85rem; color:#334155;">${itemName}</label>
                    <input type="number" class="actual-inv-input settings-input" data-name="${itemName}" style="width:80px; text-align:center; padding:8px; border-color:#cbd5e1;" placeholder="0">
                </div>
            `;
        });
    }

    const modalContent = `
        <div style="background-color: var(--surface-color); padding: calc(16px + env(safe-area-inset-top)) 20px 16px 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); position: sticky; top: 0; z-index: 10;">
            <h3 style="margin: 0; font-size: 1.25rem; font-weight: 800; color: var(--text-primary);">Close Shift</h3>
            <button style="background: none; border: none; color: #ef4444; font-weight: 600; font-size: 1rem; padding: 4px 0; cursor: pointer;" onclick="closeModal('modal-close-desk')">Cancel</button>
        </div>

        <div style="flex: 1; overflow-y: auto; padding: 24px 20px; padding-bottom: calc(24px + env(safe-area-inset-bottom));">
      <div style="background: var(--warning-bg); border: 1px solid var(--warning-border); padding: 12px; border-radius: 8px; margin-bottom: 24px;">
        <p style="color: var(--warning-text); font-size: 0.85rem; margin: 0; font-weight: 600; line-height: 1.4;">Blind Count: Count your physical cash and stock. Enter the totals below to submit your report to the manager.</p>
      </div>
      
      <div class="admin-form-card" style="margin-bottom: 24px; padding: 20px; border: 2px solid var(--info-border); background: var(--info-bg);">
        <label style="display: block; font-size: 0.85rem; font-weight: 700; color: var(--info-text); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px;">1. Actual Cash in Drawer</label>
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
          <span style="font-size: 1.75rem; font-weight: bold; color: var(--info-text);">Tk</span>
          <input type="number" id="actual-cash-input" class="settings-input" style="font-size: 1.75rem; font-weight: 800; padding: 12px 16px; border-color: var(--info-border); color: var(--info-text); background: transparent;" placeholder="0" oninput="calculateBlindRetained()">
        </div>

        <label style="display: block; font-size: 0.85rem; font-weight: 700; color: var(--purple-text); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; border-top: 1px dashed var(--border-color); padding-top: 16px;">2. Manager Drop</label>
        <div style="display: flex; align-items: center; gap: 12px;">
          <span style="font-size: 1.5rem; font-weight: bold; color: var(--purple-text);">Tk</span>
          <input type="number" id="manager-drop-input" class="settings-input" style="font-size: 1.5rem; font-weight: 800; padding: 10px 16px; border-color: var(--purple-border); color: var(--purple-text); background: var(--purple-bg);" placeholder="0" oninput="calculateBlindRetained()">
        </div>
                <div style="margin-top: 16px; font-size: 0.95rem; color: #475569; display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: 600;">Retained Float (For Tomorrow):</span> 
                    <strong id="retained-float-display" style="color: #0f172a; font-size: 1.1rem;">0 Tk</strong>
                </div>
            </div>

            <div style="font-size: 0.85rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px;">3. Physical Inventory Count</div>
            <div class="admin-form-card" style="padding: 16px; margin-bottom: 32px;">
                ${invHTML}
            </div>

            <button class="btn-primary-full" style="padding: 16px; font-size: 1.1rem; background-color: #10b981; display: flex; justify-content: center; align-items: center; gap: 8px;" onclick="submitClosingReport()">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                SUBMIT TO MANAGER
            </button>
        </div>
    `;
    document.getElementById('close-desk-content').innerHTML = modalContent;
    openModal('modal-close-desk');
}

export function calculateBlindRetained() {
    let actual = parseFloat(document.getElementById('actual-cash-input').value) || 0;
    let drop = parseFloat(document.getElementById('manager-drop-input').value) || 0;
    let retained = actual - drop;
    
    let displayEl = document.getElementById('retained-float-display');
    if (drop > actual) displayEl.innerHTML = `<span style="color: #ef4444;">Error: Exceeds Drawer Total</span>`;
    else displayEl.innerText = retained + " Tk";
}

export async function submitClosingReport() {
    let actualCash = parseFloat(document.getElementById('actual-cash-input').value);
    let dropAmount = parseFloat(document.getElementById('manager-drop-input').value) || 0;

    if (isNaN(actualCash) || actualCash < 0) { showAppAlert("Invalid Input", "Please enter your total physical cash."); return; }
    if (dropAmount < 0 || dropAmount > actualCash) { 
        showAppAlert("Error", "Manager drop cannot exceed your total physical cash."); 
        return; 
    }

    actualClosingStats.cash = actualCash;
    actualClosingStats.inventory = {};

    document.querySelectorAll('.actual-inv-input').forEach(input => {
        let itemName = input.getAttribute('data-name');
        actualClosingStats.inventory[itemName] = parseInt(input.value) || 0;
    });

    let variance = actualCash - expectedClosingStats.cash;
    let retainedFloat = actualCash - dropAmount;

    try {
        await updateDoc(doc(db, 'sessions', AppState.currentSessionId), {
            closedBy: AppState.userNickname || AppState.userDisplayName, 
            closedByUid: AppState.currentUser.uid, 
            closedAt: serverTimestamp(), 
            status: 'pending', 
            expectedClosing: expectedClosingStats, 
            actualClosing: actualClosingStats, 
            variance: variance,
            hasDiscrepancy: variance !== 0, 
            managerDrop: dropAmount, 
            retainedFloat: retainedFloat
        });
        
        await setDoc(doc(db, 'desks', AppState.currentDeskId), { status: 'closed', currentSessionId: null }, { merge: true });
        await setDoc(doc(db, 'users', AppState.currentUser.uid), { assignedDeskId: null, assignedDate: null }, { merge: true });
    } catch (e) { 
        showFlashMessage("Offline: Report queued for sync."); 
    } finally {
        AppState.currentDeskId = null; 
        AppState.currentSessionId = null; 
        AppState.currentDeskName = '';
        closeModal('modal-close-desk');
        showFlashMessage("Report Submitted! See Manager.");
        loadFloorMap(); // Automatically reload the floor map
    }
}