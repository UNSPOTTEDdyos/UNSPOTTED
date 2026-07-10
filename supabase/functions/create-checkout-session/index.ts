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

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        product_id: product.id,
        product_name: product.name,
        size,
        price: product.price,
        status: 'pending',
      })
      .select()
      .single();

    if (orderError || !order) {
      console.error(orderError);
      return jsonResponse({ error: 'No se pudo crear el pedido.' }, 500);
    }

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
      metadata: { order_id: order.id },
    });

    await supabase
      .from('orders')
      .update({ stripe_session_id: session.id })
      .eq('id', order.id);

    return jsonResponse({ url: session.url });
  } catch (err) {
    console.error(err);
    return jsonResponse({ error: 'Error al crear la sesión de pago.' }, 500);
  }
});
