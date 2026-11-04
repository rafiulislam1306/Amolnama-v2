# Project: Amolnama-v2 UI/UX Polish & Modernization

## Architecture
The application is a Vanilla JavaScript POS web application bundled via Vite with CSS tokens defined in `src/style.css` and HTML structure in `index.html`. 
All changes are strictly bounded to the user interface and user experience layers (styling, visual hierarchy, viewport responsiveness, tactile micro-interactions, form ergonomics, loading feedback, accessibility, and contrast compliance). Backend Firestore schemas, transaction integrity, authentication flows, and business rules remain completely untouched.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | CSS Tokens & Dark Mode Polish | Define `--spring-physics`, `--bg-rgb`, `--accent-rgb`, fix dark mode sticky header blur | M1 | survey_1 |
| 2 | CSS Disabled States | Add comprehensive `:disabled` and `button[disabled]` styling across CSS | M1 | survey_3 |
| 3 | Keypad CTA Differentiation | Distinct visual gradients for ERS Cash (emerald) vs MFS (indigo/purple) buttons | M1 | survey_1 |
| 4 | WCAG AA Contrast Compliance | Replace low-contrast `#10b981` and `#f59e0b` text with theme tokens; fix PDF button semantics | M1 | survey_1 |
| 5 | Viewport Responsiveness | Constrain ERS keypad on desktop (max-width 460px); multi-column grid for Floor on desktop | M2 | survey_1, survey_2 |
| 6 | Fullscreen Modal Desktop Sizing | Responsive dialog bounds for admin modals on tablet/desktop viewports | M2 | survey_1 |
| 7 | Bottom Nav Grid Alignment | Dynamically adapt bottom nav columns when manager hides ERS/Store | M2 | survey_2 |
| 8 | Floor Map Empty State | Upgrade unstyled empty floor text to unified `.empty-state` component | M2 | survey_2 |
| 9 | Accessible Custom Dropdowns | Add keyboard navigation (Enter/Space/Arrows), ARIA combobox roles, and fix disabled option selection | M3 | survey_3 |
| 10 | Bottom-Sheet Drag Physics Fix | Exclude fullscreen admin modals from touch sheet-drag physics | M3 | survey_3 |
| 11 | Form Input Ergonomics | Add `inputmode="numeric"`, `type="tel"`, and Enter-to-submit on modal inputs | M3 | survey_3 |
| 12 | Corrupted Unicode Characters | Replace `\uFFFD` corrupted glyphs in `transfers.js` dropdown strings | M3 | survey_3 |
| 13 | Quantity Modal Range Sync | Align slider max (100) and numeric input max in `#modal-quantity` | M3 | survey_3 |
| 14 | Async Submission Feedback | Add loading spinners / disable triggers during modal form writes | M4 | survey_3 |
| 15 | Date Picker Icon Preservation | Retain calendar SVG icon when updating `#financial-date-label` | M4 | survey_3 |
| 16 | Transaction Card Affordance | Add subtle chevron `⌄` indicating expandable Edit/Trash actions | M4 | survey_2 |
| 17 | Comprehensive Verification & Report | Run test suite, build check, verify zero regressions, document UI/UX assessment | M5 | original_req |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Design System & Styling Foundation | CSS tokens, dark mode header fix, `:disabled` styles, ERS CTA differentiation, WCAG contrast | none | PLANNED |
| M2 | App Shell & Viewport Responsiveness | ERS desktop constraint, floor responsive grid, fullscreen modal bounds, bottom nav manager grid, floor empty state | M1 | PLANNED |
| M3 | Interactive Controls & Form Ergonomics | Accessible custom dropdowns, sheet drag exclusions, inputmode, Enter-submit, Unicode cleanup, quantity slider | M1 | PLANNED |
| M4 | Async Feedback & View Polish | Submission loading states, date picker SVG preservation, transaction card chevron affordance | M1, M2, M3 | PLANNED |
| M5 | Verification & UI/UX Assessment Report | Automated test suite execution, Vite production build, regression check, deliverable report | M1, M2, M3, M4 | PLANNED |

## Interface Contracts
### Styling Tokens (`src/style.css`)
- `--spring-physics`: `cubic-bezier(0.175, 0.885, 0.32, 1.275)` in `:root`
- `--bg-rgb`: `240, 242, 245` in light mode; `14, 22, 33` in dark mode
- `--accent-rgb`: `51, 144, 236` in light mode; `56, 189, 248` in dark mode
- `button:disabled, .btn:disabled, .action-btn:disabled`: opacity `0.5`, `cursor: not-allowed`, `pointer-events: none`

### Helpers & Utilities (`src/utils/ui-helpers.js`)
- `initCustomDropdowns()`: generates focusable elements (`tabindex="0"`, `role="combobox"`), handles keydown (Enter, Space, ArrowUp, ArrowDown, Escape), ignores `opt.disabled`
- `setupBottomSheetDrag()`: ignores selector `#modal-nicknames, #modal-trash, #modal-audit, #modal-recycle-tracker, #modal-call-rates, #modal-manage-rates, #modal-package-form`

## Code Layout
- `src/style.css`: Global styles, CSS variables, dark mode media queries, responsive layouts, button & card classes
- `index.html`: DOM shell, navigation header/footer, modal dialogs, SVG icons
- `src/utils/ui-helpers.js`: Custom dropdowns, modal drag physics, flash messages, alerts
- `src/features/transfers.js`: Cash actions, main stock, return stock, desk transfers modal logic
- `src/features/transactions.js`: ERS transaction handling, edit modal, trash management
- `src/features/reports.js`: Desk and Center ledger views, date picker label updating, history cards
- `src/features/catalog.js`: Store item cards, category badges
- `src/core/app-init.js`: App initialization, bottom navigation role visibility
