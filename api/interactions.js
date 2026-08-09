const crypto = require('crypto');

const DISCORD_PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY || '2fffbd4f38c4bed0e7f08d0aa3ed009328859bf67272ad74ed6c6c1a2adb104e';
const FIREBASE_DATABASE_URL = process.env.FIREBASE_DATABASE_URL || 'https://food-34707-default-rtdb.asia-southeast1.firebasedatabase.app';

function verifySignature(publicKeyHex, signatureHex, timestamp, rawBody) {
  try {
    const key = crypto.createPublicKey({
      key: Buffer.concat([
        Buffer.from('302a300506032b6570032100', 'hex'),
        Buffer.from(publicKeyHex, 'hex')
      ]),
      format: 'der',
      type: 'spki'
    });
    return crypto.verify(
      null,
      Buffer.from(timestamp + rawBody),
      key,
      Buffer.from(signatureHex, 'hex')
    );
  } catch (err) {
    console.error('Signature verification error:', err);
    return false;
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end('Method Not Allowed');
  }

  let rawBody = '';
  try {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    rawBody = Buffer.concat(chunks).toString('utf8');
  } catch (err) {
    return res.status(400).end('Failed to read request body');
  }

  const signature = req.headers['x-signature-ed25519'];
  const timestamp = req.headers['x-signature-timestamp'];

  if (!signature || !timestamp) {
    return res.status(401).end('Invalid signature headers');
  }

  const isVerified = verifySignature(DISCORD_PUBLIC_KEY, signature, timestamp, rawBody);
  if (!isVerified) {
    return res.status(401).end('Signature verification failed');
  }

  let interaction;
  try {
    interaction = JSON.parse(rawBody);
  } catch (err) {
    return res.status(400).end('Invalid JSON payload');
  }

  if (interaction.type === 1) {
    return res.status(200).json({ type: 1 });
  }

  const statusMap = {
    cooking: { emoji: '🍳', text: 'COOKING...', color: 16750848, bg: '#ff9900', msg: 'Chef is preparing this order!' },
    done:    { emoji: '✅', text: 'DONE — READY FOR PICKUP!', color: 5763719, bg: '#57F287', msg: 'Order is ready to serve!' },
    cancel:  { emoji: '❌', text: 'CANCELLED', color: 15548997, bg: '#ED4245', msg: 'This order has been cancelled.' },
    confirm_payment: { emoji: '💵', text: 'PAYMENT CONFIRMED', color: 5763719, bg: '#57F287', msg: 'The chef has confirmed the customer payment.' }
  };

  const updateFirebaseStatus = async (oid, action, extra = {}) => {
    try {
      const payload = {
        orderId: Number(oid) || oid,
        updatedAt: new Date().toISOString(),
        ...extra
      };
      if (action === 'cooking' || action === 'done' || action === 'cancel') {
        payload.status = action;
      }
      if (action === 'confirm_payment') {
        payload.paymentStatus = 'confirmed';
        payload.paymentConfirmedAt = new Date().toISOString();
      }
      await fetch(`${FIREBASE_DATABASE_URL}/orders/${encodeURIComponent(oid)}.json`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (err) {
      console.warn('Firebase status update failed:', err);
    }
  };

  const getComponents = (action, orderId, messageId, disabled = false, hasConfirmButton = false) => {
    const isClosed = disabled || action === 'done' || action === 'cancel';
    const components = [
      {
        type: 2,
        style: 1,
        label: "🍳 Cooking",
        custom_id: `cooking:${orderId}:${messageId}`,
        disabled: isClosed
      },
      {
        type: 2,
        style: 3,
        label: "✅ Done",
        custom_id: `done:${orderId}:${messageId}`,
        disabled: isClosed
      }
    ];
    if (hasConfirmButton) {
      components.push({
        type: 2,
        style: 2,
        label: "💵 Confirm Payment",
        custom_id: `confirm_payment:${orderId}:${messageId}`,
        disabled: isClosed || action === 'confirm_payment'
      });
    }
    components.push({
      type: 2,
      style: 4,
      custom_id: `cancel:${orderId}:${messageId}`,
      label: "❌ Cancel",
      disabled: isClosed
    });
    return [
      {
        type: 1,
        components
      }
    ];
  };

  if (interaction.type === 3) {
    const { custom_id } = interaction.data;
    const parts = custom_id.split(':');
    if (parts.length < 3) {
      return res.status(400).end('Invalid custom_id format');
    }
    const [action, orderId, messageId] = parts;

    // Check if the confirm_payment button was present in the original message
    const originalMsg = interaction.message;
    const hasConfirmButton = originalMsg && 
                             originalMsg.components && 
                             originalMsg.components[0] && 
                             originalMsg.components[0].components.some(c => c.custom_id && c.custom_id.startsWith('confirm_payment'));

    if (action === 'cancel') {
      return res.status(200).json({
        type: 9,
        data: {
          title: "Cancel Order / ยกเลิกออเดอร์",
          custom_id: `cancel_modal:${orderId}:${messageId}`,
          components: [
            {
              type: 1,
              components: [
                {
                  type: 4,
                  custom_id: "cancel_reason",
                  label: "Reason for cancellation / เหตุผลการยกเลิก",
                  style: 2,
                  min_length: 1,
                  max_length: 200,
                  placeholder: "e.g., Out of ingredients, closing soon...",
                  required: true
                }
              ]
            }
          ]
        }
      });
    }

    const status = statusMap[action];
    if (!status) {
      return res.status(400).end('Unknown action');
    }

    await updateFirebaseStatus(orderId, action);

    const embed = originalMsg.embeds[0];

    if (embed) {
      embed.fields = embed.fields.filter(f => !f.name.includes('Order Status') && !f.name.includes('Payment Confirmation'));
      embed.fields.push({
        name: action === 'confirm_payment' ? `${status.emoji} Payment Confirmation` : `${status.emoji} Order Status`,
        value: `**${status.text}**\n${status.msg}`,
        inline: false
      });
      embed.color = status.color;
      embed.title = `${status.emoji} ORDER #${orderId} — ${status.text}`;
      embed.timestamp = new Date().toISOString();
      embed.footer = {
        text: `Bitty Charcoal Bistro 🍔🖤 | Status updated`,
        icon_url: "https://ssnmhjjg-gg.vercel.app/aaaaaa.gif"
      };
    }

    const shouldDisable = (action === 'done');
    return res.status(200).json({
      type: 7,
      data: {
        embeds: embed ? [embed] : [],
        components: getComponents(action, orderId, messageId, shouldDisable, hasConfirmButton)
      }
    });
  }

  if (interaction.type === 5) {
    const { custom_id } = interaction.data;
    const parts = custom_id.split(':');
    if (parts.length < 3) {
      return res.status(400).end('Invalid modal custom_id format');
    }
    const [modalName, orderId, messageId] = parts;

    if (modalName === 'cancel_modal') {
      let reason = 'No reason specified';
      try {
        const actionRow = interaction.data.components[0];
        const inputComponent = actionRow.components.find(c => c.custom_id === 'cancel_reason');
        if (inputComponent) {
          reason = inputComponent.value;
        }
      } catch (err) {
        console.warn('Could not extract modal reason:', err);
      }

      const originalMsg = interaction.message;
      const hasConfirmButton = originalMsg && 
                               originalMsg.components && 
                               originalMsg.components[0] && 
                               originalMsg.components[0].components.some(c => c.custom_id && c.custom_id.startsWith('confirm_payment'));

      const status = statusMap.cancel;
      await updateFirebaseStatus(orderId, 'cancel', { cancelReason: reason });

      const embed = originalMsg.embeds[0];

      if (embed) {
        embed.fields = embed.fields.filter(f => !f.name.includes('Order Status') && !f.name.includes('Payment Confirmation'));
        embed.fields.push({
          name: `${status.emoji} Order Status`,
          value: `**${status.text}**\n${status.msg}\nReason: ${reason}`,
          inline: false
        });
        embed.color = status.color;
        embed.title = `${status.emoji} ORDER #${orderId} — ${status.text}`;
        embed.timestamp = new Date().toISOString();
        embed.footer = {
          text: `ไปทำงานซะ | Status updated`,
          icon_url: "https://ssnmhjjg-gg.vercel.app/aaaaaa.gif"
        };
      }

      return res.status(200).json({
        type: 7,
        data: {
          embeds: embed ? [embed] : [],
          components: getComponents('cancel', orderId, messageId, true, hasConfirmButton)
        }
      });
    }
  }

  return res.status(400).end('Unsupported interaction type');
};

module.exports.config = {
  api: {
    bodyParser: false,
  },
};
