/**
 * sc-forms.js — Gestion des formulaires de commande
 * Valide et envoie les commandes au serveur PHP
 */

class SteinkampOrderForm {
  constructor() {
    this.init();
  }
  
  init() {
    // Trouver et initialiser tous les formulaires de commande
    document.querySelectorAll('[data-order-form]').forEach(form => {
      this.setupForm(form);
    });
  }
  
  setupForm(form) {
    form.addEventListener('submit', (e) => this.handleSubmit(e, form));
  }
  
  handleSubmit(e, form) {
    e.preventDefault();
    
    // Valider le formulaire
    if (!this.validateForm(form)) {
      return;
    }
    
    // Récupérer les données
    const formData = this.getFormData(form);
    const cartData = SC_CART.getCartData();
    
    // Préparer les données pour l'envoi
    const payload = new FormData();
    payload.append('sc_action', 'send_order');
    payload.append('lang', localStorage.getItem('sc-lang') || 'de');
    payload.append('cart_items', JSON.stringify(cartData.items));
    payload.append('cart_total', cartData.total);
    
    // Ajouter les champs du formulaire
    Object.keys(formData).forEach(key => {
      payload.append(key, formData[key]);
    });
    
    // Afficher l'état d'envoi
    const submitBtn = form.querySelector('[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = window.t('form.sending', 'Wird gesendet...');
    
    // Envoyer les données
    fetch(window.SC_CONFIG.backendUrl, {
      method: 'POST',
      body: payload
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        alert(window.t('form.success', 'Bestellung erfolgreich gesendet!'));
        SC_CART.clearCart();
        form.reset();
        // Rediriger après 2 secondes
        setTimeout(() => {
          window.location.href = 'index.html';
        }, 2000);
      } else {
        alert(window.t('form.error', 'Es gab einen Fehler beim Senden der Bestellung.') + '\n' + (data.message || ''));
      }
    })
    .catch(error => {
      console.error('Erreur lors de l\'envoi:', error);
      alert(window.t('form.error', 'Es gab einen Fehler beim Senden der Bestellung.'));
    })
    .finally(() => {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    });
  }
  
  getFormData(form) {
    const formData = new FormData(form);
    const data = {};
    
    for (let [key, value] of formData.entries()) {
      data[key] = value;
    }
    
    return data;
  }
  
  validateForm(form) {
    let isValid = true;
    
    // Vérifier les champs obligatoires
    form.querySelectorAll('[required]').forEach(field => {
      if (!field.value.trim()) {
        this.showError(field, window.t('form.required-field', 'Dieses Feld ist erforderlich'));
        isValid = false;
      } else {
        this.clearError(field);
      }
    });
    
    // Vérifier le format de l'email
    const emailField = form.querySelector('[type="email"]');
    if (emailField && emailField.value.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emailField.value)) {
        this.showError(emailField, window.t('form.invalid-email', 'L\'adresse e-mail est invalide'));
        isValid = false;
      } else {
        this.clearError(emailField);
      }
    }
    
    // Vérifier que le panier n'est pas vide
    if (SC_CART.getItemCount() === 0) {
      alert('Votre panier est vide');
      isValid = false;
    }
    
    return isValid;
  }
  
  showError(field, message) {
    field.classList.add('error');
    let errorMsg = field.parentElement.querySelector('.error-message');
    if (!errorMsg) {
      errorMsg = document.createElement('span');
      errorMsg.className = 'error-message';
      field.parentElement.appendChild(errorMsg);
    }
    errorMsg.textContent = message;
  }
  
  clearError(field) {
    field.classList.remove('error');
    const errorMsg = field.parentElement.querySelector('.error-message');
    if (errorMsg) errorMsg.remove();
  }
}

// Initialiser les formulaires
let SC_FORMS = null;
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    SC_FORMS = new SteinkampOrderForm();
  });
} else {
  SC_FORMS = new SteinkampOrderForm();
}
