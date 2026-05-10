// src/features/pwa.js
import { showAppAlert } from '../utils/ui-helpers.js';

export function initPWA() {
    // ==========================================
    //    SERVICE WORKER FOR PWA INSTALL
    // ==========================================
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)
              .then(reg => {
                  console.log('Service Worker registered:', reg);
                  reg.update();
                  reg.addEventListener('updatefound', () => {
                      const newWorker = reg.installing;
                      newWorker.addEventListener('statechange', () => {
                          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                              showAppAlert(
                                  "App Update Available", 
                                  "A new version of Amolnama has been downloaded. Please refresh to apply the update.",
                                    true,
                                    () => {
                                        newWorker.postMessage({ type: 'SKIP_WAITING' });
                                        setTimeout(() => window.location.reload(), 200);
                                    },
                                    "Refresh Now"
                              );
                          }
                      });
                  });
              })
              .catch(err => console.error('Service Worker registration failed:', err));
        });
        
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (!refreshing) {
                refreshing = true;
                window.location.reload();
            }
        });
    }

    // ==========================================
    //    NATIVE APP INSTALL PROMPT
    // ==========================================
    let deferredPrompt;
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        const installBtn = document.getElementById('install-app-btn');
        if (installBtn) installBtn.style.display = 'flex';
    });

    export async function installPWA() {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            document.getElementById('install-app-btn').style.display = 'none';
        }
        deferredPrompt = null;
    }

    window.addEventListener('appinstalled', () => {
        const installBtn = document.getElementById('install-app-btn');
        if (installBtn) installBtn.style.display = 'none';
        deferredPrompt = null;
    });
}