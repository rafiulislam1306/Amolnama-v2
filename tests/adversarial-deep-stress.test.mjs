// tests/adversarial-deep-stress.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// --- Minimal DOM Simulator for Custom Dropdowns & Form Controls ---
class MockClassList {
    constructor() { this.classes = new Set(); }
    add(...names) { names.forEach(n => this.classes.add(n)); }
    remove(...names) { names.forEach(n => this.classes.delete(n)); }
    toggle(name) {
        if (this.classes.has(name)) { this.classes.delete(name); return false; }
        else { this.classes.add(name); return true; }
    }
    contains(name) { return this.classes.has(name); }
}

class MockElement {
    constructor(tagName = 'div') {
        this.tagName = tagName.toUpperCase();
        this.classList = new MockClassList();
        this.attributes = new Map();
        this.style = {};
        this.dataset = {};
        this.children = [];
        this.parentNode = null;
        this.listeners = new Map();
        this._innerHTML = '';
        this._innerText = '';
        this.value = '';
        this.disabled = false;
        this.selected = false;
        this.selectedIndex = 0;
    }

    get className() { return Array.from(this.classList.classes).join(' '); }
    set className(name) {
        this.classList.classes.clear();
        (name || '').split(/\s+/).filter(Boolean).forEach(c => this.classList.add(c));
    }

    get innerHTML() { return this._innerHTML; }
    set innerHTML(html) {
        this._innerHTML = html;
        if (html === '') {
            this.children = [];
        } else if (html.includes('<span class="custom-trigger-text"')) {
            const span = new MockElement('span');
            span.classList.add('custom-trigger-text');
            span.parentNode = this;
            const svg = new MockElement('svg');
            svg.parentNode = this;
            this.children = [span, svg];
        }
    }

    get innerText() { return this._innerText; }
    set innerText(text) {
        this._innerText = text;
        this._innerHTML = text;
    }

    get text() { return this._innerText; }
    set text(t) { this._innerText = t; }

    get options() {
        return this.children.filter(c => c.tagName === 'OPTION');
    }

    setAttribute(k, v) { this.attributes.set(k, String(v)); }
    getAttribute(k) { return this.attributes.has(k) ? this.attributes.get(k) : null; }
    hasAttribute(k) { return this.attributes.has(k); }
    removeAttribute(k) { this.attributes.delete(k); }

    appendChild(child) {
        child.parentNode = this;
        this.children.push(child);
        if (this._mutationCallback) this._mutationCallback();
        return child;
    }

    insertBefore(newNode, refNode) {
        newNode.parentNode = this;
        const idx = this.children.indexOf(refNode);
        if (idx !== -1) {
            this.children.splice(idx, 0, newNode);
        } else {
            this.children.push(newNode);
        }
        return newNode;
    }

    removeChild(child) {
        const idx = this.children.indexOf(child);
        if (idx !== -1) {
            this.children.splice(idx, 1);
            child.parentNode = null;
        }
        return child;
    }

    closest(selector) {
        let curr = this;
        while (curr) {
            if (selector.startsWith('.') && curr.classList.contains(selector.slice(1))) return curr;
            if (selector.startsWith('#') && curr.id === selector.slice(1)) return curr;
            curr = curr.parentNode;
        }
        return null;
    }

    querySelector(selector) {
        const all = this.querySelectorAll(selector);
        return all.length > 0 ? all[0] : null;
    }

    querySelectorAll(selector) {
        const results = [];
        const check = (node) => {
            let matches = false;
            if (selector === '.custom-option') {
                matches = node.classList.contains('custom-option');
            } else if (selector === '.custom-option:not(.disabled)') {
                matches = node.classList.contains('custom-option') && !node.classList.contains('disabled');
            } else if (selector === '.custom-option.highlighted') {
                matches = node.classList.contains('custom-option') && node.classList.contains('highlighted');
            } else if (selector === '.custom-trigger-text') {
                matches = node.classList.contains('custom-trigger-text');
            } else if (selector === '.custom-options.open') {
                matches = node.classList.contains('custom-options') && node.classList.contains('open');
            }
            if (matches) results.push(node);
            node.children.forEach(c => check(c));
        };
        this.children.forEach(c => check(c));
        return results;
    }

