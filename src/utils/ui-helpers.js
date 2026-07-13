// src/utils/ui-helpers.js

let alertConfirmCallback = null;

export function showAppAlert(title, message, isConfirm = false, confirmCallback = null, confirmText = "OK") {
    if (navigator.vibrate) navigator.vibrate([50, 50, 50]); 
    
    document.getElementById('app-alert-title').innerText = title;
    document.getElementById('app-alert-message').innerText = message;
    
    let cancelBtn = document.getElementById('app-alert-cancel');
    let confirmBtn = document.getElementById('app-alert-confirm');
    let iconBox = document.getElementById('app-alert-icon');
    
    confirmBtn.innerText = confirmText;
    
    if (isConfirm) {
        cancelBtn.style.display = 'block';
        iconBox.style.color = '#f59e0b'; 
        iconBox.innerHTML = '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>';
        confirmBtn.style.background = 'var(--accent-color)';
    } else {
        cancelBtn.style.display = 'none';
        iconBox.style.color = '#ef4444'; 
        iconBox.innerHTML = '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>';
        confirmBtn.style.background = '#ef4444'; 
    }
    
    alertConfirmCallback = confirmCallback;
    openModal('modal-app-alert');
}

export function executeAlertConfirm() {
    closeModal('modal-app-alert');
    if (alertConfirmCallback) alertConfirmCallback();
}

// Exposed globally for compatibility with transaction saves
window.renderOfflineBanner = function(count) {
    if (window.updateNetworkStatus) window.updateNetworkStatus();
}

export function showFlashMessage(text) {
    if (navigator.vibrate) navigator.vibrate(50); 
    let msg = document.createElement('div'); 
    msg.className = 'flash-pill';
    // Use innerText to completely prevent Cross-Site Scripting (XSS)
    msg.innerText = text;
    
    // Inject smooth, native-feeling slide and scale spring animation directly
    msg.style.cssText = `
        position: fixed; top: calc(24px + env(safe-area-inset-top)); left: 50%; transform: translateX(-50%) translateY(-20px) scale(0.9);
        background: rgba(18, 12, 38, 0.85); color: #ffffff; padding: 12px 24px; border-radius: 99px;
        font-weight: 700; font-size: 0.9rem; box-shadow: 0 12px 32px rgba(124, 58, 237, 0.25);
        border: 1px solid rgba(167, 139, 250, 0.2); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
        z-index: 100000; opacity: 0; transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        white-space: nowrap; pointer-events: none; text-align: center;
    `;
    
    document.body.appendChild(msg); 
    
    // Trigger slide down and scale up with spring physics
    setTimeout(() => {
        msg.style.transform = 'translateX(-50%) translateY(0) scale(1)';
        msg.style.opacity = '1';
    }, 10);

    // Trigger slide up, scale down and remove
    setTimeout(() => {
        msg.style.transform = 'translateX(-50%) translateY(-20px) scale(0.9)';
        msg.style.opacity = '0';
        setTimeout(() => msg.remove(), 400);
    }, 2700);
}

export function openModal(modalId) { 
    document.getElementById(modalId).classList.add('active'); 
}

export function closeModal(modalId) { 
    const overlay = document.getElementById(modalId);
    if (!overlay) return;
    overlay.classList.remove('active');
    // Reset any inline transform/opacity left behind by drag physics or animation forwards-fill
    const content = overlay.querySelector('.modal-content, .bottom-sheet');
    if (content) {
        content.style.transform = '';
        content.style.transition = '';
        content.style.opacity = '';
    }
}

export function showTooltip(element, text) {
    document.querySelectorAll('.mobile-tooltip').forEach(el => el.remove());
    
    let tooltip = document.createElement('div');
    tooltip.className = 'mobile-tooltip';
    tooltip.innerText = text;
    document.body.appendChild(tooltip);
    
    let rect = element.getBoundingClientRect();
    
    tooltip.style.left = (rect.left + (rect.width / 2)) + 'px';
    tooltip.style.top = (rect.top - 10) + 'px'; 
    
    setTimeout(() => tooltip.classList.add('show'), 10);
    
    setTimeout(() => {
        tooltip.classList.remove('show');
        setTimeout(() => tooltip.remove(), 200); 
    }, 2500);
}

