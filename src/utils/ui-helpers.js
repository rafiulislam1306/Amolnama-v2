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
    document.body.appendChild(msg); 
    
    setTimeout(() => {
        msg.classList.add('fade-out');
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
//    NATIVE BOTTOM SHEET DRAG PHYSICS
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
            
            // Prevent mobile browser pull-to-refresh while actively dragging the sheet
            e.preventDefault();
            
            currentY = e.touches[0].clientY;
            let delta = currentY - startY;
            // Only allow dragging downwards (positive delta)
            if (delta > 0) {
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