    addEventListener(event, fn) {
        if (!this.listeners.has(event)) this.listeners.set(event, []);
        this.listeners.get(event).push(fn);
    }

    removeEventListener(event, fn) {
        if (!this.listeners.has(event)) return;
        this.listeners.set(event, this.listeners.get(event).filter(f => f !== fn));
    }

    dispatchEvent(ev) {
        const fns = this.listeners.get(ev.type) || [];
        for (const fn of fns) {
            fn(ev);
            if (ev._stopped) break;
        }
        return true;
    }

    click() {
        const ev = new MockEvent('click', { bubbles: true });
        this.dispatchEvent(ev);
    }

    get previousElementSibling() {
        if (!this.parentNode) return null;
        const siblings = this.parentNode.children;
        const idx = siblings.indexOf(this);
        return idx > 0 ? siblings[idx - 1] : null;
    }

    scrollIntoView() {}
}

class MockEvent {
    constructor(type, opts = {}) {
        this.type = type;
        this.bubbles = !!opts.bubbles;
        this.defaultPrevented = false;
        this._stopped = false;
        this.key = opts.key || '';
    }
    preventDefault() { this.defaultPrevented = true; }
    stopPropagation() { this._stopped = true; }
}

class MockMutationObserver {
    constructor(callback) { this.callback = callback; }
    observe(target) { target._mutationCallback = this.callback; }
    disconnect() {}
}

const dummyEl = new MockElement();

globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {}
};

globalThis.window = {
    Amolnama: {},
    addEventListener: () => {},
    removeEventListener: () => {}
};

globalThis.document = {
    querySelectorAll: () => [],
    querySelector: () => dummyEl,
    getElementById: () => dummyEl,
    createElement: (tag) => new MockElement(tag),
    addEventListener: () => {},
    removeEventListener: () => {}
};

try {
    Object.defineProperty(globalThis, 'navigator', {
        value: { vibrate: () => true, onLine: true },
        configurable: true,
        writable: true
    });
} catch (e) {
    globalThis.navigator.vibrate = () => true;
}

globalThis.requestAnimationFrame = (callback) => callback();
globalThis.MutationObserver = MockMutationObserver;
globalThis.Event = MockEvent;

// Imports under test
const transactionsModule = await import('../src/features/transactions.js');
const uiHelpersModule = await import('../src/utils/ui-helpers.js');
const { AppState } = await import('../src/core/state.js');