// ==========================================
//    NETWORK STATUS ENGINE
// ==========================================
export function initNetworkStatus() {
    function updateNetworkStatus() {
        const offlineTxs = JSON.parse(localStorage.getItem('amolnama_offline_txs') || '[]');
        const offlineSessions = JSON.parse(localStorage.getItem('amolnama_offline_sessions') || '[]');
        const count = offlineTxs.length + offlineSessions.length;

        // Hide static index.html red banner since we are using our unified dynamic banner
        const staticRedBanner = document.getElementById('offline-banner');
        if (staticRedBanner) staticRedBanner.style.display = 'none';

        let banner = document.getElementById('offline-sync-banner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'offline-sync-banner';
            banner.style.cssText = `
                position: fixed; top: 0; left: 0; right: 0; z-index: 100000;
                color: #fff; padding: 10px 16px;
                font-weight: 600; font-size: 0.85rem; text-align: center;
                display: flex; justify-content: space-between; align-items: center;
                transition: all 0.3s ease;
                padding-top: calc(10px + env(safe-area-inset-top));
            `;
            document.body.appendChild(banner);
        }

        const appContainer = document.querySelector('.app-container');

        if (!navigator.onLine) {
            banner.style.background = count > 0 ? '#f59e0b' : '#ef4444';
            banner.style.boxShadow = count > 0 ? '0 4px 12px rgba(245, 158, 11, 0.3)' : '0 4px 12px rgba(239, 68, 68, 0.3)';
            
            banner.innerHTML = count > 0 
                ? `<span>⚠️ Offline: ${count} pending sales queued</span> <span style="font-size: 0.72rem; opacity: 0.9; font-weight: 700;">Reconnect to sync</span>`
                : `<div style="display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m2 2 20 20"/><path d="M8.53 8.53a9 9 0 0 1 11.23 3.86"/><path d="M4.68 4.68a13 13 0 0 0-2.6 1.74"/><path d="M2.08 9.5A13 13 0 0 1 4.5 7.1"/></svg>
                    OFFLINE - Changes Queued Locally
                   </div>`;
            
            banner.style.display = 'flex';
            if (appContainer) appContainer.style.marginTop = '45px';
        } else if (count > 0) {
            banner.style.background = '#0ea5e9';
            banner.style.boxShadow = '0 4px 12px rgba(14, 165, 233, 0.3)';
            banner.innerHTML = `
                <span style="display: flex; align-items: center; gap: 6px;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="animation: spin 1s linear infinite;"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                    Syncing Queue: ${count} pending sales...
                </span>
                <button onclick="if(window.syncOfflineTransactions) window.syncOfflineTransactions()" 
                        style="background: #fff; color: #0ea5e9; border: none; padding: 4px 10px; border-radius: 4px; font-weight: 800; cursor: pointer; text-transform: uppercase; font-size: 0.75rem;">
                    SYNC NOW
                </button>
            `;
            banner.style.display = 'flex';
            if (appContainer) appContainer.style.marginTop = '45px';

            // Auto-trigger sync on reconnection
            if (window.syncOfflineTransactions) {
                window.syncOfflineTransactions();
            }
        } else {
            banner.style.display = 'none';
            if (appContainer) appContainer.style.marginTop = '0';
        }
    }

    window.updateNetworkStatus = updateNetworkStatus;

    // Listen for network changes in real-time
    window.addEventListener('online', () => {
        showFlashMessage("Back Online! Syncing...");
        updateNetworkStatus();
    });
    window.addEventListener('offline', updateNetworkStatus);

    // Run a check immediately when the app loads
    updateNetworkStatus();
}

// ==========================================
//   NATIVE BOTTOM SHEET DRAG PHYSICS
// ==========================================
export function setupBottomSheetDrag() {
    document.querySelectorAll('.bottom-sheet, .modal-content').forEach(sheet => {
        // Exclude full-screen modals and popups that shouldn't be swipe-closed
        if (sheet.closest('#modal-app-alert, #modal-auth, #modal-settings, #modal-desk-select, #modal-close-desk')) return; 

        let startY = 0;
        let currentY = 0;
        let isDragging = false;
        let activeScrollEl = null;

        sheet.addEventListener('touchstart', (e) => {
            startY = e.touches[0].clientY;
            currentY = startY; 
            isDragging = true;
            
            // Dynamically find the innermost scrollable container the user touched
            activeScrollEl = null;
            let el = e.target;
            while (el && el !== sheet && el !== document.body) {
                const style = window.getComputedStyle(el);
                if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
                    activeScrollEl = el;
                    break;
                }
                el = el.parentElement;
            }

            // Remove CSS animation transitions so the sheet sticks to the thumb perfectly 1:1
            sheet.style.transition = 'none';
        }, { passive: true });

        sheet.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            
            currentY = e.touches[0].clientY;
            let delta = currentY - startY;

            // If we're interacting with a scrollable element
            if (activeScrollEl) {
                // If the element is scrolled down, let the native scroll handle everything
                if (activeScrollEl.scrollTop > 0) {
                    isDragging = false;
                    return;
                }
                
                // If it's at the top, but the user is pulling UP (scrolling down the list), let native scroll handle it
                if (delta < 0) {
                    isDragging = false;
                    return;
                }
            } else {
                // No scrollable element. If user pulls UP, just abort dragging (can't drag sheet up past the top)
                if (delta < 0) {
                    isDragging = false;
                    return;
                }
            }

            // At this point: 
            // - The user is pulling DOWN (delta > 0)
            // - They are either touching a non-scrollable area, OR a scrollable area that is pinned to the very top.
            // We intercept this to drag the sheet.
            if (delta > 0) {
                e.preventDefault();
                sheet.style.transform = `translateY(${delta}px)`;
            }
        }, { passive: false });

        sheet.addEventListener('touchend', (e) => {
            if (!isDragging) return;
            isDragging = false;
            
            let delta = currentY - startY;
            let threshold = sheet.offsetHeight * 0.25; // 25% threshold to trigger a close
            
            // Re-apply the smooth bezier transition for the snap-back or close animation
            sheet.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)';

            if (delta > threshold) {
                // User dragged far enough -> Slide it completely off screen
                sheet.style.transform = `translateY(100%)`;
                
                // Wait for the animation to finish, then safely remove it from the DOM
                setTimeout(() => {
                    let modal = sheet.closest('.modal-overlay');
                    if (modal) closeModal(modal.id);
                    
                    // Reset the inline styles so it works normally the next time it's opened
                    setTimeout(() => { sheet.style.transform = ''; sheet.style.transition = ''; }, 50);
                }, 250);
            } else {
                // User didn't drag far enough -> Snap it smoothly back into place
                sheet.style.transform = 'translateY(0)';
                setTimeout(() => { sheet.style.transform = ''; sheet.style.transition = ''; }, 250);
            }
        });
    });
}

