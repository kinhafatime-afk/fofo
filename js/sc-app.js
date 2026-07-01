/**
 * sc-app.js — Steinkamp Container · Application principale
 * ──────────────────────────────────────────────────────────
 * Ce module gère :
 *   1. Système de traduction i18n (5 langues, localStorage)
 *   2. Panier dynamique (ajout, modification, suppression, compteur)
 *   3. Synchronisation du compteur du panier dans toutes les pages
 *   4. Formulaire de commande (validation + envoi PHP via fetch)
 *   5. Formulaire de contact
 *   6. Navigation dynamique (menus, sous-menus)
 *   7. Boutons +/- de quantité dans le panier
 *
 * Dépendances : sc-config.js, sc-translations.js (chargés avant)
 */
(function () {
  'use strict';
  /* ═══════════════════════════════════════════════════════════════
     0. UTILITAIRES
  ═══════════════════════════════════════════════════════════════ */
  const CFG = window.SC_CONFIG || {};
  const T   = window.SC_TRANSLATIONS || {};
  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));
  /* formatage monétaire */
  function formatPrice(num) {
    return num.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '\u00a0' + (CFG.CURRENCY || '€');
  }
  /* ═══════════════════════════════════════════════════════════════
     1. SYSTÈME DE LANGUE (i18n)
  ═══════════════════════════════════════════════════════════════ */
  const I18N = {
    current: null,
    /* Récupère la langue enregistrée ou la langue par défaut */
    getLang() {
      return localStorage.getItem(CFG.LANG_KEY || 'sc_lang') || CFG.DEFAULT_LANG || 'de';
    },
    /* Change la langue, stocke le choix et retraduire la page */
    setLang(code) {
      if (!T[code]) { console.warn('[SC i18n] Langue inconnue:', code); return; }
      this.current = code;
      localStorage.setItem(CFG.LANG_KEY || 'sc_lang', code);
      this.applyTranslations(code);
      this.updateLangBar(code);
      document.documentElement.lang = code;
    },
    /* Applique les traductions à tous les éléments [data-i18n] */
    applyTranslations(code) {
      const dict = T[code] || T['de'] || {};
      $$('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const val = dict[key];
        if (val === undefined) return;
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
          el.placeholder = val;
        } else if (el.tagName === 'OPTION') {
          el.textContent = val;
        } else {
          el.textContent = val;
        }
      });
      /* Traduit les placeholders [data-i18n-placeholder] */
      $$('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        const val = dict[key];
        if (val) el.placeholder = val;
      });
    },
    /* Met à jour l'affichage du sélecteur de langue */
    updateLangBar(code) {
      const LANGS_META = {
        de: { flag: '🇩🇪', label: 'Deutsch' },
        en: { flag: '🇬🇧', label: 'English' },
        fr: { flag: '🇫🇷', label: 'Français' },
        nl: { flag: '🇳🇱', label: 'Nederlands' },
        it: { flag: '🇮🇹', label: 'Italiano' },
      };
      const meta = LANGS_META[code] || LANGS_META['de'];
      /* Mettre à jour tous les sélecteurs de langue sur la page */
      $$('.sc-current-label').forEach(el => {
        el.textContent = meta.flag + ' ' + meta.label;
      });
      /* Marquer l'option active */
      $$('.sc-lang-option').forEach(btn => {
        btn.classList.toggle('sc-lang-active', btn.dataset.code === code);
      });
    },
    /* Initialise le sélecteur de langue et ses événements */
    initLangBar() {
      const lang = this.getLang();
      this.setLang(lang);
      /* Ouvrir/fermer le dropdown */
      $$('.sc-lang-current').forEach(trigger => {
        trigger.addEventListener('click', () => {
          const bar = trigger.closest('#sc-lang-bar');
          if (bar) {
            const dropdown = bar.querySelector('.sc-lang-dropdown');
            const isOpen = bar.classList.toggle('sc-open');
            if (dropdown) dropdown.style.display = isOpen ? 'block' : 'none';
          }
        });
        /* Ferme au clic en dehors */
        document.addEventListener('click', (e) => {
          const bar = trigger.closest('#sc-lang-bar');
          if (bar && !bar.contains(e.target)) {
            bar.classList.remove('sc-open');
            const dropdown = bar.querySelector('.sc-lang-dropdown');
            if (dropdown) dropdown.style.display = 'none';
          }
        }, true);
      });
      /* Sélection de langue */
      $$('.sc-lang-option').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const code = btn.dataset.code;
          if (code) {
            I18N.setLang(code);
            /* Ferme le dropdown */
            $$('.sc-lang-bar, #sc-lang-bar').forEach(bar => {
              bar.classList.remove('sc-open');
              const dropdown = bar.querySelector('.sc-lang-dropdown');
              if (dropdown) dropdown.style.display = 'none';
            });
          }
        });
      });
    },
  };
  /* ═══════════════════════════════════════════════════════════════
     2. GESTIONNAIRE DE PANIER
  ═══════════════════════════════════════════════════════════════ */
  const CART = {
    items: [],
    /* Sync localStorage depuis le panier serveur WooCommerce (wc_fragments)
       Si WooCommerce ne fournit pas les fragments, on ne fait rien. */
    syncFromWooFragments() {
      try {
        const frag = window.wc_cart_fragments;
        if (!frag || !frag.cart_hash_key && !frag['div.widget_shopping_cart_content']) {
          /* On tente quand même, mais si pas de fragments utilisables => stop */
        }
        const html = frag && (frag['div.widget_shopping_cart_content'] || frag['.widget_shopping_cart_content'] || frag['div.widget_shopping_cart_content'] );
        if (!html) return;

        /* Parse DOM: on extrait les lignes cart_item et qty.
           WooCommerce rend généralement des liens remove et des inputs qty.
        */
        const wrapper = document.createElement('div');
        wrapper.innerHTML = html;
        const lineEls = wrapper.querySelectorAll('.cart_item');
        const serverItems = [];

        lineEls.forEach(li => {
          const idMatch = li.getAttribute('data-product_id') || li.querySelector('a.remove')?.getAttribute('data-product_id');
          const productId = idMatch ? String(idMatch) : (li.querySelector('a.remove')?.getAttribute('data-product_id') ? String(li.querySelector('a.remove').getAttribute('data-product_id')) : null);
          const qtyInput = li.querySelector('input.qty');
          const qty = qtyInput ? parseInt(qtyInput.value, 10) : 1;

          const name = li.querySelector('.product-name')?.textContent?.trim() || li.querySelector('.product-name a')?.textContent?.trim() || 'Produkt';
          const priceText = li.querySelector('.product-subtotal .woocommerce-Price-amount')?.textContent || li.querySelector('.product-price .woocommerce-Price-amount')?.textContent || '';
          const numeric = priceText.replace(/[^\d,\.]/g, '').replace(',', '.');
          const price = parseFloat(numeric) || 0;
          const image = li.querySelector('img')?.src || '';

          if (!productId) return;
          serverItems.push({ id: productId, name, price, image, qty: isNaN(qty) ? 1 : qty });
        });

        /* Nettoyage: remplace localStorage par état serveur */
        this.items = serverItems;
        this.save();
        this.updateAllCounters();
        this.renderCartPage();
        this.renderOrderSummary();
      } catch (e) {
        console.warn('[SC Cart] syncFromWooFragments failed:', e);
      }
    },
    /* ── Persistance ── */
    load() {
      try {
        const data = localStorage.getItem(CFG.CART_KEY || 'sc_cart_v1');
        this.items = data ? JSON.parse(data) : [];
      } catch (e) {
        this.items = [];
      }
    },
    save() {
      localStorage.setItem(CFG.CART_KEY || 'sc_cart_v1', JSON.stringify(this.items));
    },
    /* ── CRUD ── */
    addItem(product) {
      /* product = { id, name, price, image } */
      const existing = this.items.find(i => i.id === product.id);
      if (existing) {
        existing.qty += 1;
      } else {
        this.items.push({ ...product, qty: 1 });
      }
      this.save();
      this.updateAllCounters();
      this.showAddedNotice(product.name);
    },
    updateQty(id, qty) {
      const item = this.items.find(i => i.id === id);
      if (!item) return;
      if (qty <= 0) {
        this.removeItem(id);
        return;
      }
      item.qty = qty;
      this.save();
      this.updateAllCounters();
    },
    removeItem(id) {
      this.items = this.items.filter(i => i.id !== id);
      this.save();
      this.updateAllCounters();
    },
    clear() {
      this.items = [];
      this.save();
      this.updateAllCounters();
    },
    /* ── Calculs ── */
    total() {
      return this.items.reduce((sum, i) => sum + i.price * i.qty, 0);
    },
    count() {
      return this.items.reduce((sum, i) => sum + i.qty, 0);
    },
    /* ── Affichage des compteurs ── */
    updateAllCounters() {
      const count = this.count();
      const total = this.total();
      /* Tous les badges de compteur */
      $$('.wd-cart-number, .sc-cart-count').forEach(el => {
        /* Cible l'élément texte interne ou le nœud directement */
        const span = el.querySelector('span') || el;
        /* Format original : "0 items" */
        const innerSpan = el.querySelector('span');
        if (innerSpan) {
          el.childNodes[0].textContent = count + ' ';
        } else {
          el.textContent = count;
        }
        /* Ajoute une animation de rebond */
        el.classList.add('sc-bump');
        setTimeout(() => el.classList.remove('sc-bump'), 400);
      });
      /* Mise à jour du montant dans l'en-tête */
      $$('.wd-cart-subtotal .woocommerce-Price-amount bdi').forEach(el => {
        el.childNodes[0].textContent = total.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '\u00a0';
      });
      /* Rerender si on est sur la page panier */
      if ($('#sc-cart-table') || $('.woocommerce-cart-form')) {
        this.renderCartPage();
      }
    },
    /* ── Notification d'ajout ── */
    showAddedNotice(name) {
      let notice = $('#sc-add-notice');
      if (!notice) {
        notice = document.createElement('div');
        notice.id = 'sc-add-notice';
        notice.style.cssText = 'position:fixed;top:80px;right:20px;background:#2d6a4f;color:#fff;padding:12px 20px;border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,.2);z-index:99999;font-size:14px;max-width:300px;transition:opacity .3s;';
        document.body.appendChild(notice);
      }
      const lang = I18N.current || I18N.getLang();
      const dict = T[lang] || T['de'];
      notice.textContent = '✓ ' + name + ' ' + (dict['cart.add_success'] || 'wurde dem Warenkorb hinzugefügt');
      notice.style.opacity = '1';
      clearTimeout(notice._timer);
      notice._timer = setTimeout(() => { notice.style.opacity = '0'; }, 3000);
    },
    /* ── Page panier complète ── */
    renderCartPage() {
      const table = $('#sc-cart-table');
      if (!table) return;
      const tbody = table.querySelector('tbody');
      if (!tbody) return;
      const lang = I18N.current || I18N.getLang();
      const dict = T[lang] || T['de'];
      if (this.items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;">' + (dict['cart.empty'] || 'Dein Warenkorb ist leer.') + '</td></tr>';
        /* Masque les totaux */
        const totalsSection = $('#sc-cart-totals');
        if (totalsSection) totalsSection.style.display = 'none';
        return;
      }
      /* Affiche les totaux */
      const totalsSection = $('#sc-cart-totals');
      if (totalsSection) totalsSection.style.display = '';
      /* Génère les lignes */
      tbody.innerHTML = this.items.map(item => `
        <tr class="woocommerce-cart-form__cart-item cart_item" data-id="${item.id}">
          <td class="product-remove">
            <button class="remove sc-remove-btn" data-id="${item.id}" aria-label="${dict['cart.remove'] || 'Entfernen'}" title="${dict['cart.remove'] || 'Entfernen'}">
              &times;
            </button>
          </td>
          <td class="product-thumbnail">
            ${item.image ? `<img src="${item.image}" alt="${item.name}" style="max-width:60px;height:auto;">` : '<span style="font-size:2em;">📦</span>'}
          </td>
          <td class="product-name" data-title="${dict['cart.product'] || 'Produkt'}">
            <strong>${item.name}</strong>
          </td>
          <td class="product-price" data-title="${dict['cart.price'] || 'Preis'}">
            <span class="woocommerce-Price-amount amount">${formatPrice(item.price)}</span>
          </td>
          <td class="product-quantity" data-title="${dict['cart.quantity'] || 'Anzahl'}">
            <div class="quantity">
              <button class="minus sc-qty-btn" data-id="${item.id}" data-action="minus">−</button>
              <input type="number" class="input-text qty text sc-qty-input" value="${item.qty}" min="1" data-id="${item.id}" style="width:60px;text-align:center;">
              <button class="plus sc-qty-btn" data-id="${item.id}" data-action="plus">+</button>
            </div>
          </td>
          <td class="product-subtotal" data-title="${dict['cart.subtotal'] || 'Zwischensumme'}">
            <span class="woocommerce-Price-amount amount">${formatPrice(item.price * item.qty)}</span>
          </td>
        </tr>
      `).join('');
      /* Met à jour les totaux affichés */
      const subtotal = this.total();
      $$('.sc-cart-subtotal-amount').forEach(el => { el.textContent = formatPrice(subtotal); });
      $$('.sc-cart-total-amount').forEach(el => { el.textContent = formatPrice(subtotal); });
      /* Attache les événements aux nouveaux éléments */
      this.bindCartEvents(table);
      /* Synchronise le résumé dans la section commande */
      this.renderOrderSummary();
    },
    /* ── Résumé dans le formulaire de commande ── */
    renderOrderSummary() {
      const summaryEl = $('#sc-order-cart-summary');
      if (!summaryEl) return;
      const lang = I18N.current || I18N.getLang();
      const dict = T[lang] || T['de'];
      if (this.items.length === 0) {
        summaryEl.innerHTML = '<p>' + (dict['cart.empty'] || 'Aucun article') + '</p>';
        return;
      }
      summaryEl.innerHTML = `
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
          <thead>
            <tr style="border-bottom:2px solid #eee;">
              <th style="text-align:left;padding:8px 4px;">${dict['cart.product'] || 'Produkt'}</th>
              <th style="text-align:center;padding:8px 4px;">${dict['cart.quantity'] || 'Anzahl'}</th>
              <th style="text-align:right;padding:8px 4px;">${dict['cart.subtotal'] || 'Zwischensumme'}</th>
            </tr>
          </thead>
          <tbody>
            ${this.items.map(i => `
              <tr style="border-bottom:1px solid #f0f0f0;">
                <td style="padding:8px 4px;">${i.name}</td>
                <td style="text-align:center;padding:8px 4px;">${i.qty}</td>
                <td style="text-align:right;padding:8px 4px;">${formatPrice(i.price * i.qty)}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr style="font-weight:bold;border-top:2px solid #eee;">
              <td colspan="2" style="padding:10px 4px;">${dict['cart.total'] || 'Gesamtsumme'}</td>
              <td style="text-align:right;padding:10px 4px;">${formatPrice(this.total())}</td>
            </tr>
          </tfoot>
        </table>
      `;
    },
    /* ── Événements du tableau de panier ── */
    bindCartEvents(ctx) {
      ctx = ctx || document;
      /* Boutons de suppression */
      $$(`.sc-remove-btn`, ctx).forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.id;
          const lang = I18N.current || I18N.getLang();
          const dict = T[lang] || T['de'];
          if (confirm(dict['cart.remove_confirm'] || 'Artikel wirklich entfernen?')) {
            CART.removeItem(id);
          }
        });
      });
      /* Boutons +/- */
      $$('.sc-qty-btn', ctx).forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.id;
          const action = btn.dataset.action;
          const item = CART.items.find(i => i.id === id);
          if (!item) return;
          const newQty = action === 'plus' ? item.qty + 1 : item.qty - 1;
          CART.updateQty(id, newQty);
        });
      });
      /* Saisie directe de quantité */
      $$('.sc-qty-input', ctx).forEach(input => {
        input.addEventListener('change', () => {
          const id = input.dataset.id;
          const qty = parseInt(input.value, 10);
          if (!isNaN(qty)) CART.updateQty(id, qty);
        });
      });
    },
    /* ── Boutons "Ajouter au panier" dans le shop ── */
    bindAddToCartButtons() {
      $$('.add_to_cart_button, .add-to-cart-loop').forEach(btn => {
        /* Ignore si déjà bindé */
        if (btn.dataset.scBound) return;
        btn.dataset.scBound = '1';
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          const id    = btn.dataset.product_id || btn.getAttribute('href')?.match(/add-to-cart=(\d+)/)?.[1] || Math.random().toString(36).substr(2, 9);
          const name  = btn.getAttribute('aria-label')?.replace(/^In den Warenkorb legen:\s*[„""]?/, '').replace(/[""]?\s*$/, '').trim() ||
                        btn.closest('.wd-product')?.querySelector('.wd-entities-title')?.textContent?.trim() || 'Produkt';
          const priceEl = btn.closest('.wd-product')?.querySelector('.woocommerce-Price-amount bdi');
          let price = 0;
          if (priceEl) {
            const txt = priceEl.textContent.replace(/[^\d,\.]/g, '').replace(',', '.');
            price = parseFloat(txt) || 0;
          }
          const imgEl = btn.closest('.wd-product')?.querySelector('img.attachment-400x457, img.swiper-slide-image, img');
          const image = imgEl?.src || '';
          CART.addItem({ id: String(id), name, price, image });
          /* Feedback visuel sur le bouton */
          const origText = btn.innerHTML;
          btn.innerHTML = '<span>✓</span>';
          btn.style.background = '#2d6a4f';
          setTimeout(() => {
            btn.innerHTML = origText;
            btn.style.background = '';
          }, 900);

          /* Synchroniser localStorage depuis le panier serveur après ajout */
          setTimeout(() => {
            if (typeof CART.syncFromWooFragments === 'function') {
              CART.syncFromWooFragments();
            }
          }, 500);
        });
      });
    },
  };
  /* ═══════════════════════════════════════════════════════════════
     3. FORMULAIRE DE COMMANDE (envoi PHP)
  ═══════════════════════════════════════════════════════════════ */
  const ORDER_FORM = {
    init() {
      const form = $('#sc-order-form');
      if (!form) return;
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!this.validate(form)) return;
        /* Honeypot anti-spam */
        if (form.querySelector('[name="_gotcha"]')?.value) return;
        const lang = I18N.current || I18N.getLang();
        const dict = T[lang] || T['de'];
        const submitBtn = form.querySelector('[type="submit"]');
        const statusEl  = form.querySelector('.sc-form-status');
        submitBtn.disabled = true;
        submitBtn.textContent = dict['order.sending'] || 'Wird gesendet…';
        if (statusEl) { statusEl.style.display = 'none'; }
        /* Construit le payload */
        const data = new FormData(form);
        data.append('sc_action', 'send_order');
        data.append('lang', lang);
        /* Ajoute les articles du panier */
        data.append('cart_items', JSON.stringify(CART.items));
        data.append('cart_total', CART.total().toFixed(2));
        /* Détermine l'URL du script PHP (relatif à la racine du site) */
        const mailerUrl = this.getMailerUrl();
        try {
          const resp = await fetch(mailerUrl, { method: 'POST', body: data });
          const json = await resp.json();
          if (json.success) {
            form.reset();
            CART.clear();
            if (statusEl) {
              statusEl.textContent = dict['order.success'] || 'Vielen Dank! Ihre Bestellung wurde erfolgreich gesendet.';
              statusEl.className = 'sc-form-status sc-form-success';
              statusEl.style.display = 'block';
            }
            /* Confetti léger */
            this.showSuccessAnimation();
          } else {
            throw new Error(json.message || 'Server error');
          }
        } catch (err) {
          console.error('[SC Order]', err);
          if (statusEl) {
            statusEl.textContent = dict['order.error'] || 'Fehler beim Senden. Bitte versuche es erneut.';
            statusEl.className = 'sc-form-status sc-form-error';
            statusEl.style.display = 'block';
          }
        } finally {
          submitBtn.disabled = false;
          const lang2 = I18N.current || I18N.getLang();
          const dict2 = T[lang2] || T['de'];
          submitBtn.textContent = dict2['order.submit'] || 'Bestellung senden';
        }
      });
    },
    getMailerUrl() {
      /* Remonte vers la racine selon la profondeur de la page */
      const path = window.location.pathname;
      const depth = (path.match(/\//g) || []).length - 1;
      const prefix = depth > 0 ? '../'.repeat(depth) : '';
      return prefix + (CFG.MAILER_URL || 'send_order.php');
    },
    validate(form) {
      let valid = true;
      form.querySelectorAll('[required]').forEach(field => {
        field.classList.remove('sc-field-error');
        if (!field.value.trim()) {
          field.classList.add('sc-field-error');
          valid = false;
        }
      });
      /* Validation email */
      const emailField = form.querySelector('[type="email"]');
      if (emailField && emailField.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailField.value)) {
        emailField.classList.add('sc-field-error');
        valid = false;
      }
      if (!valid) {
        const firstError = form.querySelector('.sc-field-error');
        if (firstError) firstError.focus();
      }
      return valid;
    },
    showSuccessAnimation() {
      /* Message de confirmation visible */
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:100000;display:flex;align-items:center;justify-content:center;';
      overlay.innerHTML = `<div style="background:#fff;padding:40px;border-radius:12px;text-align:center;max-width:400px;">
        <div style="font-size:60px;">🎉</div>
        <h2 style="margin:16px 0 8px;">Vielen Dank!</h2>
        <p style="color:#555;">Ihre Bestellung wurde erfolgreich gesendet. Wir melden uns bald.</p>
        <button onclick="this.closest('div[style*=fixed]').remove();window.location.href='${this.getRootPath()}index.html';"
          style="margin-top:20px;padding:12px 32px;background:#1a1a2e;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:15px;">
          OK
        </button>
      </div>`;
      document.body.appendChild(overlay);
    },
    getRootPath() {
      const path = window.location.pathname;
      const depth = (path.match(/\//g) || []).length - 1;
      return depth > 0 ? '../'.repeat(depth) : '';
    },
  };
  /* ═══════════════════════════════════════════════════════════════
     4. FORMULAIRE DE CONTACT
  ═══════════════════════════════════════════════════════════════ */
  const CONTACT_FORM = {
    init() {
      /* Formulaire WooCommerce de contact natif */
      const forms = $$('.wpcf7-form, form.contact-form, #sc-contact-form');
      forms.forEach(form => {
        if (form.dataset.scBound) return;
        form.dataset.scBound = '1';
        form.addEventListener('submit', async (e) => {
          /* Laisse le formulaire CF7 fonctionner normalement si possible */
          const action = form.action || '';
          if (action.includes('steinkamp-container.com')) {
            /* Remplace par la version locale */
            e.preventDefault();
            await this.handleLocalSubmit(form);
          }
        });
      });
    },
    async handleLocalSubmit(form) {
      const lang = I18N.current || I18N.getLang();
      const dict = T[lang] || T['de'];
      const submitBtn = form.querySelector('[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        const origText = submitBtn.textContent;
        submitBtn.textContent = dict['order.sending'] || 'Wird gesendet…';
        setTimeout(() => {
          submitBtn.disabled = false;
          submitBtn.textContent = origText;
        }, 3000);
      }
      /* Simule un succès côté local (sans serveur mail, montre juste un message) */
      const statusDiv = document.createElement('div');
      statusDiv.style.cssText = 'margin:16px 0;padding:12px 20px;background:#d4edda;color:#155724;border-radius:6px;border:1px solid #c3e6cb;';
      statusDiv.textContent = dict['contact.success'] || 'Ihre Nachricht wurde gesendet.';
      form.after(statusDiv);
      form.reset();
      setTimeout(() => statusDiv.remove(), 6000);
    },
  };
  /* ═══════════════════════════════════════════════════════════════
     5. BOUTON "VALIDER LA COMMANDE" sur panier.html
  ═══════════════════════════════════════════════════════════════ */
  const CHECKOUT_BUTTON = {
    init() {
      /* Intercepte le bouton WooCommerce "Zur Kasse" */
      $$('a.checkout-button, .wc-proceed-to-checkout a, a[href*="formulaire"]').forEach(btn => {
        if (btn.dataset.scBound) return;
        btn.dataset.scBound = '1';
        btn.addEventListener('click', (e) => {
          /* Si le panier est vide, empêche la navigation */
          if (CART.items.length === 0) {
            e.preventDefault();
            const lang = I18N.current || I18N.getLang();
            const dict = T[lang] || T['de'];
            alert(dict['cart.empty'] || 'Dein Warenkorb ist leer.');
            return;
          }
          /* Sinon, laisse aller à formulaire.html */
        });
      });
      /* Bouton custom "sc-checkout-btn" dans panier.html */
      $$('.sc-checkout-btn').forEach(btn => {
        if (btn.dataset.scBound) return;
        btn.dataset.scBound = '1';
        btn.addEventListener('click', () => {
          if (CART.items.length === 0) {
            const lang = I18N.current || I18N.getLang();
            alert(T[lang]?.['cart.empty'] || 'Dein Warenkorb ist leer.');
            return;
          }
          window.location.href = btn.dataset.href || 'formulaire.html';
        });
      });
    },
  };
  /* ═══════════════════════════════════════════════════════════════
     6. SECTION COMMANDE sur index.html (formulaire custom)
  ═══════════════════════════════════════════════════════════════ */
  const ORDER_SECTION = {
    init() {
      const section = $('#sc-order-section');
      if (!section) return;
      /* Bouton "Zur Kasse" sur la page d'accueil ou d'autres pages */
      $$('.sc-open-order-form').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          section.style.display = 'block';
          section.scrollIntoView({ behavior: 'smooth' });
          CART.renderOrderSummary();
        });
      });
      /* Initialise le formulaire d'ordre */
      ORDER_FORM.init();
    },
  };
  /* ═══════════════════════════════════════════════════════════════
     7. FORMULAIRE WooCommerce sur formulaire.html
  ═══════════════════════════════════════════════════════════════ */
  const WOOCOMMERCE_CHECKOUT = {
    init() {
      const form = $('form.checkout.woocommerce-checkout');
      if (!form) return;
      /* Préremplit la section "Votre commande" */
      this.fillOrderReview();
      /* Intercepte la soumission */
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (CART.items.length === 0) {
          const lang = I18N.current || I18N.getLang();
          alert(T[lang]?.['cart.empty'] || 'Ihr Warenkorb ist leer.');
          return;
        }
        const submitBtn = form.querySelector('#place_order, [name="woocommerce_checkout_place_order"]');
        const lang = I18N.current || I18N.getLang();
        const dict = T[lang] || T['de'];
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.value = dict['order.sending'] || 'Wird gesendet…';
        }
        /* Construit le payload */
        const formData = new FormData(form);
        formData.append('sc_action', 'wc_checkout');
        formData.append('cart_items', JSON.stringify(CART.items));
        formData.append('cart_total', CART.total().toFixed(2));
        const mailerUrl = ORDER_FORM.getMailerUrl();
        try {
          const resp = await fetch(mailerUrl, { method: 'POST', body: formData });
          const json = await resp.json();
          if (json.success) {
            CART.clear();
            ORDER_FORM.showSuccessAnimation();
          } else {
            throw new Error(json.message || 'Server error');
          }
        } catch (err) {
          console.error('[SC Checkout]', err);
          const statusEl = form.querySelector('.woocommerce-error, .sc-form-status');
          if (statusEl) {
            statusEl.textContent = dict['order.error'] || 'Fehler beim Senden.';
            statusEl.style.display = 'block';
          } else {
            alert(dict['order.error'] || 'Fehler beim Senden.');
          }
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.value = dict['checkout.place_order'] || 'Zahlungspflichtig bestellen';
          }
        }
      });
    },
    fillOrderReview() {
      /* Remplit le tableau récapitulatif des articles dans formulaire.html */
      const reviewTable = $('.woocommerce-checkout-review-order-table');
      if (!reviewTable) return;
      const tbody = reviewTable.querySelector('tbody') || reviewTable;
      if (CART.items.length === 0) {
        /* Garde l'affichage original WooCommerce si le panier local est vide */
        return;
      }
      const lang = I18N.current || I18N.getLang();
      const dict = T[lang] || T['de'];
      /* Remplace le contenu du tbody */
      if (reviewTable.querySelector('tbody')) {
        reviewTable.querySelector('tbody').innerHTML = CART.items.map(i => `
          <tr class="cart_item">
            <td class="product-name">${i.name}&nbsp;<strong class="product-quantity">×&nbsp;${i.qty}</strong></td>
            <td class="product-total"><span class="woocommerce-Price-amount">${formatPrice(i.price * i.qty)}</span></td>
          </tr>
        `).join('');
      }
      /* Met à jour total dans tfoot */
      const totalEl = reviewTable.querySelector('.order-total .woocommerce-Price-amount');
      if (totalEl) totalEl.textContent = formatPrice(CART.total());
    },
  };
  /* ═══════════════════════════════════════════════════════════════
     8. NAVIGATION DYNAMIQUE
  ═══════════════════════════════════════════════════════════════ */
  const NAV = {
    init() {
      /* Sous-menus hover au clic sur mobile */
      $$('.menu-item-has-children').forEach(li => {
        const link = li.querySelector(':scope > a');
        const dropdown = li.querySelector('.wd-dropdown-menu, .wd-dropdown, .wd-sub-menu');
        if (!link || !dropdown) return;
        /* Desktop: déjà géré par CSS, mais on renforce le comportement */
        li.addEventListener('mouseenter', () => {
          dropdown.style.display = '';
        });
        li.addEventListener('mouseleave', () => {
          dropdown.style.display = '';
        });
      });
      /* Correction des liens absolus → liens locaux */
      this.fixAbsoluteLinks();
    },
    fixAbsoluteLinks() {
      $$('a[href*="steinkamp-container.com"]').forEach(a => {
        const href = a.getAttribute('href');
        if (!href) return;
        /* Remplace les liens vers des pages connues */
        const map = {
          '/': 'index.html',
          '/warenkorb/': 'panier.html',
          '/kasse/': 'formulaire.html',
          '/kontakt/': 'contact.html',
          '/ueber-uns/': 'about.html',
          '/shop/': 'shop/shop.html',
        };
        for (const [path, local] of Object.entries(map)) {
          if (href.endsWith(path) || href.includes(path + '?') || href.includes(path + '#')) {
            /* Calcule le chemin relatif depuis la page courante */
            const currentPath = window.location.pathname;
            const depth = (currentPath.match(/\//g) || []).length - 1;
            const prefix = depth > 0 ? '../'.repeat(depth) : '';
            a.setAttribute('href', prefix + local);
            break;
          }
        }
      });
    },
  };
  /* ═══════════════════════════════════════════════════════════════
     9. BOUTONS QUANTITÉ +/- dans le shop et les pages produit
  ═══════════════════════════════════════════════════════════════ */
  const QTY_BUTTONS = {
    init() {
      document.addEventListener('click', (e) => {
        const btn = e.target.closest('.minus, .plus');
        if (!btn) return;
        const wrapper = btn.closest('.quantity');
        if (!wrapper) return;
        const input = wrapper.querySelector('input[type="number"], input.qty');
        if (!input) return;
        let val = parseInt(input.value, 10) || 1;
        const min = parseInt(input.min, 10) || 0;
        const max = input.max ? parseInt(input.max, 10) : Infinity;
        if (btn.classList.contains('minus')) {
          val = Math.max(min, val - 1);
        } else {
          val = Math.min(max, val + 1);
        }
        input.value = val;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
    },
  };
  /* ═══════════════════════════════════════════════════════════════
     10. COUPON (simulé — affichage uniquement)
  ═══════════════════════════════════════════════════════════════ */
  const COUPON = {
    init() {
      $$('[name="apply_coupon"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const input = btn.closest('form, .wd-coupon-form')?.querySelector('[name="coupon_code"]');
          if (!input?.value.trim()) return;
          /* Message local d'information */
          const notice = document.createElement('p');
          notice.style.cssText = 'color:#856404;background:#fff3cd;padding:8px 14px;border-radius:4px;margin-top:8px;font-size:14px;';
          notice.textContent = '⚠ Gutscheine sind in der lokalen Demo nicht verfügbar.';
          btn.after(notice);
          setTimeout(() => notice.remove(), 4000);
        });
      });
    },
  };
  /* ═══════════════════════════════════════════════════════════════
     11. COOKIE NOTICE (fermeture locale)
  ═══════════════════════════════════════════════════════════════ */
  const COOKIES = {
    init() {
      const notice = $('#cookie-notice');
      if (!notice) return;
      /* Si déjà accepté, masque */
      if (localStorage.getItem('sc_cookie_accepted')) {
        notice.style.display = 'none';
        return;
      }
      notice.classList.remove('cookie-notice-hidden');
      notice.style.display = '';
      const acceptBtn = notice.querySelector('#cn-accept-cookie');
      const closeBtn  = notice.querySelector('#cn-close-notice');
      [acceptBtn, closeBtn].filter(Boolean).forEach(btn => {
        btn.addEventListener('click', () => {
          localStorage.setItem('sc_cookie_accepted', '1');
          notice.style.display = 'none';
        });
      });
    },
  };
  /* ═══════════════════════════════════════════════════════════════
     12. SCROLL-TO-TOP
  ═══════════════════════════════════════════════════════════════ */
  const SCROLL_TOP = {
    init() {
      const btn = document.createElement('button');
      btn.id = 'sc-scroll-top';
      btn.innerHTML = '↑';
      btn.title = 'Nach oben scrollen';
      btn.style.cssText = `
        position:fixed;bottom:30px;right:30px;width:44px;height:44px;
        background:#1a1a2e;color:#fff;border:none;border-radius:50%;
        font-size:20px;cursor:pointer;z-index:9999;opacity:0;
        transition:opacity .3s;box-shadow:0 4px 12px rgba(0,0,0,.3);
        display:flex;align-items:center;justify-content:center;
      `;
      document.body.appendChild(btn);
      window.addEventListener('scroll', () => {
        btn.style.opacity = window.scrollY > 300 ? '1' : '0';
      });
      btn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    },
  };
  /* ═══════════════════════════════════════════════════════════════
     INITIALISATION PRINCIPALE
  ═══════════════════════════════════════════════════════════════ */
  function init() {
    /* Panier */
    CART.load();
    CART.updateAllCounters();
    /* i18n */
    I18N.initLangBar();
    /* Boutons produit */
    CART.bindAddToCartButtons();
    /* Boutons +/- */
    QTY_BUTTONS.init();
    /* Navigation */
    NAV.init();
    /* Page panier */
    if ($('#sc-cart-table') || $('.cart-data-form')) {
      CART.renderCartPage();
    }
    /* Coupon */
    COUPON.init();
    /* Formulaire de commande (section custom sur toutes les pages) */
    ORDER_SECTION.init();
    /* Formulaire WooCommerce checkout */
    WOOCOMMERCE_CHECKOUT.init();
    /* Formulaire de contact */
    CONTACT_FORM.init();
    /* Bouton de passage à la caisse */
    CHECKOUT_BUTTON.init();
    /* Cookies */
    COOKIES.init();
    /* Scroll-to-top */
    SCROLL_TOP.init();
    /* Observer pour les boutons ajoutés dynamiquement */
    const observer = new MutationObserver(() => {
      CART.bindAddToCartButtons();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    console.log('[SC App] Initialisé — Panier:', CART.count(), 'article(s), Langue:', I18N.getLang());
  }
  /* Lance après chargement du DOM */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  /* Expose l'API globale pour usage externe */
  window.SC = {
    cart:       CART,
    i18n:       I18N,
    orderForm:  ORDER_FORM,
    translate:  (key) => {
      const lang = I18N.current || I18N.getLang();
      return (T[lang] || T['de'] || {})[key] || key;
    },
  };
})();
