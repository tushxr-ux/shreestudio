const nodemailer = require('nodemailer');

// --- Transporter Configuration ---
function createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host && user && pass) {
    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  }

  // Fallback dev / log transporter when SMTP is not configured
  return {
    sendMail: async (options) => {
      console.log('\n======================================================');
      console.log('[SHREESTUDIO EMAIL SERVICE - DEV TRANSMISSION LOG]');
      console.log(`TO: ${options.to}`);
      console.log(`FROM: ${options.from || 'noreply@shreestudio.com'}`);
      console.log(`SUBJECT: ${options.subject}`);
      console.log('--- EMAIL CONTENT PREVIEW ---');
      console.log(options.text || '[HTML Email Output]');
      console.log('======================================================\n');
      return { messageId: 'dev_mock_msg_' + Date.now() };
    },
  };
}

/**
 * Send an order confirmation & preset download link email to customer
 */
async function sendOrderConfirmationEmail({ userEmail, userName, order }) {
  if (!userEmail) {
    console.warn('[Email Service] No recipient email specified.');
    return { success: false, reason: 'Missing email' };
  }

  const transporter = createTransporter();
  const fromAddress = process.env.SMTP_FROM || 'ShreeStudio <orders@shreestudio.com>';
  const customerName = userName || userEmail.split('@')[0] || 'Creator';
  const orderDate = new Date(order.createdAt || Date.now()).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const itemsHtml = (order.items || [])
    .map(
      (item) => `
      <tr style="border-bottom: 1px solid #2a2b36;">
        <td style="padding: 14px 16px; color: #ffffff; font-weight: 500;">
          ${item.name}
          ${item.driveLink ? `
            <div style="margin-top: 6px;">
              <a href="${item.driveLink}" target="_blank" style="display: inline-block; background: #1a1b2e; color: #38bdf8; border: 1px solid #38bdf8; font-size: 11.5px; font-weight: 600; text-decoration: none; padding: 4px 10px; border-radius: 6px;">
                📥 Open Google Drive Folder
              </a>
            </div>
          ` : ''}
        </td>
        <td style="padding: 14px 16px; color: #a1a1aa; text-align: center;">x${item.quantity}</td>
        <td style="padding: 14px 16px; color: #a78bfa; font-weight: 600; text-align: right;">₹${item.lineTotal || item.price}</td>
      </tr>
    `
    )
    .join('');

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Your ShreeStudio Order Receipt</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #0b0c10; font-family: 'Inter', Helvetica, Arial, sans-serif; color: #e4e4e7;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0b0c10; padding: 30px 15px;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background-color: #12131a; border: 1px solid #272738; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.5);">
              
              <!-- Header -->
              <tr>
                <td style="background: linear-gradient(135deg, #6d28d9 0%, #4c1d95 100%); padding: 32px; text-align: center;">
                  <h1 style="margin: 0; font-size: 26px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px;">
                    Shree<span style="color: #c4b5fd;">Studio</span>
                  </h1>
                  <p style="margin: 8px 0 0 0; font-size: 14px; color: #ddd6fe;">Presets, Actions & Motion Packs for Creators</p>
                </td>
              </tr>

              <!-- Greeting & Order Status -->
              <tr>
                <td style="padding: 32px 32px 16px 32px;">
                  <h2 style="margin: 0 0 12px 0; font-size: 20px; color: #ffffff;">Thank you for your purchase, ${customerName}! 🎉</h2>
                  <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #a1a1aa;">
                    Your payment was verified successfully. Below are your order summary and instant download instructions.
                  </p>
                </td>
              </tr>

              <!-- Order Info Badge -->
              <tr>
                <td style="padding: 0 32px 24px 32px;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #1a1b26; border-radius: 12px; padding: 16px;">
                    <tr>
                      <td style="font-size: 13px; color: #71717a;">Order ID: <b style="color: #ffffff;">#${order.id}</b></td>
                      <td align="right" style="font-size: 13px; color: #71717a;">Date: <b style="color: #ffffff;">${orderDate}</b></td>
                    </tr>
                    <tr>
                      <td style="font-size: 13px; color: #71717a; padding-top: 6px;">Payment: <b style="color: #34d399;">Razorpay Verified (UPI/Card)</b></td>
                      <td align="right" style="font-size: 13px; color: #71717a; padding-top: 6px;">Status: <b style="color: #34d399;">Paid & Complete</b></td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Item Breakdown Table -->
              <tr>
                <td style="padding: 0 32px 24px 32px;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; background-color: #161722; border-radius: 12px; overflow: hidden;">
                    <thead>
                      <tr style="background-color: #1e1f2e; border-bottom: 1px solid #2e3044;">
                        <th align="left" style="padding: 12px 16px; font-size: 12px; color: #9ca3af; text-transform: uppercase;">Item</th>
                        <th align="center" style="padding: 12px 16px; font-size: 12px; color: #9ca3af; text-transform: uppercase;">Qty</th>
                        <th align="right" style="padding: 12px 16px; font-size: 12px; color: #9ca3af; text-transform: uppercase;">Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${itemsHtml}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colspan="2" align="right" style="padding: 16px; font-size: 15px; font-weight: 600; color: #ffffff;">Total Amount:</td>
                        <td align="right" style="padding: 16px; font-size: 18px; font-weight: 700; color: #a78bfa;">₹${order.subtotal}</td>
                      </tr>
                    </tfoot>
                  </table>
                </td>
              </tr>

              <!-- Download Button CTA -->
              <tr>
                <td align="center" style="padding: 0 32px 36px 32px;">
                  <a href="${process.env.CLIENT_ORIGIN || 'http://localhost:4000'}/#orders" 
                     style="display: inline-block; background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%); color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 12px; box-shadow: 0 10px 20px rgba(124, 58, 237, 0.3);">
                    ⚡ Download Your Presets Now
                  </a>
                  <p style="margin: 12px 0 0 0; font-size: 12px; color: #71717a;">
                    Need assistance? Reply directly to this email or visit our support dashboard.
                  </p>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="background-color: #0e0f14; padding: 20px; text-align: center; border-top: 1px solid #232433;">
                  <p style="margin: 0; font-size: 12px; color: #52525b;">
                    © ${new Date().getFullYear()} ShreeStudio. All rights reserved. Made for creators & editors.
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

  try {
    const info = await transporter.sendMail({
      from: fromAddress,
      to: userEmail,
      subject: `🎉 Order Confirmed! Your ShreeStudio Download (Order #${order.id})`,
      text: `Thank you for your purchase, ${customerName}! Order #${order.id} for ₹${order.subtotal} has been confirmed. Download your presets at http://localhost:4000/#orders`,
      html: htmlContent,
    });

    console.log(`[Email Service] ✅ Purchase receipt sent to ${userEmail} (MsgID: ${info.messageId})`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('[Email Service] ❌ Error sending receipt email:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = {
  sendOrderConfirmationEmail,
};