// ==========================================
//   CUSTOM UI DROPDOWN GENERATOR
// ==========================================
export function initCustomDropdowns() {
    const selects = document.querySelectorAll('select.settings-input');

    selects.forEach(select => {
        // Skip if already converted
        if (select.closest('.custom-select-wrapper')) return;

        // Hide original select completely
        select.style.display = 'none';

        // Create the wrapper architecture
        const wrapper = document.createElement('div');
        wrapper.className = 'custom-select-wrapper';
        select.parentNode.insertBefore(wrapper, select);
        wrapper.appendChild(select);

        const trigger = document.createElement('div');
        trigger.className = 'custom-select-trigger';
        
        const optionsContainer = document.createElement('div');
        optionsContainer.className = 'custom-options';

        wrapper.appendChild(trigger);
        wrapper.appendChild(optionsContainer);

        // Core rendering logic
        const renderOptions = () => {
            optionsContainer.innerHTML = '';
            
            let selectedText = select.options[select.selectedIndex]?.text || 'Select...';
            // Render HTML structure safely without the variable
            trigger.innerHTML = `<span class="custom-trigger-text" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 12px;"></span> 
                                 <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;"><polyline points="6 9 12 15 18 9"/></svg>`;
            // Inject text safely via innerText
            trigger.querySelector('.custom-trigger-text').innerText = selectedText;

            Array.from(select.children).forEach(child => {
                if (child.tagName === 'OPTGROUP') {
                    const groupLabel = document.createElement('div');
                    groupLabel.className = 'custom-optgroup';
                    groupLabel.innerText = child.label;
                    optionsContainer.appendChild(groupLabel);
                    Array.from(child.children).forEach(opt => createOptionEl(opt));
                } else if (child.tagName === 'OPTION') {
                    createOptionEl(child);
                }
            });
        };

        const createOptionEl = (opt) => {
            const optEl = document.createElement('div');
            optEl.className = 'custom-option';
            if (opt.selected) optEl.classList.add('selected');
            optEl.innerText = opt.text;
            
            optEl.addEventListener('click', (e) => {
                e.stopPropagation();
                select.value = opt.value; 
                select.dispatchEvent(new Event('change')); // Tell the app it changed!
                renderOptions(); 
                optionsContainer.classList.remove('open');
                trigger.classList.remove('open');
            });
            optionsContainer.appendChild(optEl);
        };

        renderOptions();

        // Magic: Auto-rebuild if the app adds new items to the original hidden select
        const observer = new MutationObserver(renderOptions);
        observer.observe(select, { childList: true });

        // Click to open logic
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            // Close any other open dropdowns first
            document.querySelectorAll('.custom-options.open').forEach(el => {
                if (el !== optionsContainer) {
                    el.classList.remove('open');
                    el.previousElementSibling.classList.remove('open');
                }
            });
            optionsContainer.classList.toggle('open');
            trigger.classList.toggle('open');
        });
    });

    // Close dropdowns if tapping outside
    document.addEventListener('click', () => {
        document.querySelectorAll('.custom-options.open').forEach(el => {
            el.classList.remove('open');
            el.previousElementSibling.classList.remove('open');
        });
    });
}