const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  const sig = event.headers['stripe-signature'];

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook error:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object;
    const email = session.customer_details?.email;
    const plan = session.metadata?.plan || 'starter';

    if (!email) {
      console.error('Brak emaila w sesji Stripe');
      return { statusCode: 200, body: JSON.stringify({ received: true }) };
    }

    // Supabase Admin Client
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    // Wyślij zaproszenie — Supabase tworzy konto i wysyła email z linkiem
    const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: {
        plan: plan,
        stripe_customer_id: session.customer,
      },
      redirectTo: 'https://wyceniarka2.netlify.app/app.html',
    });

    if (error) {
      console.error('Supabase invite error:', error.message);
    } else {
      console.log('Zaproszenie wysłane do:', email);
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  const sig = event.headers['stripe-signature'];

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook error:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object;
    const email = session.customer_details?.email;
    const plan = session.metadata?.plan || 'starter';

    if (!email) {
      console.error('Brak emaila w sesji Stripe');
      return { statusCode: 200, body: JSON.stringify({ received: true }) };
    }

    // Supabase Admin Client
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    // Wyślij zaproszenie — Supabase tworzy konto i wysyła email z linkiem
    const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: {
        plan: plan,
        stripe_customer_id: session.customer,
      },
      redirectTo: 'https://wyceniarka2.netlify.app/app.html',
    });

    if (error) {
      console.error('Supabase invite error:', error.message);
    } else {
      console.log('Zaproszenie wysłane do:', email);
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
