/* =============================================
   UNSPOTTED — Pagar ahora (Stripe Checkout)
   ============================================= */

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.product-card__btn--pay');
  if (!btn || btn.disabled) return;

  const productId = btn.dataset.productId;
  const size = btn.dataset.size;
  const msgEl = btn.closest('.product-card__info')?.querySelector('.product-card__pay-msg');

  if (!productId || !size) return;

  if (msgEl) msgEl.textContent = '';
  btn.disabled = true;
  const originalText = btn.textContent;
  btn.textContent = 'Redirigiendo…';

  try {
    const { data, error } = await supabaseClient.functions.invoke('create-checkout-session', {
      body: { product_id: productId, size },
    });

    if (error || !data?.url) {
      throw new Error(data?.error || 'No se pudo iniciar el pago.');
    }

    window.location.href = data.url;
  } catch (err) {
    console.error(err);
    if (msgEl) msgEl.textContent = err.message || 'Error al iniciar el pago. Intenta de nuevo.';
    btn.disabled = false;
    btn.textContent = originalText;
  }
});
