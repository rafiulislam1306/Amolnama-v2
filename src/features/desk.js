// src/features/desk.js
import { collection, doc, setDoc, getDoc, getDocs, updateDoc, query, where, orderBy, limit, serverTimestamp } from "firebase/firestore";
import { db } from '../config/firebase.js';
import { AppState } from '../core/state.js';
import { getStrictDate } from '../utils/helpers.js';
import { showAppAlert, showFlashMessage, openModal, closeModal } from '../utils/ui-helpers.js';
import { getInventoryChange, getPhysicalItems } from './inventory.js';

// ==========================================
//   THE SEAMLESS DAILY ROLLOVER
// ==========================================
export async function performLazyAutoClose() {
    const todayStr = getStrictDate();
    try {
        // Get ALL desks to ensure everyone's stock rolls over to today's ledger automatically
        const desksSnap = await getDocs(collection(db, 'desks'));

        for (const deskDoc of desksSnap.docs) {
            const deskId = deskDoc.id;
            const deskData = deskDoc.data();
            const currentSessId = deskData.currentSessionId;

            let lastSession = null;
            let lastSessionId = currentSessId;
            let needsRollover = true;

            // Check if this desk already has a session created for TODAY
            if (currentSessId && currentSessId !== 'null') {
                const sessSnap = await getDoc(doc(db, 'sessions', currentSessId));
                if (sessSnap.exists()) {
                    lastSession = sessSnap.data();
                    if (lastSession.dateStr === todayStr) {
                        needsRollover = false; // Already synced for today!
                    }
                }
            }

            if (needsRollover) {
                let carryOverInv = {};
                let carryOverCash = 0;

                // If we lost the session pointer, find the most recent session for this desk in history
                if (!lastSession) {
                    const pastSnap = await getDocs(query(collection(db, 'sessions'), where('deskId', '==', deskId)));
                    let maxTime = 0;
                    pastSnap.forEach(docSnap => {
                        let s = docSnap.data();
                        let t = s.openedAt?.toMillis() || 0;
                        if (t > maxTime) { maxTime = t; lastSession = s; lastSessionId = docSnap.id; }
                    });
                }

                // Calculate exact final leftovers from that past session
                if (lastSession) {
                    carryOverInv = { ...(lastSession.openingBalances?.inventory || {}) };
                    if (lastSession.status === 'open') carryOverCash = parseFloat(lastSession.openingBalances?.cash) || 0;

                    const txSnap = await getDocs(query(collection(db, 'transactions'), where('sessionId', '==', lastSessionId), where('isDeleted', '==', false)));
                    txSnap.forEach(tDoc => {
                        let tx = tDoc.data();
                        let change = getInventoryChange(tx);
                        if (change !== 0) carryOverInv[tx.trackAs] = (carryOverInv[tx.trackAs] || 0) + change;
                        if (lastSession.status === 'open') carryOverCash += (tx.cashAmt || 0);
                    });

                    // If left open overnight, seal it officially with Auto-Drop!
                    if (lastSession.status === 'open') {
                        let finalCash = carryOverCash;
                        
                        // 1. Write the Auto-Drop Transaction for 11:59 PM yesterday
                        if (finalCash > 0) {
                            await setDoc(doc(collection(db, 'transactions')), {
                                id: Date.now() + Math.floor(Math.random() * 1000), // Ensure unique ID
                                receiptNo: `SYS-${Date.now().toString().slice(-4)}`,
                                type: 'adjustment',
                                name: 'System Auto-Handover',
                                trackAs: 'Physical Cash',
                                amount: finalCash,
                                qty: 1,
                                payment: 'Auto-Dropped to Manager',
                                cashAmt: -Math.abs(finalCash),
                                mfsAmt: 0,
                                isDeleted: false,
                                time: '11:59 PM',
                                dateStr: lastSession.dateStr, // Yesterday's date
                                deskId: deskId,
                                sessionId: lastSessionId,
                                agentId: 'system',
                                agentName: 'System Auto-Close',
                                timestamp: serverTimestamp() // Safe fallback
                            });
                        }

                        // 2. Save the Snapshot
                        await setDoc(doc(collection(db, 'eod_reports')), {
                            deskId: deskId,
                            sessionId: lastSessionId,
                            dateStr: lastSession.dateStr,
                            submittedBy: 'System',
                            submittedAt: serverTimestamp(),
                            expectedClosing: { cash: finalCash, inventory: carryOverInv },
                            actualClosing: { cash: 0, inventory: carryOverInv }, // Cash dropped to 0
                            variance: 0, // No variance because system assumes perfect drop
                            managerDrop: finalCash,
                            retainedFloat: 0
                        });

                        // 3. Seal the session
                        await updateDoc(doc(db, 'sessions', lastSessionId), {
                            status: 'closed_by_system', closedAt: serverTimestamp(),
                            expectedClosing: { cash: 0, inventory: carryOverInv } // Cash is now 0
                        });
                        
                        carryOverCash = 0; // Reset next day cash to 0
                    }
                }

                // Create TODAY'S session for this desk with the carried-over stock!
                // If the desk was closed yesterday, it stays "closed" today (acts as a dormant vault for the Floor Report)
                let newStatus = (lastSession && lastSession.status === 'open') ? 'open' : 'closed';
                
                const newSessionRef = doc(collection(db, 'sessions'));
                await setDoc(newSessionRef, {
                    deskId: deskId, dateStr: todayStr, 
                    openedBy: newStatus === 'open' ? 'System Auto-Rollover' : 'System Auto-Forward', 
                    openedByUid: 'system', openedAt: serverTimestamp(),
                    status: newStatus, openingBalances: { cash: carryOverCash, inventory: carryOverInv }
                });

                // Point the desk to today's new pre-loaded session
                await setDoc(doc(db, 'desks', deskId), { status: newStatus, currentSessionId: newSessionRef.id }, { merge: true });
            }
        }
    } catch(e) {
        console.error("System Error: Seamless daily sync failed.", e);
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
        const myFirstName = AppState.userNickname || (AppState.userDisplayName ? AppState.userDisplayName.split(' ')[0] : 'Agent');
        const myDrawerName = `${myFirstName}'s Drawer`;
        const safeDrawerName = myDrawerName.replace(/'/g, "\\'");
        let foundPersonal = false;

        if (desksSnapshot.empty) {
            await setDoc(doc(db, 'desks', 'desk_1'), { name: 'Desk 1', status: 'closed', currentSessionId: null });
            await setDoc(doc(db, 'desks', 'desk_2'), { name: 'Desk 2', status: 'closed', currentSessionId: null });
            await setDoc(doc(db, 'desks', 'desk_3'), { name: 'Desk 3', status: 'closed', currentSessionId: null });
            loadFloorMap(); return;
        }

        desksSnapshot.forEach(docSnap => {
            const desk = docSnap.data();
            // Desks are now universally active
            const statusDot = '<div style="width: 10px; height: 10px; border-radius: 50%; background-color: #10b981; box-shadow: 0 0 8px rgba(16, 185, 129, 0.4);"></div>';
            const statusText = '<span style="color: #10b981; font-size: 0.8rem; font-weight: 600;">Active</span>';
            
            if (docSnap.id === personalDeskId) {
                foundPersonal = true;
                
                // Silent update to fix existing generic names in Firebase
                if (desk.name === 'Personal Drawer') {
                    setDoc(doc(db, 'desks', personalDeskId), { name: myDrawerName }, { merge: true }).catch(()=>{});
                }
                
                personalDeskHTML = `
                    <div style="margin-bottom: 32px;">
                        <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; margin-left: 4px;">My Workspace</div>
                        <div class="admin-form-card" style="padding: 16px; margin-bottom: 0; cursor: pointer; transition: transform 0.1s; display: flex; justify-content: space-between; align-items: center; background: var(--surface-color); border: 1px solid var(--border-color); box-shadow: 0 2px 8px rgba(0,0,0,0.04);" onclick="handleDeskSelect('${docSnap.id}', '${safeDrawerName}', '${desk.status}', '${desk.currentSessionId}')">
                            <div style="display: flex; align-items: center; gap: 16px;">
                                <div style="width: 48px; height: 48px; border-radius: 12px; background: #ede9fe; color: #8b5cf6; display: flex; align-items: center; justify-content: center;">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
                                </div>
                                <div>
                                    <h3 style="margin: 0; font-size: 1.15rem; font-weight: 700; color: #0f172a;">${myDrawerName}</h3>
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
            await setDoc(doc(db, 'desks', personalDeskId), { name: myDrawerName, status: 'closed', currentSessionId: null, isPersonal: true });
            personalDeskHTML = `
                <div style="margin-bottom: 32px;">
                    <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; margin-left: 4px;">My Workspace</div>
                    <div class="admin-form-card" style="padding: 16px; margin-bottom: 0; cursor: pointer; transition: transform 0.1s; display: flex; justify-content: space-between; align-items: center; background: var(--surface-color); border: 1px solid var(--border-color); box-shadow: 0 2px 8px rgba(0,0,0,0.04);" onclick="handleDeskSelect('${personalDeskId}', '${safeDrawerName}', 'closed', 'null')">
                        <div style="display: flex; align-items: center; gap: 16px;">
                            <div style="width: 48px; height: 48px; border-radius: 12px; background: #ede9fe; color: #8b5cf6; display: flex; align-items: center; justify-content: center;">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
                            </div>
                            <div>
                                <h3 style="margin: 0; font-size: 1.15rem; font-weight: 700; color: #0f172a;">${myDrawerName}</h3>
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

    // FIX: Clean up stringified null/undefined passed from HTML buttons
    let activeSessionId = (sessionId === 'null' || sessionId === 'undefined' || !sessionId) ? null : sessionId;

    // The boot script already created a dormant session for today. We just wake it up!
    if (status !== 'open' && activeSessionId) {
        await updateDoc(doc(db, 'sessions', activeSessionId), {
            status: 'open',
            openedBy: AppState.userNickname || AppState.userDisplayName,
            openedByUid: AppState.currentUser.uid
        });
        await setDoc(doc(db, 'desks', deskId), { status: 'open' }, { merge: true });
    } 
    // Absolute failsafe just in case the boot script was interrupted
    else if (!activeSessionId) {
        const newSessionRef = doc(collection(db, 'sessions'));
        activeSessionId = newSessionRef.id;
        await setDoc(newSessionRef, {
            deskId: deskId, dateStr: getStrictDate(), 
            openedBy: AppState.userNickname || AppState.userDisplayName, openedByUid: AppState.currentUser.uid, openedAt: serverTimestamp(),
            status: 'open', openingBalances: { cash: 0, inventory: {} }
        });
        await setDoc(doc(db, 'desks', deskId), { status: 'open', currentSessionId: activeSessionId }, { merge: true });
    }

    AppState.currentSessionId = activeSessionId;
    const todayStr = getStrictDate();
    try {
        await setDoc(doc(db, 'users', AppState.currentUser.uid), { assignedDeskId: AppState.currentDeskId, assignedDate: todayStr }, { merge: true });
    } catch(e) { console.error("Failed to assign desk to user profile:", e); }

    document.getElementById('modal-desk-select').classList.remove('active');
    document.getElementById('header-title').innerText = `${deskName}`;
    
    try {
        const sessionSnap = await getDoc(doc(db, 'sessions', activeSessionId));
        if (sessionSnap.exists() && sessionSnap.data().openingBalances) {
            let dbCash = parseFloat(sessionSnap.data().openingBalances.cash) || 0;
            if (dbCash > 0) {
                await updateDoc(doc(db, 'sessions', activeSessionId), { 'openingBalances.cash': 0 });
                dbCash = 0;
            }
            AppState.currentOpeningCash = dbCash;
            AppState.currentOpeningInv = sessionSnap.data().openingBalances.inventory || {}; 
        }
    } catch(e) { console.error("Session fetch error:", e); }

    if(window.fetchTransactionsForDate) await window.fetchTransactionsForDate();
    showFlashMessage(`Joined ${deskName}!`);
    
    // Auto-route the user directly into their drawer for better UX
    if (window.switchTab) window.switchTab('desk', deskName);
    if (window.renderDeskDashboard) window.renderDeskDashboard(deskId);
}

// Function deprecated but left empty to prevent external errors if called
export async function confirmOpenDesk() { return; }

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
                    let isLow = qty < 3;
                    let bg = isLow ? '#fef2f2' : '#f8fafc';
                    let border = isLow ? '#fca5a5' : '#e2e8f0';
                    let color = isLow ? '#ef4444' : '#475569';
                    invDisplay += `<div style="flex-grow: 1; display: flex; justify-content: space-between; align-items: center; background:${bg}; border: 1px solid ${border}; padding:6px 10px; border-radius:12px; font-size:0.75rem; color:${color}; font-weight:700;"><span style="white-space:nowrap;">${name}</span> <span style="margin-left: 8px; padding-left: 8px; border-left: 1px solid ${border};">${qty}</span></div>`;
                }
            }
            if (liveServicesCount > 0) {
                invDisplay += `<div style="flex-grow: 1; display: flex; justify-content: space-between; align-items: center; background:#fffbeb; border: 1px solid #fde68a; padding:6px 10px; border-radius:12px; font-size:0.75rem; color:#d97706; font-weight:700;"><span style="white-space:nowrap;">Services</span> <span style="margin-left: 8px; padding-left: 8px; border-left: 1px solid #fde68a;">${liveServicesCount}</span></div>`;
            }
            
            if (invDisplay) {
                // Invisible flex-grow spacer to stop the last row from stretching!
                invDisplay += `<div style="flex-grow: 999;"></div>`;
            } else {
                invDisplay = '<span style="font-size:0.8rem; color:var(--text-secondary); font-style: italic;">No physical stock tracked.</span>';
            }

            const isMyDesk = sid === AppState.currentSessionId;

            let displayDeskName = session.deskId.replace('_', ' ').toUpperCase();
            
            try {
                const deskSnap = await getDoc(doc(db, 'desks', session.deskId));
                if (deskSnap.exists() && deskSnap.data().name) {
                    displayDeskName = deskSnap.data().name;
                }
                
                // UPGRADE: If it STILL says "Personal Drawer", the agent hasn't logged in yet. 
                // Let's fetch their name directly and heal the database!
                if (displayDeskName === 'Personal Drawer' && session.deskId.startsWith('personal_')) {
                    const uid = session.deskId.replace('personal_', '');
                    const userSnap = await getDoc(doc(db, 'users', uid));
                    
                    if (userSnap.exists()) {
                        const uData = userSnap.data();
                        const fName = uData.nickname || (uData.displayName ? uData.displayName.split(' ')[0] : 'Agent');
                        displayDeskName = `${fName}'s Drawer`;
                        
                        // Silently heal the database so it's permanently fixed
                        setDoc(doc(db, 'desks', session.deskId), { name: displayDeskName }, { merge: true }).catch(()=>{});
                    }
                }
            } catch(e) { console.error("Could not fetch real desk name", e); }

            if (session.deskId.startsWith('personal_') && isMyDesk) {
                displayDeskName = "My Drawer";
            }

            let safeDeskName = displayDeskName.replace(/'/g, "\\'");

            let actionBtn = isMyDesk 
                ? `<button class="btn-primary-full" style="width: 100%; background: #0ea5e9; padding: 14px; margin-top: 8px; border-radius: 14px; font-weight: 700; font-size: 1rem; box-shadow: 0 4px 16px rgba(14, 165, 233, 0.25);" onclick="openMyDeskDashboard()">Open My Drawer</button>`
                : `<button class="btn-outline" style="width: 100%; color: #8b5cf6; border-color: #8b5cf6; background: transparent; padding: 14px; margin-top: 8px; border-radius: 14px; font-weight: 700; font-size: 1rem;" onclick="peekAtDesk('${session.deskId}', '${safeDeskName}')">View Details</button>`;

            let agentNamesStr = 'Loading...';
            try {
                const agentsSnap = await getDocs(query(collection(db, 'users'), where('assignedDeskId', '==', session.deskId)));
                let names = [];
                agentsSnap.forEach(aDoc => { names.push(aDoc.data().nickname || aDoc.data().displayName || aDoc.data().email?.split('@')[0] || 'Agent'); });
                agentNamesStr = names.length > 0 ? names.join(', ') : 'Empty';
            } catch(e) { agentNamesStr = 'Unknown'; }

            let cardStyle = isMyDesk 
                ? `margin-bottom: 0; padding: 20px; background: linear-gradient(145deg, #ffffff, #f0f9ff); border: 2px solid #38bdf8; border-radius: 20px; box-shadow: 0 8px 24px rgba(14, 165, 233, 0.15); position: relative; overflow: hidden;`
                : `margin-bottom: 0; padding: 20px; background: var(--surface-color); border: 1px solid var(--border-color); border-radius: 20px; box-shadow: 0 4px 16px rgba(0,0,0,0.03); position: relative; overflow: hidden;`;

            let badge = isMyDesk ? `<div style="position: absolute; top: 0; right: 0; background: #38bdf8; color: white; font-size: 0.65rem; font-weight: 800; padding: 6px 16px; border-bottom-left-radius: 16px; text-transform: uppercase; letter-spacing: 1px; box-shadow: -2px 2px 8px rgba(56, 189, 248, 0.2);">My Desk</div>` : '';

            let agentIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.7;"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;

            floorHTML += `
                <div style="${cardStyle}">
                    ${badge}
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px;">
                        <div style="flex: 1; min-width: 0; padding-right: ${isMyDesk ? '60px' : '0'};">
                            <h4 style="margin: 0 0 6px 0; color: ${isMyDesk ? '#0369a1' : 'var(--text-primary)'}; font-size: 1.25rem; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                ${displayDeskName}
                            </h4>
                            <div style="display: flex; align-items: center; gap: 6px; font-size: 0.85rem; color: ${isMyDesk ? '#0284c7' : 'var(--text-secondary)'}; font-weight: 600;">
                                ${agentIcon}
                                <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${agentNamesStr}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div style="background: ${isMyDesk ? '#e0f2fe' : 'var(--bg-color)'}; border-radius: 12px; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                        <span style="font-size: 0.85rem; font-weight: 700; color: ${isMyDesk ? '#0284c7' : 'var(--text-secondary)'}; text-transform: uppercase; letter-spacing: 0.5px;">Live Cash</span>
                        <span style="font-size: 1.35rem; font-weight: 800; color: #10b981; letter-spacing: -0.5px;">${liveCash} <span style="font-size: 0.9rem; color: #10b981; opacity: 0.8;">Tk</span></span>
                    </div>

                    <div style="margin-bottom: ${isMyDesk ? '8px' : '16px'};">
                        <span style="display: block; font-size: 0.75rem; font-weight: 800; color: ${isMyDesk ? '#0284c7' : 'var(--text-secondary)'}; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px;">Physical Stock</span>
                        <div style="display: flex; flex-wrap: wrap; gap: 8px;">${invDisplay}</div>
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
    if (AppState.currentUserRole !== 'admin' && AppState.currentUserRole !== 'manager') {
        showAppAlert("Access Denied", "Only Center Managers and Admins have clearance to view active remote desk ledgers.");
        return;
    }

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
    
    if(itemsToCount.length === 0) invHTML = '<p style="text-align:center; color: var(--text-secondary); font-size: 0.9rem;">No physical inventory tracked today.</p>';
    else {
        itemsToCount.forEach(itemName => {
            let qty = expectedInv[itemName];
            if (qty > 0) {
                invHTML += `
                    <div style="display:flex; justify-content:space-between; align-items:center; padding: 6px 0; border-bottom:1px dashed #e2e8f0; font-size: 0.9rem;">
                        <span style="color:#334155; font-weight: 600;">${itemName}</span>
                        <span style="color:#0f172a; font-weight: 800;">${qty}</span>
                    </div>
                `;
            }
        });
        if (!invHTML) invHTML = '<p style="text-align:center; color: var(--text-secondary); font-size: 0.9rem;">All tracked stock is at 0.</p>';
    }

    const modalContent = `
        <div style="background-color: var(--surface-color); padding: calc(16px + env(safe-area-inset-top)) 20px 16px 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); position: sticky; top: 0; z-index: 10;">
            <h3 style="margin: 0; font-size: 1.25rem; font-weight: 800; color: var(--text-primary);">Close Shift</h3>
            <button style="background: none; border: none; color: #ef4444; font-weight: 600; font-size: 1rem; padding: 4px 0; cursor: pointer;" onclick="closeModal('modal-close-desk')">Cancel</button>
        </div>

        <div style="flex: 1; overflow-y: auto; padding: 24px 20px; padding-bottom: calc(24px + env(safe-area-inset-bottom));">
            <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 24px; line-height: 1.5;">Please hand over the following expected cash and items to your manager. This will permanently seal your shift.</p>
      
            <div class="admin-form-card" style="margin-bottom: 24px; padding: 20px; border: 2px solid #10b981; background: #ecfdf5;">
                <label style="display: block; font-size: 0.8rem; font-weight: 800; color: #047857; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">Expected Cash Handover</label>
                <div style="font-size: 2rem; font-weight: 900; color: #065f46;">${expectedCash} Tk</div>
                <div style="font-size: 0.85rem; font-weight: 600; color: #047857; margin-top: 4px;">Expected MFS: ${expectedMfs} Tk</div>
            </div>

            <div style="font-size: 0.8rem; font-weight: 800; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px;">Expected Physical Stock</div>
            <div class="admin-form-card" style="padding: 16px; margin-bottom: 32px; background: #f8fafc; border: 1px solid #cbd5e1;">
                ${invHTML}
            </div>

            <button class="btn-primary-full" style="padding: 16px; font-size: 1.1rem; background-color: #ef4444; display: flex; justify-content: center; align-items: center; gap: 8px; box-shadow: 0 4px 16px rgba(239,68,68,0.3);" onclick="submitClosingReport()">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                CONFIRM & SEAL DESK
            </button>
        </div>
    `;
    document.getElementById('close-desk-content').innerHTML = modalContent;
    openModal('modal-close-desk');
}

export async function submitClosingReport() {
    // In One-Click Close, actual equals expected. The manager handles shortages offline.
    actualClosingStats.cash = expectedClosingStats.cash;
    actualClosingStats.inventory = expectedClosingStats.inventory;

    try {
        // 1. Save the daily report snapshot
        await setDoc(doc(collection(db, 'eod_reports')), {
            deskId: AppState.currentDeskId,
            sessionId: AppState.currentSessionId,
            dateStr: getStrictDate(),
            submittedBy: AppState.userNickname || AppState.userDisplayName,
            submittedAt: serverTimestamp(),
            expectedClosing: expectedClosingStats,
            actualClosing: actualClosingStats,
            variance: 0, // Perfectly balanced conceptually
            managerDrop: expectedClosingStats.cash,
            retainedFloat: 0
        });

        // 2. Mark session as closed
        await updateDoc(doc(db, 'sessions', AppState.currentSessionId), {
            status: 'closed', closedAt: serverTimestamp()
        });

        // 3. Mark desk as closed and detach session pointer
        await updateDoc(doc(db, 'desks', AppState.currentDeskId), {
            status: 'closed', currentSessionId: null
        });

        // 4. Release the user's desk lock
        await updateDoc(doc(db, 'users', AppState.currentUser.uid), {
            assignedDeskId: null, assignedDate: null
        });

    } catch (e) { 
        showFlashMessage("Offline: Report queued for sync."); 
        console.error(e);
    } finally {
        closeModal('modal-close-desk');
        showFlashMessage("Desk Sealed! Shift complete.");
        
        // Reset local state and boot them back to the Floor Map
        AppState.currentDeskId = null;
        AppState.currentSessionId = null;
        document.getElementById('header-title').innerText = 'Floor Map';
        
        if(window.fetchTransactionsForDate) window.fetchTransactionsForDate();
        if(window.switchTab) window.switchTab('floor', 'Live Floor Map');
        loadFloorMap(); 
    }
}