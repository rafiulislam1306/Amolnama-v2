// src/core/app-init.js
import { doc, getDoc, setDoc, collection, query, where, getDocs } from "firebase/firestore";
import { db } from '../config/firebase.js';
import { AppState } from './state.js';
import { getStrictDate } from '../utils/helpers.js';
import { defaultInventoryGroups, defaultCatalog } from './constants.js';
import { performLazyAutoClose, loadFloorMap, executeHandleDeskSelect } from '../features/desk.js';
import { fetchTransactionsForDate } from '../features/reports.js';
import { setupBottomSheetDrag, showAppAlert } from '../utils/ui-helpers.js';

export function updateCurrencyUI() { 
    const userCurrency = 'Tk';
    document.querySelectorAll('.ers-currency').forEach(el => { 
        if(!el.innerText.includes('Qty')) el.innerText = userCurrency; 
    }); 
}
export async function initUserData(onComplete) {
    if(!AppState.currentUser) return;
    try {
        const userDocRef = doc(db, 'users', AppState.currentUser.uid);
        const todayStr = getStrictDate();

        let userData = {};
        try {
            const userDocSnap = await getDoc(userDocRef);
            if (userDocSnap.exists()) {
                userData = userDocSnap.data();
                localStorage.setItem('amolnama_cache_user_' + AppState.currentUser.uid, JSON.stringify(userData));
            }
            AppState.currentUserRole = userData.role || 'user';
            AppState.userNickname = userData.nickname || '';
            await setDoc(userDocRef, { email: AppState.currentUser.email || null, displayName: AppState.userDisplayName || 'User', role: AppState.currentUserRole }, { merge: true });
        } catch (err) {
            console.warn("Offline Mode: Loading user data from cache", err);
            userData = JSON.parse(localStorage.getItem('amolnama_cache_user_' + AppState.currentUser.uid) || '{}');
            AppState.currentUserRole = userData.role || 'user';
            AppState.userNickname = userData.nickname || '';
        }

        // 2. Fetch global catalog & inventory groups BEFORE auto-close
        try {
            const globalDoc = await getDoc(doc(db, 'global', 'settings'));
            if (globalDoc.exists() && globalDoc.data().catalog) {
                AppState.globalCatalog = globalDoc.data().catalog;
                AppState.globalInventoryGroups = globalDoc.data().inventoryGroups || defaultInventoryGroups;
                localStorage.setItem('amolnama_cache_global', JSON.stringify({ catalog: AppState.globalCatalog, inventoryGroups: AppState.globalInventoryGroups }));
            } else {
                AppState.globalCatalog = defaultCatalog;
                AppState.globalInventoryGroups = defaultInventoryGroups;
                if (AppState.currentUserRole === 'admin') await setDoc(doc(db, 'global', 'settings'), { catalog: AppState.globalCatalog, inventoryGroups: AppState.globalInventoryGroups }, { merge: true });
            }
        } catch (err) {
            console.warn("Offline Mode: Loading global catalog from cache", err);
            const cachedGlobal = JSON.parse(localStorage.getItem('amolnama_cache_global') || 'null');
            if (cachedGlobal) {
                AppState.globalCatalog = cachedGlobal.catalog;
                AppState.globalInventoryGroups = cachedGlobal.inventoryGroups;
            } else {
                AppState.globalCatalog = defaultCatalog;
                AppState.globalInventoryGroups = defaultInventoryGroups;
            }
        }

        // 3. NOW run auto-close so it knows which items to calculate leftovers for
        try {
            await performLazyAutoClose();
        } catch(err) { console.warn("Offline Mode: Skipped auto-close", err); }

        const rName = document.getElementById('report-user-name');
        if (rName) rName.innerText = AppState.userDisplayName;
        const rEmail = document.getElementById('report-user-email');
        if (rEmail && AppState.currentUser.email) rEmail.innerText = AppState.currentUser.email;
        let toggleWrapper = document.getElementById('admin-report-toggle-wrapper');
        if (toggleWrapper) toggleWrapper.style.display = AppState.currentUserRole === 'admin' ? 'flex' : 'none';
        if (AppState.currentUser.photoURL) {
            const rPhoto = document.getElementById('report-user-photo');
            if (rPhoto) rPhoto.src = AppState.currentUser.photoURL;
            document.getElementById('header-user-photo').src = AppState.currentUser.photoURL;
        }
        if(document.getElementById('tab-ers').classList.contains('active')) document.getElementById('header-title').innerText = AppState.userNickname || AppState.userDisplayName;

        const devNoteFab = document.getElementById('dev-note-fab');
        if (devNoteFab) {
            devNoteFab.style.display = AppState.currentUserRole === 'admin' ? 'flex' : 'none';
        }

        // --- MANAGER ROLE UI RESTRICTIONS ---
        const navBtns = document.querySelectorAll('.nav-item');
        if (['manager', 'owner'].includes(AppState.currentUserRole)) {
            if (navBtns.length >= 2) {
                navBtns[0].style.display = 'none'; // Hide ERS
                navBtns[1].style.display = 'none'; // Hide Store
            }
        } else {
            if (navBtns.length >= 2) {
                navBtns[0].style.display = 'flex';
                navBtns[1].style.display = 'flex';
            }
        }

        updateCurrencyUI(); 
        if (typeof window.renderAppUI === 'function') window.renderAppUI();
        
        const t = new Date();
        document.getElementById('report-date-picker').value = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
        
        // --- ROUTING LOGIC ---
        if (['manager', 'owner'].includes(AppState.currentUserRole)) {
            // Managers and Owners bypass desk selection and go straight to Floor Map
            document.getElementById('modal-desk-select').classList.remove('active');
            AppState.currentDeskId = null; 
            AppState.currentSessionId = null; 
            
            let viewName = AppState.currentUserRole === 'owner' ? 'Owner View' : 'Manager View';
            AppState.currentDeskName = viewName;
            document.getElementById('header-title').innerText = viewName;
            
            setTimeout(() => {
                if (window.switchTab) window.switchTab('floor', 'Live Floor Map');
                fetchTransactionsForDate(); 
            }, 150);
            
        } else if (userData.assignedDate === todayStr && userData.assignedDeskId) {
            AppState.currentDeskId = userData.assignedDeskId;
            
            try {
                const deskSnap = await getDoc(doc(db, 'desks', AppState.currentDeskId));
                let deskData;
                if (deskSnap.exists()) {
                    deskData = deskSnap.data();
                    localStorage.setItem('amolnama_cache_desk_' + AppState.currentDeskId, JSON.stringify(deskData));
                }

                if (deskData && deskData.status === 'open') {
                    AppState.currentSessionId = deskData.currentSessionId;
                    AppState.currentDeskName = deskData.name;
                    document.getElementById('header-title').innerText = `${AppState.currentDeskName}`;
                    
                    const sessionSnap = await getDoc(doc(db, 'sessions', AppState.currentSessionId));
                    if (sessionSnap.exists()) {
                        const sData = sessionSnap.data();
                        localStorage.setItem('amolnama_cache_session_' + AppState.currentSessionId, JSON.stringify(sData));
                        if (sData.openingBalances) {
                            AppState.currentOpeningCash = parseFloat(sData.openingBalances.cash) || 0;
                            AppState.currentOpeningInv = sData.openingBalances.inventory || {}; 
                        }
                    }
                    document.getElementById('modal-desk-select').classList.remove('active');
                    await fetchTransactionsForDate();
                } else {
                    AppState.currentDeskId = null;
                    await setDoc(doc(db, 'users', AppState.currentUser.uid), { assignedDeskId: null, assignedDate: null }, { merge: true });
                    await loadFloorMap();
                }
            } catch (err) {
                console.warn("Offline Mode: Restoring desk/session from cache", err);
                let deskData = JSON.parse(localStorage.getItem('amolnama_cache_desk_' + AppState.currentDeskId) || 'null');
                if (deskData && deskData.status === 'open') {
                    AppState.currentSessionId = deskData.currentSessionId;
                    AppState.currentDeskName = deskData.name;
                    document.getElementById('header-title').innerText = `${AppState.currentDeskName}`;
                    let sData = JSON.parse(localStorage.getItem('amolnama_cache_session_' + AppState.currentSessionId) || 'null');
                    if (sData && sData.openingBalances) {
                        AppState.currentOpeningCash = parseFloat(sData.openingBalances.cash) || 0;
                        AppState.currentOpeningInv = sData.openingBalances.inventory || {}; 
                    }
                    document.getElementById('modal-desk-select').classList.remove('active');
                    await fetchTransactionsForDate();
                } else {
                    try { await loadFloorMap(); } catch(e){}
                }
            }
        } else {
            // Standard agent without active desk assigned today -> Auto-assign and open personal drawer
            const personalDeskId = 'personal_' + AppState.currentUser.uid;
            const myFirstName = AppState.userNickname || (AppState.userDisplayName ? AppState.userDisplayName.split(' ')[0] : 'Agent');
            const myDrawerName = `${myFirstName}'s Drawer`;
            
            try {
                // Instantly open/join the personal drawer in the background!
                await executeHandleDeskSelect(personalDeskId, myDrawerName, 'closed', null);
            } catch(autoErr) {
                console.error("Auto drawer assignment failed, falling back to map:", autoErr);
                await loadFloorMap();
            }
        }
    } catch(e) {
        console.error("App Initialization Error:", e);
        showAppAlert("Connection Error", "Failed to sync user data. If this persists, check your Firestore security rules.");
        // Fallback: Safely attempt to load map, but swallow errors if offline
        try {
            await loadFloorMap();
        } catch(fallbackErr) {
            console.error("Fallback routing failed:", fallbackErr);
            // Close loading overlays manually if everything fails
            document.getElementById('modal-desk-select').classList.remove('active');
        }
    } finally {
        if (onComplete) onComplete();
        calculateAndDisplayRank();
    }
    setTimeout(setupBottomSheetDrag, 300); // Failsafe to attach drag physics
}

