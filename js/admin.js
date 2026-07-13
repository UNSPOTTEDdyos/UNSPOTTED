/* =============================================
   UNSPOTTED — Panel de administración
   ============================================= */

const loginView = document.getElementById('login-view');
const dashboardView = document.getElementById('dashboard-view');
const loginForm = document.getElementById('login-form');
const loginMsg = document.getElementById('login-msg');
const logoutBtn = document.getElementById('logout-btn');
const addProductForm = document.getElementById('add-product-form');
const addProductMsg = document.getElementById('add-product-msg');
const productsTbody = document.getElementById('products-tbody');
const productsEmpty = document.getElementById('products-empty');
const ordersTbody = document.getElementById('orders-tbody');
const ordersEmpty = document.getElementById('orders-empty');
const addDiscountForm = document.getElementById('add-discount-form');
const addDiscountMsg = document.getElementById('add-discount-msg');
const discountsTbody = document.getElementById('discounts-tbody');
const discountsEmpty = document.getElementById('discounts-empty');

function showDashboard() {
  loginView.classList.add('hidden');
  dashboardView.classList.remove('hidden');
  loadProducts();
  loadOrders();
  loadDiscounts();
}

function showLogin() {
  dashboardView.classList.add('hidden');
  loginView.classList.remove('hidden');
}

/* --- Auth --- */
async function checkSession() {
  const { data } = await supabaseClient.auth.getSession();
  if (data.session) {
    showDashboard();
  } else {
    showLogin();
  }
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginMsg.textContent = '';

  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

  if (error) {
    loginMsg.textContent = 'Email o contraseña incorrectos.';
    return;
  }

  showDashboard();
});

logoutBtn.addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  showLogin();
});

/* --- Cargar y renderizar productos --- */
async function loadProducts() {
  const { data, error } = await supabaseClient
    .from('products')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('Error al cargar productos:', error);
    return;
  }

  productsTbody.innerHTML = '';
  productsEmpty.classList.toggle('hidden', data.length > 0);

  data.forEach((product) => productsTbody.appendChild(renderProductRow(product)));
}

function renderProductRow(product) {
  const tr = document.createElement('tr');
  tr.dataset.id = product.id;

  const sizes = product.sizes || {};

  tr.innerHTML = `
    <td><img src="${product.image_front}" alt="${product.name}" /></td>
    <td>
      <div class="f-image-extra">
        ${product.image_extra ? `<img src="${product.image_extra}" alt="${product.name} puesta en persona" />` : ''}
        <input type="file" class="f-image-extra-input" accept="image/*" />
      </div>
    </td>
    <td><input type="text" class="f-name" value="${product.name.replace(/"/g, '&quot;')}" /></td>
    <td><input type="number" class="f-price" min="0" step="1" value="${product.price}" /></td>
    <td><input type="number" class="f-size-s" min="0" step="1" value="${sizes.S ?? 0}" /></td>
    <td><input type="number" class="f-size-m" min="0" step="1" value="${sizes.M ?? 0}" /></td>
    <td><input type="number" class="f-size-l" min="0" step="1" value="${sizes.L ?? 0}" /></td>
    <td><input type="number" class="f-size-xl" min="0" step="1" value="${sizes.XL ?? 0}" /></td>
    <td><input type="checkbox" class="f-active" ${product.active ? 'checked' : ''} /></td>
    <td><input type="number" class="f-order" min="0" step="1" value="${product.sort_order}" /></td>
    <td class="col-actions">
      <button type="button" class="btn btn-secondary btn-save">Guardar</button>
      <button type="button" class="btn btn-danger btn-delete">Eliminar</button>
      <span class="row-msg"></span>
    </td>
  `;

  tr.querySelector('.btn-save').addEventListener('click', () => saveProduct(tr, product.id));
  tr.querySelector('.btn-delete').addEventListener('click', () => deleteProduct(tr, product.id));
  tr.querySelector('.f-image-extra-input').addEventListener('change', (e) => uploadExtraImage(tr, product.id, e.target.files[0]));

  return tr;
}

