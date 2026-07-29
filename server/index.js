const express = require('express');
const cors = require('cors');
const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');
const geoip = require('geoip-lite');

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const SITE_URL = (process.env.SITE_URL || 'https://haimeal.com').replace(/\/$/, '');
const PORT = process.env.PORT || 3000;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!STRIPE_SECRET_KEY) {
  console.error('Missing STRIPE_SECRET_KEY environment variable');
  process.exit(1);
}

// Analytics is optional — if these aren't set, /track just responds 503
// instead of crashing the whole server (payments still work either way).
const supabaseAdmin = (SUPABASE_URL && SUPABASE_SERVICE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;
if (!supabaseAdmin) {
  console.warn('SUPABASE_URL / SUPABASE_SERVICE_KEY not set — /track is disabled');
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
// frequency 'monthly' creates a real recurring subscription (not a one-off
// charge dressed up as one) — Stripe supports inline recurring price_data,
// no pre-created Price object needed.
app.post('/create-checkout-session', async (req, res) => {
  try {
    const amount = Math.round(Number(req.body.amount));
    if (!amount || amount < 2 || amount > 1000000) {
      return res.status(400).json({ error: 'הסכום המינימלי לתרומה הוא 2 ₪' });
    }
    const frequency = req.body.frequency === 'monthly' ? 'monthly' : 'once';
    const email = typeof req.body.email === 'string' ? req.body.email.trim().slice(0, 200) : '';
    const name = typeof req.body.name === 'string' ? req.body.name.trim().slice(0, 200) : '';

    const priceData = {
      currency: 'ils',
      product_data: { name: frequency === 'monthly' ? 'תרומה חודשית לארוחה אחת' : 'תרומה לארוחה אחת' },
      unit_amount: amount * 100
    };
    if (frequency === 'monthly') {
      priceData.recurring = { interval: 'month' };
    }

    const session = await stripe.checkout.sessions.create({
      mode: frequency === 'monthly' ? 'subscription' : 'payment',
      line_items: [{ price_data: priceData, quantity: 1 }],
      customer_email: email || undefined,
      metadata: { donor_name: name, frequency },
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
      email: session.customer_details ? session.customer_details.email : null,
      frequency: session.mode === 'subscription' ? 'monthly' : 'once'
    });
  } catch (err) {
    console.error('session lookup error:', err.message);
    res.status(404).json({ error: 'לא נמצא' });
  }
});

// Ingests one analytics event (pageview/click/conversion) from the site's
// assets/analytics.js. The frontend never talks to Supabase directly — this
// is the only place the service_role key is used, and it never leaves the
// server. Country is resolved from the request IP with a local (offline)
// lookup; the IP itself is never stored anywhere.
const ANALYTICS_EVENT_TYPES = new Set(['pageview', 'click', 'conversion']);

app.post('/track', async (req, res) => {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'analytics not configured' });
  }
  try {
    const b = req.body || {};
    if (!b.visitor_id || !b.session_id || !b.event_type || !b.page_path) {
      return res.status(400).json({ error: 'missing fields' });
    }
    if (!ANALYTICS_EVENT_TYPES.has(b.event_type)) {
      return res.status(400).json({ error: 'invalid event_type' });
    }

    const forwardedFor = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const ip = (forwardedFor || req.socket.remoteAddress || '').replace('::ffff:', '');
    const geo = ip ? geoip.lookup(ip) : null;

    const row = {
      visitor_id: String(b.visitor_id),
      session_id: String(b.session_id),
      event_type: b.event_type,
      event_name: b.event_name ? String(b.event_name).slice(0, 120) : null,
      page_path: String(b.page_path).slice(0, 300),
      referrer: b.referrer ? String(b.referrer).slice(0, 500) : null,
      utm_source: b.utm_source ? String(b.utm_source).slice(0, 120) : null,
      utm_medium: b.utm_medium ? String(b.utm_medium).slice(0, 120) : null,
      utm_campaign: b.utm_campaign ? String(b.utm_campaign).slice(0, 120) : null,
      utm_term: b.utm_term ? String(b.utm_term).slice(0, 120) : null,
      utm_content: b.utm_content ? String(b.utm_content).slice(0, 120) : null,
      device_type: b.device_type ? String(b.device_type).slice(0, 30) : null,
      browser: b.browser ? String(b.browser).slice(0, 30) : null,
      country: geo ? geo.country : null,
      amount: b.amount != null && !isNaN(Number(b.amount)) ? Number(b.amount) : null
    };

    const { error } = await supabaseAdmin.from('analytics_events').insert(row);
    if (error) throw error;
    res.status(204).end();
  } catch (err) {
    console.error('track error:', err.message);
    res.status(500).json({ error: 'שגיאה' });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
