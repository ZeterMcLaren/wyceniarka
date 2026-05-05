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
    console.error('Webhook signature error:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  // ── Checkout completed → save pending registration ──
  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object;
    const email = session.customer_details?.email;
    const plan  = session.metadata?.plan || 'starter';

    if (!email) {
      console.error('No email in Stripe session');
      return { statusCode: 200, body: JSON.stringify({ received: true }) };
    }

    // Get trial end date directly from the subscription object
    let trialEndsAt = null;
    try {
      if (session.subscription) {
        const sub = await stripe.subscriptions.retrieve(session.subscription);
        if (sub.trial_end) {
          trialEndsAt = new Date(sub.trial_end * 1000).toISOString();
        }
      }
    } catch(e) {
      console.warn('Could not retrieve subscription:', e.message);
    }

    // Fallback: calculate 14 days from now
    if (!trialEndsAt) {
      const d = new Date();
      d.setDate(d.getDate() + 14);
      trialEndsAt = d.toISOString();
    }

    const { error } = await supabase
      .from('pending_registrations')
      .upsert({
        email,
        plan,
        trial_ends_at: trialEndsAt,
        stripe_customer_id: session.customer,
        stripe_session_id:  session.id,
        created_at: new Date().toISOString(),
      }, { onConflict: 'email' });

    if (error) {
      console.error('Supabase pending_registrations error:', error.message);
    } else {
      console.log(`Saved pending registration: ${email} / ${plan} / trial ends ${trialEndsAt}`);
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