async function uploadExtraImage(tr, id, file) {
  if (!file) return;
  const rowMsg = tr.querySelector('.row-msg');
  rowMsg.textContent = 'Subiendo foto…';
  rowMsg.classList.remove('is-ok');

  try {
    const imageExtraUrl = await uploadImage(file);
    const { error } = await supabaseClient.from('products').update({ image_extra: imageExtraUrl }).eq('id', id);
    if (error) throw error;

    rowMsg.textContent = 'Foto guardada ✓';
    rowMsg.classList.add('is-ok');
    setTimeout(() => { rowMsg.textContent = ''; }, 2000);

    const cell = tr.querySelector('.f-image-extra');
    let img = cell.querySelector('img');
    if (!img) {
      img = document.createElement('img');
      cell.insertBefore(img, cell.firstChild);
    }
    img.src = imageExtraUrl;
    img.alt = 'Puesta en persona';
  } catch (err) {
    console.error(err);
    rowMsg.textContent = 'Error al subir la foto';
  }
}

async function saveProduct(tr, id) {
  const rowMsg = tr.querySelector('.row-msg');
  rowMsg.textContent = 'Guardando…';
  rowMsg.classList.remove('is-ok');

  const updates = {
    name: tr.querySelector('.f-name').value.trim(),
    price: Number(tr.querySelector('.f-price').value),
    sizes: {
      S: Number(tr.querySelector('.f-size-s').value),
      M: Number(tr.querySelector('.f-size-m').value),
      L: Number(tr.querySelector('.f-size-l').value),
      XL: Number(tr.querySelector('.f-size-xl').value),
    },
    active: tr.querySelector('.f-active').checked,
    sort_order: Number(tr.querySelector('.f-order').value),
  };

  const { error } = await supabaseClient.from('products').update(updates).eq('id', id);

  if (error) {
    rowMsg.textContent = 'Error al guardar';
    console.error(error);
    return;
  }

  rowMsg.textContent = 'Guardado ✓';
  rowMsg.classList.add('is-ok');
  setTimeout(() => { rowMsg.textContent = ''; }, 2000);
}

async function deleteProduct(tr, id) {
  if (!confirm('¿Eliminar este producto? Esta acción no se puede deshacer.')) return;

  const { error } = await supabaseClient.from('products').delete().eq('id', id);

  if (error) {
    alert('Error al eliminar el producto.');
    console.error(error);
    return;
  }

  tr.remove();
  productsEmpty.classList.toggle('hidden', productsTbody.children.length > 0);
}

/* --- Agregar producto --- */
async function uploadImage(file) {
  const path = `${Date.now()}-${file.name}`;
  const { error } = await supabaseClient.storage.from('product-images').upload(path, file);

  if (error) throw error;

  const { data } = supabaseClient.storage.from('product-images').getPublicUrl(path);
  return data.publicUrl;
}

addProductForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  addProductMsg.textContent = 'Subiendo…';
  addProductMsg.classList.remove('is-ok');

  const submitBtn = addProductForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;

  try {
    const name = document.getElementById('new-name').value.trim();
    const price = Number(document.getElementById('new-price').value);
    const sortOrder = Number(document.getElementById('new-order').value);
    const frontFile = document.getElementById('new-image-front').files[0];
    const backFile = document.getElementById('new-image-back').files[0];
    const extraFile = document.getElementById('new-image-extra').files[0];

    if (!name || !price || !frontFile) {
      addProductMsg.textContent = 'Nombre, precio y foto frontal son obligatorios.';
      submitBtn.disabled = false;
      return;
    }

    const imageFrontUrl = await uploadImage(frontFile);
    const imageBackUrl = backFile ? await uploadImage(backFile) : null;
    const imageExtraUrl = extraFile ? await uploadImage(extraFile) : null;

    const sizes = {
      S: Number(document.getElementById('new-size-s').value),
      M: Number(document.getElementById('new-size-m').value),
      L: Number(document.getElementById('new-size-l').value),
      XL: Number(document.getElementById('new-size-xl').value),
    };

    const { error } = await supabaseClient.from('products').insert({
      name,
      price,
      image_front: imageFrontUrl,
      image_back: imageBackUrl,
      image_extra: imageExtraUrl,
      sizes,
      active: true,
      sort_order: sortOrder,
    });

    if (error) throw error;

    addProductMsg.textContent = 'Producto agregado ✓';
    addProductMsg.classList.add('is-ok');
    addProductForm.reset();
    loadProducts();
  } catch (err) {
    console.error(err);
    addProductMsg.textContent = 'Error al agregar el producto.';
  } finally {
    submitBtn.disabled = false;
  }
});

/* --- Pedidos --- */
const ORDER_STATUS_LABEL = {
  pending: 'Pendiente',
  paid: 'Pagado',
  cancelled: 'Cancelado',
  shipped: 'Enviado',
};