async function calculateAndDisplayRank() {
    if (!AppState.currentUser) return;
    
    const eligibleUsers = [
        'zmi9OdIBlQQJZo3rszWYQ9sXMVq1', // Rafi
        'sXeeJMdRycegcf4eAsyDZ53WIrD2', // Shovon
        'lWuUuOSm38UIm4hsVit8GthtFvK2', // Asha
        'YqZQ7hH3TUfrNKNhNOCegZrHZs82', // Rakiba
        'RH6ZFn5Z1XQKNDE24ZYcsZMhvbg1', // Sumon
        'AHOkNTiM1RV7urXvY3P5hXtUH8J2'  // Wahid
    ];

    if (!eligibleUsers.includes(AppState.currentUser.uid)) return;

    try {
        const today = new Date();
        const currentMonthYear = `/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;

        const txRef = collection(db, 'transactions');
        const q = query(txRef, where('agentId', 'in', eligibleUsers));
        const snap = await getDocs(q);
        
        let salesData = {};
        eligibleUsers.forEach(uid => salesData[uid] = 0);

        snap.forEach(docSnap => {
            const data = docSnap.data();
            // Match dates like "05/05/2026" checking if it ends with "/05/2026"
            if (data.dateStr && data.dateStr.endsWith(currentMonthYear) && !data.isDeleted) {
                salesData[data.agentId] += (Number(data.amount) || 0);
            }
        });

        const sortedUsers = Object.keys(salesData).sort((a, b) => salesData[b] - salesData[a]);
        const rank = sortedUsers.indexOf(AppState.currentUser.uid) + 1;
        const badge = document.getElementById('rank-badge');
        
        if (badge && rank >= 1 && rank <= 3 && salesData[AppState.currentUser.uid] > 0) {
            badge.innerText = rank;
            badge.style.display = 'flex';
            
            if (rank === 1) {
                badge.style.background = '#fbbf24'; // Gold
                badge.style.color = '#78350f';
            } else if (rank === 2) {
                badge.style.background = '#cbd5e1'; // Silver
                badge.style.color = '#0f172a';
            } else if (rank === 3) {
                badge.style.background = '#d97706'; // Bronze
                badge.style.color = '#ffffff';
            }
        }
    } catch (err) {
        console.error("Failed to calculate rank:", err);
    }
}