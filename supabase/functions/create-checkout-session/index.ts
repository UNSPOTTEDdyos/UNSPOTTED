// UNSPOTTED — crea una Stripe Checkout Session para un producto/talla real
// Nunca confía en el precio que mande el cliente: siempre lo relee de la DB.

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
    const { product_id, size, discount_code } = await req.json();

    if (!product_id || !size) {
      return jsonResponse({ error: 'Faltan datos (product_id, size).' }, 400);
    }

    const { data: product, error: productError } = await supabase
      .from('products')
      .select('*')
      .eq('id', product_id)
      .eq('active', true)
      .single();

    if (productError || !product) {
      return jsonResponse({ error: 'Producto no encontrado.' }, 404);
    }

    const stock = Number(product.sizes?.[size] ?? 0);
    if (stock <= 0) {
      return jsonResponse({ error: 'Esa talla está agotada.' }, 400);
    }

    // El código de descuento nunca se confía tal cual del cliente: se relee
    // de la DB (tabla sin lectura pública, solo esta función la puede leer
    // vía service_role) y se valida activo/no expirado/con usos disponibles.
    const originalPrice = Number(product.price);
    let finalPrice = originalPrice;
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
        : originalPrice * (Number(discount.value) / 100);

      // Nunca dejar el cobro en $0 o negativo, y respetar el mínimo que
      // acepta Stripe para MXN.
      const MIN_CHARGE_MXN = 10;
      discountAmount = Math.max(0, Math.min(discountAmount, originalPrice - MIN_CHARGE_MXN));
      finalPrice = Math.round((originalPrice - discountAmount) * 100) / 100;
      appliedCode = normalizedCode;
    }

    // El pedido NO se crea aquí. Si se creara ahora, cualquiera que abra el
    // checkout y no pague dejaría una fila "pending" basura en la tabla.
    // En vez de eso, mandamos los datos ya verificados (precio real, nombre
    // real) como metadata de la sesión, y el webhook crea el pedido —
    // directo como "paid" — solo si el pago se completa de verdad. El
    // descuento (si hay) también se acredita ahí (used_count += 1) solo
    // cuando el pago se confirma, no cuando se abre el checkout.
    const siteUrl = Deno.env.get('SITE_URL') ?? 'http://localhost:8080';

    const productName = appliedCode
      ? `${product.name} — Talla ${size} (${appliedCode})`
      : `${product.name} — Talla ${size}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'mxn',
            product_data: { name: productName },
            unit_amount: Math.round(finalPrice * 100),
          },
          quantity: 1,
        },
      ],
      shipping_address_collection: { allowed_countries: ['MX'] },
      phone_number_collection: { enabled: true },
      success_url: `${siteUrl}/checkout-success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/checkout-cancel.html`,
      metadata: {
        product_id: product.id,
        product_name: product.name,
        size,
        price: String(finalPrice),
        discount_code: appliedCode ?? '',
        discount_amount: String(discountAmount),
      },
    });

    return jsonResponse({ url: session.url });
  } catch (err) {
    console.error(err);
    return jsonResponse({ error: 'Error al crear la sesión de pago.' }, 500);
  }
});
