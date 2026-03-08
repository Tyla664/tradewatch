// TradeWatch — Telegram Proxy Worker
// Deploy this on Cloudflare Workers (free tier)
// Set these as Worker environment variables (Settings → Variables):
//   TELEGRAM_TOKEN  = your bot token from BotFather
//   TELEGRAM_CHAT_ID = your personal chat ID
//   ALLOWED_ORIGIN  = your app's deployed URL, e.g. https://tyla664.github.io

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    // Only allow requests from your app's origin
    const origin = request.headers.get('Origin') || '';
    const allowedOrigin = env.ALLOWED_ORIGIN || '*';
    if (allowedOrigin !== '*' && origin !== allowedOrigin) {
      return new Response('Forbidden', { status: 403 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response('Invalid JSON', { status: 400 });
    }

    const { message } = body;
    if (!message || typeof message !== 'string') {
      return new Response('Missing message', { status: 400 });
    }

    // Forward to Telegram Bot API
    const telegramUrl = `https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/sendMessage`;
    const telegramRes = await fetch(telegramUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'HTML'
      })
    });

    const result = await telegramRes.json();

    return new Response(JSON.stringify(result), {
      status: telegramRes.ok ? 200 : 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': allowedOrigin,
      }
    });
  }
};
