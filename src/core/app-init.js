// src/core/app-init.js
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from '../config/firebase.js';
import { AppState } from './state.js';
import { getStrictDate } from '../utils/helpers.js';
import { defaultInventoryGroups, defaultCatalog } from './constants.js';
import { performLazyAutoClose, loadFloorMap } from '../features/desk.js';
import { renderAppUI } from '../features/catalog.js';
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
        // 1. Fetch user data first to establish roles
        const userDocRef = doc(db, 'users', AppState.currentUser.uid);
        const userDocSnap = await getDoc(userDocRef);
        const todayStr = getStrictDate();

        let userData = {};
        if (userDocSnap.exists()) {
            userData = userDocSnap.data();
            AppState.currentUserRole = userData.role || 'user';
            AppState.userNickname = userData.nickname || '';
            if (userData.devNotesQueue) {
                AppState.devNotesQueue = userData.devNotesQueue;
            }
        } else {
            AppState.currentUserRole = 'user'; 
        }

        await setDoc(userDocRef, { email: AppState.currentUser.email || null, displayName: AppState.userDisplayName || 'User', role: AppState.currentUserRole }, { merge: true });

        // 2. Fetch global catalog & inventory groups BEFORE auto-close
        const globalDoc = await getDoc(doc(db, 'global', 'settings'));
        if (globalDoc.exists() && globalDoc.data().catalog) {
            AppState.globalCatalog = globalDoc.data().catalog;
            AppState.globalInventoryGroups = globalDoc.data().inventoryGroups || defaultInventoryGroups;
        } else {
            AppState.globalCatalog = defaultCatalog;
            AppState.globalInventoryGroups = defaultInventoryGroups;
            if (AppState.currentUserRole === 'admin') await setDoc(doc(db, 'global', 'settings'), { catalog: AppState.globalCatalog, inventoryGroups: AppState.globalInventoryGroups }, { merge: true });
        }

        // 3. NOW run auto-close so it knows which items to calculate leftovers for
        await performLazyAutoClose();

        document.getElementById('report-user-name').innerText = AppState.userDisplayName;
        if (AppState.currentUser.email) document.getElementById('report-user-email').innerText = AppState.currentUser.email;
        let toggleWrapper = document.getElementById('admin-report-toggle-wrapper');
        if (toggleWrapper) toggleWrapper.style.display = AppState.currentUserRole === 'admin' ? 'flex' : 'none';
        if (AppState.currentUser.photoURL) {
            document.getElementById('report-user-photo').src = AppState.currentUser.photoURL;
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
        setTimeout(() => {
            if (typeof window.renderAppUI === 'function') window.renderAppUI();
        }, 100);
        
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
                if (window.fetchTransactionsForDate) window.fetchTransactionsForDate(); 
            }, 150);
            
        } else if (userData.assignedDate === todayStr && userData.assignedDeskId) {
            AppState.currentDeskId = userData.assignedDeskId;
            
            const deskSnap = await getDoc(doc(db, 'desks', AppState.currentDeskId));
            if (deskSnap.exists() && deskSnap.data().status === 'open') {
                AppState.currentSessionId = deskSnap.data().currentSessionId;
                AppState.currentDeskName = deskSnap.data().name;
                document.getElementById('header-title').innerText = `${AppState.currentDeskName}`;
                try {
                    const sessionSnap = await getDoc(doc(db, 'sessions', AppState.currentSessionId));
                    if (sessionSnap.exists() && sessionSnap.data().openingBalances) {
                        AppState.currentOpeningCash = parseFloat(sessionSnap.data().openingBalances.cash) || 0;
                        AppState.currentOpeningInv = sessionSnap.data().openingBalances.inventory || {}; 
                    }
                } catch(e) {
                    console.error("Failed to recover session balances on app load:", e);
                }
                document.getElementById('modal-desk-select').classList.remove('active');
                await fetchTransactionsForDate();
            } else {
                // The desk was closed (by a manager or auto-close), so we unassign the user.
                AppState.currentDeskId = null;
                await setDoc(doc(db, 'users', AppState.currentUser.uid), { assignedDeskId: null, assignedDate: null }, { merge: true });
                await loadFloorMap();
            }
        } else {
            await loadFloorMap();
        }
    } catch(e) {
        console.error("App Initialization Error:", e);
        showAppAlert("Connection Error", "Failed to sync user data. If this persists, check your Firestore security rules.");
        await loadFloorMap(); // Fallback: Force the map to open so you aren't stuck
    } finally {
        if (onComplete) onComplete();
    }
    setTimeout(setupBottomSheetDrag, 300); // Failsafe to attach drag physics
}