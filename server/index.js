const express = require('express');
const cors = require('cors');
const Stripe = require('stripe');

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const SITE_URL = (process.env.SITE_URL || 'https://haimeal.com').replace(/\/$/, '');
const PORT = process.env.PORT || 3000;

if (!STRIPE_SECRET_KEY) {
  console.error('Missing STRIPE_SECRET_KEY environment variable');
  process.exit(1);
}

const stripe = Stripe(STRIPE_SECRET_KEY);
const app = express();

const allowedOrigins = [
  SITE_URL,
  'https://haimeal.com',
  'https://www.haimeal.com',
  'https://nestnookca.github.io',
  'http://localhost:8532'
];
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

app.get('/', (req, res) => {
  res.send('ארוחה אחת — payments server is running');
});

// Creates a Stripe Checkout Session for the exact amount the donor chose,
// so there's no manual copy/paste of the amount on Stripe's page.
app.post('/create-checkout-session', async (req, res) => {
  try {
    const amount = Math.round(Number(req.body.amount));
    if (!amount || amount <= 0 || amount > 1000000) {
      return res.status(400).json({ error: 'סכום לא תקין' });
    }
    const email = typeof req.body.email === 'string' ? req.body.email.trim().slice(0, 200) : '';
    const name = typeof req.body.name === 'string' ? req.body.name.trim().slice(0, 200) : '';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'ils',
          product_data: { name: 'תרומה לארוחה אחת' },
          unit_amount: amount * 100
        },
        quantity: 1
      }],
      customer_email: email || undefined,
      metadata: { donor_name: name },
      success_url: `${SITE_URL}/thank-you.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/donate.html`
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('create-checkout-session error:', err.message);
    res.status(500).json({ error: 'שגיאת שרת, נסו שוב' });
  }
});

// Lets thank-you.html confirm the real, paid amount instead of guessing.
app.get('/session/:id', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.params.id);
    res.json({
      status: session.payment_status,
      amount: session.amount_total != null ? session.amount_total / 100 : null,
      email: session.customer_details ? session.customer_details.email : null
    });
  } catch (err) {
    console.error('session lookup error:', err.message);
    res.status(404).json({ error: 'לא נמצא' });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
