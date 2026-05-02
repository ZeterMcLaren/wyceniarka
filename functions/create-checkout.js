// netlify/functions/create-checkout.js
// Tworzy sesję Stripe Checkout — BEZ wymagania logowania wcześniej

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Method Not Allowed' };

  try {
    const { plan } = JSON.parse(event.body || '{}');

    const PRICE_IDS = {
      starter: process.env.STRIPE_PRICE_STARTER,
      pro:     process.env.STRIPE_PRICE_PRO,
    };

    const priceId = PRICE_IDS[plan];
    if (!priceId) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Nieprawidłowy plan' }) };
    }

    const siteUrl = process.env.URL || 'http://localhost:8888';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: 14,
        metadata: { plan },
      },
      metadata: { plan },
      allow_promotion_codes: true,
      // Zbieramy email w Stripe — nie wymagamy rejestracji przed płatnością
      billing_address_collection: 'auto',
      locale: 'pl',
      success_url: `${siteUrl}/rejestracja.html?payment=success`,
      cancel_url:  `${siteUrl}/#cennik`,
    });

    return { statusCode: 200, headers, body: JSON.stringify({ url: session.url }) };

  } catch (err) {
    console.error('Checkout error:', err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
