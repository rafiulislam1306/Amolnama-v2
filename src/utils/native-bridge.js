// src/utils/native-bridge.js
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { App } from '@capacitor/app';

/**
 * Checks if the application is running inside a native hybrid container.
 * @returns {boolean}
 */
export function isNative() {
    return Capacitor.isNativePlatform();
}

/**
 * Triggers a precise tactile haptic feedback.
 * Cascades gracefully from native iOS/Android haptic engines into web vibration, and then degrades silently.
 * @param {string} type - 'light', 'medium', 'heavy', 'success', 'warning', 'error', or 'selection'
 */
export async function triggerNativeHaptic(type = 'selection') {
    try {
        if (isNative()) {
            switch (type) {
                case 'light':
                    await Haptics.impact({ style: ImpactStyle.Light });
                    break;
                case 'medium':
                    await Haptics.impact({ style: ImpactStyle.Medium });
                    break;
                case 'heavy':
                    await Haptics.impact({ style: ImpactStyle.Heavy });
                    break;
                case 'success':
                    await Haptics.notification({ type: NotificationType.Success });
                    break;
                case 'warning':
                    await Haptics.notification({ type: NotificationType.Warning });
                    break;
                case 'error':
                    await Haptics.notification({ type: NotificationType.Error });
                    break;
                case 'selection':
                default:
                    await Haptics.selectionStart();
                    break;
            }
        } else if (navigator.vibrate) {
            // Web PWA fallback using standard browser vibration patterns
            switch (type) {
                case 'light':
                case 'selection':
                    navigator.vibrate(12);
                    break;
                case 'medium':
                    navigator.vibrate(25);
                    break;
                case 'heavy':
                    navigator.vibrate(45);
                    break;
                case 'success':
                    navigator.vibrate([15, 30, 15]);
                    break;
                case 'warning':
                    navigator.vibrate([35, 50, 20]);
                    break;
                case 'error':
                    navigator.vibrate([60, 40, 60]);
                    break;
            }
        }
    } catch (err) {
        console.warn('Haptic feedback trigger failed:', err);
    }
}

/**
 * Orchestrates native back gestures to intercept Android back button.
 * Instead of quitting the app context, it closes open bottom sheets or rolls back tabs.
 */
export function setupNativeNavigation() {
    if (!isNative()) return;

    App.addListener('backButton', async (event) => {
        // 1. If an active modal overlay is open, dismiss it
        const activeOverlay = Array.from(document.querySelectorAll('.modal-overlay.active'))
            .filter(el => !['modal-auth', 'splash-screen'].includes(el.id))
            .pop();

        if (activeOverlay) {
            if (typeof window.closeModal === 'function') {
                window.closeModal(activeOverlay.id);
                triggerNativeHaptic('light');
                return;
            }
        }

        // 2. If drawer peek header is active in tab-desk, return to standard drawer view
        const deskPeekHeader = document.getElementById('desk-peek-header');
        if (deskPeekHeader && deskPeekHeader.style.display !== 'none') {
            if (typeof window.handleMyDrawerNav === 'function') {
                window.handleMyDrawerNav();
                triggerNativeHaptic('light');
                return;
            }
        }

        // 3. Intercept tab navigation to return to the home tab (ers)
        const activeTab = document.querySelector('.tab-content.active');
        if (activeTab && activeTab.id !== 'tab-ers') {
            if (typeof window.switchTab === 'function') {
                window.switchTab('ers', 'Amolnama');
                triggerNativeHaptic('selection');
                return;
            }
        }

        // 4. If already on home screen and no overlays, double back exits app
        triggerNativeHaptic('warning');
        App.exitApp();
    });
}
