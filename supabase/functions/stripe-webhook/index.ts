// UNSPOTTED — recibe la confirmación de pago de Stripe, crea un pedido por
// cada línea del carrito (todas comparten stripe_session_id), y resta el
// stock de cada talla comprada.

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

async function decrementStock(product_id: string, size: string, quantity: number) {
  const { data: product } = await supabase
    .from('products')
    .select('sizes')
    .eq('id', product_id)
    .single();

  if (!product) return;

  const sizes = { ...product.sizes };
  const current = Number(sizes[size] ?? 0);
  sizes[size] = Math.max(0, current - quantity);

  await supabase.from('products').update({ sizes }).eq('id', product_id);
}

async function creditDiscountUsage(code: string) {
  const { data: discount } = await supabase
    .from('discount_codes')
    .select('id, used_count')
    .eq('code', code)
    .maybeSingle();

  if (discount) {
    await supabase
      .from('discount_codes')
      .update({ used_count: Number(discount.used_count) + 1 })
      .eq('id', discount.id);
  }
}

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

    const customer_name = shipping?.name ?? session.customer_details?.name ?? null;
    const customer_phone = session.customer_details?.phone ?? null;

    if (!meta?.cart_id) {
      // Formato viejo (una sesión = un solo producto), por si queda alguna
      // sesión de Stripe en vuelo creada antes de pasar al carrito.
      if (!meta?.product_id || !meta?.size || !meta?.price) {
        console.error('checkout.session.completed sin metadata reconocible', session.id);
        return new Response('ok', { status: 200 });
      }

      const quantity = Math.max(1, Number(meta.quantity || 1));

      const { error: insertError } = await supabase.from('orders').insert({
        product_id: meta.product_id,
        product_name: meta.product_name,
        size: meta.size,
        fit: meta.fit || null,
        quantity,
        price: Number(meta.price),
        status: 'paid',
        stripe_session_id: session.id,
        customer_name,
        customer_phone,
        shipping_address: shippingAddress,
        discount_code: meta.discount_code || null,
        discount_amount: Number(meta.discount_amount || 0),
      });

      if (insertError) {
        console.error('Error al crear el pedido (legacy)', session.id, insertError);
        return new Response('error', { status: 500 });
      }

      if (meta.discount_code) await creditDiscountUsage(meta.discount_code);
      await decrementStock(meta.product_id, meta.size, quantity);

      return new Response('ok', { status: 200 });
    }

    // --- Carrito multi-producto ---
    const { data: pendingCart, error: cartError } = await supabase
      .from('pending_carts')
      .select('items')
      .eq('id', meta.cart_id)
      .maybeSingle();

    if (cartError || !pendingCart) {
      console.error('No se encontró el carrito pendiente', session.id, meta.cart_id, cartError);
      return new Response('error', { status: 500 });
    }

    const items = pendingCart.items as {
      product_id: string;
      product_name: string;
      size: string;
      fit: string;
      quantity: number;
      unit_price: number;
    }[];

    const cartTotal = items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
    const totalDiscount = Number(meta.discount_amount || 0);

    const rows = items.map((item) => {
      const itemTotal = item.unit_price * item.quantity;
      const itemDiscount = cartTotal > 0 ? Math.round((itemTotal / cartTotal) * totalDiscount * 100) / 100 : 0;

      return {
        product_id: item.product_id,
        product_name: item.product_name,
        size: item.size,
        fit: item.fit,
        quantity: item.quantity,
        price: Math.round((itemTotal - itemDiscount) * 100) / 100,
        status: 'paid',
        stripe_session_id: session.id,
        customer_name,
        customer_phone,
        shipping_address: shippingAddress,
        discount_code: meta.discount_code || null,
        discount_amount: itemDiscount,
      };
    });

    const { error: insertError } = await supabase.from('orders').insert(rows);

    if (insertError) {
      console.error('Error al crear los pedidos del carrito', session.id, insertError);
      return new Response('error', { status: 500 });
    }

    if (meta.discount_code) await creditDiscountUsage(meta.discount_code);

    for (const item of items) {
      await decrementStock(item.product_id, item.size, item.quantity);
    }

    await supabase.from('pending_carts').delete().eq('id', meta.cart_id);
  }

  return new Response('ok', { status: 200 });
});
