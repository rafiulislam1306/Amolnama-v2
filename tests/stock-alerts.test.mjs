// tests/stock-alerts.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
    DEFAULT_LOW_STOCK_THRESHOLD,
    normalizeThreshold,
    parseOptionalItemThreshold,
    resolveItemLowStockThreshold,
    getItemStockStatus
} from '../src/utils/stock-alerts.js';

function createMockElement(id = '', tagName = 'DIV') {
    const classSet = new Set();
    const attrs = {};
    const children = [];
    const el = {
        id,
        tagName,
        className: '',
        style: {},
        innerText: '',
        innerHTML: '',
        value: '',
        dataset: {},
        children,
        get childElementCount() { return children.length; },
        classList: {
            add: (...cls) => cls.forEach(c => classSet.add(c)),
            remove: (...cls) => cls.forEach(c => classSet.delete(c)),
            toggle: (c, force) => {
                if (force === true) { classSet.add(c); return true; }
                if (force === false) { classSet.delete(c); return false; }
                if (classSet.has(c)) { classSet.delete(c); return false; }
                classSet.add(c);
                return true;
            },
            contains: (c) => classSet.has(c) || el.className.split(/\s+/).includes(c)
        },
        setAttribute(k, v) { attrs[k] = String(v); },
        getAttribute(k) { return attrs[k] ?? null; },
        addEventListener() {},
        removeEventListener() {},
        appendChild(child) { children.push(child); return child; },
        querySelector: () => null,
        querySelectorAll: () => [],
        remove() {}
    };
    return el;
}