async function loadOrders() {
  const { data, error } = await supabaseClient
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error al cargar pedidos:', error);
    return;
  }

  // Un checkout puede generar varias filas en `orders` (una por producto del
  // carrito) que comparten el mismo stripe_session_id — se agrupan aquí para
  // mostrar un solo renglón por pedido, con todos sus productos adentro.
  const groups = groupOrdersBySession(data);

  ordersTbody.innerHTML = '';
  ordersEmpty.classList.toggle('hidden', groups.length > 0);

  groups.forEach((group) => ordersTbody.appendChild(renderOrderGroup(group)));
}

function groupOrdersBySession(rows) {
  const map = new Map();
  rows.forEach((row) => {
    const key = row.stripe_session_id || row.id;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  });
  return Array.from(map.values());
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function renderOrderGroup(rows) {
  const tr = document.createElement('tr');
  const first = rows[0];
  const date = new Date(first.created_at).toLocaleDateString('es-MX');
  const statusLabel = ORDER_STATUS_LABEL[first.status] || first.status;

  // customer_name / customer_phone / shipping_address vienen de lo que el
  // cliente escribió en Stripe Checkout — no son datos de confianza, se escapan.
  const canShip = first.status === 'paid' || first.status === 'shipped';

  const totalQty = rows.reduce((sum, r) => sum + (r.quantity ?? 1), 0);
  const totalPrice = rows.reduce((sum, r) => sum + Number(r.price), 0);

  const productsHtml = rows
    .map((r) => `${escapeHtml(r.product_name)} — ${escapeHtml(r.size)} — ${escapeHtml(r.fit) || '—'} × ${r.quantity ?? 1}`)
    .join('<br />');

  tr.innerHTML = `
    <td>${date}</td>
    <td class="col-products">${productsHtml}</td>
    <td>$${totalPrice.toLocaleString('es-MX')}<br /><span class="row-hint">${totalQty} pza${totalQty === 1 ? '' : 's'}</span></td>
    <td>${escapeHtml(first.customer_name) || '—'}</td>
    <td>${escapeHtml(first.customer_phone) || '—'}</td>
    <td>${escapeHtml(first.shipping_address) || '—'}</td>
    <td>${statusLabel}</td>
    <td>${canShip ? `<input type="text" class="f-tracking" placeholder="Número de guía" value="${escapeHtml(first.tracking_number)}" />` : '—'}</td>
    <td class="col-actions"></td>
  `;

  const ids = rows.map((r) => r.id);
  const actionsCell = tr.querySelector('.col-actions');

  if (canShip) {
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'btn btn-secondary';
    saveBtn.textContent = 'Guardar guía';
    saveBtn.addEventListener('click', () => saveTrackingNumber(ids, tr));
    actionsCell.appendChild(saveBtn);
  }

  if (first.status === 'paid') {
    const shipBtn = document.createElement('button');
    shipBtn.type = 'button';
    shipBtn.className = 'btn btn-secondary';
    shipBtn.textContent = 'Marcar enviado';
    shipBtn.addEventListener('click', () => markOrderShipped(ids, tr));
    actionsCell.appendChild(shipBtn);
  }

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'btn btn-danger';
  deleteBtn.textContent = 'Eliminar';
  deleteBtn.addEventListener('click', () => deleteOrder(ids, tr));
  actionsCell.appendChild(deleteBtn);

  return tr;
}

async function deleteOrder(ids, tr) {
  if (!confirm('¿Eliminar este pedido? Esta acción no se puede deshacer.')) return;

  const { error } = await supabaseClient.from('orders').delete().in('id', ids);

  if (error) {
    alert('Error al eliminar el pedido.');
    console.error(error);
    return;
  }

  tr.remove();
  ordersEmpty.classList.toggle('hidden', ordersTbody.children.length > 0);
}

async function saveTrackingNumber(ids, tr) {
  const trackingNumber = tr.querySelector('.f-tracking').value.trim();

  const { error } = await supabaseClient
    .from('orders')
    .update({ tracking_number: trackingNumber })
    .in('id', ids);

  if (error) {
    alert('Error al guardar la guía.');
    console.error(error);
    return;
  }

  loadOrders();
}

async function markOrderShipped(ids, tr) {
  const trackingNumber = tr.querySelector('.f-tracking')?.value.trim() || null;

  const { error } = await supabaseClient
    .from('orders')
    .update({ status: 'shipped', tracking_number: trackingNumber })
    .in('id', ids);

  if (error) {
    alert('Error al actualizar el pedido.');
    console.error(error);
    return;
  }

  loadOrders();
}

/* --- Códigos de descuento --- */
async function loadDiscounts() {
  const { data, error } = await supabaseClient
    .from('discount_codes')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error al cargar códigos de descuento:', error);
    return;
  }

  discountsTbody.innerHTML = '';
  discountsEmpty.classList.toggle('hidden', data.length > 0);

  data.forEach((discount) => discountsTbody.appendChild(renderDiscountRow(discount)));
}

