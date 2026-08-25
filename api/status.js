// Vercel Serverless — Order Status Updater
// Edits the original Discord webhook message with a new status

module.exports = async (req, res) => {
  const { mid, oid } = req.query;
  const action = req.query.action === 'ready' ? 'done' : req.query.action;
  const cancelReason = String(req.query.reason || req.query.cancelReason || '').trim();
  const isCancelConfirmed = req.query.confirm === '1';
  const paidAmount = String(req.query.amount || '').trim();

  if (!mid || !action || !oid) {
    return res.status(400).send('Missing parameters');
  }

  const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || '';
  const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || '';
  const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID || '';
  const FIREBASE_DATABASE_URL = process.env.FIREBASE_DATABASE_URL || 'https://food-34707-default-rtdb.asia-southeast1.firebasedatabase.app';
  const SITE_URL = process.env.SITE_URL || 'https://emperor-burger-ssnmhjjg.vercel.app';

  const statusMap = {
    cooking: { emoji: '🍳', text: 'COOKING...', color: 16750848, bg: '#ff9900', msg: 'Chef is preparing this order!' },
    done:    { emoji: '✅', text: 'DONE — READY FOR PICKUP!', color: 5763719, bg: '#57F287', msg: 'Order is ready to serve!' },
    cancel:  { emoji: '❌', text: 'CANCELLED', color: 15548997, bg: '#ED4245', msg: 'This order has been cancelled.' },
    confirm_payment: { emoji: '💵', text: 'PAYMENT CONFIRMED', color: 5763719, bg: '#57F287', msg: 'The chef has confirmed the customer payment.' }
  };

  const status = statusMap[action];
  if (!status) {
    return res.status(400).send('Invalid action. Use: cooking, done, ready, cancel, or confirm_payment');
  }

  const escapeHtml = (value) => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const pageStyles = `
    @import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@400;600;700&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Fredoka', sans-serif;
      background: #0c0a09;
      color: #fafaf9;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      text-align: center;
      padding: 20px;
    }
    .card {
      background: #1c1917;
      border: 2.5px solid ${status.bg};
      box-shadow: 0 0 40px ${status.bg}44, 6px 6px 0 #fff;
      border-radius: 24px;
      padding: 48px 36px;
      max-width: 460px;
      width: 90vw;
    }
    .emoji { font-size: 3.5rem; margin-bottom: 16px; }
    h1 { font-size: 1.5rem; margin-bottom: 8px; color: ${status.bg}; }
    p { font-size: 0.95rem; color: #a8a29e; line-height: 1.6; }
    label {
      display: block;
      margin-top: 22px;
      margin-bottom: 8px;
      color: #fafaf9;
      font-weight: 700;
      text-align: left;
    }
    textarea {
      width: 100%;
      min-height: 110px;
      resize: vertical;
      border: 2px solid #fff;
      border-radius: 14px;
      background: #0c0a09;
      color: #fafaf9;
      padding: 12px;
      font: inherit;
      outline: none;
    }
    textarea:focus { border-color: ${status.bg}; box-shadow: 0 0 16px ${status.bg}66; }
    button, a {
      display: inline-block;
      margin-top: 20px;
      color: #0c0a09;
      background: ${status.bg};
      border: 2px solid #fff;
      border-radius: 999px;
      padding: 10px 18px;
      font-size: 0.85rem;
      font-weight: 700;
      text-decoration: none;
      cursor: pointer;
    }
    .order-id {
      display: inline-block;
      background: #0c0a09;
      padding: 6px 16px;
      border-radius: 10px;
      font-size: 0.85rem;
      color: #fafaf9;
      margin-top: 16px;
      border: 1px solid #3f3f3f;
    }
    .reason {
      margin-top: 14px;
      padding: 12px;
      border-radius: 12px;
      background: #0c0a09;
      border: 1px solid #3f3f3f;
      color: #fafaf9;
    }
    .close-hint {
      margin-top: 24px;
      font-size: 0.75rem;
      color: #57534e;
    }
  `;

  if (action === 'cancel' && !isCancelConfirmed) {
    return res.setHeader('Content-Type', 'text/html').status(200).send(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cancel Order #${escapeHtml(oid)}</title>
  <style>${pageStyles}</style>
</head>
<body>
  <form class="card" method="GET" action="/api/status">
    <div class="emoji">${status.emoji}</div>
    <h1>Cancel Order #${escapeHtml(oid)}</h1>
    <p>Please tell the customer why this order is cancelled.</p>
    <input type="hidden" name="mid" value="${escapeHtml(mid)}">
    <input type="hidden" name="action" value="cancel">
    <input type="hidden" name="oid" value="${escapeHtml(oid)}">
    <input type="hidden" name="confirm" value="1">
    <label for="reason">Reason for cancel</label>
    <textarea id="reason" name="reason" maxlength="240" placeholder="Reason for cancel"></textarea>
    <button type="submit">Cancel order</button>
  </form>
</body>
</html>
    `);
  }

  try {
    try {
      const firebasePayload = {
        orderId: Number(oid) || oid,
        updatedAt: new Date().toISOString()
      };
      if (action === 'confirm_payment') {
        firebasePayload.paymentStatus = 'confirmed';
        firebasePayload.paymentConfirmedAt = new Date().toISOString();
        if (paidAmount) firebasePayload.paymentConfirmedAmount = paidAmount;
      } else {
        firebasePayload.status = action;
      }
      if (action === 'cancel') {
        firebasePayload.cancelReason = cancelReason;
      }
      await fetch(`${FIREBASE_DATABASE_URL}/orders/${encodeURIComponent(oid)}.json`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(firebasePayload)
      });
    } catch (firebaseErr) {
      console.warn('Firebase status update failed:', firebaseErr);
    }

    // 0. Fetch the order details from Firebase to check if sent via Bot and check payment method
    let sentViaBot = false;
    let isPendingConfirmationPayment = false;
    try {
      const orderRes = await fetch(`${FIREBASE_DATABASE_URL}/orders/${encodeURIComponent(oid)}.json`);
      if (orderRes.ok) {
        const orderData = await orderRes.json();
        if (orderData) {
          if (orderData.sentViaBot) {
            sentViaBot = true;
          }
          const paymentMethod = String(orderData.paymentMethod || '').toLowerCase();
          isPendingConfirmationPayment = orderData.paymentStatus === 'awaiting_promptpay' || orderData.paymentStatus === 'awaiting_cash_verification' ||
            paymentMethod.includes('qr') || paymentMethod.includes('promptpay') || paymentMethod.includes('พร้อมเพย์') || paymentMethod.includes('cash') || paymentMethod.includes('เงินสด');
        }
      }
    } catch (firebaseErr) {
      console.warn('Firebase order fetch failed:', firebaseErr);
    }

    // 1. Fetch the original message
    let originalMsg = null;
    if (sentViaBot) {
      try {
        const getRes = await fetch(`https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages/${mid}`, {
          headers: {
            'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
            'User-Agent': 'DiscordBot (https://github.com/discord/discord-api-docs, 1.0.0)'
          }
        });
        if (getRes.ok) {
          originalMsg = await getRes.json();
        } else {
          console.warn('Could not fetch message via bot API, falling back to Webhook:', await getRes.text());
        }
      } catch (botErr) {
        console.warn('Discord Bot API fetch exception, falling back to Webhook:', botErr);
      }
    }

    if (!originalMsg) {
      // Fallback/Default to Webhook
      const getRes = await fetch(`${WEBHOOK_URL}/messages/${mid}`);
      if (!getRes.ok) {
        return res.status(404).send('Could not find the original order message.');
      }
      originalMsg = await getRes.json();
      sentViaBot = false; // ensure we patch via webhook if we fetched via webhook
    }

    // 2. Update the embed
    const embed = originalMsg.embeds[0];
    if (!embed) {
      return res.status(400).send('No embed found in the message.');
    }

    // Remove any existing status field
    embed.fields = embed.fields.filter(f => !f.name.includes('Order Status') && !f.name.includes('Payment Confirmation'));

    // Add new status field
    const statusMessage = action === 'cancel' && cancelReason
      ? `${status.msg}\nReason: ${cancelReason}`
      : status.msg;

    embed.fields.push({
      name: action === 'confirm_payment' ? `${status.emoji} Payment Confirmation` : `${status.emoji} Order Status`,
      value: `**${status.text}**\n${statusMessage}`,
      inline: false
    });

    // Update embed color & title
    embed.color = status.color;
    embed.title = `${status.emoji} ORDER #${oid} — ${status.text}`;

    // Update timestamp to show when status changed
    embed.timestamp = new Date().toISOString();
    embed.footer = {
      text: `Bitty Charcoal Bistro 🍔🖤 | Status updated`,
      icon_url: "https://ssnmhjjg-gg.vercel.app/aaaaaa.gif"
    };

    // Reconstruct the link buttons, disabling them if the order is done or cancelled
    const cookingLink = `${SITE_URL}/api/status?mid=${mid}&action=cooking&oid=${oid}`;
    const doneLink = `${SITE_URL}/api/status?mid=${mid}&action=done&oid=${oid}`;
    const cancelLink = `${SITE_URL}/api/status?mid=${mid}&action=cancel&oid=${oid}`;
    const confirmPaymentLink = `${SITE_URL}/api/status?mid=${mid}&action=confirm_payment&oid=${oid}`;

    const buttonComponents = [
      { type: 2, style: 5, label: "🍳 Cooking", url: cookingLink, disabled: false },
      { type: 2, style: 5, label: "✅ Done", url: doneLink, disabled: false }
    ];
    if (isPendingConfirmationPayment) {
      buttonComponents.push({ type: 2, style: 5, label: "💵 Confirm Payment", url: confirmPaymentLink, disabled: false });
    }
    buttonComponents.push({ type: 2, style: 5, label: "❌ Cancel", url: cancelLink, disabled: false });

    // All buttons stay enabled so admins can always correct a mis-click
    const components = [
      {
        type: 1,
        components: buttonComponents
      }
    ];

    // 3. Patch the message
    let patchRes;
    if (sentViaBot) {
      patchRes = await fetch(`https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages/${mid}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
          'Content-Type': 'application/json',
          'User-Agent': 'DiscordBot (https://github.com/discord/discord-api-docs, 1.0.0)'
        },
        body: JSON.stringify({ embeds: [embed], components })
      });
    } else {
      patchRes = await fetch(`${WEBHOOK_URL}/messages/${mid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds: [embed], components })
      });
    }

    if (!patchRes.ok) {
      const errText = await patchRes.text();
      console.error('Discord PATCH error:', errText);
      return res.status(500).send('Failed to update the order on Discord.');
    }

    // 4. Return a pretty confirmation page
    return res.setHeader('Content-Type', 'text/html').status(200).send(`
      
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Order #${oid} — ${status.text}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@400;600;700&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Fredoka', sans-serif;
      background: #0c0a09;
      color: #fafaf9;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      text-align: center;
    }
    .card {
      background: #1c1917;
      border: 2.5px solid ${status.bg};
      box-shadow: 0 0 40px ${status.bg}44, 6px 6px 0 #fff;
      border-radius: 24px;
      padding: 48px 36px;
      max-width: 420px;
      width: 90vw;
    }
    .emoji { font-size: 3.5rem; margin-bottom: 16px; }
    h1 { font-size: 1.5rem; margin-bottom: 8px; color: ${status.bg}; }
    p { font-size: 0.95rem; color: #a8a29e; line-height: 1.6; }
    .order-id { 
      display: inline-block;
      background: #0c0a09;
      padding: 6px 16px;
      border-radius: 10px;
      font-size: 0.85rem;
      color: #fafaf9;
      margin-top: 16px;
      border: 1px solid #3f3f3f;
    }
    .close-hint {
      margin-top: 24px;
      font-size: 0.75rem;
      color: #57534e;
    }
    a {
      display: inline-block;
      margin-top: 20px;
      color: #0c0a09;
      background: ${status.bg};
      border: 2px solid #fff;
      border-radius: 999px;
      padding: 10px 18px;
      font-size: 0.85rem;
      font-weight: 700;
      text-decoration: none;
    }
    .reason {
      margin-top: 14px;
      padding: 12px;
      border-radius: 12px;
      background: #0c0a09;
      border: 1px solid #3f3f3f;
      color: #fafaf9;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="emoji">${status.emoji}</div>
    <h1>${status.text}</h1>
    <p>${action === 'cancel' && cancelReason ? `This order was cancelled. The chef said:` : status.msg}</p>
    ${action === 'cancel' && cancelReason ? `<div class="reason">${escapeHtml(cancelReason)}</div>` : ''}
    <div class="order-id">Order #${oid}</div>
    <a href="${SITE_URL}?order=${encodeURIComponent(oid)}">Open customer status</a>
    <p class="close-hint">You can close this tab now. The Discord message has been updated! ✨</p>
  </div>
</body>
</html>
    `);

  } catch (err) {
    console.error('Status update exception:', err);
    return res.status(500).send('Something went wrong while updating the order status.');
  }
};