test('Low-Stock Alert Threshold & Store Card Warning Suite', async (t) => {
    await t.test('1. normalizeThreshold handles valid, zero, decimal, and invalid inputs', () => {
        assert.equal(normalizeThreshold(5), 5);
        assert.equal(normalizeThreshold('12'), 12);
        assert.equal(normalizeThreshold(0), 0);
        assert.equal(normalizeThreshold('0'), 0);
        assert.equal(normalizeThreshold(7.9), 7);
        assert.equal(normalizeThreshold(-3), DEFAULT_LOW_STOCK_THRESHOLD);
        assert.equal(normalizeThreshold(''), DEFAULT_LOW_STOCK_THRESHOLD);
        assert.equal(normalizeThreshold(null), DEFAULT_LOW_STOCK_THRESHOLD);
        assert.equal(normalizeThreshold(undefined), DEFAULT_LOW_STOCK_THRESHOLD);
        assert.equal(normalizeThreshold('abc', 8), 8);
    });

    await t.test('2. parseOptionalItemThreshold distinguishes blank (inherit), 0 (disable), valid int, and invalid', () => {
        assert.equal(parseOptionalItemThreshold(''), null);
        assert.equal(parseOptionalItemThreshold('   '), null);
        assert.equal(parseOptionalItemThreshold(null), null);
        assert.equal(parseOptionalItemThreshold(undefined), null);
        assert.equal(parseOptionalItemThreshold('0'), 0);
        assert.equal(parseOptionalItemThreshold(0), 0);
        assert.equal(parseOptionalItemThreshold('10'), 10);
        assert.equal(parseOptionalItemThreshold('4.8'), 4);
        assert.equal(Number.isNaN(parseOptionalItemThreshold('-1')), true);
        assert.equal(Number.isNaN(parseOptionalItemThreshold('nope')), true);
    });

    await t.test('3. resolveItemLowStockThreshold applies per-item overrides including 0 and falls back to global', () => {
        assert.equal(resolveItemLowStockThreshold({ name: 'Prime' }, 6), 6);
        assert.equal(resolveItemLowStockThreshold({ name: 'Prime', lowStockThreshold: '' }, 6), 6);
        assert.equal(resolveItemLowStockThreshold({ name: 'Prime', lowStockThreshold: null }, 6), 6);
        assert.equal(resolveItemLowStockThreshold({ name: 'Prime', lowStockThreshold: 10 }, 6), 10);
        assert.equal(resolveItemLowStockThreshold({ name: 'Prime', lowStockThreshold: 0 }, 6), 0);
        assert.equal(resolveItemLowStockThreshold({ name: 'Prime', lowStockThreshold: -2 }, 6), 6);
    });

    await t.test('4. getItemStockStatus flags strictly below threshold, out-of-stock, ok, disabled, and untracked', () => {
        // Default threshold 5: 1..4 are low, 5+ are ok, <=0 is out
        assert.deepEqual(getItemStockStatus(0, 5), { level: 'out', isOutOfStock: true, isLowStock: false, threshold: 5 });
        assert.deepEqual(getItemStockStatus(-2, 5), { level: 'out', isOutOfStock: true, isLowStock: false, threshold: 5 });
        assert.deepEqual(getItemStockStatus(1, 5), { level: 'low', isOutOfStock: false, isLowStock: true, threshold: 5 });
        assert.deepEqual(getItemStockStatus(4, 5), { level: 'low', isOutOfStock: false, isLowStock: true, threshold: 5 });
        assert.deepEqual(getItemStockStatus(5, 5), { level: 'ok', isOutOfStock: false, isLowStock: false, threshold: 5 });
        assert.deepEqual(getItemStockStatus(20, 5), { level: 'ok', isOutOfStock: false, isLowStock: false, threshold: 5 });

        // Threshold 0 disables low-stock warning (only out-of-stock at 0)
        assert.deepEqual(getItemStockStatus(1, 0), { level: 'ok', isOutOfStock: false, isLowStock: false, threshold: 0 });
        assert.deepEqual(getItemStockStatus(0, 0), { level: 'out', isOutOfStock: true, isLowStock: false, threshold: 0 });

        // Untracked / digital item (Infinity stock) never warns
        assert.deepEqual(getItemStockStatus(Infinity, 5), { level: 'untracked', isOutOfStock: false, isLowStock: false, threshold: 5 });
    });

    await t.test('5. renderAppUI applies .is-low-stock, data attributes, and aria-label using global & per-item thresholds', async () => {
        const containerNewSim = createMockElement('container-new-sim');
        const containerCards = createMockElement('container-cards');
        const registry = new Map([
            ['container-new-sim', containerNewSim],
            ['container-cards', containerCards]
        ]);

        Object.defineProperty(globalThis, 'navigator', { value: { vibrate: () => false, onLine: true }, configurable: true });
        globalThis.window = { showAppAlert: () => {} };
        globalThis.document = {
            getElementById: (id) => registry.get(id) || null,
            querySelector: () => null,
            querySelectorAll: () => [],
            createElement: (tag) => createMockElement('', tag.toUpperCase())
        };

        const { AppState } = await import('../src/core/state.js');
        const { renderAppUI } = await import('../src/features/catalog.js');

        AppState.currentUserRole = 'user';
        AppState.currentSessionId = 'sess_1';
        AppState.transactions = [];
        AppState.globalInventoryGroups = ['GP SIM', 'Skitto SIM', 'VIP SIM'];
        AppState.globalLowStockThreshold = 5;
        AppState.currentOpeningInv = {
            'GP SIM': 3,       // Below global threshold (5) -> low stock
            'Skitto SIM': 0,   // Zero -> out of stock
            'VIP SIM': 7       // Above global (5) BUT per-item threshold is 10 -> low stock!
        };
        AppState.globalCatalog = {
            sim_prime: { name: 'Prime', display: 'Prime', price: 300, cat: 'new-sim', trackAs: 'GP SIM', isActive: true, order: 1 },
            sim_skitto: { name: 'Skitto', display: 'Skitto', price: 300, cat: 'new-sim', trackAs: 'Skitto SIM', isActive: true, order: 2 },
            sim_vip: { name: 'VIP Pack', display: 'VIP Pack', price: 500, cat: 'new-sim', trackAs: 'VIP SIM', lowStockThreshold: 10, isActive: true, order: 3 },
            sim_muted: { name: 'Silent SIM', display: 'Silent SIM', price: 250, cat: 'new-sim', trackAs: 'GP SIM', lowStockThreshold: 0, isActive: true, order: 4 },
            card_50: { name: '50 Tk Scratch Card', display: '50 Tk Scratch Card', price: 50, cat: 'cards', trackAs: '', isActive: true, order: 5 }
        };

        renderAppUI();

        const simRows = containerNewSim.children;
        assert.equal(simRows.length, 4);

        const primeRow = simRows.find(r => r.getAttribute('data-item-name') === 'Prime');
        assert.equal(primeRow.classList.contains('is-low-stock'), true);
        assert.equal(primeRow.getAttribute('data-stock-status'), 'low');
        assert.equal(primeRow.getAttribute('data-low-stock-threshold'), '5');
        assert.match(primeRow.innerHTML, /Low stock · 3 left/);
        assert.match(primeRow.getAttribute('aria-label'), /Low stock, 3 left/);

        const skittoRow = simRows.find(r => r.getAttribute('data-item-name') === 'Skitto');
        assert.equal(skittoRow.classList.contains('is-locked'), true);
        assert.equal(skittoRow.classList.contains('is-low-stock'), false);
        assert.equal(skittoRow.getAttribute('data-stock-status'), 'out');

        const vipRow = simRows.find(r => r.getAttribute('data-item-name') === 'VIP Pack');
        assert.equal(vipRow.classList.contains('is-low-stock'), true);
        assert.equal(vipRow.getAttribute('data-stock-status'), 'low');
        assert.equal(vipRow.getAttribute('data-low-stock-threshold'), '10');
        assert.match(vipRow.innerHTML, /Low stock · 7 left/);

        const mutedRow = simRows.find(r => r.getAttribute('data-item-name') === 'Silent SIM');
        assert.equal(mutedRow.classList.contains('is-low-stock'), false);
        assert.equal(mutedRow.getAttribute('data-stock-status'), 'ok');
        assert.equal(mutedRow.getAttribute('data-low-stock-threshold'), '0');

        const cardRow = containerCards.children[0];
        assert.equal(cardRow.classList.contains('is-low-stock'), false);
        assert.equal(cardRow.getAttribute('data-stock-status'), 'untracked');
    });

    await t.test('6. HTML, CSS, Admin & Persistence Contracts for Configurable Low-Stock Warnings', () => {
        const indexHtml = fs.readFileSync(path.resolve('index.html'), 'utf8');
        const styleCss = fs.readFileSync(path.resolve('src/style.css'), 'utf8');
        const adminJs = fs.readFileSync(path.resolve('src/features/admin.js'), 'utf8');
        const appInitJs = fs.readFileSync(path.resolve('src/core/app-init.js'), 'utf8');

        assert.match(indexHtml, /id="admin-low-stock-threshold"/);
        assert.match(indexHtml, /id="new-item-low-stock"/);
        assert.match(adminJs, /class="settings-input i-low-stock"/);
        assert.match(adminJs, /lowStockThreshold:\s*AppState\.globalLowStockThreshold/);
        assert.match(appInitJs, /globalLowStockThreshold\s*=\s*normalizeThreshold/);
        assert.match(styleCss, /#tab-store\s+\.store-item-row\.is-low-stock\b/);
        assert.match(styleCss, /:root\[data-theme="dark"\]\s+#tab-store\s+\.store-item-row\.is-low-stock\b/);
        assert.match(styleCss, /\.store-stock-note\.is-low\b/);
    });
});