function renderDiscountRow(discount) {
  const tr = document.createElement('tr');
  const expires = discount.expires_at ? new Date(discount.expires_at).toLocaleDateString('es-MX') : '—';
  const valueLabel = discount.type === 'percent' ? `${Number(discount.value)}%` : `$${Number(discount.value).toLocaleString('es-MX')}`;

  tr.innerHTML = `
    <td>${escapeHtml(discount.code)}</td>
    <td>${discount.type === 'percent' ? 'Porcentaje' : 'Monto fijo'}</td>
    <td>${valueLabel}</td>
    <td>${discount.used_count}</td>
    <td>${discount.max_uses ?? '—'}</td>
    <td>${expires}</td>
    <td><input type="checkbox" class="f-active" ${discount.active ? 'checked' : ''} /></td>
    <td class="col-actions">
      <button type="button" class="btn btn-secondary btn-save">Guardar</button>
      <button type="button" class="btn btn-danger btn-delete">Eliminar</button>
      <span class="row-msg"></span>
    </td>
  `;

  tr.querySelector('.btn-save').addEventListener('click', () => saveDiscount(tr, discount.id));
  tr.querySelector('.btn-delete').addEventListener('click', () => deleteDiscount(tr, discount.id));

  return tr;
}

async function saveDiscount(tr, id) {
  const rowMsg = tr.querySelector('.row-msg');
  rowMsg.textContent = 'Guardando…';
  rowMsg.classList.remove('is-ok');

  const active = tr.querySelector('.f-active').checked;
  const { error } = await supabaseClient.from('discount_codes').update({ active }).eq('id', id);

  if (error) {
    rowMsg.textContent = 'Error al guardar';
    console.error(error);
    return;
  }

  rowMsg.textContent = 'Guardado ✓';
  rowMsg.classList.add('is-ok');
  setTimeout(() => { rowMsg.textContent = ''; }, 2000);
}

async function deleteDiscount(tr, id) {
  if (!confirm('¿Eliminar este código de descuento? Esta acción no se puede deshacer.')) return;

  const { error } = await supabaseClient.from('discount_codes').delete().eq('id', id);

  if (error) {
    alert('Error al eliminar el código.');
    console.error(error);
    return;
  }

  tr.remove();
  discountsEmpty.classList.toggle('hidden', discountsTbody.children.length > 0);
}

addDiscountForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  addDiscountMsg.textContent = '';
  addDiscountMsg.classList.remove('is-ok');

  const submitBtn = addDiscountForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;

  try {
    const code = document.getElementById('new-discount-code').value.trim().toUpperCase();
    const type = document.getElementById('new-discount-type').value;
    const value = Number(document.getElementById('new-discount-value').value);
    const maxUsesRaw = document.getElementById('new-discount-max-uses').value;
    const expiresRaw = document.getElementById('new-discount-expires').value;

    if (!code || !value) {
      addDiscountMsg.textContent = 'Código y valor son obligatorios.';
      submitBtn.disabled = false;
      return;
    }

    const { error } = await supabaseClient.from('discount_codes').insert({
      code,
      type,
      value,
      max_uses: maxUsesRaw ? Number(maxUsesRaw) : null,
      expires_at: expiresRaw ? new Date(expiresRaw).toISOString() : null,
      active: true,
    });

    if (error) throw error;

    addDiscountMsg.textContent = 'Código creado ✓';
    addDiscountMsg.classList.add('is-ok');
    addDiscountForm.reset();
    loadDiscounts();
  } catch (err) {
    console.error(err);
    addDiscountMsg.textContent = err.code === '23505' ? 'Ese código ya existe.' : 'Error al crear el código.';
  } finally {
    submitBtn.disabled = false;
  }
});

checkSession();
