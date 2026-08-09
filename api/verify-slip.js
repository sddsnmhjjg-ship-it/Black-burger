// Vercel Serverless NodeJS API - Slip Verification
// c:\Users\ssnmh\Documents\Food\api\verify-slip.js

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || '';
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || '';
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID || '';
const FIREBASE_DATABASE_URL = process.env.FIREBASE_DATABASE_URL || 'https://food-34707-default-rtdb.asia-southeast1.firebasedatabase.app';

module.exports = async (req, res) => {
  // Security check: Only allow POST requests
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    const { orderId, amount, image, fileName, fileType } = req.body;

    if (!orderId || !image) {
      return res.status(400).json({ success: false, error: 'Missing required slip verification parameters' });
    }

    const SLIPOK_API_KEY = process.env.SLIPOK_API_KEY;
    const SLIPOK_BRANCH_ID = process.env.SLIPOK_BRANCH_ID;

    let verificationResult = { success: false, method: 'none' };

    if (!SLIPOK_API_KEY || !SLIPOK_BRANCH_ID) {
      // 🚀 MOCK MODE (Test Fallback)
      console.log('SlipOK API credentials not set. Running in Mock Mode...');
      await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate API network latency
      verificationResult = {
        success: true,
        method: 'mock',
        transRef: 'MOCK_REF_' + Math.random().toString(36).substring(2, 10).toUpperCase(),
        amount: Number(amount) || 0
      };
    } else {
      // 🏦 REAL SLIPOK API INTEGRATION
      console.log(`Running real SlipOK API verification for order #${orderId}...`);
      const fileBuffer = Buffer.from(image, 'base64');
      const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);

      // Construct multipart/form-data body manually in pure Node.js (dependency-free)
      const parts = [];
      parts.push(Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="files"; filename="${fileName || 'slip.png'}"\r\n` +
        `Content-Type: ${fileType || 'image/png'}\r\n\r\n`
      ));
      parts.push(fileBuffer);
      parts.push(Buffer.from('\r\n'));

      parts.push(Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="log"\r\n\r\n` +
        `true\r\n`
      ));

      if (amount) {
        parts.push(Buffer.from(
          `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="amount"\r\n\r\n` +
          `${amount}\r\n`
        ));
      }
      parts.push(Buffer.from(`--${boundary}--\r\n`));
      const multipartBody = Buffer.concat(parts);

      const slipOkResponse = await fetch(`https://api.slipok.com/api/line/apikey/${SLIPOK_BRANCH_ID}`, {
        method: 'POST',
        headers: {
          'x-authorization': SLIPOK_API_KEY,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': multipartBody.length
        },
        body: multipartBody
      });

      if (!slipOkResponse.ok) {
        const errText = await slipOkResponse.text();
        console.error('SlipOK API error response:', errText);
        return res.status(502).json({ success: false, error: 'Slip verification server failed or returned invalid response' });
      }

      const resData = await slipOkResponse.json();
      console.log('SlipOK response:', resData);

      if (resData.success) {
        verificationResult = {
          success: true,
          method: 'slipok',
          transRef: resData.data ? resData.data.transRef : 'N/A',
          amount: resData.data ? resData.data.amount : (Number(amount) || 0)
        };
      } else {
        return res.status(400).json({ success: false, error: resData.message || 'Slip verification failed (Invalid slip)' });
      }
    }

    if (verificationResult.success) {
      const now = new Date().toISOString();

      // 1. Patch Firebase database with confirmation
      await fetch(`${FIREBASE_DATABASE_URL}/orders/${encodeURIComponent(orderId)}.json`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentStatus: 'confirmed',
          paymentConfirmedAt: now,
          paymentConfirmedAmount: verificationResult.amount,
          paymentSlipRef: verificationResult.transRef,
          paymentVerificationMethod: verificationResult.method,
          updatedAt: now
        })
      });

      // 2. Retrieve the order details to get Discord message reference
      let discordMessageId = null;
      let sentViaBot = false;
      try {
        const orderRes = await fetch(`${FIREBASE_DATABASE_URL}/orders/${encodeURIComponent(orderId)}.json`);
        if (orderRes.ok) {
          const orderData = await orderRes.json();
          if (orderData) {
            discordMessageId = orderData.discordMessageId;
            sentViaBot = orderData.sentViaBot;
          }
        }
      } catch (err) {
        console.warn('Could not read order from Firebase for Discord reference:', err);
      }

      // 3. Update the Discord message if reference exists
      if (discordMessageId) {
        let originalMsg = null;
        if (sentViaBot) {
          try {
            const getRes = await fetch(`https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages/${discordMessageId}`, {
              headers: {
                'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
                'User-Agent': 'DiscordBot (https://github.com/discord/discord-api-docs, 1.0.0)'
              }
            });
            if (getRes.ok) originalMsg = await getRes.json();
          } catch (botErr) {
            console.warn('Bot API message fetch exception:', botErr);
          }
        }

        if (!originalMsg) {
          try {
            const getRes = await fetch(`${DISCORD_WEBHOOK_URL}/messages/${discordMessageId}`);
            if (getRes.ok) {
              originalMsg = await getRes.json();
              sentViaBot = false;
            }
          } catch (webhookErr) {
            console.warn('Webhook API message fetch exception:', webhookErr);
          }
        }

        if (originalMsg && originalMsg.embeds && originalMsg.embeds[0]) {
          const embed = originalMsg.embeds[0];
          
          // Remove old fields and append confirmed status
          embed.fields = embed.fields.filter(f => !f.name.includes('Order Status') && !f.name.includes('Payment Confirmation'));
          embed.fields.push({
            name: `💵 Payment Confirmation`,
            value: `**PAYMENT CONFIRMED**\nAuto-verified via slip upload. (${verificationResult.method === 'mock' ? 'Mock Mode' : 'SlipOK Verified'})`,
            inline: false
          });

          embed.color = 5763719; // Green color
          embed.title = `💵 ORDER #${orderId} — PAYMENT CONFIRMED`;
          embed.timestamp = now;
          embed.footer = {
            text: `Bitty Charcoal Bistro 🍔🖤 | Auto-verified`,
            icon_url: "https://ssnmhjjg-gg.vercel.app/aaaaaa.gif"
          };

          // Re-render buttons (disable Confirm Payment but keep others enabled)
          const components = [
            {
              type: 1,
              components: [
                { type: 2, style: 1, label: "🍳 Cooking", custom_id: `cooking:${orderId}:${discordMessageId}`, disabled: false },
                { type: 2, style: 3, label: "✅ Done", custom_id: `done:${orderId}:${discordMessageId}`, disabled: false },
                { type: 2, style: 2, label: "💵 Confirm Payment", custom_id: `confirm_payment:${orderId}:${discordMessageId}`, disabled: true },
                { type: 2, style: 4, label: "❌ Cancel", custom_id: `cancel:${orderId}:${discordMessageId}`, disabled: false }
              ]
            }
          ];

          if (sentViaBot) {
            await fetch(`https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages/${discordMessageId}`, {
              method: 'PATCH',
              headers: {
                'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
                'Content-Type': 'application/json',
                'User-Agent': 'DiscordBot (https://github.com/discord/discord-api-docs, 1.0.0)'
              },
              body: JSON.stringify({ embeds: [embed], components })
            });
          } else {
            await fetch(`${DISCORD_WEBHOOK_URL}/messages/${discordMessageId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ embeds: [embed], components })
            });
          }
        }
      }

      return res.status(200).json({ success: true, message: `Verification successful (${verificationResult.method})` });
    }

    return res.status(400).json({ success: false, error: 'Payment verification failed' });

  } catch (err) {
    console.error('Verify-slip exception:', err);
    return res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};
