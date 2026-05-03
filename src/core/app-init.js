// src/core/app-init.js
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from '../config/firebase.js';
import { AppState } from './state.js';
import { getStrictDate } from '../utils/helpers.js';
import { defaultInventoryGroups, defaultCatalog } from './constants.js';
import { performLazyAutoClose, loadFloorMap } from '../features/desk.js';
import { renderAppUI } from '../features/catalog.js';
import { fetchTransactionsForDate } from '../features/reports.js';
import { setupBottomSheetDrag } from '../utils/ui-helpers.js';

export function updateCurrencyUI() { 
    const userCurrency = 'Tk';
    document.querySelectorAll('.ers-currency').forEach(el => { 
        if(!el.innerText.includes('Qty')) el.innerText = userCurrency; 
    }); 
}

export async function initUserData(onComplete) {
    if(!AppState.currentUser) return;
    try {
        await performLazyAutoClose(); 

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

        await setDoc(userDocRef, { email: AppState.currentUser.email, displayName: AppState.userDisplayName, role: AppState.currentUserRole }, { merge: true });

        const globalDoc = await getDoc(doc(db, 'global', 'settings'));
        if (globalDoc.exists() && globalDoc.data().catalog) {
            AppState.globalCatalog = globalDoc.data().catalog;
            AppState.globalInventoryGroups = globalDoc.data().inventoryGroups || defaultInventoryGroups;
        } else {
            AppState.globalCatalog = defaultCatalog;
            AppState.globalInventoryGroups = defaultInventoryGroups;
            if (AppState.currentUserRole === 'admin') await setDoc(doc(db, 'global', 'settings'), { catalog: AppState.globalCatalog, inventoryGroups: AppState.globalInventoryGroups }, { merge: true });
        }

        document.getElementById('report-user-name').innerText = AppState.userDisplayName;
        if (AppState.currentUser.email) document.getElementById('report-user-email').innerText = AppState.currentUser.email;
        let toggleWrapper = document.getElementById('admin-report-toggle-wrapper');
        if (toggleWrapper) toggleWrapper.style.display = AppState.currentUserRole === 'admin' ? 'flex' : 'none';
        if (AppState.currentUser.photoURL) {
            document.getElementById('report-user-photo').src = AppState.currentUser.photoURL;
            document.getElementById('header-user-photo').src = AppState.currentUser.photoURL;
        }
        if(document.getElementById('tab-ers').classList.contains('active')) document.getElementById('header-title').innerText = AppState.userNickname || AppState.userDisplayName;

        if (AppState.currentUserRole === 'admin') {
            document.getElementById('dev-note-fab').style.display = 'flex';
        } else {
            document.getElementById('dev-note-fab').style.display = 'none';
        }

        updateCurrencyUI(); 
        setTimeout(() => {
            renderAppUI();
        }, 100);
        
        const t = new Date();
        document.getElementById('report-date-picker').value = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
        
        if (userData.assignedDate === todayStr && userData.assignedDeskId) {
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
            } else {
                AppState.currentDeskName = deskSnap.exists() ? deskSnap.data().name : AppState.currentDeskId;
                document.getElementById('header-title').innerText = `${AppState.currentDeskName} (Closed)`;
                AppState.currentSessionId = null; 
            }
            document.getElementById('modal-desk-select').classList.remove('active');
            await fetchTransactionsForDate();
        } else {
            await loadFloorMap();
        }
    } catch(e) { 
        console.error(e); 
    } finally {
        if (onComplete) onComplete();
    }
    setTimeout(setupBottomSheetDrag, 300); // Failsafe to attach drag physics
}