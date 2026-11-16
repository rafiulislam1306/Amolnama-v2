// src/features/rates.js
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from '../config/firebase.js';
import { AppState } from '../core/state.js';
import { showAppAlert, showFlashMessage, openModal, closeModal, refreshCustomDropdowns, setButtonLoading, markInputError, clearInputError } from '../utils/ui-helpers.js';
import { escapeHtml } from '../utils/helpers.js';

// Default static fallback packages (64 rows grouped under 15 packages)
const DEFAULT_RATES_DATABASE = [
  {
    "packageName": "1 Nombor Plan",
    "callType": "GP-Any net",
    "fnfCount": 0,
    "tariffExceptTax": 1.86,
    "tariffWithTax": 2.59,
    "pulseSeconds": "10",
    "timeSlot": "24 Hrs",
    "note": "Launch date: 27 September 2024",
    "oldTariff": 2.65
  },
  {
    "packageName": "1 Nombor Plan",
    "callType": "SMS",
    "fnfCount": 0,
    "tariffExceptTax": 0.5,
    "tariffWithTax": 0.69,
    "pulseSeconds": "160 characters",
    "timeSlot": "24 Hrs",
    "note": "",
    "oldTariff": 0.71
  },
  {
    "packageName": "Bondhu",
    "callType": "GP-Any net",
    "fnfCount": 0,
    "tariffExceptTax": 2,
    "tariffWithTax": 2.78,
    "pulseSeconds": "10",
    "timeSlot": "24 Hrs",
    "note": "Tariff changed from 10 Jan 2025",
    "oldTariff": 2.85
  },
  {
    "packageName": "Bondhu",
    "callType": "SFnF (GP- GP)",
    "fnfCount": 1,
    "tariffExceptTax": 0.54,
    "tariffWithTax": 0.75,
    "pulseSeconds": "10",
    "timeSlot": "24 Hrs",
    "note": "Tariff changed from 28 Aug 2022",
    "oldTariff": 0.77
  },
  {
    "packageName": "Bondhu",
    "callType": "FnF (GP- Any net)",
    "fnfCount": 17,
    "tariffExceptTax": 0.75,
    "tariffWithTax": 1.04,
    "pulseSeconds": "10",
    "timeSlot": "24 Hrs",
    "note": "Tariff changed from 28 Aug 2022",
    "oldTariff": 1.07
  },
  {
    "packageName": "Bondhu",
    "callType": "SMS",
    "fnfCount": 0,
    "tariffExceptTax": 0.5,
    "tariffWithTax": 0.69,
    "pulseSeconds": "160 characters",
    "timeSlot": "24 Hrs",
    "note": "",
    "oldTariff": 0.71
  },
  {
    "packageName": "BPO",
    "callType": "GP-Any net",
    "fnfCount": 0,
    "tariffExceptTax": 0.49,
    "tariffWithTax": 0.68,
    "pulseSeconds": "1",
    "timeSlot": "12 pm - 4 pm",
    "note": "",
    "oldTariff": 0.7
  },
  {
    "packageName": "BPO",
    "callType": "GP-Any net",
    "fnfCount": 0,
    "tariffExceptTax": 0.99,
    "tariffWithTax": 1.38,
    "pulseSeconds": "1",
    "timeSlot": "4 pm - 12 pm",
    "note": "",
    "oldTariff": 1.41
  },
  {
    "packageName": "BPO",
    "callType": "FnF",
    "fnfCount": 0,
    "tariffExceptTax": 0,
    "tariffWithTax": 0,
    "pulseSeconds": "1",
    "timeSlot": "24 Hrs",
    "note": "",
    "oldTariff": 0
  },
  {
    "packageName": "BPO",
    "callType": "FnF (Same package group)",
    "fnfCount": 0,
    "tariffExceptTax": 0,
    "tariffWithTax": 0,
    "pulseSeconds": "10",
    "timeSlot": "24 Hrs",
    "note": "",
    "oldTariff": 0
  },
  {
    "packageName": "BPO",
    "callType": "SMS",
    "fnfCount": 0,
    "tariffExceptTax": 0.5,
    "tariffWithTax": 0.69,
    "pulseSeconds": "160 characters",
    "timeSlot": "24 Hrs",
    "note": "",
    "oldTariff": 0.71
  },
  {
    "packageName": "BS Pack 1",
    "callType": "GP-Any net",
    "fnfCount": 0,
    "tariffExceptTax": 1.25,
    "tariffWithTax": 1.74,
    "pulseSeconds": "10",
    "timeSlot": "24 Hrs",
    "note": "",
    "oldTariff": 1.78
  },
  {
    "packageName": "BS Pack 1",
    "callType": "FnF (GP- Any net)",
    "fnfCount": 10,
    "tariffExceptTax": 0.6,
    "tariffWithTax": 0.83,
    "pulseSeconds": "10",
    "timeSlot": "24 Hrs",
    "note": "",
    "oldTariff": 0.85
  },
  {
    "packageName": "BS Pack 1",
    "callType": "FnF (Same package group)",
    "fnfCount": 0,
    "tariffExceptTax": 0.45,
    "tariffWithTax": 0.63,
    "pulseSeconds": "10",
    "timeSlot": "24 Hrs",
    "note": "",
    "oldTariff": 0.64
  },
  {
    "packageName": "BS Pack 1",
    "callType": "SMS",
    "fnfCount": 0,
    "tariffExceptTax": 0.5,
    "tariffWithTax": 0.69,
    "pulseSeconds": "160 characters",
    "timeSlot": "24 Hrs",
    "note": "",
    "oldTariff": 0.71
  },
  {
    "packageName": "BS Pack 2",
    "callType": "GP-Any net",
    "fnfCount": 0,
    "tariffExceptTax": 1.1,
    "tariffWithTax": 1.53,
    "pulseSeconds": "10",
    "timeSlot": "24 Hrs",
    "note": "",
    "oldTariff": 1.57
  },
  {
    "packageName": "BS Pack 2",
    "callType": "FnF (GP- Any net)",
    "fnfCount": 0,
    "tariffExceptTax": 0,
    "tariffWithTax": 0,
    "pulseSeconds": "10",
    "timeSlot": "24 Hrs",
    "note": "",
    "oldTariff": 0
  },
  {
    "packageName": "BS Pack 2",
    "callType": "FnF (Same package group)",
    "fnfCount": 0,
    "tariffExceptTax": 0.45,
    "tariffWithTax": 0.63,
    "pulseSeconds": "10",
    "timeSlot": "24 Hrs",
    "note": "",
    "oldTariff": 0.64
  },
  {
    "packageName": "BS Pack 2",
    "callType": "SMS",
    "fnfCount": 0,
    "tariffExceptTax": 0.5,
    "tariffWithTax": 0.69,
    "pulseSeconds": "160 characters",
    "timeSlot": "24 Hrs",
    "note": "",
    "oldTariff": 0.71
  },
  {
    "packageName": "BS Pack 3",
    "callType": "GP-Any net",
    "fnfCount": 0,
    "tariffExceptTax": 1.3,
    "tariffWithTax": 1.81,
    "pulseSeconds": "10",
    "timeSlot": "24 Hrs",
    "note": "",
    "oldTariff": 1.85
  },
  {
    "packageName": "BS Pack 3",
    "callType": "FnF (GP- Any net)",
    "fnfCount": 10,
    "tariffExceptTax": 0.5,
    "tariffWithTax": 0.69,
    "pulseSeconds": "10",
    "timeSlot": "24 Hrs",
    "note": "",
    "oldTariff": 0.71
  },
  {
    "packageName": "BS Pack 3",
    "callType": "SMS",
    "fnfCount": 0,
    "tariffExceptTax": 0.5,
    "tariffWithTax": 0.69,
    "pulseSeconds": "160 characters",
    "timeSlot": "24 Hrs",
    "note": "",
    "oldTariff": 0.71
  },
  {
    "packageName": "BS Pack 4 Shofol",
    "callType": "GP-Any net",
    "fnfCount": 0,
    "tariffExceptTax": 1.3,
    "tariffWithTax": 1.81,
    "pulseSeconds": "10",
    "timeSlot": "24 Hrs",
    "note": "",
    "oldTariff": 1.85
  },
  {
    "packageName": "BS Pack 4 Shofol",
    "callType": "FnF (GP- Any net)",
    "fnfCount": 10,
    "tariffExceptTax": 0.5,
    "tariffWithTax": 0.69,
    "pulseSeconds": "10",
    "timeSlot": "24 Hrs",
    "note": "",
    "oldTariff": 0.71
  },
  {
    "packageName": "BS Pack 4 Shofol",
    "callType": "SMS",
    "fnfCount": 0,
    "tariffExceptTax": 0.5,
    "tariffWithTax": 0.69,
    "pulseSeconds": "160 characters",
    "timeSlot": "24 Hrs",
    "note": "",
    "oldTariff": 0.71
  },
  {
    "packageName": "BS Pack 5",
    "callType": "GP-Any net",
    "fnfCount": 0,
    "tariffExceptTax": 0.89,
    "tariffWithTax": 1.24,
    "pulseSeconds": "10",
    "timeSlot": "24 Hrs",
    "note": "Tariff changed from 28 April 2025.",
    "oldTariff": 0
  },
  {
    "packageName": "BS Pack 5",
    "callType": "FnF (GP- Any net)",
    "fnfCount": 10,
    "tariffExceptTax": 0.5,
    "tariffWithTax": 0.69,
    "pulseSeconds": "10",
    "timeSlot": "24 Hrs",
    "note": "",
    "oldTariff": 0
  },
  {
    "packageName": "BS Pack 5",
    "callType": "FnF (Same package group)",
    "fnfCount": 0,
    "tariffExceptTax": 0.45,
    "tariffWithTax": 0.63,
    "pulseSeconds": "10",
    "timeSlot": "24 Hrs",
    "note": "",
    "oldTariff": 0
  },
  {
    "packageName": "BS Pack 5",
    "callType": "SMS",
    "fnfCount": 0,
    "tariffExceptTax": 0.25,
    "tariffWithTax": 0.35,
    "pulseSeconds": "160 characters",
    "timeSlot": "24 Hrs",
    "note": "",
    "oldTariff": 0
  },
  {
    "packageName": "BS Pack 6",
    "callType": "GP-Any net",
    "fnfCount": 0,
    "tariffExceptTax": 0.7,
    "tariffWithTax": 0.97,
    "pulseSeconds": "10",
    "timeSlot": "24 Hrs",
    "note": "",
    "oldTariff": 1
  },
  {
    "packageName": "BS Pack 6",
    "callType": "FnF (GP- Any net)",
    "fnfCount": 10,
    "tariffExceptTax": 0.45,
    "tariffWithTax": 0.63,
    "pulseSeconds": "10",
    "timeSlot": "24 Hrs",
    "note": "",
    "oldTariff": 0.64
  },
  {
    "packageName": "BS Pack 6",
    "callType": "FnF (Same package group)",
    "fnfCount": 0,
    "tariffExceptTax": 0.45,
    "tariffWithTax": 0.63,
    "pulseSeconds": "10",
    "timeSlot": "24 Hrs",
    "note": "",
    "oldTariff": 0.64
  },
  {
    "packageName": "BS Pack 6",
    "callType": "SMS",
    "fnfCount": 0,
    "tariffExceptTax": 0.25,
    "tariffWithTax": 0.35,
    "pulseSeconds": "160 characters",
    "timeSlot": "24 Hrs",
    "note": "",
    "oldTariff": 0.36
  },
  {
    "packageName": "BS Pack 7",
    "callType": "GP-Any net",
    "fnfCount": 0,
    "tariffExceptTax": 0.75,
    "tariffWithTax": 1.04,
    "pulseSeconds": "10",
    "timeSlot": "24 Hrs",
    "note": "Launch date: December 2024",
    "oldTariff": 0
  },
  {
    "packageName": "BS Pack 7",
    "callType": "FnF (GP- Any net)",
    "fnfCount": 10,
    "tariffExceptTax": 0.5,
    "tariffWithTax": 0.69,
    "pulseSeconds": "10",
    "timeSlot": "24 Hrs",
    "note": "Launch date: December 2024",
    "oldTariff": 0
  },
  {
    "packageName": "BS Pack 7",
    "callType": "FnF (Same package group)",
    "fnfCount": 0,
    "tariffExceptTax": 0.45,
    "tariffWithTax": 0.63,
    "pulseSeconds": "10",
    "timeSlot": "24 Hrs",
    "note": "Launch date: December 2024",
    "oldTariff": 0
  },
  {
    "packageName": "BS Pack 7",
    "callType": "SMS",
    "fnfCount": 0,
    "tariffExceptTax": 0.25,
    "tariffWithTax": 0.35,
    "pulseSeconds": "160 characters",
    "timeSlot": "24 Hrs",
    "note": "Launch date: December 2024",
    "oldTariff": 0
  },
  {
    "packageName": "Djuice",
    "callType": "GP-Any net",
    "fnfCount": 0,
    "tariffExceptTax": 2,
    "tariffWithTax": 2.78,
    "pulseSeconds": "10",
    "timeSlot": "24 Hrs",
    "note": "Tariff changed from 10 Jan 2025",
    "oldTariff": 2.85
  },
  {
    "packageName": "Djuice",
    "callType": "SFnF (GP- Any net)",
    "fnfCount": 5,
    "tariffExceptTax": 0.54,
    "tariffWithTax": 0.75,
    "pulseSeconds": "10",
    "timeSlot": "24 Hrs",
    "note": "Tariff changed from 28 Aug 2022",
    "oldTariff": 0.77
  },
  {
    "packageName": "Djuice",
    "callType": "FnF (GP- Any net)",
    "fnfCount": 10,
    "tariffExceptTax": 0.75,
    "tariffWithTax": 1.04,
    "pulseSeconds": "10",
    "timeSlot": "24 Hrs",
    "note": "Tariff changed from 28 Aug 2022",
    "oldTariff": 1.07
  },
  {
    "packageName": "Djuice",
    "callType": "SMS",
    "fnfCount": 0,
    "tariffExceptTax": 0.5,
    "tariffWithTax": 0.69,
    "pulseSeconds": "160 characters",
    "timeSlot": "24 Hrs",
    "note": "",
    "oldTariff": 0.71
  },
  {
    "packageName": "Ekota",
    "callType": "GP-Any net",
    "fnfCount": 0,
    "tariffExceptTax": 0.99,
    "tariffWithTax": 1.38,
    "pulseSeconds": "10",
    "timeSlot": "24 Hrs",
    "note": "",
    "oldTariff": 1.41
  },
  {
    "packageName": "Ekota",
    "callType": "FnF (GP- Any net)",
    "fnfCount": 20,
    "tariffExceptTax": 0.5,
    "tariffWithTax": 0.69,
    "pulseSeconds": "10",
    "timeSlot": "24 Hrs",
    "note": "",
    "oldTariff": 0.71
  },
  {
    "packageName": "Ekota",
    "callType": "SMS",
    "fnfCount": 0,
    "tariffExceptTax": 0.5,
    "tariffWithTax": 0.69,
    "pulseSeconds": "160 characters",
    "timeSlot": "24 Hrs",
    "note": "",
    "oldTariff": 0.71
  },
  {
    "packageName": "Ekota_3",
    "callType": "GP-Any net",
    "fnfCount": 0,
    "tariffExceptTax": 1.25,
    "tariffWithTax": 1.74,
    "pulseSeconds": "10",
    "timeSlot": "24 Hrs",
    "note": "",
    "oldTariff": 1.78
  },
  {
    "packageName": "Ekota_3",
    "callType": "FnF (GP- Any net)",
    "fnfCount": 20,
    "tariffExceptTax": 0.5,
    "tariffWithTax": 0.69,
    "pulseSeconds": "10",
    "timeSlot": "24 Hrs",
    "note": "",
    "oldTariff": 0.71
  },
  {
    "packageName": "Ekota_3",
    "callType": "SMS",
    "fnfCount": 0,
    "tariffExceptTax": 0.5,
    "tariffWithTax": 0.69,
    "pulseSeconds": "160 characters",
    "timeSlot": "24 Hrs",
    "note": "",
    "oldTariff": 0.71
  },
  {
    "packageName": "Emergency Balance (EB)",
    "callType": "GP-Any net (Local)\r\n[ISD tariff will be as per ISD tariff matrix]",
    "fnfCount": 0,
    "tariffExceptTax": 2,
    "tariffWithTax": 2.78,
    "pulseSeconds": "10",
    "timeSlot": "24 Hrs",
    "note": "Tariff changed from 04 Sep 2023",
    "oldTariff": 2.85
  },
  {
    "packageName": "Emergency Balance (EB)",
    "callType": "SMS",
    "fnfCount": 0,
    "tariffExceptTax": 0.5,
    "tariffWithTax": 0.69,
    "pulseSeconds": "160 characters",
    "timeSlot": "24 Hrs",
    "note": "",
    "oldTariff": 0.71
  },
  {
    "packageName": "GPPP",
    "callType": "GP-Any net",
    "fnfCount": 0,
    "tariffExceptTax": 1.5,
    "tariffWithTax": 2.08,
    "pulseSeconds": "10",
    "timeSlot": "24 Hrs",
    "note": "Tariff changed from 04 Sep 2023",
    "oldTariff": 2.14
  },
  {
    "packageName": "GPPP",
    "callType": "SMS",
    "fnfCount": 0,
    "tariffExceptTax": 0.5,
    "tariffWithTax": 0.69,
    "pulseSeconds": "160 characters",
    "timeSlot": "24 Hrs",
    "note": "",
    "oldTariff": 0.71
  },
  {
    "packageName": "Nishchinto",
    "callType": "GP-Any net",
    "fnfCount": 0,
    "tariffExceptTax": 2,
    "tariffWithTax": 2.78,
    "pulseSeconds": "10",
    "timeSlot": "24 Hrs",
    "note": "Tariff changed from 10 Jan 2025",
    "oldTariff": 2.85
  },
  {
    "packageName": "Nishchinto",
    "callType": "SMS",
    "fnfCount": 0,
    "tariffExceptTax": 0.5,
    "tariffWithTax": 0.69,
    "pulseSeconds": "160 characters",
    "timeSlot": "24 Hrs",
    "note": "",
    "oldTariff": 0.71
  },
  {
    "packageName": "Prime",
    "callType": "Base \r\nTariff (Without any bundle and offer)  (Rate plan Xplore True, Xplore \r\nTrue MNP, Xplore Ture PreToPost & Xplore Special, Power Prime) \r\nService class Consumer Postpaid customers (1305, 1270, 1266, 1289, 1016,\r\n 1350)",
    "fnfCount": 0,
    "tariffExceptTax": 1.5,
    "tariffWithTax": 2.08,
    "pulseSeconds": "1",
    "timeSlot": "24 Hrs",
    "note": "Tariff changed from 10 Jan 2025",
    "oldTariff": 2.14
  },
  {
    "packageName": "Prime",
    "callType": "SMS",
    "fnfCount": 0,
    "tariffExceptTax": 0.5,
    "tariffWithTax": 0.69,
    "pulseSeconds": "160 characters",
    "timeSlot": "24 Hrs",
    "note": "Tariff changed from 10 Jan 2025",
    "oldTariff": 0.71
  },
  {
    "packageName": "Smile",
    "callType": "GP-Any net",
    "fnfCount": 0,
    "tariffExceptTax": 2,
    "tariffWithTax": 2.78,
    "pulseSeconds": "10",
    "timeSlot": "24 Hrs",
    "note": "Tariff changed from 10 Jan 2025",
    "oldTariff": 2.85
  },
  {
    "packageName": "Smile",
    "callType": "FnF (GP- Any net)",
    "fnfCount": 3,
    "tariffExceptTax": 0.75,
    "tariffWithTax": 1.04,
    "pulseSeconds": "10",
    "timeSlot": "24 Hrs",
    "note": "Tariff changed from 28 Aug 2022",
    "oldTariff": 1.07
  },
  {
    "packageName": "Smile",
    "callType": "SMS",
    "fnfCount": 0,
    "tariffExceptTax": 0.5,
    "tariffWithTax": 0.69,
    "pulseSeconds": "160 characters",
    "timeSlot": "24 Hrs",
    "note": "",
    "oldTariff": 0.71
  },
  {
    "packageName": "VP",
    "callType": "GP-Any net",
    "fnfCount": 0,
    "tariffExceptTax": 1.5,
    "tariffWithTax": 2.08,
    "pulseSeconds": "10",
    "timeSlot": "24 Hrs",
    "note": "Tariff changed from 03 Sep 2023",
    "oldTariff": 2.14
  },
  {
    "packageName": "VP",
    "callType": "SMS",
    "fnfCount": 0,
    "tariffExceptTax": 0.5,
    "tariffWithTax": 0.69,
    "pulseSeconds": "160 characters",
    "timeSlot": "24 Hrs",
    "note": "",
    "oldTariff": 0.71
  },
  {
    "packageName": "VP Offer",
    "callType": "GP-Any\r\n net  Opt-in Tariff Plan, Opt in: Just Dial *479*1# Opt Out: Just Dial \r\n*479*2# Validity: Once Customer Optin, the validity will be for \r\nunlimited time",
    "fnfCount": 0,
    "tariffExceptTax": 1.3,
    "tariffWithTax": 1.81,
    "pulseSeconds": "1",
    "timeSlot": "24 Hrs",
    "note": "Tariff changed from 04 Sep 2023",
    "oldTariff": 1.85
  },
  {
    "packageName": "Xplore Xp",
    "callType": "GP-Any net",
    "fnfCount": 0,
    "tariffExceptTax": 1.5,
    "tariffWithTax": 2.08,
    "pulseSeconds": "1",
    "timeSlot": "24 Hrs",
    "note": "Tariff changed from 04 Sep 2023",
    "oldTariff": 2.14
  },
  {
    "packageName": "Xplore Xp",
    "callType": "FnF (GP- Any net)",
    "fnfCount": 9,
    "tariffExceptTax": 0.66,
    "tariffWithTax": 0.92,
    "pulseSeconds": "1",
    "timeSlot": "24 Hrs",
    "note": "",
    "oldTariff": 0.94
  },
  {
    "packageName": "Xplore Xp",
    "callType": "SMS",
    "fnfCount": 0,
    "tariffExceptTax": 0.5,
    "tariffWithTax": 0.69,
    "pulseSeconds": "160 characters",
    "timeSlot": "24 Hrs",
    "note": "Tariff changed from 10 Jan 2025",
    "oldTariff": 0.71
  }
];

