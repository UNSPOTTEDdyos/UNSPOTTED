/* =============================================
   UNSPOTTED — Productos (fetch + render)
   Usado por drops.html (grid completo) e index.html (preview)
   ============================================= */

const SIZE_ORDER = ['S', 'M', 'L', 'XL'];

// Productos activos, indexados por id — lo usa js/checkout.js para poblar
// el modal de pedido sin tener que volver a pedirlos a Supabase.
let productsById = {};

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatPrice(price) {
  return `$${Number(price).toLocaleString('es-MX')} MXN`;
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

  article.innerHTML = `
    <div class="product-card__image-wrap" data-product-id="${product.id}">
      <img class="product-card__img product-card__img--front" src="${product.image_front}" alt="${escapeHtml(product.name)}" loading="lazy" />
      ${product.image_back ? `<img class="product-card__img product-card__img--back" src="${product.image_back}" alt="${escapeHtml(product.name)}" loading="lazy" />` : ''}
      <div class="product-card__overlay">
        <span class="product-card__overlay-text">PEDIR →</span>
      </div>
    </div>
    <div class="product-card__info">
      <p class="product-card__name">${escapeHtml(product.name)}</p>
      <p class="product-card__price">${formatPrice(product.price)}</p>
    </div>
  `;

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

  products.forEach((product) => { productsById[product.id] = product; });

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
