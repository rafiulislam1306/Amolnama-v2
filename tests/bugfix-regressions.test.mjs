// tests/bugfix-regressions.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const readSrc = (...parts) => fs.readFileSync(path.join(rootDir, ...parts), 'utf-8');

test('Suite: Bugfix & Security Regression Verification', async (t) => {
    await t.test('1. Helper sanitization and formatting utilities', async () => {
        const {
            escapeHtml,
            escapeJsSingleQuote,
            formatUserIdentifier,
            formatLocalISODate
        } = await import('../src/utils/helpers.js');

        assert.equal(
            escapeHtml(`<script>alert("x&'y")</script>`),
            `&lt;script&gt;alert(&quot;x&amp;'y&quot;)&lt;/script&gt;`
        );
        assert.equal(escapeHtml(null), '');
        assert.equal(escapeHtml(0), '0');

        assert.equal(
            escapeJsSingleQuote(`O'Brien\n<test>`),
            `O\\'Brien\\n&lt;test&gt;`
        );

        assert.equal(formatUserIdentifier('phone_01712345678@amolnama.internal'), 'Phone: 01712345678');
        assert.equal(formatUserIdentifier('agent@example.com'), 'agent@example.com');
        assert.equal(formatUserIdentifier(''), 'No Email Linked');

        const localDate = new Date(2026, 2, 5, 23, 45, 0);
        assert.equal(formatLocalISODate(localDate), '2026-03-05');
    });

    await t.test('2. FOC Govt SIM item is marked managerOnly and gated in catalog.js', async () => {
        const { defaultCatalog } = await import('../src/core/constants.js');
        assert.equal(defaultCatalog.foc_govt?.managerOnly, true);

        const catalogCode = readSrc('src', 'features', 'catalog.js');
        assert.match(catalogCode, /if\s*\(item\.managerOnly\s*&&\s*AppState\.currentUserRole\s*!==\s*'center_manager'\)\s*return;/);
    });

    await t.test('3. rates.js uses showAppAlert instead of broken executeAlertConfirm call', () => {
        const ratesCode = readSrc('src', 'features', 'rates.js');
        assert.doesNotMatch(ratesCode, /executeAlertConfirm/);
        assert.match(ratesCode, /showAppAlert\(\s*["']Confirm Delete["']/);
    });

    await t.test('4. recycle.js fixes date parsing, note clearing, firewall ordering, and agent attribution', () => {
        const recycleCode = readSrc('src', 'features', 'recycle.js');

        // Local YYYY-MM-DD date parsing instead of UTC new Date(dateStr)
        assert.match(recycleCode, /const parts = String\(dateStr \|\| ''\)\.split\('-'\)/);
        assert.match(recycleCode, /new Date\(Number\(parts\[0\]\), Number\(parts\[1\]\) - 1, Number\(parts\[2\]\)\)/);

        // Clearing notes must persist empty string instead of falling back to sim.notes
        assert.match(recycleCode, /\bnotes:\s*note\s*,/);
        assert.doesNotMatch(recycleCode, /notes:\s*note\s*\|\|\s*sim\.notes/);

        // Stock firewall runs before promptSimOnboarding / saving
        const fnStart = recycleCode.indexOf('export async function confirmRecycleSimSale()');
        const firewallPos = recycleCode.indexOf('passStockFirewall(catalogItem.name, 1)', fnStart);
        const onboardingPos = recycleCode.indexOf('promptSimOnboarding(', fnStart);
        assert.ok(fnStart !== -1 && firewallPos !== -1 && onboardingPos !== -1);
        assert.ok(firewallPos < onboardingPos, 'passStockFirewall must execute before onboarding prompt');

        // Completed SIM soldBy uses logged-in AppState user instead of status-update-agent dropdown
        assert.doesNotMatch(
            recycleCode.slice(fnStart),
            /getElementById\(['"]status-update-agent['"]\)/
        );
    });

    await t.test('5. transfers.js clamps transfer suggestions to available stock', () => {
        const transfersCode = readSrc('src', 'features', 'transfers.js');
        assert.match(transfersCode, /let availableStock = getAvailableStock\(itemName\)/);
        assert.match(transfersCode, /let suggestion = Math\.min\(maxSendable,\s*Math\.max\(0,\s*targetPerAgent - targetCurrentStock\)\)/);
    });

    await t.test('6. reports.js cash_actions filter and XPath removal', () => {
        const reportsCode = readSrc('src', 'features', 'reports.js');
        assert.doesNotMatch(reportsCode, /document\.evaluate\s*\(/);
        assert.match(reportsCode, /filterVal === 'cash_actions' && tx\.type === 'adjustment'\)\s*showTx = true/);
        assert.doesNotMatch(reportsCode, /filterVal === 'cash_actions' && tx\.type === 'adjustment' && tx\.name === 'Physical Cash'/);
    });

    await t.test('7. desk.js and admin.js avoid invalid merge options on updateDoc/batch.update and normalize trackAs', () => {
        const deskCode = readSrc('src', 'features', 'desk.js');
        const adminCode = readSrc('src', 'features', 'admin.js');

        assert.doesNotMatch(deskCode, /updateDoc\([^;]*\{\s*merge:\s*true\s*\}/);
        assert.doesNotMatch(adminCode, /batch\.update\([^;]*\{\s*merge:\s*true\s*\}/);

        assert.match(deskCode, /getNormalizedTrackAs\(tx\.trackAs\)/);
        assert.match(adminCode, /getNormalizedTrackAs\(tx\.trackAs\)/);
    });

    await t.test('8. PWA postbuild and service worker resilience', () => {
        const postbuildCode = readSrc('scripts', 'postbuild.js');
        const swCode = readSrc('public', 'sw.js');

        assert.match(postbuildCode, /__BUILD_HASH__/);
        assert.match(swCode, /Promise\.allSettled/);
        assert.match(swCode, /withBase\(['"]\/manifest\.json['"]\)/);
    });

    await t.test('9. index.html uses a single <main id="app-main"> and <section> tabs without inline style overrides', () => {
        const indexHtml = readSrc('index.html');
        const mainMatches = indexHtml.match(/<main\b/g) || [];
        assert.equal(mainMatches.length, 1, 'Document should have exactly one <main> landmark');
        assert.match(indexHtml, /<main id="app-main">/);
        assert.match(indexHtml, /<section id="tab-ers" class="tab-content active">/);
        assert.doesNotMatch(indexHtml, /#modal-close-desk\s+\.modal-content::before/);
    });
});
