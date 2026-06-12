import nodemailer from 'nodemailer';
import { logger } from '../lib/logger.js';

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

export async function sendDomainVerificationFailedEmail(
    tenantAdminEmail: string,
    domain: string,
    daysRemaining: number
) {
    const subject = `⚠️ Domain Verification Issue: ${domain}`;
    const html = `
        <h2>Action Required: DNS Verification Failed</h2>
        <p>We couldn't verify the DNS records for <strong>${domain}</strong></p>
        
        <h3>What to do:</h3>
        <ol>
            <li>Check your DNS settings with your domain provider</li>
            <li>Ensure TXT and CNAME records are correctly configured</li>
            <li>Wait 5-10 minutes for DNS propagation</li>
            <li>Re-verify in your admin panel</li>
        </ol>
        
        <p><strong>⏰ You have ${daysRemaining} days to fix this.</strong></p>
        <p>After that, the domain will be automatically disabled.</p>
    `;

    try {
        await transporter.sendMail({
            from: process.env.SMTP_FROM || '"Vendora Platform" <noreply@vendora.com>',
            to: tenantAdminEmail,
            subject,
            html,
        });
        logger.info(`Verification failed email sent to ${tenantAdminEmail}`);
    } catch (error) {
        logger.error({ error }, 'Failed to send email');
    }
}

export async function sendDomainDisabledEmail(
    tenantAdminEmail: string,
    domain: string
) {
    const subject = `🚨 Domain Disabled: ${domain}`;
    const html = `
        <h2>Domain Has Been Disabled</h2>
        <p>Your custom domain <strong>${domain}</strong> was disabled due to failed DNS verification.</p>
        
        <p>Your site is still accessible via the default URL.</p>
        
        <p>To re-enable:</p>
        <ol>
            <li>Fix your DNS configuration</li>
            <li>Go to Admin Panel → Domains</li>
            <li>Click "Re-verify"</li>
        </ol>
    `;

    try {
        await transporter.sendMail({
            from: process.env.SMTP_FROM || '"Vendora Platform" <noreply@vendora.com>',
            to: tenantAdminEmail,
            subject,
            html,
        });
        logger.info(`Domain disabled email sent to ${tenantAdminEmail}`);
    } catch (error) {
        logger.error({ error }, 'Failed to send email');
    }
}
