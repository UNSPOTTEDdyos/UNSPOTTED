// UNSPOTTED — crea una Stripe Checkout Session para el carrito completo
// (uno o más productos). Nunca confía en nada que mande el cliente: precio,
// nombre y stock de cada línea se releen siempre de la DB.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VALID_FITS = ['Oversized', 'Cropped'];
const MIN_CHARGE_MXN = 10;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { items, discount_code } = await req.json();

    if (!Array.isArray(items) || items.length === 0) {
      return jsonResponse({ error: 'El carrito está vacío.' }, 400);
    }
    if (items.length > 20) {
      return jsonResponse({ error: 'Demasiados productos en el carrito.' }, 400);
    }

    // --- Validar cada línea y traer el producto real de la DB (una sola vez
    // por producto, aunque aparezca en varias líneas con distinto corte) ---
    const productCache = new Map<string, any>();
    const validatedItems: {
      product_id: string;
      product_name: string;
      size: string;
      fit: string;
      quantity: number;
      unit_price: number;
    }[] = [];

    for (const raw of items) {
      const product_id = raw?.product_id;
      const size = raw?.size;
      const fit = raw?.fit;

      if (!product_id || !size) {
        return jsonResponse({ error: 'Faltan datos de un producto (talla).' }, 400);
      }
      if (!VALID_FITS.includes(fit)) {
        return jsonResponse({ error: 'Falta elegir el corte (Oversized o Cropped) de un producto.' }, 400);
      }

      let quantity = Number.isInteger(Number(raw?.quantity)) ? Number(raw.quantity) : 1;
      if (quantity < 1) quantity = 1;

      if (!productCache.has(product_id)) {
        const { data: product, error: productError } = await supabase
          .from('products')
          .select('*')
          .eq('id', product_id)
          .eq('active', true)
          .single();

        productCache.set(product_id, productError ? null : product);
      }

      const product = productCache.get(product_id);
      if (!product) {
        return jsonResponse({ error: 'Uno de los productos del carrito ya no está disponible.' }, 404);
      }

      validatedItems.push({
        product_id: product.id,
        product_name: product.name,
        size,
        fit,
        quantity,
        unit_price: Number(product.price),
      });
    }

    // --- Revalidar stock agregado por producto+talla (dos líneas del mismo
    // producto/talla con distinto corte comparten el mismo stock) ---
    const neededByProductSize = new Map<string, number>();
    for (const item of validatedItems) {
      const key = `${item.product_id}::${item.size}`;
      neededByProductSize.set(key, (neededByProductSize.get(key) ?? 0) + item.quantity);
    }

    for (const [key, neededQty] of neededByProductSize) {
      const [product_id, size] = key.split('::');
      const product = productCache.get(product_id);
      const stock = Number(product.sizes?.[size] ?? 0);

      if (stock <= 0) {
        return jsonResponse({ error: `${product.name} — talla ${size} está agotada.` }, 400);
      }
      if (neededQty > stock) {
        return jsonResponse({ error: `Solo quedan ${stock} piezas de ${product.name} talla ${size}.` }, 400);
      }
    }

    const cartTotal = validatedItems.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);

    // --- Código de descuento (opcional): se relee de la DB, nunca se
    // confía en un monto que mande el cliente. Se aplica una sola vez sobre
    // el total del carrito vía un cupón de Stripe ad-hoc. ---
    let discountAmount = 0;
    let appliedCode: string | null = null;

    if (discount_code && String(discount_code).trim()) {
      const normalizedCode = String(discount_code).trim().toUpperCase();

      const { data: discount, error: discountError } = await supabase
        .from('discount_codes')
        .select('*')
        .eq('code', normalizedCode)
        .eq('active', true)
        .maybeSingle();

      if (discountError || !discount) {
        return jsonResponse({ error: 'Código de descuento inválido.' }, 400);
      }

      if (discount.expires_at && new Date(discount.expires_at) < new Date()) {
        return jsonResponse({ error: 'Este código de descuento ya expiró.' }, 400);
      }

      if (discount.max_uses != null && Number(discount.used_count) >= Number(discount.max_uses)) {
        return jsonResponse({ error: 'Este código de descuento ya alcanzó su límite de usos.' }, 400);
      }

      discountAmount = discount.type === 'fixed'
        ? Number(discount.value)
        : cartTotal * (Number(discount.value) / 100);

      // Nunca dejar el cobro en $0 o negativo, y respetar el mínimo que
      // acepta Stripe para MXN.
      discountAmount = Math.max(0, Math.min(discountAmount, cartTotal - MIN_CHARGE_MXN));
      appliedCode = normalizedCode;
    }

    // --- El pedido NO se crea aquí. En vez de eso, el carrito ya validado
    // se guarda en pending_carts, y el webhook lo lee y crea los pedidos
    // reales (uno por línea) solo si el pago se completa de verdad. ---
    const { data: pendingCart, error: cartError } = await supabase
      .from('pending_carts')
      .insert({ items: validatedItems })
      .select('id')
      .single();

    if (cartError || !pendingCart) {
      console.error('Error al guardar el carrito pendiente', cartError);
      return jsonResponse({ error: 'Error al iniciar el pago.' }, 500);
    }

    const siteUrl = Deno.env.get('SITE_URL') ?? 'http://localhost:8080';

    const discounts = [];
    if (discountAmount > 0) {
      const coupon = await stripe.coupons.create({
        amount_off: Math.round(discountAmount * 100),
        currency: 'mxn',
        duration: 'once',
        max_redemptions: 1,
        name: appliedCode ?? undefined,
      });
      discounts.push({ coupon: coupon.id });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: validatedItems.map((item) => ({
        price_data: {
          currency: 'mxn',
          product_data: { name: `${item.product_name} — Talla ${item.size} — ${item.fit}` },
          unit_amount: Math.round(item.unit_price * 100),
        },
        quantity: item.quantity,
      })),
      discounts,
      shipping_address_collection: { allowed_countries: ['MX'] },
      phone_number_collection: { enabled: true },
      success_url: `${siteUrl}/checkout-success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/checkout-cancel.html`,
      metadata: {
        cart_id: pendingCart.id,
        discount_code: appliedCode ?? '',
        discount_amount: String(Math.round(discountAmount * 100) / 100),
      },
    });

    return jsonResponse({ url: session.url });
  } catch (err) {
    console.error(err);
    return jsonResponse({ error: 'Error al crear la sesión de pago.' }, 500);
  }
});
