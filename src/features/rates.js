// src/features/rates.js
import { openModal, closeModal } from '../utils/ui-helpers.js';

// Parsed call and SMS rates from internal portal
const RATES_DATABASE = [
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

export function openCallRates() {
    openModal('modal-call-rates');
    
    // Clear and focus search
    const searchInput = document.getElementById('rates-search');
    if (searchInput) {
        searchInput.value = '';
    }
    
    const operatorSelect = document.getElementById('rates-operator-select');
    if (operatorSelect) {
        operatorSelect.value = 'GP';
    }
    
    renderRatesList();
}

export function closeCallRates() {
    closeModal('modal-call-rates');
}

export function filterRatesList() {
    renderRatesList();
}

export function renderRatesList() {
    const searchInput = document.getElementById('rates-search');
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
    
    const operatorSelect = document.getElementById('rates-operator-select');
    const operator = operatorSelect ? operatorSelect.value : 'GP';
    
    const container = document.getElementById('rates-list-container');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (operator !== 'GP') {
        container.innerHTML = `
            <div style="padding: 40px 20px; text-align: center; color: var(--text-secondary);">
                <div style="font-size: 2.2rem; margin-bottom: 12px;">📱</div>
                <div style="font-weight: 700; color: var(--text-primary);">No data available</div>
                <div style="font-size: 0.8rem; margin-top: 4px; opacity: 0.8;">Call rates for this operator have not been imported yet.</div>
            </div>`;
        return;
    }
    
    // Group rates by packageName
    const grouped = {};
    
    RATES_DATABASE.forEach(item => {
        // Apply search query filter
        const matchesSearch = !query || 
            item.packageName.toLowerCase().includes(query) ||
            item.callType.toLowerCase().includes(query) ||
            (item.note && item.note.toLowerCase().includes(query)) ||
            (item.pulseSeconds && item.pulseSeconds.toLowerCase().includes(query));
            
        if (matchesSearch) {
            if (!grouped[item.packageName]) {
                grouped[item.packageName] = [];
            }
            grouped[item.packageName].push(item);
        }
    });
    
    const packageNames = Object.keys(grouped).sort();
    
    if (packageNames.length === 0) {
        container.innerHTML = `
            <div style="padding: 40px 20px; text-align: center; color: var(--text-secondary);">
                <div style="font-size: 2.2rem; margin-bottom: 12px;">🔍</div>
                <div style="font-weight: 700; color: var(--text-primary);">No matching packages found</div>
                <div style="font-size: 0.8rem; margin-top: 4px; opacity: 0.8;">Try searching for another keyword like 'Bondhu', 'Ekota', 'SMS' or 'FnF'.</div>
            </div>`;
        return;
    }
    
    packageNames.forEach(packageName => {
        const rates = grouped[packageName];
        
        const card = document.createElement('div');
        card.className = 'history-item';
        card.style.cssText = 'display: flex; flex-direction: column; padding: 16px; background: var(--surface-strong); border: 1px solid var(--border-color); border-radius: 18px; box-shadow: var(--shadow-soft); margin-bottom: 12px;';
        
        let ratesHtml = '';
        rates.forEach(rate => {
            const hasFnF = rate.fnfCount > 0 ? ` (FnF: ${rate.fnfCount})` : '';
            const slotText = rate.timeSlot && rate.timeSlot !== '24 Hrs' ? ` | Slot: ${rate.timeSlot}` : '';
            const pulseText = rate.pulseSeconds ? ` | Pulse: ${rate.pulseSeconds}s` : '';
            
            let noteHtml = '';
            if (rate.note) {
                noteHtml = `<div style="font-size: 0.72rem; color: #f59e0b; font-weight: 600; margin-top: 2px; padding-left: 2px;">ℹ️ ${rate.note}</div>`;
            }
            
            const oldTariffText = rate.oldTariff > 0 ? `<span style="font-size: 0.72rem; color: var(--text-secondary); text-decoration: line-through; margin-right: 4px;">${rate.oldTariff} Tk</span>` : '';
            
            ratesHtml += `
                <div style="padding: 8px 0; border-bottom: 1px dashed var(--border-color); display: flex; flex-direction: column; gap: 4px;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
                        <div style="flex: 1; min-width: 0;">
                            <span style="font-size: 0.88rem; font-weight: 700; color: var(--text-primary);">${rate.callType}${hasFnF}</span>
                            <div style="font-size: 0.72rem; color: var(--text-secondary); margin-top: 2px;">
                                ⏱️ ${rate.timeSlot}${pulseText}
                            </div>
                        </div>
                        <div style="text-align: right; flex-shrink: 0;">
                            <span style="font-size: 0.95rem; font-weight: 800; color: var(--accent-color);">${rate.tariffWithTax} Tk<span style="font-size: 0.7rem; font-weight: 500; color: var(--text-secondary);">/min</span></span>
                            <div style="font-size: 0.7rem; color: var(--text-secondary);">
                                Base: ${rate.tariffExceptTax} Tk
                            </div>
                        </div>
                    </div>
                    ${noteHtml}
                </div>
            `;
        });
        
        // Remove trailing dashed border from the last rate row
        ratesHtml = ratesHtml.replace(/border-bottom: 1px dashed var\(--border-color\);([^;]*)$/, '$1');
        
        card.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border-color); padding-bottom: 10px; margin-bottom: 6px;">
                <h4 style="margin: 0; color: var(--text-primary); font-size: 1.1rem; font-weight: 800; display: flex; align-items: center; gap: 6px;">
                    📱 ${packageName}
                </h4>
                <span style="font-size: 0.72rem; font-weight: 700; background: rgba(51, 144, 236, 0.08); color: var(--accent-color); padding: 4px 10px; border-radius: 12px; border: 1px solid rgba(51, 144, 236, 0.15);">
                    ${rates.length} Rates
                </span>
            </div>
            <div style="display: flex; flex-direction: column;">
                ${ratesHtml}
            </div>
        `;
        
        container.appendChild(card);
    });
}
