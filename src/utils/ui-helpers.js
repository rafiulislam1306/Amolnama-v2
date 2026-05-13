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

export function showFlashMessage(text) {
    if (navigator.vibrate) navigator.vibrate(50); 
    let msg = document.createElement('div'); 
    msg.className = 'flash-pill';
    msg.innerHTML = `${text}`;
    
    // Inject smooth, native-feeling slide animation directly
    msg.style.cssText = `
        position: fixed; top: calc(24px + env(safe-area-inset-top)); left: 50%; transform: translateX(-50%) translateY(-20px);
        background: #1e293b; color: #f8fafc; padding: 12px 24px; border-radius: 99px;
        font-weight: 600; font-size: 0.9rem; box-shadow: 0 4px 16px rgba(0,0,0,0.2);
        z-index: 100000; opacity: 0; transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        white-space: nowrap; pointer-events: none; text-align: center;
    `;
    
    document.body.appendChild(msg); 
    
    // Trigger slide up
    setTimeout(() => {
        msg.style.transform = 'translateX(-50%) translateY(0)';
        msg.style.opacity = '1';
    }, 10);

    // Trigger slide up and remove
    setTimeout(() => {
        msg.style.transform = 'translateX(-50%) translateY(-20px)';
        msg.style.opacity = '0';
        setTimeout(() => msg.remove(), 300);
    }, 2700);
}

export function openModal(modalId) { 
    document.getElementById(modalId).classList.add('active'); 
}

export function closeModal(modalId) { 
    document.getElementById(modalId).classList.remove('active'); 
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
        const banner = document.getElementById('offline-banner');
        if (!banner) return;
        
        if (!navigator.onLine) {
            banner.style.display = 'block';
        } else {
            // Only show the back online message if the banner was actually visible
            if (banner.style.display === 'block') {
                showFlashMessage("Back Online! Syncing...");
            }
            banner.style.display = 'none';
        }
    }

    // Listen for network changes in real-time
    window.addEventListener('online', updateNetworkStatus);
    window.addEventListener('offline', updateNetworkStatus);

    // Run a check immediately when the app loads
    updateNetworkStatus();
}

// ==========================================
//   NATIVE BOTTOM SHEET DRAG PHYSICS
// ==========================================
export function setupBottomSheetDrag() {
    document.querySelectorAll('.bottom-sheet').forEach(sheet => {
        let startY = 0;
        let currentY = 0;
        let isDragging = false;

        sheet.addEventListener('touchstart', (e) => {
            // Only allow the sheet to be dragged if the user is scrolled to the very top
            if (sheet.scrollTop > 0) return;
            
            startY = e.touches[0].clientY;
            isDragging = true;
            
            // Remove CSS animation transitions so the sheet sticks to the thumb perfectly 1:1
            sheet.style.transition = 'none';
        }, { passive: true });

        sheet.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            
            currentY = e.touches[0].clientY;
            let delta = currentY - startY;
            
            // FIX: Only prevent default scroll if the user is pulling DOWN to close the modal
            if (delta > 0) {
                e.preventDefault();
                sheet.style.transform = `translateY(${delta}px)`;
            } else {
                // If they are pulling UP (to scroll down the content), let the browser handle it natively!
                isDragging = false;
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
            trigger.innerHTML = `<span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 12px;">${selectedText}</span> 
                                 <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;"><polyline points="6 9 12 15 18 9"/></svg>`;

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