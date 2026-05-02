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