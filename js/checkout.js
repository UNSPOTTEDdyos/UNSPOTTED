/* =============================================
   UNSPOTTED — Modal de pedido (talla + descuento) + Pagar ahora (Stripe)
   ============================================= */

const orderModal = document.getElementById('order-modal');
const orderModalImg = document.getElementById('order-modal-img');
const orderModalName = document.getElementById('order-modal-name');
const orderModalPrice = document.getElementById('order-modal-price');
const orderModalSizes = document.getElementById('order-modal-sizes');
const orderModalQtyMinus = document.getElementById('order-modal-qty-minus');
const orderModalQtyPlus = document.getElementById('order-modal-qty-plus');
const orderModalQtyValue = document.getElementById('order-modal-qty-value');
const orderModalQtyStock = document.getElementById('order-modal-qty-stock');
const orderModalDiscount = document.getElementById('order-modal-discount');
const orderModalSubmit = document.getElementById('order-modal-submit');
const orderModalMsg = document.getElementById('order-modal-msg');
const orderModalClose = document.getElementById('order-modal-close');
const orderModalBackdrop = document.getElementById('order-modal-backdrop');

let currentProduct = null;
let selectedSize = null;
let selectedQty = 1;
let maxQty = 0;

function updateQtyControls() {
  orderModalQtyValue.textContent = String(selectedQty);
  orderModalQtyMinus.disabled = !selectedSize || selectedQty <= 1;
  orderModalQtyPlus.disabled = !selectedSize || selectedQty >= maxQty;
  orderModalQtyStock.textContent = selectedSize ? `${maxQty} disponibles en talla ${selectedSize}` : '';
}

function openOrderModal(product) {
  if (!orderModal || !product) return;

  currentProduct = product;
  selectedSize = null;
  selectedQty = 1;
  maxQty = 0;

  orderModalImg.src = product.image_front;
  orderModalImg.alt = product.name;
  orderModalName.textContent = product.name;
  orderModalPrice.textContent = formatPrice(product.price);
  orderModalDiscount.value = '';
  orderModalMsg.textContent = '';
  orderModalSubmit.disabled = true;
  orderModalSubmit.textContent = 'Pagar ahora →';
  updateQtyControls();

  const sizes = product.sizes || {};
  orderModalSizes.innerHTML = SIZE_ORDER.map((size) => {
    const stock = Number(sizes[size] || 0);
    const soldOut = stock <= 0;
    return `<button type="button" class="size-chip${soldOut ? ' size-chip--soldout' : ''}" data-size="${size}" ${soldOut ? 'disabled' : ''}>${size}</button>`;
  }).join('');

  orderModal.classList.add('is-open');
  orderModal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeOrderModal() {
  if (!orderModal) return;
  orderModal.classList.remove('is-open');
  orderModal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  currentProduct = null;
  selectedSize = null;
}

document.addEventListener('click', (e) => {
  const trigger = e.target.closest('.product-card__image-wrap');
  if (!trigger) return;

  const productId = trigger.dataset.productId;
  const product = productsById[productId];
  if (product) openOrderModal(product);
});

if (orderModalSizes) {
  orderModalSizes.addEventListener('click', (e) => {
    const chip = e.target.closest('.size-chip:not(.size-chip--soldout)');
    if (!chip) return;

    orderModalSizes.querySelectorAll('.size-chip').forEach((c) => c.classList.remove('is-selected'));
    chip.classList.add('is-selected');
    selectedSize = chip.dataset.size;
    maxQty = Number((currentProduct.sizes || {})[selectedSize] || 0);
    selectedQty = 1;
    updateQtyControls();
    orderModalSubmit.disabled = false;
  });
}

if (orderModalQtyMinus) {
  orderModalQtyMinus.addEventListener('click', () => {
    if (selectedQty <= 1) return;
    selectedQty -= 1;
    updateQtyControls();
  });
}

if (orderModalQtyPlus) {
  orderModalQtyPlus.addEventListener('click', () => {
    if (selectedQty >= maxQty) return;
    selectedQty += 1;
    updateQtyControls();
  });
}

if (orderModalClose) orderModalClose.addEventListener('click', closeOrderModal);
if (orderModalBackdrop) orderModalBackdrop.addEventListener('click', closeOrderModal);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && orderModal?.classList.contains('is-open')) closeOrderModal();
});

if (orderModalSubmit) {
  orderModalSubmit.addEventListener('click', async () => {
    if (!currentProduct || !selectedSize) return;

    orderModalMsg.textContent = '';
    orderModalSubmit.disabled = true;
    const originalText = orderModalSubmit.textContent;
    orderModalSubmit.textContent = 'Redirigiendo…';

    const discountCode = orderModalDiscount.value.trim();

    try {
      const { data, error } = await supabaseClient.functions.invoke('create-checkout-session', {
        body: {
          product_id: currentProduct.id,
          size: selectedSize,
          quantity: selectedQty,
          discount_code: discountCode || undefined,
        },
      });

      if (error || !data?.url) {
        // Cuando la función responde con un status de error (400/404/500),
        // supabase-js no mete el body en `data` — hay que leerlo directo de
        // la respuesta HTTP que trae el propio error para ver el motivo real.
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
      orderModalMsg.textContent = err.message || 'Error al iniciar el pago. Intenta de nuevo.';
      orderModalSubmit.disabled = false;
      orderModalSubmit.textContent = originalText;
    }
  });
}
