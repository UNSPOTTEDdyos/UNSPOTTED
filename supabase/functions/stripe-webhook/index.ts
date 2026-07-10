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
    const orderId = session.metadata?.order_id;

    if (!orderId) {
      console.error('checkout.session.completed sin order_id en metadata');
      return new Response('ok', { status: 200 });
    }

    const { data: order } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (!order) {
      console.error('No se encontró la orden', orderId);
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
      orderId,
      hasShippingDetails: !!session.shipping_details,
      hasShippingAddress: !!session.shipping_details?.address,
      hasCustomerAddress: !!session.customer_details?.address,
      resolvedShippingAddress: shippingAddress,
    });

    const { error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'paid',
        customer_name: shipping?.name ?? session.customer_details?.name ?? null,
        customer_phone: session.customer_details?.phone ?? null,
        shipping_address: shippingAddress,
      })
      .eq('id', orderId);

    if (updateError) {
      console.error('Error al actualizar la orden', orderId, updateError);
    }

    const { data: product } = await supabase
      .from('products')
      .select('sizes')
      .eq('id', order.product_id)
      .single();

    if (product) {
      const sizes = { ...product.sizes };
      const current = Number(sizes[order.size] ?? 0);
      sizes[order.size] = Math.max(0, current - 1);

      await supabase.from('products').update({ sizes }).eq('id', order.product_id);
    }
  }

  return new Response('ok', { status: 200 });
});
