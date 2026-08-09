// Vercel Serverless Node.js Backend API
// c:\Users\ssnmh\Documents\index.html\api\order.js

module.exports = async (req, res) => {
  // Security check: Only allow POST requests
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }
  try {
    const { orderId, customerName, patty, specialNote, pickupEstimate, time, total, paymentMethod, paymentStatus, paymentNote, paymentTimeoutAt, queueNumber } = req.body;

    // Validation: Ensure required fields are present
    if (!orderId || !patty) {
      return res.status(400).json({ success: false, error: 'Missing required order details' });
    }

    const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || '';
    const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || '';
    const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID || '';
    const SITE_URL = process.env.SITE_URL || 'https://black-burger-ssnmhjjg-ice.vercel.app';
    const FIREBASE_DATABASE_URL = process.env.FIREBASE_DATABASE_URL || 'https://food-34707-default-rtdb.asia-southeast1.firebasedatabase.app';
    const saveOrderStatus = async (status, extra = {}) => {
      const now = new Date().toISOString();
      try {
        await fetch(`${FIREBASE_DATABASE_URL}/orders/${encodeURIComponent(orderId)}.json`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId,
            customerName: customerName || 'Guest',
            patty,
            specialNote: specialNote || '',
            pickupEstimate: pickupEstimate || 'About 8-12 minutes',
            time,
            total,
            paymentMethod: paymentMethod || null,
            paymentStatus: paymentStatus || null,
            paymentNote: paymentNote || null,
            paymentTimeoutAt: paymentTimeoutAt || null,
            queueNumber: queueNumber || null,
            status,
            updatedAt: now,
            ...extra
          })
        });
      } catch (firebaseErr) {
        console.warn('Firebase order save failed:', firebaseErr);
      }
    };

    await saveOrderStatus('pending', { createdAt: new Date().toISOString() });

    // Build the gorgeous rich Discord Embed message
    const discordPayload = {
      embeds: [
        {
          title: "🍔 New Order! | ออเดอร์มาเเล้ว!🖤",
          description: "A customer has placed an order from your Cozy Charcoal Bistro website! Here are the yummy details:",
          color: 14753096, // Hex #e11d48 in decimal (Strawberry Rose Red)
          fields: [
            {
              name: "👤 Customer Name | ชื่อผู้ใช้",
              value: `**${customerName || 'Guest'}**`,
              inline: false
            },
            {
              name: "📋 Order Reference | หมายเลขออเดอร์",
              value: `\`#${orderId}\``,
              inline: true
            },
            {
              name: "🔢 Queue Number | หมายเลขคิว",
              value: `**Queue #${queueNumber || 'N/A'}**`,
              inline: true
            },
            {
              name: "🍔 Big Black Burger",
              value: `**${patty}**`,
              inline: true
            },
            {
              name: "Special Note",
              value: specialNote ? `**${specialNote}**` : "None",
              inline: false
            },
            {
              name: "💳 Payment | จ่ายผ่าน",
              value: `**${paymentMethod || 'Not selected'}**${total ? `\nTotal: **${total} Baht**` : ''}${paymentNote ? `\n${paymentNote}` : ''}`,
              inline: false
            },
            {
              name: "🕒 Order Time | เวลาสั่ง",
              value: `\`${time}\``,
              inline: false
            },
            {
              name: "⏳ Order Status | สถานะ",
              value: paymentStatus === 'awaiting_promptpay'
                ? "**PENDING** — Awaiting PromptPay. Check bank before cooking."
                : "**PENDING** — Waiting for chef...",
              inline: false
            }
          ],
          footer: {
            text: "ไปรับใช้ชาติสะพวกไพร่",
            icon_url: "https://ssnmhjjg-gg.vercel.app/aaaaaa.gif"
          },
          timestamp: new Date().toISOString()
        }
      ]
    };

    let messageId = null;
    let sentViaBot = false;

    // Try Discord Bot API first
    if (DISCORD_BOT_TOKEN && DISCORD_CHANNEL_ID) {
      try {
        const botResponse = await fetch(`https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
            'Content-Type': 'application/json',
            'User-Agent': 'DiscordBot (https://github.com/discord/discord-api-docs, 1.0.0)'
          },
          body: JSON.stringify(discordPayload)
        });
        if (botResponse.ok) {
          const msgData = await botResponse.json();
          messageId = msgData.id;
          sentViaBot = true;
        } else {
          console.warn('Discord Bot API error (falling back to webhook):', await botResponse.text());
        }
      } catch (botErr) {
        console.warn('Discord Bot API exception (falling back to webhook):', botErr);
      }
    }

    // Webhook Fallback
    if (!sentViaBot) {
      const discordResponse = await fetch(DISCORD_WEBHOOK_URL + '?wait=true', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(discordPayload)
      });

      if (!discordResponse.ok) {
        const errorText = await discordResponse.text();
        console.error('Discord webhook dispatch error:', errorText);
        return res.status(500).json({ success: false, error: 'Failed to send notification to Discord' });
      }

      const messageData = await discordResponse.json();
      messageId = messageData.id;
    }

    await saveOrderStatus('pending', { discordMessageId: messageId, sentViaBot });

    // Step 2: Patch the message to add status action links (now that we have the message ID)
    const cookingLink = `${SITE_URL}/api/status?mid=${messageId}&action=cooking&oid=${orderId}`;
    const doneLink = `${SITE_URL}/api/status?mid=${messageId}&action=done&oid=${orderId}`;
    const cancelLink = `${SITE_URL}/api/status?mid=${messageId}&action=cancel&oid=${orderId}`;
    const confirmPaymentLink = `${SITE_URL}/api/status?mid=${messageId}&action=confirm_payment&oid=${orderId}`;

    const isPendingConfirmationPayment = paymentStatus === 'awaiting_promptpay' || paymentStatus === 'awaiting_cash_verification' ||
      (paymentMethod && (paymentMethod.toLowerCase().includes('qr') || paymentMethod.toLowerCase().includes('promptpay') || paymentMethod.toLowerCase().includes('พร้อมเพย์') || paymentMethod.toLowerCase().includes('cash') || paymentMethod.toLowerCase().includes('เงินสด')));

    // Update description with clickable action links
    let statusDescription = `\n\n**📊 Update Order Status:**\n[🍳 Cooking](${cookingLink}) · [✅ Done](${doneLink})`;
    if (isPendingConfirmationPayment) {
      statusDescription += ` · [💵 Confirm Payment](${confirmPaymentLink})`;
    }
    statusDescription += ` · [❌ Cancel](${cancelLink})`;
    discordPayload.embeds[0].description += statusDescription;

    const componentsList = [
      { type: 2, style: 1, label: "🍳 Cooking", custom_id: `cooking:${orderId}:${messageId}` },
      { type: 2, style: 3, label: "✅ Done", custom_id: `done:${orderId}:${messageId}` }
    ];
    if (isPendingConfirmationPayment) {
      componentsList.push({ type: 2, style: 2, label: "💵 Confirm Payment", custom_id: `confirm_payment:${orderId}:${messageId}` });
    }
    componentsList.push({ type: 2, style: 4, label: "❌ Cancel", custom_id: `cancel:${orderId}:${messageId}` });

    discordPayload.components = [
      {
        type: 1,
        components: componentsList
      }
    ];

    if (sentViaBot) {
      await fetch(`https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages/${messageId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
          'Content-Type': 'application/json',
          'User-Agent': 'DiscordBot (https://github.com/discord/discord-api-docs, 1.0.0)'
        },
        body: JSON.stringify(discordPayload)
      });
    } else {
      await fetch(`${DISCORD_WEBHOOK_URL}/messages/${messageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(discordPayload)
      });
    }

    // Return success response to the frontend client
    return res.status(200).json({ success: true, message: 'Order sent successfully to Discord! 🍔✨' });

  } catch (err) {
    console.error('Order backend exception:', err);
    return res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};
