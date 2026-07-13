/* =============================================
   UNSPOTTED — Modal de producto (talla + corte + cantidad)
   Agrega el item al carrito (ver js/cart.js) — el pago se
   hace desde el carrito, no aquí.
   ============================================= */

const orderModal = document.getElementById('order-modal');
const orderModalImg = document.getElementById('order-modal-img');
const orderModalName = document.getElementById('order-modal-name');
const orderModalPrice = document.getElementById('order-modal-price');
const orderModalSizes = document.getElementById('order-modal-sizes');
const orderModalFit = document.getElementById('order-modal-fit');
const orderModalQtyMinus = document.getElementById('order-modal-qty-minus');
const orderModalQtyPlus = document.getElementById('order-modal-qty-plus');
const orderModalQtyValue = document.getElementById('order-modal-qty-value');
const orderModalQtyStock = document.getElementById('order-modal-qty-stock');
const orderModalSubmit = document.getElementById('order-modal-submit');
const orderModalMsg = document.getElementById('order-modal-msg');
const orderModalClose = document.getElementById('order-modal-close');
const orderModalBackdrop = document.getElementById('order-modal-backdrop');

let currentProduct = null;
let selectedSize = null;
let selectedFit = null;
let selectedQty = 1;
let maxQty = 0;

function updateQtyControls() {
  orderModalQtyValue.textContent = String(selectedQty);
  orderModalQtyMinus.disabled = !selectedSize || selectedQty <= 1;
  orderModalQtyPlus.disabled = !selectedSize || selectedQty >= maxQty;
  orderModalQtyStock.textContent = selectedSize ? `${maxQty} disponibles en talla ${selectedSize}` : '';
}

function updateSubmitState() {
  orderModalSubmit.disabled = !(selectedSize && selectedFit);
}

function openOrderModal(product) {
  if (!orderModal || !product) return;

  currentProduct = product;
  selectedSize = null;
  selectedFit = null;
  selectedQty = 1;
  maxQty = 0;

  orderModalImg.src = product.image_front;
  orderModalImg.alt = product.name;
  orderModalName.textContent = product.name;
  orderModalPrice.textContent = formatPrice(product.price);
  orderModalMsg.textContent = '';
  orderModalSubmit.textContent = 'Agregar al carrito';
  updateQtyControls();
  updateSubmitState();

  const sizes = product.sizes || {};
  orderModalSizes.innerHTML = SIZE_ORDER.map((size) => {
    const stock = Number(sizes[size] || 0);
    const soldOut = stock <= 0;
    return `<button type="button" class="size-chip${soldOut ? ' size-chip--soldout' : ''}" data-size="${size}" ${soldOut ? 'disabled' : ''}>${size}</button>`;
  }).join('');

  if (orderModalFit) {
    orderModalFit.querySelectorAll('.size-chip').forEach((c) => c.classList.remove('is-selected'));
  }
  orderModalSizes.querySelectorAll('.size-chip').forEach((c) => c.classList.remove('is-selected'));

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
  selectedFit = null;
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
    updateSubmitState();
  });
}

if (orderModalFit) {
  orderModalFit.addEventListener('click', (e) => {
    const chip = e.target.closest('.size-chip');
    if (!chip) return;

    orderModalFit.querySelectorAll('.size-chip').forEach((c) => c.classList.remove('is-selected'));
    chip.classList.add('is-selected');
    selectedFit = chip.dataset.fit;
    updateSubmitState();
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
  orderModalSubmit.addEventListener('click', () => {
    if (!currentProduct || !selectedSize || !selectedFit) return;

    addToCart({
      product_id: currentProduct.id,
      name: currentProduct.name,
      image: currentProduct.image_front,
      price: Number(currentProduct.price),
      size: selectedSize,
      fit: selectedFit,
      quantity: selectedQty,
      maxQty,
    });

    orderModalMsg.textContent = '';
    closeOrderModal();
    openCartDrawer();
  });
}
