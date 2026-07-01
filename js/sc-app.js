/**
 * sc-config.js — Configuration globale du système Steinkamp Container
 * Centralise les paramètres utilisés par tous les modules
 */

window.SC_CONFIG = {
  siteName: 'Steinkamp Container GmbH',
  siteEmail: 'info@steinkamp-container.com',
  backendUrl: window.location.protocol + '//' + window.location.host + window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/')) + '/send_order.php',
  defaultLang: 'de',
  supportedLangs: ['de', 'en', 'it', 'fr', 'nl'],
  langNames: {
    de: '🇩🇪 Deutsch',
    en: '🇬🇧 English',
    it: '🇮🇹 Italiano',
    fr: '🇫🇷 Français',
    nl: '🇳🇱 Nederlands'
  },
  langFlags: {
    de: '🇩🇪',
    en: '🇬🇧',
    it: '🇮🇹',
    fr: '🇫🇷',
    nl: '🇳🇱'
  }
};
