// netlify/functions/stripe-webhook.js
// Po zakupie: tworzy użytkownika Netlify Identity i wysyła email z linkiem do ustawienia hasła

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

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

  const siteUrl = process.env.URL || 'http://localhost:8888';
  const netlifyToken = process.env.NETLIFY_IDENTITY_TOKEN;

  switch (stripeEvent.type) {

    // ── Zakup / start trialu → utwórz konto i wyślij email ───────────────
    case 'checkout.session.completed': {
      const session = stripeEvent.data.object;
      const email   = session.customer_details?.email || session.customer_email;
      const plan    = session.metadata?.plan || 'pro';
      const customerId = session.customer;

      if (!email) {
        console.error('No email in session:', session.id);
        break;
      }

      // Sprawdź czy użytkownik już istnieje
      let userId = null;
      try {
        const listRes = await fetch(
          `${siteUrl}/.netlify/identity/admin/users?email=${encodeURIComponent(email)}`,
          { headers: { Authorization: `Bearer ${netlifyToken}` } }
        );
        const listData = await listRes.json();
        const existing = listData.users?.find(u => u.email === email);

        if (existing) {
          userId = existing.id;
          // Zaktualizuj rolę
          await updateUserRole(userId, plan, customerId, siteUrl, netlifyToken);
          // Wyślij link do logowania (recovery)
          await sendRecoveryEmail(email, siteUrl, netlifyToken);
        } else {
          // Utwórz nowego użytkownika
          const createRes = await fetch(`${siteUrl}/.netlify/identity/admin/users`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${netlifyToken}`,
            },
            body: JSON.stringify({
              email,
              app_metadata: {
                roles: [plan],
                stripe_customer_id: customerId,
                plan,
              },
              // send_confirmation: true → Netlify wyśle email z linkiem do ustawienia hasła
              send_confirmation: true,
            }),
          });
          const created = await createRes.json();
          userId = created.id;
          console.log(`Created user ${userId} with role ${plan}`);
        }
      } catch (err) {
        console.error('User create/update error:', err.message);
      }
      break;
    }

    // ── Subskrypcja anulowana → usuń rolę ────────────────────────────────
    case 'customer.subscription.deleted': {
      const sub      = stripeEvent.data.object;
      const custId   = sub.customer;

      // Znajdź użytkownika po stripe_customer_id
      try {
        const listRes = await fetch(`${siteUrl}/.netlify/identity/admin/users`, {
          headers: { Authorization: `Bearer ${netlifyToken}` }
        });
        const { users = [] } = await listRes.json();
        const user = users.find(u => u.app_metadata?.stripe_customer_id === custId);
        if (user) {
          await updateUserRole(user.id, null, custId, siteUrl, netlifyToken);
        }
      } catch (err) {
        console.error('Subscription deleted handler error:', err.message);
      }
      break;
    }

    case 'invoice.payment_failed': {
      console.warn('Payment failed for subscription:', stripeEvent.data.object.subscription);
      break;
    }

    default:
      console.log('Unhandled event type:', stripeEvent.type);
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};

async function updateUserRole(userId, role, customerId, siteUrl, token) {
  const roles = role ? [role] : [];
  const res = await fetch(`${siteUrl}/.netlify/identity/admin/users/${userId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      app_metadata: {
        roles,
        stripe_customer_id: customerId,
        plan: role,
      }
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error('Role update failed:', res.status, body);
  } else {
    console.log(`Role "${role}" set for user ${userId}`);
  }
}

async function sendRecoveryEmail(email, siteUrl, token) {
  // Wyślij email z linkiem do odzyskania hasła (dla istniejącego użytkownika)
  const res = await fetch(`${siteUrl}/.netlify/identity/admin/users/recover`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error('Recovery email failed:', res.status, body);
  }
}