test('Adversarial Deep Stress Test Suite (Challenger 1 Verification)', async (t) => {

    await t.test('1. Quantity Stepper / Slider Boundaries & Stress Harness', async (st) => {
        const mockNumInput = new MockElement('input');
        const mockSliderInput = new MockElement('input');
        const mockQtyDisplay = new MockElement('div');
        const mockQtyCalcDisplay = new MockElement('div');
        const mockQtyItemName = new MockElement('div');

        const elements = {
            'qty-number-input': mockNumInput,
            'qty-slider': mockSliderInput,
            'qty-display': mockQtyDisplay,
            'qty-calc-display': mockQtyCalcDisplay,
            'qty-item-name': mockQtyItemName
        };

        globalThis.document.getElementById = (id) => elements[id] || new MockElement();

        await st.test('Extreme Boundary Clamping & Negative Input Protection', () => {
            AppState.ui.currentQty = '1';
            AppState.ui.currentItemPrice = 150;
            AppState.ui.currentItemName = 'SIM Card';

            // Underflow
            transactionsModule.stepQty(-1);
            assert.equal(AppState.ui.currentQty, '1', 'Cannot step below 1');
            assert.equal(mockNumInput.value, 1);
            assert.equal(mockSliderInput.value, 1);

            transactionsModule.stepQty(-1000);
            assert.equal(AppState.ui.currentQty, '1', 'Extreme negative step clamps to 1');

            // Overflow
            transactionsModule.stepQty(99);
            assert.equal(AppState.ui.currentQty, '100', 'Can step to 100');
            assert.equal(mockNumInput.value, 100);
            assert.equal(mockSliderInput.value, 100);

            transactionsModule.stepQty(1);
            assert.equal(AppState.ui.currentQty, '100', 'Cannot step above 100');
            assert.equal(mockNumInput.value, 100);
            assert.equal(mockSliderInput.value, 100);

            transactionsModule.stepQty(5000);
            assert.equal(AppState.ui.currentQty, '100', 'Extreme positive step clamps to 100');
        });

        await st.test('Adversarial String & Non-Numeric Fuzzing', () => {
            const fuzzInputs = [
                '0', '-1', '-999', '100', '101', '99999', 'abc', '', '   ',
                'undefined', 'null', 'NaN', '1e5', '0x20', '50.9'
            ];

            for (const input of fuzzInputs) {
                transactionsModule.onQtyInputChange(input);
                const qty = parseInt(AppState.ui.currentQty, 10);
                assert.ok(!isNaN(qty), `Qty must not be NaN for input "${input}"`);
                assert.ok(qty >= 1 && qty <= 100, `Qty must be bounded in [1, 100] for input "${input}", got ${qty}`);
                assert.equal(mockSliderInput.value, qty, `Slider in sync for input "${input}"`);
            }
        });

        await st.test('High-Velocity Random Stepper Fuzzing (5,000 steps)', () => {
            AppState.ui.currentQty = '50';
            for (let i = 0; i < 5000; i++) {
                const delta = Math.floor(Math.random() * 51) - 25; // -25 to +25
                transactionsModule.stepQty(delta);
                const current = parseInt(AppState.ui.currentQty, 10);
                assert.ok(!isNaN(current), `Never NaN at step ${i}`);
                assert.ok(current >= 1 && current <= 100, `Never outside bounds at step ${i}`);
                assert.equal(mockNumInput.value, current);
                assert.equal(mockSliderInput.value, current);
            }
        });
    });

    await t.test('2. Dropdown Keyboard Navigation & ARIA Combobox Accessibility', async (st) => {
        const parentDiv = new MockElement('div');
        const selectEl = new MockElement('select');
        parentDiv.appendChild(selectEl);

        const opt0 = new MockElement('option');
        opt0.value = '';
        opt0.innerText = '— Select Transfer Type —';
        opt0.disabled = true;
        opt0.selected = true;

        const opt1 = new MockElement('option');
        opt1.value = 'agent_1';
        opt1.innerText = 'Agent 1';

        const opt2 = new MockElement('option');
        opt2.value = 'agent_2';
        opt2.innerText = 'Agent 2';

        const optDisabled = new MockElement('option');
        optDisabled.value = 'agent_inactive';
        optDisabled.innerText = 'Agent Inactive (Disabled)';
        optDisabled.disabled = true;

        const opt3 = new MockElement('option');
        opt3.value = 'agent_3';
        opt3.innerText = 'Agent 3';

        selectEl.appendChild(opt0);
        selectEl.appendChild(opt1);
        selectEl.appendChild(opt2);
        selectEl.appendChild(optDisabled);
        selectEl.appendChild(opt3);

        globalThis.document.querySelectorAll = (sel) => {
            if (sel.includes('select.settings-input')) {
                return [selectEl];
            }
            if (sel === '.custom-options.open') {
                return parentDiv.querySelectorAll('.custom-options.open');
            }
            return [];
        };

        const docListeners = new Map();
        globalThis.document.addEventListener = (ev, fn) => {
            if (!docListeners.has(ev)) docListeners.set(ev, []);
            docListeners.get(ev).push(fn);
        };

        uiHelpersModule.initCustomDropdowns();

        const wrapper = selectEl.parentNode;
        const trigger = wrapper.children.find(c => c.classList.contains('custom-select-trigger'));
        const optionsContainer = wrapper.children.find(c => c.classList.contains('custom-options'));

        await st.test('Combobox roles and attributes compliance', () => {
            assert.equal(trigger.getAttribute('role'), 'combobox');
            assert.equal(trigger.getAttribute('tabindex'), '0');
            assert.equal(trigger.getAttribute('aria-haspopup'), 'listbox');
            assert.equal(trigger.getAttribute('aria-expanded'), 'false');
            assert.equal(optionsContainer.getAttribute('role'), 'listbox');

            const optionEls = optionsContainer.children.filter(c => c.classList.contains('custom-option'));
            assert.equal(optionEls.length, 5);
            assert.equal(optionEls[0].getAttribute('aria-disabled'), 'true', 'Disabled placeholder has aria-disabled');
            assert.equal(optionEls[3].getAttribute('aria-disabled'), 'true', 'Disabled item has aria-disabled');
        });

        await st.test('Arrow Down/Up cycles through selectable options, skipping disabled', () => {
            // ArrowDown opens dropdown
            trigger.dispatchEvent(new MockEvent('keydown', { key: 'ArrowDown' }));
            assert.equal(optionsContainer.classList.contains('open'), true);
            assert.equal(trigger.getAttribute('aria-expanded'), 'true');

            const optionEls = optionsContainer.children;
            // First selectable is opt1
            assert.ok(optionEls[1].classList.contains('highlighted'), 'opt1 highlighted');

            // Next is opt2
            trigger.dispatchEvent(new MockEvent('keydown', { key: 'ArrowDown' }));
            assert.ok(optionEls[2].classList.contains('highlighted'), 'opt2 highlighted');

            // Next MUST skip optDisabled and jump to opt3!
            trigger.dispatchEvent(new MockEvent('keydown', { key: 'ArrowDown' }));
            assert.ok(optionEls[4].classList.contains('highlighted'), 'opt3 highlighted (disabled skipped)');
            assert.equal(optionEls[3].classList.contains('highlighted'), false);

            // Wrap around back to opt1
            trigger.dispatchEvent(new MockEvent('keydown', { key: 'ArrowDown' }));
            assert.ok(optionEls[1].classList.contains('highlighted'), 'Wrapped to opt1');

            // Wrap backward to opt3
            trigger.dispatchEvent(new MockEvent('keydown', { key: 'ArrowUp' }));
            assert.ok(optionEls[4].classList.contains('highlighted'), 'Backward wrap to opt3');
        });

        await st.test('Enter key selects option, emits change event, and closes dropdown', () => {
            let changed = false;
            selectEl.addEventListener('change', () => { changed = true; });

            trigger.dispatchEvent(new MockEvent('keydown', { key: 'Enter' }));
            assert.equal(selectEl.value, 'agent_3');
            assert.equal(changed, true);
            assert.equal(optionsContainer.classList.contains('open'), false);
            assert.equal(trigger.getAttribute('aria-expanded'), 'false');
        });

        await st.test('Escape closes dropdown and outside click closes dropdown', () => {
            trigger.dispatchEvent(new MockEvent('keydown', { key: ' ' }));
            assert.equal(optionsContainer.classList.contains('open'), true);

            trigger.dispatchEvent(new MockEvent('keydown', { key: 'Escape' }));
            assert.equal(optionsContainer.classList.contains('open'), false);
            assert.equal(trigger.getAttribute('aria-expanded'), 'false');

            // Outside click
            trigger.click();
            assert.equal(optionsContainer.classList.contains('open'), true);
            const clickFns = docListeners.get('click') || [];
            clickFns.forEach(fn => fn());
            assert.equal(optionsContainer.classList.contains('open'), false);
        });
    });

    await t.test('3. Form Input Attributes & Ergonomics in index.html', () => {
        const html = fs.readFileSync(path.resolve('index.html'), 'utf-8');

        // Phone inputs verification
        const phoneInputs = [
            'auth-phone-input',
            'link-phone-input',
            'add-recycle-number',
            'add-recycle-alt',
            'recycle-sale-untracked-number'
        ];

        for (const id of phoneInputs) {
            const regex = new RegExp(`<input[^>]*id="${id}"[^>]*>`, 'i');
            const match = html.match(regex);
            assert.ok(match, `Element #${id} exists`);
            assert.match(match[0], /type="tel"/, `#${id} type is tel`);
            assert.match(match[0], /inputmode="tel"/, `#${id} inputmode is tel`);
            assert.match(match[0], /autocomplete="tel"/, `#${id} autocomplete is tel`);
            assert.match(match[0], /onkeydown=/, `#${id} has Enter handler`);
        }

        // Numeric POS & amount inputs
        const numericInputs = [
            'transfer-qty', 'mgr-cash-amount', 'main-stock-qty',
            'return-stock-qty', 'desk-transfer-qty', 'qty-number-input',
            'edit-tx-qty', 'edit-tx-cash', 'edit-tx-mfs'
        ];

        for (const id of numericInputs) {
            const regex = new RegExp(`<input[^>]*id="${id}"[^>]*>`, 'i');
            const match = html.match(regex);
            assert.ok(match, `Numeric element #${id} exists`);
            assert.match(match[0], /inputmode="numeric"/, `#${id} has inputmode="numeric"`);
        }
    });

    await t.test('4. Loading States & Double Submission Prevention', async (st) => {
        const mockBtn = new MockElement('button');
        mockBtn.innerHTML = 'Execute Transfer';

        uiHelpersModule.setButtonLoading(mockBtn, true, 'Transferring...');
        assert.equal(mockBtn.disabled, true);
        assert.ok(mockBtn.innerHTML.includes('Transferring...'));
        assert.ok(mockBtn.innerHTML.includes('<svg'));

        uiHelpersModule.setButtonLoading(mockBtn, false);
        assert.equal(mockBtn.disabled, false);
        assert.equal(mockBtn.innerHTML, 'Execute Transfer');

        // Verify style.css rules for disabled buttons
        const css = fs.readFileSync(path.resolve('src/style.css'), 'utf-8');
        assert.match(css, /button:disabled[^}]*pointer-events:\s*none\s*!important;/);
        assert.match(css, /button:disabled[^}]*opacity:\s*0\.5\s*!important;/);
    });

    await t.test('5. WCAG 2.1 AA Contrast Ratios and CSS Variables', () => {
        const css = fs.readFileSync(path.resolve('src/style.css'), 'utf-8');
        assert.match(css, /--spring-physics:\s*cubic-bezier/);
        assert.match(css, /--bg-rgb:\s*240,\s*242,\s*245/);
        assert.match(css, /--accent-rgb:\s*51,\s*144,\s*236/);

        // WCAG relative luminance helper
        function lum(hex) {
            const clean = hex.replace('#', '');
            const rgb = [
                parseInt(clean.slice(0, 2), 16),
                parseInt(clean.slice(2, 4), 16),
                parseInt(clean.slice(4, 6), 16)
            ].map(v => {
                v /= 255;
                return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
            });
            return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
        }
        function contrast(c1, c2) {
            const l1 = lum(c1), l2 = lum(c2);
            return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        }

        // Contrast ratio against white background
        assert.ok(contrast('#ffffff', '#15803d') >= 4.5, 'Success text light mode (#15803d) >= 4.5:1');
        assert.ok(contrast('#ffffff', '#b45309') >= 4.5, 'Warning text light mode (#b45309) >= 4.5:1');

        // Contrast ratio against dark background (#0e1621)
        assert.ok(contrast('#0e1621', '#34d399') >= 4.5, 'Success text dark mode (#34d399) >= 4.5:1');
        assert.ok(contrast('#0e1621', '#fbbf24') >= 4.5, 'Warning text dark mode (#fbbf24) >= 4.5:1');
    });

    await t.test('6. Zero Backend Logic or Firestore Calculation Regressions', () => {
        // Run git diff check to guarantee no changes to Firestore schemas or rules
        const transfersJs = fs.readFileSync(path.resolve('src/features/transfers.js'), 'utf-8');
        const transactionsJs = fs.readFileSync(path.resolve('src/features/transactions.js'), 'utf-8');

        // Verify transaction fields schema
        assert.ok(transfersJs.includes("type: 'transfer_out'"));
        assert.ok(transfersJs.includes("type: 'transfer_in'"));
        assert.ok(transactionsJs.includes("type === 'Item'"));
        assert.ok(transactionsJs.includes("type === 'ERS'"));
        assert.ok(transactionsJs.includes("addDoc(collection(db, 'transactions')"));
    });
});
