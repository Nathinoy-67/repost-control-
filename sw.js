// Service worker minimal — juste pour rendre l'app installable ("Ajouter à l'écran d'accueil").
// Pas de cache agressif : on veut toujours la dernière version du code.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {}); // no-op, laisse passer le réseau normalement