let activeRatesList = [];
let activeRatesTypeFilter = 'all';
let hasInitialized = false;
let isSavingPackage = false;

// Initialize rates by pulling from Firestore or fallback
async function loadRatesFromCloud() {
    if (hasInitialized) return;
    try {
        const ratesDoc = await getDoc(doc(db, 'global', 'rates'));
        if (ratesDoc.exists() && ratesDoc.data().packages) {
            activeRatesList = ratesDoc.data().packages;
            localStorage.setItem('amolnama_cache_rates', JSON.stringify(activeRatesList));
            hasInitialized = true;
        } else {
            activeRatesList = JSON.parse(JSON.stringify(DEFAULT_RATES_DATABASE)); // deep clone
            if (['admin', 'owner'].includes(AppState.currentUserRole)) {
                await setDoc(doc(db, 'global', 'rates'), { packages: activeRatesList }, { merge: true });
            }
            localStorage.setItem('amolnama_cache_rates', JSON.stringify(activeRatesList));
            hasInitialized = true;
        }
    } catch (err) {
        console.warn("Offline/Read error: loading rates from localStorage cache", err);
        const cachedRates = localStorage.getItem('amolnama_cache_rates');
        if (cachedRates) {
            activeRatesList = JSON.parse(cachedRates);
            hasInitialized = true;
        } else {
            activeRatesList = JSON.parse(JSON.stringify(DEFAULT_RATES_DATABASE));
            hasInitialized = true;
        }
    }
}

