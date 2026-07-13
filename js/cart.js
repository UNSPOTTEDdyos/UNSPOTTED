/* =============================================
   UNSPOTTED — Carrito de compra (localStorage)
   Se carga en todas las páginas: mantiene el badge
   del navbar sincronizado y maneja el drawer + checkout.
   ============================================= */

const CART_STORAGE_KEY = 'unspotted_cart';

function cartFormatPrice(price) {
  return `$${Number(price).toLocaleString('es-MX')} MXN`;
}

function cartEscapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function cartItemKey(product_id, size, fit) {
  return `${product_id}::${size}::${fit}`;
}

function getCart() {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCart(cart) {
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  renderCartBadge();
}

function clearCart() {
  localStorage.removeItem(CART_STORAGE_KEY);
  renderCartBadge();
}

/* --- Agregar un item (llamado desde js/checkout.js al elegir talla/corte) --- */
function addToCart({ product_id, name, image, price, size, fit, quantity, maxQty }) {
  const cart = getCart();
  const key = cartItemKey(product_id, size, fit);
  const existing = cart.find((i) => i.key === key);

  if (existing) {
    existing.maxQty = maxQty;
    existing.quantity = Math.min(existing.quantity + quantity, maxQty || existing.quantity + quantity);
  } else {
    cart.push({ key, product_id, name, image, price, size, fit, quantity, maxQty });
  }

  saveCart(cart);
}

function removeFromCart(key) {
  saveCart(getCart().filter((i) => i.key !== key));
}

function updateCartQty(key, delta) {
  const cart = getCart();
  const item = cart.find((i) => i.key === key);
  if (!item) return;

  const max = item.maxQty || 99;
  item.quantity = Math.max(1, Math.min(item.quantity + delta, max));
  saveCart(cart);
  renderCartDrawer();
}

function cartCount() {
  return getCart().reduce((sum, i) => sum + i.quantity, 0);
}

function cartSubtotal() {
  return getCart().reduce((sum, i) => sum + i.price * i.quantity, 0);
}

/* --- Badge del navbar (presente en todas las páginas) --- */
function renderCartBadge() {
  const badge = document.getElementById('navbar-cart-badge');
  if (!badge) return;

  const count = cartCount();
  badge.textContent = String(count);
  badge.style.display = count > 0 ? 'block' : 'none';
}

/* --- Drawer --- */
const cartDrawer = document.getElementById('cart-drawer');
const cartDrawerBackdrop = document.getElementById('cart-drawer-backdrop');
const cartDrawerClose = document.getElementById('cart-drawer-close');
const cartDrawerItems = document.getElementById('cart-drawer-items');
const cartDrawerEmpty = document.getElementById('cart-drawer-empty');
const cartDrawerFooter = document.getElementById('cart-drawer-footer');
const cartDrawerTotal = document.getElementById('cart-drawer-total');
const cartDrawerDiscount = document.getElementById('cart-drawer-discount');
const cartDrawerSubmit = document.getElementById('cart-drawer-submit');
const cartDrawerMsg = document.getElementById('cart-drawer-msg');
const navbarCartBtn = document.getElementById('navbar-cart-btn');

function renderCartDrawer() {
  if (!cartDrawerItems) return;

  const cart = getCart();

  cartDrawerEmpty.classList.toggle('hidden', cart.length > 0);
  cartDrawerFooter.classList.toggle('hidden', cart.length === 0);

  cartDrawerItems.innerHTML = cart.map((item) => `
    <div class="cart-item" data-key="${item.key}">
      ${item.image ? `<img class="cart-item__img" src="${item.image}" alt="${cartEscapeHtml(item.name)}" />` : ''}
      <div class="cart-item__body">
        <p class="cart-item__name">${cartEscapeHtml(item.name)}</p>
        <p class="cart-item__meta">Talla ${cartEscapeHtml(item.size)} — ${cartEscapeHtml(item.fit)}</p>
        <div class="cart-item__row">
          <div class="cart-item__qty">
            <button type="button" class="cart-item__qty-btn" data-action="minus" aria-label="Quitar uno">−</button>
            <span class="cart-item__qty-value">${item.quantity}</span>
            <button type="button" class="cart-item__qty-btn" data-action="plus" aria-label="Agregar uno" ${item.maxQty && item.quantity >= item.maxQty ? 'disabled' : ''}>+</button>
          </div>
          <span class="cart-item__price">${cartFormatPrice(item.price * item.quantity)}</span>
          <button type="button" class="cart-item__remove" data-action="remove" aria-label="Quitar del carrito">&times;</button>
        </div>
      </div>
    </div>
  `).join('');

  cartDrawerTotal.innerHTML = `<span class="cart-drawer__total-label">Total</span><span>${cartFormatPrice(cartSubtotal())}</span>`;
  cartDrawerMsg.textContent = '';
  cartDrawerSubmit.disabled = cart.length === 0;
}

function openCartDrawer() {
  if (!cartDrawer) return;
  renderCartDrawer();
  cartDrawer.classList.add('is-open');
  cartDrawer.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeCartDrawer() {
  if (!cartDrawer) return;
  cartDrawer.classList.remove('is-open');
  cartDrawer.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

if (navbarCartBtn) navbarCartBtn.addEventListener('click', openCartDrawer);
if (cartDrawerClose) cartDrawerClose.addEventListener('click', closeCartDrawer);
if (cartDrawerBackdrop) cartDrawerBackdrop.addEventListener('click', closeCartDrawer);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && cartDrawer?.classList.contains('is-open')) closeCartDrawer();
});

if (cartDrawerItems) {
  cartDrawerItems.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;

    const key = btn.closest('.cart-item').dataset.key;

    if (btn.dataset.action === 'plus') updateCartQty(key, 1);
    if (btn.dataset.action === 'minus') updateCartQty(key, -1);
    if (btn.dataset.action === 'remove') { removeFromCart(key); renderCartDrawer(); }
  });
}

if (cartDrawerSubmit) {
  cartDrawerSubmit.addEventListener('click', async () => {
    const cart = getCart();
    if (!cart.length) return;

    cartDrawerMsg.textContent = '';
    cartDrawerSubmit.disabled = true;
    const originalText = cartDrawerSubmit.textContent;
    cartDrawerSubmit.textContent = 'Redirigiendo…';

    const discountCode = cartDrawerDiscount.value.trim();

    try {
      const { data, error } = await supabaseClient.functions.invoke('create-checkout-session', {
        body: {
          items: cart.map((i) => ({
            product_id: i.product_id,
            size: i.size,
            fit: i.fit,
            quantity: i.quantity,
          })),
          discount_code: discountCode || undefined,
        },
      });

      if (error || !data?.url) {
        // supabase-js no mete el body de una respuesta de error (400/404/500)
        // en `data` — hay que leerlo directo de la respuesta HTTP cruda.
        let reason = data?.error;
        if (!reason && error?.context?.json) {
          try {
            reason = (await error.context.json())?.error;
          } catch { /* respuesta sin JSON, se usa el mensaje genérico */ }
        }
        throw new Error(reason || 'No se pudo iniciar el pago.');
      }

      window.location.href = data.url;
    } catch (err) {
      console.error(err);
      cartDrawerMsg.textContent = err.message || 'Error al iniciar el pago. Intenta de nuevo.';
      cartDrawerSubmit.disabled = false;
      cartDrawerSubmit.textContent = originalText;
    }
  });
}

document.addEventListener('DOMContentLoaded', renderCartBadge);
