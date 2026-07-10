/* =============================================
   UNSPOTTED — Productos (fetch + render)
   Usado por drops.html (grid completo) e index.html (preview)
   ============================================= */

const WHATSAPP_NUMBER = '526563498795';
const SIZE_ORDER = ['S', 'M', 'L', 'XL'];

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatPrice(price) {
  return `$${Number(price).toLocaleString('es-MX')} MXN`;
}

function buildWhatsappLink(productName, size) {
  const sizeText = size ? size : '___';
  const message = `Hola, quiero apartar ${productName} talla ${sizeText} . Vi el drop en unspotted.com`;
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

async function fetchActiveProducts(limit) {
  let query = supabaseClient
    .from('products')
    .select('*')
    .eq('active', true)
    .order('sort_order', { ascending: true });

  if (limit) query = query.limit(limit);

  const { data, error } = await query;

  if (error) {
    console.error('Error al cargar productos:', error);
    return [];
  }

  return data || [];
}

/* --- Card completa (drops.html) --- */
function renderProductCard(product) {
  const article = document.createElement('article');
  article.className = 'product-card fade-in';

  const sizes = product.sizes || {};
  const whatsappHref = buildWhatsappLink(product.name, null);

  const sizeChipsHtml = SIZE_ORDER.map((size) => {
    const stock = Number(sizes[size] || 0);
    const soldOut = stock <= 0;
    return `<button type="button" class="size-chip${soldOut ? ' size-chip--soldout' : ''}" data-size="${size}" ${soldOut ? 'disabled' : ''}>${size}</button>`;
  }).join('');

  article.innerHTML = `
    <div class="product-card__image-wrap">
      <img class="product-card__img product-card__img--front" src="${product.image_front}" alt="${escapeHtml(product.name)}" loading="lazy" />
      ${product.image_back ? `<img class="product-card__img product-card__img--back" src="${product.image_back}" alt="${escapeHtml(product.name)}" loading="lazy" />` : ''}
      <div class="product-card__overlay">
        <span class="product-card__overlay-text">PEDIR →</span>
      </div>
    </div>
    <div class="product-card__info">
      <p class="product-card__name">${escapeHtml(product.name)}</p>
      <p class="product-card__price">${formatPrice(product.price)}</p>
      <div class="size-chips">${sizeChipsHtml}</div>
      <div class="product-card__actions">
        <button type="button" class="product-card__btn product-card__btn--pay" data-product-id="${product.id}" disabled>Pagar ahora →</button>
        <a class="product-card__btn" href="${whatsappHref}" target="_blank" rel="noopener">Pedir por WhatsApp →</a>
      </div>
      <p class="product-card__pay-msg"></p>
    </div>
  `;

  const whatsappBtn = article.querySelector('.product-card__btn:not(.product-card__btn--pay)');
  const payBtn = article.querySelector('.product-card__btn--pay');
  const chips = article.querySelectorAll('.size-chip:not(.size-chip--soldout)');

  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      chips.forEach((c) => c.classList.remove('is-selected'));
      chip.classList.add('is-selected');
      whatsappBtn.href = buildWhatsappLink(product.name, chip.dataset.size);
      payBtn.disabled = false;
      payBtn.dataset.size = chip.dataset.size;
    });
  });

  return article;
}

/* --- Card simple para el preview de la home (index.html) --- */
function renderPreviewCard(product, delayClass) {
  const wrap = document.createElement('div');
  wrap.className = `fade-in${delayClass ? ' ' + delayClass : ''}`;

  wrap.innerHTML = `
    <div class="drop-item__image">
      <img src="${product.image_front}" alt="${escapeHtml(product.name)}" loading="lazy" />
    </div>
    <p class="drop-item__name">${escapeHtml(product.name)}</p>
    <p class="drop-item__price">${formatPrice(product.price)}</p>
  `;

  return wrap;
}

/* --- Fade-in para elementos insertados después de que main.js
   ya haya recorrido el DOM (el observer de main.js solo ve los
   .fade-in que existían al cargar la página) --- */
function observeFadeIn(elements) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  elements.forEach((el) => observer.observe(el));
}

/* --- Init: drops.html --- */
async function initDropsGrid() {
  const grid = document.getElementById('drops-grid');
  if (!grid) return;

  const products = await fetchActiveProducts();

  if (!products.length) {
    grid.innerHTML = '<p class="drops-grid__empty">Próximamente nuevos productos.</p>';
    return;
  }

  grid.innerHTML = '';
  const cards = products.map((product) => renderProductCard(product));
  cards.forEach((card) => grid.appendChild(card));
  observeFadeIn(cards);
}

/* --- Init: index.html --- */
async function initHomePreview() {
  const grid = document.getElementById('home-drop-preview');
  if (!grid) return;

  const products = await fetchActiveProducts(2);

  if (!products.length) return;

  grid.innerHTML = '';
  const cards = products.map((product, i) => renderPreviewCard(product, i === 1 ? 'delay-1' : ''));
  cards.forEach((card) => grid.appendChild(card));
  observeFadeIn(cards);
}

document.addEventListener('DOMContentLoaded', () => {
  initDropsGrid();
  initHomePreview();
});