export async function openCallRates() {
    openModal('modal-call-rates');
    
    // Check/hide gear edit button based on roles
    const manageBtn = document.getElementById('rates-manage-btn');
    if (manageBtn) {
        const hasAdminAccess = ['admin', 'owner', 'center_manager'].includes(AppState.currentUserRole);
        manageBtn.style.display = hasAdminAccess ? 'flex' : 'none';
    }
    
    // Clear search & reset type filter
    const searchInput = document.getElementById('rates-search');
    if (searchInput) {
        searchInput.value = '';
    }
    const clearBtn = document.getElementById('rates-search-clear');
    if (clearBtn) clearBtn.classList.remove('visible');
    activeRatesTypeFilter = 'all';
    document.querySelectorAll('#modal-call-rates [data-rate-type]').forEach(p => {
        const isAll = p.getAttribute('data-rate-type') === 'all';
        p.classList.toggle('active', isAll);
        p.setAttribute('aria-pressed', isAll ? 'true' : 'false');
    });
    
    const operatorSelect = document.getElementById('rates-operator-select');
    if (operatorSelect) {
        operatorSelect.value = 'GP';
        refreshCustomDropdowns(operatorSelect);
    }
    
    await loadRatesFromCloud();
    renderRatesList();
}

export function closeCallRates() {
    closeModal('modal-call-rates');
}

