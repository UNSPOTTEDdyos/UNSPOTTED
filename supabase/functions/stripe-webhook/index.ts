// UNSPOTTED — recibe la confirmación de pago de Stripe, marca la orden
// como pagada con los datos de envío, y resta el stock de esa talla.

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

Deno.serve(async (req) => {
  const signature = req.headers.get('stripe-signature');
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature!,
      Deno.env.get('STRIPE_WEBHOOK_SECRET')!
    );
  } catch (err) {
    console.error('Firma de Stripe inválida:', (err as Error).message);
    return new Response('Firma inválida', { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const meta = session.metadata;

    if (!meta?.product_id || !meta?.size || !meta?.price) {
      console.error('checkout.session.completed sin metadata de producto', session.id);
      return new Response('ok', { status: 200 });
    }

    // Stripe puede reenviar el mismo evento más de una vez (reintentos). Si ya
    // existe un pedido con este stripe_session_id, ya lo procesamos antes —
    // sin este chequeo se duplicaría el pedido y se restaría stock dos veces.
    const { data: existing } = await supabase
      .from('orders')
      .select('id')
      .eq('stripe_session_id', session.id)
      .maybeSingle();

    if (existing) {
      console.log('Evento ya procesado, ignorando duplicado', session.id);
      return new Response('ok', { status: 200 });
    }

    // shipping_details es lo normal cuando se activa shipping_address_collection,
    // pero si Stripe no la adjunta ahí (pasa en algunos checkouts), caemos a la
    // dirección del customer_details como respaldo.
    const shipping = session.shipping_details;
    const address = shipping?.address ?? session.customer_details?.address ?? null;
    const shippingAddress = address
      ? [address.line1, address.line2, address.city, address.state, address.postal_code, address.country]
          .filter(Boolean)
          .join(', ')
      : null;

    console.log('checkout.session.completed', {
      sessionId: session.id,
      productId: meta.product_id,
      size: meta.size,
      hasShippingAddress: !!session.shipping_details?.address,
      hasCustomerAddress: !!session.customer_details?.address,
      resolvedShippingAddress: shippingAddress,
    });

    const quantity = Math.max(1, Number(meta.quantity || 1));

    const { error: insertError } = await supabase.from('orders').insert({
      product_id: meta.product_id,
      product_name: meta.product_name,
      size: meta.size,
      quantity,
      price: Number(meta.price),
      status: 'paid',
      stripe_session_id: session.id,
      customer_name: shipping?.name ?? session.customer_details?.name ?? null,
      customer_phone: session.customer_details?.phone ?? null,
      shipping_address: shippingAddress,
      discount_code: meta.discount_code || null,
      discount_amount: Number(meta.discount_amount || 0),
    });

    if (insertError) {
      console.error('Error al crear el pedido', session.id, insertError);
      return new Response('error', { status: 500 });
    }

    // El uso del código se acredita aquí (no al crear el checkout) para que
    // abrir el checkout y no pagar no consuma un uso del código.
    if (meta.discount_code) {
      const { data: discount } = await supabase
        .from('discount_codes')
        .select('id, used_count')
        .eq('code', meta.discount_code)
        .maybeSingle();

      if (discount) {
        await supabase
          .from('discount_codes')
          .update({ used_count: Number(discount.used_count) + 1 })
          .eq('id', discount.id);
      }
    }

    const { data: product } = await supabase
      .from('products')
      .select('sizes')
      .eq('id', meta.product_id)
      .single();

    if (product) {
      const sizes = { ...product.sizes };
      const current = Number(sizes[meta.size] ?? 0);
      sizes[meta.size] = Math.max(0, current - quantity);

      await supabase.from('products').update({ sizes }).eq('id', meta.product_id);
    }
  }

  return new Response('ok', { status: 200 });
});
