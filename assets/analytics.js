// Lightweight first-party analytics for ארוחה אחת.
// - No cookies, no fingerprinting: just a random anonymous ID in localStorage.
// - Respects Do Not Track: if it's on, nothing is sent at all.
// - All events go to our own backend (/track), never directly to Supabase —
//   the frontend never sees any Supabase key.
(function () {
  const BACKEND_URL = 'https://aruha-achat-site.onrender.com';

  const dnt = navigator.doNotTrack || window.doNotTrack || navigator.msDoNotTrack;
  if (dnt === '1' || dnt === 'yes') {
    window.trackEvent = function () {}; // no-op so pages calling it don't error
    return;
  }

  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function getVisitorId() {
    try {
      let id = localStorage.getItem('am_visitor_id');
      if (!id) {
        id = uuid();
        localStorage.setItem('am_visitor_id', id);
      }
      return id;
    } catch (err) {
      return uuid(); // storage blocked (private mode etc.) — still track this one pageview anonymously
    }
  }

  function getSessionId() {
    try {
      let id = sessionStorage.getItem('am_session_id');
      if (!id) {
        id = uuid();
        sessionStorage.setItem('am_session_id', id);
      }
      return id;
    } catch (err) {
      return uuid();
    }
  }

  // First-touch attribution: capture UTM/referrer once per session, reuse
  // for every event after (including conversions later in the visit).
  function getAttribution() {
    try {
      const stored = sessionStorage.getItem('am_attribution');
      if (stored) return JSON.parse(stored);
    } catch (err) {}

    const params = new URLSearchParams(window.location.search);
    const attribution = {
      referrer: document.referrer || '',
      utm_source: params.get('utm_source') || '',
      utm_medium: params.get('utm_medium') || '',
      utm_campaign: params.get('utm_campaign') || '',
      utm_term: params.get('utm_term') || '',
      utm_content: params.get('utm_content') || ''
    };
    try { sessionStorage.setItem('am_attribution', JSON.stringify(attribution)); } catch (err) {}
    return attribution;
  }

  function getDeviceType() {
    const w = window.innerWidth;
    if (w < 640) return 'mobile';
    if (w < 1024) return 'tablet';
    return 'desktop';
  }

  function getBrowser() {
    const ua = navigator.userAgent;
    if (/Edg\//.test(ua)) return 'Edge';
    if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) return 'Chrome';
    if (/Firefox\//.test(ua)) return 'Firefox';
    if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return 'Safari';
    return 'Other';
  }

  const visitorId = getVisitorId();
  const sessionId = getSessionId();
  const attribution = getAttribution();

  function send(eventType, eventName, extra) {
    const payload = Object.assign({
      visitor_id: visitorId,
      session_id: sessionId,
      event_type: eventType,
      event_name: eventName || null,
      page_path: window.location.pathname,
      device_type: getDeviceType(),
      browser: getBrowser()
    }, attribution, extra || {});

    const url = BACKEND_URL + '/track';
    const body = JSON.stringify(payload);

    // Plain fetch(keepalive) instead of sendBeacon: WebKit (Safari/iOS) has a
    // long-standing bug where sendBeacon silently drops cross-origin requests
    // whose body isn't a CORS-safelisted content type (ours is JSON). None of
    // these events fire on page unload, so sendBeacon's main advantage over
    // fetch doesn't even apply here.
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
  }

  // Public API for pages to call on important clicks/conversions, e.g.:
  //   trackEvent('click', 'donate_hero_button')
  //   trackEvent('conversion', 'donation_success', {amount: 120})
  window.trackEvent = send;

  send('pageview');
})();
