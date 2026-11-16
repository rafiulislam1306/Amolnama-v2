// src/utils/ledger-filters.js

export function createDefaultLedgerFilters() {
    return {
        category: 'all',
        search: '',
        payment: 'all',
        status: 'all',
        agent: 'all',
        sort: 'newest'
    };
}

export function resolveTxCategory(tx, catalog = {}) {
    if (!tx) return null;
    const catItem = Object.values(catalog || {}).find(c => c && c.name === tx.name);
    return (catItem ? catItem.cat : null) || tx.cat || null;
}

export function matchesLedgerCategory(tx, category = 'all', catalog = {}) {
    if (!category || category === 'all') return true;
    if (category === 'ers') return tx.name === 'ERS Flexiload';
    if (category === 'cash_actions') return tx.type === 'adjustment';
    if (category === 'transfers') return tx.type === 'transfer_in' || tx.type === 'transfer_out';
    const txCat = resolveTxCategory(tx, catalog);
    return txCat === category;
}

export function matchesLedgerFilters(tx, filterState = {}, catalog = {}) {
    if (!tx) return false;
    const state = { ...createDefaultLedgerFilters(), ...filterState };

    if (!matchesLedgerCategory(tx, state.category, catalog)) {
        return false;
    }

    if (state.payment && state.payment !== 'all') {
        if ((tx.payment || '') !== state.payment) {
            return false;
        }
    }

    if (state.status && state.status !== 'all') {
        if (state.status === 'incomplete_onboarding') {
            const hasIncompleteOnboarding = Boolean(
                tx.onboarding && (!tx.onboarding.firstCall || !tx.onboarding.appReg)
            );
            if (!hasIncompleteOnboarding) return false;
        } else if (state.status === 'edited') {
            if (!tx.isEdited) return false;
        } else if (state.status === 'pending') {
            if (!tx.isPending && !tx.isOffline) return false;
        }
    }

    if (state.agent && state.agent !== 'all') {
        const txAgent = (tx.agentName || 'Unknown').trim().toLowerCase();
        if (txAgent !== state.agent.trim().toLowerCase()) {
            return false;
        }
    }

    const q = (state.search || '').trim().toLowerCase();
    if (q.length > 0) {
        const haystack = [
            tx.name || '',
            tx.receiptNo || '',
            tx.id !== undefined && tx.id !== null ? String(tx.id) : '',
            tx.agentName || '',
            tx.notes || '',
            tx.handsetModel || '',
            tx.payment || '',
            tx.amount !== undefined && tx.amount !== null ? String(tx.amount) : ''
        ].join(' ').toLowerCase();

        if (!haystack.includes(q)) {
            return false;
        }
    }

    return true;
}

export function sortLedgerTransactions(txList = [], sortMode = 'newest') {
    const list = Array.isArray(txList) ? [...txList] : [];
    const getIdVal = (tx) => Number(tx?.id) || 0;
    const getAbsAmt = (tx) => Math.abs(Number(tx?.amount) || 0);

    list.sort((a, b) => {
        if (sortMode === 'oldest') {
            return getIdVal(a) - getIdVal(b);
        }
        if (sortMode === 'amount_desc') {
            const diff = getAbsAmt(b) - getAbsAmt(a);
            return diff !== 0 ? diff : (getIdVal(b) - getIdVal(a));
        }
        if (sortMode === 'amount_asc') {
            const diff = getAbsAmt(a) - getAbsAmt(b);
            return diff !== 0 ? diff : (getIdVal(b) - getIdVal(a));
        }
        // Default: newest first
        return getIdVal(b) - getIdVal(a);
    });

    return list;
}

export function countActiveAdvancedFilters(filterState = {}) {
    let count = 0;
    if (filterState.payment && filterState.payment !== 'all') count++;
    if (filterState.status && filterState.status !== 'all') count++;
    if (filterState.agent && filterState.agent !== 'all') count++;
    if (filterState.sort && filterState.sort !== 'newest') count++;
    return count;
}

export function isLedgerFiltered(filterState = {}) {
    return Boolean(
        (filterState.category && filterState.category !== 'all') ||
        (filterState.search && filterState.search.trim().length > 0) ||
        countActiveAdvancedFilters(filterState) > 0
    );
}

export function computeFilteredLedgerTotal(txList = [], paymentFilter = 'all') {
    return (txList || []).reduce((sum, tx) => {
        if (!tx) return sum;
        if (paymentFilter === 'Cash') {
            const cash = tx.cashAmt !== undefined ? Number(tx.cashAmt) : (tx.payment === 'Cash' ? Number(tx.amount) : 0);
            return sum + Math.abs(cash || 0);
        }
        if (paymentFilter === 'MFS') {
            const mfs = tx.mfsAmt !== undefined ? Number(tx.mfsAmt) : (tx.payment === 'MFS' ? Number(tx.amount) : 0);
            return sum + Math.abs(mfs || 0);
        }
        return sum + Math.abs(Number(tx.amount) || 0);
    }, 0);
}

export function extractLedgerAgents(txList = []) {
    const map = new Map();
    (txList || []).forEach(tx => {
        if (!tx || tx.isDeleted) return;
        const raw = (tx.agentName || '').trim();
        if (!raw) return;
        const key = raw.toLowerCase();
        if (!map.has(key)) {
            map.set(key, raw);
        }
    });
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
}
