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

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    // Store pending registration so the register page can pick up the plan
    const { error } = await supabase
      .from('pending_registrations')
      .upsert({
        email,
        plan,
        stripe_customer_id: session.customer,
        stripe_session_id: session.id,
        created_at: new Date().toISOString(),
      }, { onConflict: 'email' });

    if (error) {
      console.error('Supabase error:', error.message);
    } else {
      console.log('Pending registration saved for:', email);
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