export function filterRatesList() {
    renderRatesList();
}

export function filterRatesByType(typeKey = 'all', pillEl = null) {
    activeRatesTypeFilter = typeKey || 'all';
    document.querySelectorAll('#modal-call-rates [data-rate-type]').forEach(p => {
        const isMatch = pillEl ? (p === pillEl) : (p.getAttribute('data-rate-type') === activeRatesTypeFilter);
        p.classList.toggle('active', isMatch);
        p.setAttribute('aria-pressed', isMatch ? 'true' : 'false');
    });
    renderRatesList();
}

export function clearRatesSearch() {
    const searchInput = document.getElementById('rates-search');
    if (searchInput) {
        searchInput.value = '';
        if (typeof searchInput.focus === 'function') searchInput.focus();
    }
    const clearBtn = document.getElementById('rates-search-clear');
    if (clearBtn) clearBtn.classList.remove('visible');
    renderRatesList();
}

export function resetRatesFilters() {
    const searchInput = document.getElementById('rates-search');
    if (searchInput) searchInput.value = '';
    const clearBtn = document.getElementById('rates-search-clear');
    if (clearBtn) clearBtn.classList.remove('visible');
    filterRatesByType('all');
}

// REDESIGNED: Premium Spacious Call rates rendering with color-coded badges
export function renderRatesList() {
    const searchInput = document.getElementById('rates-search');
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const clearBtn = document.getElementById('rates-search-clear');
    if (clearBtn) clearBtn.classList.toggle('visible', query.length > 0);
    
    const operatorSelect = document.getElementById('rates-operator-select');
    const operator = operatorSelect ? operatorSelect.value : 'GP';
    const countBar = document.getElementById('rates-count-bar');
    
    const container = document.getElementById('rates-list-container');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (operator !== 'GP') {
        if (countBar) countBar.style.display = 'none';
        container.innerHTML = `
            <div class="empty-state" style="padding: 48px 20px;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/></svg>
                <p>No data available</p>
                <span>Call rates for this operator have not been imported yet.</span>
            </div>`;
        return;
    }
    
    // Classify call type for badge & filter pill matching
    const classifyRateType = (callType = '') => {
        const lower = String(callType || '').toLowerCase();
        if (lower.includes('fnf')) return 'fnf';
        if (lower.includes('sms')) return 'sms';
        if (lower.includes('any net') || lower.includes('anynet') || lower.includes('local') || lower.includes('gp-any') || lower.includes('base')) return 'anynet';
        return 'other';
    };

    // Group rates by packageName
    const grouped = {};
    const totalPackages = new Set(activeRatesList.map(item => item.packageName)).size;
    
    activeRatesList.forEach(item => {
        const rateKind = classifyRateType(item.callType);
        const matchesType = activeRatesTypeFilter === 'all' || rateKind === activeRatesTypeFilter;
        const matchesSearch = !query || 
            (item.packageName && item.packageName.toLowerCase().includes(query)) ||
            (item.callType && item.callType.toLowerCase().includes(query)) ||
            (item.note && item.note.toLowerCase().includes(query)) ||
            (item.pulseSeconds && String(item.pulseSeconds).toLowerCase().includes(query));
            
        if (matchesType && matchesSearch) {
            if (!grouped[item.packageName]) {
                grouped[item.packageName] = [];
            }
            grouped[item.packageName].push(item);
        }
    });
    
    const packageNames = Object.keys(grouped).sort();
    const isFiltered = Boolean(query) || activeRatesTypeFilter !== 'all';

    if (countBar) {
        if (totalPackages === 0) {
            countBar.style.display = 'none';
        } else {
            countBar.style.display = 'flex';
            countBar.innerHTML = isFiltered
                ? `<span>Showing ${packageNames.length} of ${totalPackages} GP package${totalPackages === 1 ? '' : 's'}</span><button type="button" class="ledger-reset-link" onclick="Amolnama.resetRatesFilters()">Reset</button>`
                : `<span>${packageNames.length} GP package${packageNames.length === 1 ? '' : 's'}</span>`;
        }
    }
    
    if (packageNames.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="padding: 48px 20px;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                <p>No packages matched</p>
                <span>Try searching for another keyword or reset the call type filter.</span>
                ${isFiltered ? `<button type="button" class="btn-outline" style="height: auto; padding: 8px 16px; font-size: 0.82rem; margin-top: 12px;" onclick="Amolnama.resetRatesFilters()">Reset Filters</button>` : ''}
            </div>`;
        return;
    }
    
    packageNames.forEach(packageName => {
        const rates = grouped[packageName];
        
        const card = document.createElement('div');
        card.className = 'rates-card';
        
        let ratesHtml = '';
        rates.forEach(rate => {
            const hasFnF = rate.fnfCount > 0 ? ` (FnF: ${rate.fnfCount})` : '';
            const pulseText = rate.pulseSeconds ? `Pulse: ${rate.pulseSeconds}s` : '';
            const slotText = rate.timeSlot ? `${rate.timeSlot}` : '';
            
            // Generate details string
            const detailParts = [];
            if (slotText) detailParts.push(slotText);
            if (pulseText) detailParts.push(pulseText);
            const detailStr = detailParts.join(' · ');

            // Color-code and label types
            let badgeClass = 'rate-badge-other';
            const displayType = rate.callType || 'General';
            
            const lowerType = displayType.toLowerCase();
            if (lowerType.includes('any net') || lowerType.includes('anynet') || lowerType.includes('local') || lowerType.includes('gp-any')) {
                badgeClass = 'rate-badge-anynet';
            } else if (lowerType.includes('fnf')) {
                badgeClass = 'rate-badge-fnf';
            } else if (lowerType.includes('sms')) {
                badgeClass = 'rate-badge-sms';
            }
            
            let noteHtml = '';
            if (rate.note) {
                noteHtml = `
                    <div class="rate-note-banner" style="margin-top: 6px;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; color: var(--warning-text);"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="16" y2="12"/><line x1="12" x2="12.01" y1="8" y2="8"/></svg>
                        <div style="flex: 1;">${escapeHtml(rate.note)}</div>
                    </div>
                `;
            }
            
            ratesHtml += `
                <div class="rate-row-item">
                    <div class="rate-info-pill">
                        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                            <span class="rate-type-badge ${badgeClass}">${escapeHtml(displayType)}${escapeHtml(hasFnF)}</span>
                        </div>
                        <span class="rate-info-subtext" style="margin-top: 4px; display: block;">${escapeHtml(detailStr)}</span>
                        ${noteHtml}
                    </div>
                    <div class="rate-price-pill">
                        <div class="rate-price-main">${parseFloat(rate.tariffWithTax || 0).toFixed(2)} <span style="font-size: 0.72rem; font-weight: 500; opacity: 0.8;">Tk/min</span></div>
                        <div class="rate-price-base">Base: ${parseFloat(rate.tariffExceptTax || 0).toFixed(2)} Tk</div>
                    </div>
                </div>
            `;
        });
        
        card.innerHTML = `
            <div class="rates-card-header">
                <h4 class="rates-card-title">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--accent-color)" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/></svg>
                    ${escapeHtml(packageName)}
                </h4>
                <span class="rates-badge-count tabular-nums">
                    ${rates.length} rate${rates.length === 1 ? '' : 's'}
                </span>
            </div>
            <div class="rates-list">
                ${ratesHtml}
            </div>
        `;
        
        container.appendChild(card);
    });
}

// --- ADMIN / MANAGER EDITING PANEL LOGIC ---

export function openManageRates() {
    closeModal('modal-call-rates');
    const searchInput = document.getElementById('manage-rates-search');
    if (searchInput) searchInput.value = '';
    const clearBtn = document.getElementById('manage-rates-search-clear');
    if (clearBtn) clearBtn.classList.remove('visible');
    openModal('modal-manage-rates');
    renderManageRatesDashboard();
}

export function closeManageRates() {
    closeModal('modal-manage-rates');
    openCallRates(); // Return to directory
}

export function clearManageRatesSearch() {
    const searchInput = document.getElementById('manage-rates-search');
    if (searchInput) {
        searchInput.value = '';
        if (typeof searchInput.focus === 'function') searchInput.focus();
    }
    const clearBtn = document.getElementById('manage-rates-search-clear');
    if (clearBtn) clearBtn.classList.remove('visible');
    renderManageRatesDashboard();
}

// Render dynamic list of packages in management screen
export function renderManageRatesDashboard() {
    const listContainer = document.getElementById('manage-rates-packages-list');
    if (!listContainer) return;

    const searchInput = document.getElementById('manage-rates-search');
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const clearBtn = document.getElementById('manage-rates-search-clear');
    if (clearBtn) clearBtn.classList.toggle('visible', query.length > 0);
    
    listContainer.innerHTML = '';
    
    // Group all active rates by package name to display in admin dashboard
    const uniquePackages = [];
    activeRatesList.forEach(item => {
        if (!uniquePackages.includes(item.packageName)) {
            uniquePackages.push(item.packageName);
        }
    });
    
    uniquePackages.sort();

    const filteredPackages = query
        ? uniquePackages.filter(pkg => pkg.toLowerCase().includes(query))
        : uniquePackages;
    
    if (uniquePackages.length === 0) {
        listContainer.innerHTML = `
            <div class="empty-state" style="padding: 40px 20px;">
                <p>No packages registered</p>
                <span>Tap + New Package above to create your first SIM rate package.</span>
            </div>
        `;
        return;
    }

    if (filteredPackages.length === 0) {
        listContainer.innerHTML = `
            <div class="empty-state" style="padding: 40px 20px;">
                <p>No packages match "${escapeHtml(query)}"</p>
                <button type="button" class="btn-outline" style="height: auto; padding: 8px 16px; font-size: 0.82rem; margin-top: 10px;" onclick="Amolnama.clearManageRatesSearch()">Clear Search</button>
            </div>
        `;
        return;
    }
    
    filteredPackages.forEach(pkgName => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'manage-rate-row';
        row.onclick = () => openPackageForm(pkgName);
        
        const count = activeRatesList.filter(item => item.packageName === pkgName).length;
        
        row.innerHTML = `
            <div class="list-item-content">
                <span class="list-item-title" style="font-weight: 800; font-size: 0.95rem; color: var(--text-primary);">${escapeHtml(pkgName)}</span>
                <span style="font-size: 0.76rem; color: var(--text-secondary);">${count} Call Rate / SMS entr${count === 1 ? 'y' : 'ies'} defined</span>
            </div>
            <div style="display: flex; align-items: center; gap: 4px;">
                <svg class="list-item-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
            </div>
        `;
        listContainer.appendChild(row);
    });
}

// Auto calculates the tax-inclusive tariff (adds 38.89% tax ratio)
export function autoCalcRateTax(baseInput) {
    if (!baseInput) return;
    const parentRow = baseInput.closest('.editor-rate-row');
    if (!parentRow) return;
    
    const taxInput = parentRow.querySelector('.edit-rate-tariff-tax');
    if (!taxInput) return;
    
    const baseValue = parseFloat(baseInput.value);
    if (!isNaN(baseValue) && baseValue >= 0) {
        // Government consolidated tax ratio = 38.89% (1.3889)
        const computedTax = baseValue * 1.3889;
        taxInput.value = computedTax.toFixed(2);
    } else {
        taxInput.value = '';
    }
}

// Add dynamic rate item input row in the editor form
export function addRateRow(rateData = null) {
    const container = document.getElementById('editor-rates-container');
    if (!container) return;
    
    const rowId = 'rate_row_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    const row = document.createElement('div');
    row.className = 'editor-rate-row';
    row.id = rowId;
    
    const callType = rateData ? (rateData.callType || '') : '';
    const fnfCount = rateData ? (rateData.fnfCount || 0) : 0;
    const baseVal = rateData ? (rateData.tariffExceptTax !== undefined ? rateData.tariffExceptTax : '') : '';
    const taxVal = rateData ? (rateData.tariffWithTax !== undefined ? rateData.tariffWithTax : '') : '';
    const pulse = rateData ? (rateData.pulseSeconds !== undefined ? rateData.pulseSeconds : '10') : '10';
    const slot = rateData ? (rateData.timeSlot || '24 Hrs') : '24 Hrs';
    const note = rateData ? (rateData.note || '') : '';
    
    row.innerHTML = `
        <div class="editor-rate-row-header">
            <span style="font-size: 0.8rem; font-weight: 800; color: var(--accent-color); text-transform: uppercase;">Rate configuration</span>
            <button class="delete-btn" style="color: var(--danger-text); font-size: 0.85rem; font-weight: 700; padding: 4px 8px; border: 1px solid var(--danger-border); background: var(--danger-bg); border-radius: 8px;" onclick="document.getElementById('${rowId}').remove()">Remove</button>
        </div>
        <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px;">
            <div style="min-width: 0;">
                <label class="admin-label" style="font-size: 0.72rem; margin-bottom: 4px;">Call / Rate Type *</label>
                <select class="pos-select edit-rate-calltype" style="padding: 8px 12px; height: auto; font-size: 0.85rem; border-radius: 10px;">
                    <option value="GP-Any net" ${callType === 'GP-Any net' ? 'selected' : ''}>GP-Any net</option>
                    <option value="FnF (GP- Any net)" ${callType.includes('FnF') && !callType.includes('SFnF') ? 'selected' : ''}>FnF (GP- Any net)</option>
                    <option value="SFnF (GP- GP)" ${callType.includes('SFnF') ? 'selected' : ''}>SFnF (GP- GP)</option>
                    <option value="SMS" ${callType === 'SMS' ? 'selected' : ''}>SMS</option>
                    <option value="Custom" ${!['GP-Any net', 'SMS'].includes(callType) && !callType.includes('FnF') && callType !== '' ? 'selected' : ''}>Custom (Define Below)</option>
                </select>
                <input type="text" class="pos-input edit-rate-custom-calltype" style="padding: 8px 12px; font-size: 0.85rem; border-radius: 10px; margin-top: 6px; display: ${(!['GP-Any net', 'SMS'].includes(callType) && !callType.includes('FnF') && callType !== '') ? 'block' : 'none'};" placeholder="e.g. SFnF (GP- Any net)" value="${escapeHtml(callType)}">
            </div>
            <div style="min-width: 0;">
                <label class="admin-label" style="font-size: 0.72rem; margin-bottom: 4px;">FnF Count</label>
                <input type="number" class="pos-input edit-rate-fnf" style="padding: 8px 12px; font-size: 0.85rem; border-radius: 10px;" value="${escapeHtml(fnfCount)}" min="0">
            </div>
        </div>
        
        <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px;">
            <div style="min-width: 0;">
                <label class="admin-label" style="font-size: 0.72rem; margin-bottom: 4px;">Base Tariff (Excl. Tax) *</label>
                <input type="number" step="0.01" class="pos-input edit-rate-tariff-base" style="padding: 8px 12px; font-size: 0.85rem; border-radius: 10px;" placeholder="e.g. 1.50" value="${escapeHtml(baseVal)}" oninput="Amolnama.autoCalcRateTax(this)">
            </div>
            <div style="min-width: 0;">
                <label class="admin-label" style="font-size: 0.72rem; margin-bottom: 4px;">Tariff (Incl. Tax) *</label>
                <input type="number" step="0.01" class="pos-input edit-rate-tariff-tax" style="padding: 8px 12px; font-size: 0.85rem; border-radius: 10px;" placeholder="e.g. 2.08" value="${escapeHtml(taxVal)}">
            </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px;">
            <div style="min-width: 0;">
                <label class="admin-label" style="font-size: 0.72rem; margin-bottom: 4px;">Pulse (Seconds / Char)</label>
                <input type="text" class="pos-input edit-rate-pulse" style="padding: 8px 12px; font-size: 0.85rem; border-radius: 10px;" placeholder="e.g. 10 or 160 characters" value="${escapeHtml(pulse)}">
            </div>
            <div style="min-width: 0;">
                <label class="admin-label" style="font-size: 0.72rem; margin-bottom: 4px;">Time Slot</label>
                <input type="text" class="pos-input edit-rate-timeslot" style="padding: 8px 12px; font-size: 0.85rem; border-radius: 10px;" placeholder="e.g. 24 Hrs" value="${escapeHtml(slot)}">
            </div>
        </div>

        <div>
            <label class="admin-label" style="font-size: 0.72rem; margin-bottom: 4px;">Rate Specific Note (Optional)</label>
            <input type="text" class="pos-input edit-rate-note" style="padding: 8px 12px; font-size: 0.85rem; border-radius: 10px;" placeholder="e.g. Tariff changed from 10 Jan 2025" value="${escapeHtml(note)}">
        </div>
    `;
    
    // Bind change listener to call type dropdown to show/hide custom text field
    const selectEl = row.querySelector('.edit-rate-calltype');
    const customInputEl = row.querySelector('.edit-rate-custom-calltype');
    selectEl.addEventListener('change', () => {
        if (selectEl.value === 'Custom') {
            customInputEl.style.display = 'block';
            customInputEl.value = '';
            customInputEl.focus();
        } else {
            customInputEl.style.display = 'none';
            customInputEl.value = selectEl.value;
        }
    });

    container.appendChild(row);
}

// Opens the create/edit form modal
export function openPackageForm(packageName = '') {
    closeModal('modal-manage-rates');
    openModal('modal-package-form');
    
    const titleEl = document.getElementById('package-form-title');
    const nameInput = document.getElementById('edit-package-name');
    const deleteBtn = document.getElementById('btn-delete-package');
    const container = document.getElementById('editor-rates-container');
    
    if (!titleEl || !nameInput || !deleteBtn || !container) return;

    clearInputError(nameInput);
    container.innerHTML = '';
    
    if (packageName) {
        titleEl.innerText = 'Edit SIM Package';
        nameInput.value = packageName;
        nameInput.disabled = true; // Renaming is blocked to maintain key mapping
        deleteBtn.style.display = 'block';
        
        // Load existing rates for this package name
        const rates = activeRatesList.filter(item => item.packageName === packageName);
        rates.forEach(r => addRateRow(r));
    } else {
        titleEl.innerText = 'Create SIM Package';
        nameInput.value = '';
        nameInput.disabled = false;
        deleteBtn.style.display = 'none';
        
        // Add a default blank rate row
        addRateRow();
    }
}

export function closePackageForm() {
    closeModal('modal-package-form');
    openManageRates();
}

// Commit package data to local list and push update to Firestore
export async function savePackageData() {
    if (isSavingPackage) return;
    const nameInput = document.getElementById('edit-package-name');
    if (!nameInput) return;

    clearInputError(nameInput);
    const packageName = nameInput.value.trim();
    if (!packageName) {
        markInputError(nameInput);
        showAppAlert("Input Required", "Please enter a package name.");
        return;
    }
    
    const rateRows = document.querySelectorAll('.editor-rate-row');
    if (rateRows.length === 0) {
        showAppAlert("Rates Required", "Please add at least one rate configuration.");
        return;
    }
    
    const newRates = [];
    let isValid = true;
    
    rateRows.forEach(row => {
        const selectEl = row.querySelector('.edit-rate-calltype');
        const customEl = row.querySelector('.edit-rate-custom-calltype');
        const baseEl = row.querySelector('.edit-rate-tariff-base');
        const taxEl = row.querySelector('.edit-rate-tariff-tax');
        clearInputError(customEl);
        clearInputError(baseEl);
        clearInputError(taxEl);

        const selectType = selectEl.value;
        const customType = customEl.value.trim();
        const callType = selectType === 'Custom' ? customType : selectType;
        
        const fnf = parseInt(row.querySelector('.edit-rate-fnf').value, 10) || 0;
        const baseVal = parseFloat(baseEl.value);
        const taxVal = parseFloat(taxEl.value);
        const pulse = row.querySelector('.edit-rate-pulse').value.trim();
        const slot = row.querySelector('.edit-rate-timeslot').value.trim();
        const note = row.querySelector('.edit-rate-note').value.trim();
        
        if (!callType || isNaN(baseVal) || baseVal < 0 || isNaN(taxVal) || taxVal < 0) {
            if (!callType && selectType === 'Custom') markInputError(customEl);
            if (isNaN(baseVal) || baseVal < 0) markInputError(baseEl);
            if (isNaN(taxVal) || taxVal < 0) markInputError(taxEl);
            isValid = false;
            return;
        }
        
        newRates.push({
            packageName,
            callType,
            fnfCount: fnf,
            tariffExceptTax: baseVal,
            tariffWithTax: taxVal,
            pulseSeconds: pulse,
            timeSlot: slot || '24 Hrs',
            note
        });
    });
    
    if (!isValid) {
        showAppAlert("Validation Error", "Please enter a valid Call Type and non-negative Base & Inclusive tariffs.");
        return;
    }
    
    // Remove old records matching this package name
    activeRatesList = activeRatesList.filter(item => item.packageName !== packageName);
    
    // Add the new grouped rates
    activeRatesList.push(...newRates);
    
    const saveBtn = document.querySelector('#modal-package-form button[onclick*="savePackageData"]');
    isSavingPackage = true;
    setButtonLoading(saveBtn, true, 'Saving...');

    try {
        // Save to Firestore settings
        await setDoc(doc(db, 'global', 'rates'), { packages: activeRatesList }, { merge: true });
        localStorage.setItem('amolnama_cache_rates', JSON.stringify(activeRatesList));
        showFlashMessage("Package saved successfully!");
        closePackageForm();
    } catch (err) {
        console.error("Error saving call rates to Firestore", err);
        showAppAlert("Database Error", "Could not save package rates to the database. Check connection.");
    } finally {
        isSavingPackage = false;
        setButtonLoading(saveBtn, false);
    }
}

// Delete package and write change to Firestore
export async function deletePackage() {
    const nameInput = document.getElementById('edit-package-name');
    if (!nameInput) return;
    
    const packageName = nameInput.value.trim();
    if (!packageName) return;
    
    showAppAlert(
        "Confirm Delete",
        `Are you sure you want to permanently delete the package "${packageName}" and all its call rates?`,
        true,
        async () => {
            const deleteBtn = document.getElementById('btn-delete-package');
            setButtonLoading(deleteBtn, true, 'Deleting...');
            activeRatesList = activeRatesList.filter(item => item.packageName !== packageName);
            
            try {
                await setDoc(doc(db, 'global', 'rates'), { packages: activeRatesList }, { merge: true });
                localStorage.setItem('amolnama_cache_rates', JSON.stringify(activeRatesList));
                showFlashMessage("Package deleted successfully!");
                closePackageForm();
            } catch (err) {
                console.error("Error deleting call rates from Firestore", err);
                showAppAlert("Database Error", "Could not delete package. Check connection.");
            } finally {
                setButtonLoading(deleteBtn, false);
            }
        },
        "Delete"
    );
}
