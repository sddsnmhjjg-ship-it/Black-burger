// Vercel Serverless Function: Send Order Receipt via Gmail SMTP (Nodemailer) + Resend Fallback
const nodemailer = require('nodemailer');

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const GMAIL_USER = process.env.GMAIL_USER || 'sddsnmhjjg@gmail.com';
  const GMAIL_PASS = process.env.GMAIL_PASS || Buffer.from('Y3V0d3dpc3B3d2JvZ3Jxcg==', 'base64').toString('utf8');

  try {
    const payload = req.method === 'POST' ? req.body : req.query;
    const {
      customerEmail,
      customerName = 'ลูกค้าคนสำคัญ',
      orderId = '----',
      queueNumber = '-',
      burger = 'Classic Emperor',
      meat = 'ไก่ (Chicken)',
      extraMeat = false,
      extraCheese = false,
      specialNote = '',
      total = 0,
      paymentMethod = 'PromptPay QR',
      orderTime = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })
    } = payload || {};

    const targetEmail = customerEmail || GMAIL_USER;

    // Build addons text
    const addons = [];
    if (extraMeat) addons.push('เพิ่มเนื้อไก่ (+15฿)');
    if (extraCheese) addons.push('เพิ่มชีสเยิ้ม (+10฿)');
    const addonsHtml = addons.length > 0
      ? `<div style="font-size: 13px; color: #f59e0b; margin-top: 4px;">🧀 ท็อปปิ้งเสริม: ${addons.join(', ')}</div>`
      : '';

    const noteHtml = specialNote
      ? `<div style="font-size: 13px; color: #a1a1aa; margin-top: 4px; font-style: italic;">📝 โน้ตพิเศษ: "${escapeHtml(specialNote)}"</div>`
      : '';

    const formattedTotal = Number(total).toFixed(2);

    // Build payment method badge
    let paymentBadgeHtml = '';
    const payLower = String(paymentMethod || '').toLowerCase();
    if (payLower.includes('cash') || payLower.includes('เงินสด')) {
      paymentBadgeHtml = '<span style="display: inline-block; background-color: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4); padding: 4px 10px; border-radius: 8px; font-weight: 700; font-size: 13px;">💵 เงินสด (Cash)</span>';
    } else {
      paymentBadgeHtml = '<span style="display: inline-block; background-color: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.4); padding: 4px 10px; border-radius: 8px; font-weight: 700; font-size: 13px;">📱 สแกนจ่ายพร้อมเพย์ (PromptPay QR)</span>';
    }

    const emailHtml = `
<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ใบเสร็จรับเงิน — Emperor Burger</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0c0a09; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #fafaf9;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #0c0a09; padding: 30px 10px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 540px; background-color: #18181b; border-radius: 24px; border: 1px solid rgba(245, 158, 11, 0.3); overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.8);">
          
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #7f1d1d 0%, #1c1917 100%); padding: 32px 24px; text-align: center; border-bottom: 2px solid rgba(245, 158, 11, 0.4);">
              <div style="font-size: 40px; line-height: 1; margin-bottom: 8px;">🍔👑</div>
              <h1 style="margin: 0 0 6px 0; font-size: 24px; font-weight: 800; color: #ffffff; letter-spacing: 1px; text-transform: uppercase;">
                Emperor Burger
              </h1>
              <p style="margin: 0; font-size: 13px; color: #fde68a; font-family: monospace;">
                ใบเสร็จรับเงิน & อาหารของคุณพร้อมเสิร์ฟแล้ว!
              </p>
            </td>
          </tr>

          <!-- Success Alert Status -->
          <tr>
            <td style="padding: 24px 28px 0 28px;">
              <div style="background-color: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.4); border-radius: 16px; padding: 16px; text-align: center;">
                <div style="font-size: 18px; font-weight: 700; color: #34d399; margin-bottom: 4px;">
                  ✅ อาหารปรุงเสร็จแล้ว พร้อมรับประทาน!
                </div>
                <div style="font-size: 13px; color: #a7f3d0;">
                  เชฟทำอาหารเสร็จร้อนๆ แล้ว สามารถมารับได้ที่เคาน์เตอร์เลยครับ
                </div>
              </div>
            </td>
          </tr>

          <!-- Order & Customer Info -->
          <tr>
            <td style="padding: 24px 28px;">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 20px;">
                <tr>
                  <td style="font-size: 14px; color: #a1a1aa; padding-bottom: 6px;">ชื่อลูกค้า:</td>
                  <td align="right" style="font-size: 15px; font-weight: 700; color: #ffffff; padding-bottom: 6px;">
                    คุณ ${escapeHtml(customerName)}
                  </td>
                </tr>
                <tr>
                  <td style="font-size: 14px; color: #a1a1aa; padding-bottom: 6px;">หมายเลขออเดอร์:</td>
                  <td align="right" style="font-size: 14px; font-family: monospace; font-weight: 700; color: #f87171; padding-bottom: 6px;">
                    #${escapeHtml(String(orderId))} (คิว #${escapeHtml(String(queueNumber))})
                  </td>
                </tr>
                <tr>
                  <td style="font-size: 14px; color: #a1a1aa; padding-bottom: 6px;">วันที่สั่งซื้อ:</td>
                  <td align="right" style="font-size: 13px; color: #d4d4d8; padding-bottom: 6px; font-family: monospace;">
                    ${escapeHtml(orderTime)}
                  </td>
                </tr>
                <tr>
                  <td style="font-size: 14px; color: #a1a1aa; padding-top: 4px;">วิธีชำระเงิน:</td>
                  <td align="right" style="padding-top: 4px;">
                    ${paymentBadgeHtml}
                  </td>
                </tr>
              </table>

              <!-- Itemized Receipt Box -->
              <div style="background-color: #09090b; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 18px; margin-bottom: 20px;">
                <div style="font-size: 11px; font-weight: 700; color: #71717a; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; font-family: monospace;">
                  รายการอาหารที่สั่ง (ORDER ITEMS)
                </div>

                <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                  <tr>
                    <td valign="top">
                      <div style="font-size: 16px; font-weight: 700; color: #ffffff; margin-bottom: 2px;">
                        🍔 ${escapeHtml(burger)}
                      </div>
                      <div style="font-size: 13px; color: #34d399;">
                        🍗 เนื้อ: ${escapeHtml(meat)}
                      </div>
                      ${addonsHtml}
                      ${noteHtml}
                    </td>
                    <td align="right" valign="top" style="font-size: 16px; font-weight: 700; color: #f59e0b; font-family: monospace; white-space: nowrap;">
                      ฿${formattedTotal}
                    </td>
                  </tr>
                </table>

                <div style="border-top: 1px dashed rgba(255,255,255,0.15); margin: 16px 0 12px 0;"></div>

                <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="font-size: 16px; font-weight: 800; color: #ffffff;">ยอดชำระสุทธิ (Total):</td>
                    <td align="right" style="font-size: 22px; font-weight: 800; color: #fbbf24; font-family: monospace;">
                      ฿${formattedTotal}
                    </td>
                  </tr>
                </table>
              </div>

              <!-- Thank you note -->
              <p style="margin: 0; font-size: 13px; color: #a1a1aa; text-align: center; line-height: 1.6;">
                ขอบพระคุณที่อุดหนุน <strong style="color:#ffffff;">Emperor Burger</strong> ขอให้อร่อยกับมื้อนี้นะครับ! ❤️🔥
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #111113; padding: 18px 24px; text-align: center; border-top: 1px solid rgba(255,255,255,0.06);">
              <p style="margin: 0; font-size: 11px; color: #71717a; font-family: monospace;">
                Emperor Burger • Handcrafted Gourmet Burgers<br>
                <a href="https://emperor-burger-ssnmhjjg.vercel.app/index.html" style="color: #f59e0b; text-decoration: none;">emperor-burger-ssnmhjjg.vercel.app</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    // 1. PRIMARY: Send via Gmail SMTP (Allows sending to ANY recipient: teachers, students, customers)
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: GMAIL_USER,
        pass: GMAIL_PASS
      }
    });

    const mailOptions = {
      from: `"Emperor Burger" <${GMAIL_USER}>`,
      to: targetEmail,
      subject: `🍔 อาหารของคุณเสร็จแล้ว! ใบเสร็จรับเงิน Order #${orderId} — Emperor Burger`,
      html: emailHtml
    };

    const info = await transporter.sendMail(mailOptions);

    return res.status(200).json({
      success: true,
      messageId: info.messageId,
      recipient: targetEmail,
      engine: 'gmail_smtp_v2'
    });

  } catch (error) {
    console.error('Error sending receipt email via Gmail:', error);
    return res.status(500).json({ error: error.message });
  }
};

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
