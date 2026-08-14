import nodemailer from 'nodemailer';

const ADMIN_EMAIL = 'muragoods0@gmail.com';

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.EMAIL_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export async function sendOrderNotification(orderData: {
  customer: string;
  phone: string;
  zone: string;
  address: string;
  total: number;
  items: string[];
  deliveryDate: string;
  deliveryType: string;
  payment: string;
  orderId: string;
}) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('Email credentials not configured. Skipping email notification.');
    return;
  }

  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: ADMIN_EMAIL,
      subject: `🎮 New Order #${orderData.orderId} - ₱${orderData.total}`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 4px solid #000; border-radius: 16px; background: #fff;">
          <div style="background: #E60012; padding: 20px; border-bottom: 4px solid #000; text-align: center;">
            <h1 style="color: #fff; margin: 0; font-size: 24px; font-weight: 900; text-transform: uppercase;">🎮 New Order Received!</h1>
          </div>
          <div style="padding: 20px; background: #fff;">
            <h2 style="color: #000; font-size: 18px; margin-bottom: 15px;">Order Details</h2>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
              <tr>
                <td style="padding: 8px; border-bottom: 2px solid #eee; font-weight: bold; color: #666;">Order ID:</td>
                <td style="padding: 8px; border-bottom: 2px solid #eee; font-weight: bold; color: #000;">${orderData.orderId}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border-bottom: 2px solid #eee; font-weight: bold; color: #666;">Customer:</td>
                <td style="padding: 8px; border-bottom: 2px solid #eee; font-weight: bold; color: #000;">${orderData.customer}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border-bottom: 2px solid #eee; font-weight: bold; color: #666;">Phone:</td>
                <td style="padding: 8px; border-bottom: 2px solid #eee; font-weight: bold; color: #000;">${orderData.phone}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border-bottom: 2px solid #eee; font-weight: bold; color: #666;">Zone:</td>
                <td style="padding: 8px; border-bottom: 2px solid #eee; font-weight: bold; color: #000;">${orderData.zone}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border-bottom: 2px solid #eee; font-weight: bold; color: #666;">Address:</td>
                <td style="padding: 8px; border-bottom: 2px solid #eee; font-weight: bold; color: #000;">${orderData.address}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border-bottom: 2px solid #eee; font-weight: bold; color: #666;">Delivery Date:</td>
                <td style="padding: 8px; border-bottom: 2px solid #eee; font-weight: bold; color: #000;">${orderData.deliveryDate}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border-bottom: 2px solid #eee; font-weight: bold; color: #666;">Delivery Type:</td>
                <td style="padding: 8px; border-bottom: 2px solid #eee; font-weight: bold; color: #000;">${orderData.deliveryType}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border-bottom: 2px solid #eee; font-weight: bold; color: #666;">Payment:</td>
                <td style="padding: 8px; border-bottom: 2px solid #eee; font-weight: bold; color: #000;">${orderData.payment}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border-bottom: 2px solid #eee; font-weight: bold; color: #666;">Total:</td>
                <td style="padding: 8px; border-bottom: 2px solid #eee; font-weight: bold; color: #E60012; font-size: 20px;">₱${orderData.total}</td>
              </tr>
            </table>
            <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; border: 2px solid #000;">
              <h3 style="color: #000; font-size: 14px; margin: 0 0 10px 0; text-transform: uppercase;">Items Ordered:</h3>
              <ul style="margin: 0; padding-left: 20px; color: #333;">
                ${orderData.items.map(item => `<li style="margin-bottom: 5px; font-weight: bold;">${item}</li>`).join('')}
              </ul>
            </div>
          </div>
          <div style="background: #000; padding: 15px; text-align: center; border-top: 4px solid #000;">
            <p style="color: #FFD700; margin: 0; font-weight: bold; font-size: 12px; text-transform: uppercase;">Muragoods Admin Notification</p>
          </div>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log('Order notification email sent successfully');
  } catch (error) {
    console.error('Failed to send order notification email:', error);
  }
}
