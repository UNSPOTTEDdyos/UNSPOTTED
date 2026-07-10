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
    const { product_id, size } = await req.json();

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

    // El pedido NO se crea aquí. Si se creara ahora, cualquiera que abra el
    // checkout y no pague dejaría una fila "pending" basura en la tabla.
    // En vez de eso, mandamos los datos ya verificados (precio real, nombre
    // real) como metadata de la sesión, y el webhook crea el pedido —
    // directo como "paid" — solo si el pago se completa de verdad.
    const siteUrl = Deno.env.get('SITE_URL') ?? 'http://localhost:8080';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'mxn',
            product_data: { name: `${product.name} — Talla ${size}` },
            unit_amount: Math.round(Number(product.price) * 100),
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
        price: String(product.price),
      },
    });

    return jsonResponse({ url: session.url });
  } catch (err) {
    console.error(err);
    return jsonResponse({ error: 'Error al crear la sesión de pago.' }, 500);
  }
});
