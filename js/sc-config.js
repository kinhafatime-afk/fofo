/**
 * sc-config.js — Steinkamp Container · Configuration centrale
 * ─────────────────────────────────────────────────────────────
 * Ce fichier définit les constantes globales utilisées par tous
 * les modules JS du projet (panier, traductions, formulaires).
 */
window.SC_CONFIG = {
  /* Email destinataire des commandes (ne pas modifier sans accord) */
  ORDER_EMAIL: 'info@steinkamp-container.com',
  /* Langue par défaut */
  DEFAULT_LANG: 'de',
  /* Langues disponibles */
  LANGUAGES: ['de', 'en', 'fr', 'nl', 'it'],
  /* Clé de stockage localStorage pour le panier */
  CART_KEY: 'sc_cart_v1',
  /* Clé de stockage localStorage pour la langue active */
  LANG_KEY: 'sc_lang',
  /* URL du script PHP d'envoi de commande (serveur local) */
  MAILER_URL: 'send_order.php',
  /* Devise */
  CURRENCY: '€',
  CURRENCY_CODE: 'EUR',
};
