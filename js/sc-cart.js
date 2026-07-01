/**
 * sc-cart.js — Système de panier complet
 * Gère l'ajout, la modification, la suppression de produits localement
 */

class SteinkampCart {
  constructor() {
    this.storageKey = 'sc-cart-items';
    this.items = this.loadCart();
    this.init();
  }
  
  /**
   * Charger le panier depuis localStorage
   */
  loadCart() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      console.error('Erreur lors du chargement du panier:', e);
      return [];
    }
  }
  
  /**
   * Sauvegarder le panier dans localStorage
   */
  saveCart() {
    localStorage.setItem(this.storageKey, JSON.stringify(this.items));
    this.updateCartUI();
    this.dispatchCartChangeEvent();
  }
  
  /**
   * Ajouter un produit au panier
   */
  addToCart(product) {
    if (!product.id || !product.name || product.price === undefined) {
      console.error('Produit invalide:', product);
      return false;
    }
    
    const existingItem = this.items.find(item => item.id === product.id);
    
    if (existingItem) {
      existingItem.qty = (existingItem.qty || 1) + (product.qty || 1);
    } else {
      this.items.push({
        id: product.id,
        name: product.name,
        price: parseFloat(product.price),
        qty: product.qty || 1,
        image: product.image || null
      });
    }
    
    this.saveCart();
    return true;
  }
  
  /**
   * Mettre à jour la quantité d'un produit
   */
  updateQuantity(productId, newQty) {
    newQty = parseInt(newQty);
    if (newQty < 1) {
      this.removeItem(productId);
      return;
    }
    
    const item = this.items.find(i => i.id === productId);
    if (item) {
      item.qty = newQty;
      this.saveCart();
    }
  }
  
  /**
   * Supprimer un produit du panier
   */
  removeItem(productId) {
    this.items = this.items.filter(item => item.id !== productId);
    this.saveCart();
  }
  
  /**
   * Vider complètement le panier
   */
  clearCart() {
    this.items = [];
    this.saveCart();
  }
  
  /**
   * Obtenir le nombre total d'articles
   */
  getItemCount() {
    return this.items.reduce((sum, item) => sum + (item.qty || 1), 0);
  }
  
  /**
   * Obtenir le total du panier
   */
  getTotal() {
    return this.items.reduce((sum, item) => sum + (item.price * (item.qty || 1)), 0);
  }
  
  /**
   * Initialiser les écouteurs d'événements
   */
  init() {
    // Écouteur global pour les boutons "Ajouter au panier"
    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-add-to-cart]')) {
        this.handleAddToCart(e.target.closest('[data-add-to-cart]'));
      }
      
      if (e.target.closest('[data-remove-from-cart]')) {
        const productId = e.target.closest('[data-remove-from-cart]').getAttribute('data-product-id');
        this.removeItem(productId);
      }
      
      if (e.target.closest('[data-update-quantity]')) {
        const productId = e.target.closest('[data-update-quantity]').getAttribute('data-product-id');
        const input = e.target.closest('[data-update-quantity]').querySelector('input');
        this.updateQuantity(productId, input.value);
      }
    });
    
    // Mettre à jour l'interface initiale
    this.updateCartUI();
  }
  
  /**
   * Gérer le clic sur "Ajouter au panier"
   */
  handleAddToCart(element) {
    const form = element.closest('[data-product-form]');
    if (!form) return;
    
    const product = {
      id: form.getAttribute('data-product-id'),
      name: form.getAttribute('data-product-name'),
      price: form.getAttribute('data-product-price'),
      qty: parseInt(form.querySelector('[data-product-qty]')?.value || 1),
      image: form.getAttribute('data-product-image')
    };
    
    if (this.addToCart(product)) {
      // Afficher une confirmation
      const msg = element.closest('[data-add-to-cart]');
      const originalText = msg.textContent;
      msg.textContent = '✓ Hinzugefügt!';
      msg.style.opacity = '0.6';
      setTimeout(() => {
        msg.textContent = originalText;
        msg.style.opacity = '1';
      }, 2000);
    }
  }
  
  /**
   * Mettre à jour l'interface utilisateur du panier
   */
  updateCartUI() {
    // Mettre à jour les compteurs
    document.querySelectorAll('[data-cart-count]').forEach(el => {
      el.textContent = this.getItemCount();
    });
    
    // Mettre à jour les totaux
    document.querySelectorAll('[data-cart-total]').forEach(el => {
      el.textContent = this.getTotal().toFixed(2).replace('.', ',') + ' €';
    });
    
    // Mettre à jour la page du panier si elle existe
    const cartTable = document.querySelector('[data-cart-table]');
    if (cartTable) {
      this.renderCartTable(cartTable);
    }
  }
  
  /**
   * Afficher le tableau du panier
   */
  renderCartTable(container) {
    if (this.items.length === 0) {
      container.innerHTML = '<p>' + window.t('cart.empty', 'Votre panier est vide') + '</p>';
      return;
    }
    
    let html = '<table class="cart-table">';
    html += '<thead><tr><th>Produit</th><th>Prix</th><th>Quantité</th><th>Subtotal</th><th></th></tr></thead>';
    html += '<tbody>';
    
    this.items.forEach(item => {
      const subtotal = (item.price * item.qty).toFixed(2).replace('.', ',');
      const price = item.price.toFixed(2).replace('.', ',');
      html += `<tr data-product-row="${item.id}">`;
      html += `<td>${item.name}</td>`;
      html += `<td>${price} €</td>`;
      html += `<td><input type="number" value="${item.qty}" min="1" data-qty-input="${item.id}" class="qty-input"></td>`;
      html += `<td>${subtotal} €</td>`;
      html += `<td><button class="btn-remove" data-remove-item="${item.id}">✕</button></td>`;
      html += '</tr>';
    });
    
    html += '</tbody></table>';
    html += `<div class="cart-summary"><strong>Total:</strong> ${this.getTotal().toFixed(2).replace('.', ',')} €</div>`;
    
    container.innerHTML = html;
    
    // Ajouter les écouteurs pour les entrées de quantité
    container.querySelectorAll('[data-qty-input]').forEach(input => {
      input.addEventListener('change', () => {
        const productId = input.getAttribute('data-qty-input');
        this.updateQuantity(productId, input.value);
      });
    });
    
    // Ajouter les écouteurs pour les boutons de suppression
    container.querySelectorAll('[data-remove-item]').forEach(btn => {
      btn.addEventListener('click', () => {
        const productId = btn.getAttribute('data-remove-item');
        this.removeItem(productId);
      });
    });
  }
  
  /**
   * Obtenir les données du panier pour l'envoi
   */
  getCartData() {
    return {
      items: this.items,
      total: this.getTotal(),
      itemCount: this.getItemCount()
    };
  }
  
  /**
   * Émettre un événement personnalisé
   */
  dispatchCartChangeEvent() {
    window.dispatchEvent(new CustomEvent('cartChanged', { detail: this.getCartData() }));
  }
}

// Initialiser le panier
let SC_CART = null;
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    SC_CART = new SteinkampCart();
  });
} else {
  SC_CART = new SteinkampCart();
}
