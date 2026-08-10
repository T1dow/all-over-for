/**
 * src/services/emailService.js
 * ------------------------------------------------------------------
 * SMTP delivery layer (FR-34..FR-40). Two transports:
 *
 *   transport = smtp  → real delivery via nodemailer (SMTP_* env vars;
 *                       recommended: Gmail + App Password, TLS).
 *   transport = json  → DEMO/TEST mode: the composed message is saved
 *                       as a JSON file in storage/test-mail/ and
 *                       reported as delivered. Lets you demonstrate
 *                       the whole pipeline (attachment, statuses,
 *                       audit) with no SMTP credentials.
 *
 * SECURITY (FR-39): the subject and body NEVER contain salary figures
 * or public URLs; the payslip is a direct attachment from storage/
 * (outside the web root).
 * ------------------------------------------------------------------
 */
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const env = require('../config/env');
const { getSetting } = require('../utils/settings');

async function buildTransport() {
  const transport = (await getSetting('email.transport')) || 'json';

  if (transport !== 'smtp') {
    // JSON test transport — captures the message instead of sending.
    return {
      kind: 'json',
      send: async (message) => {
        const dir = env.isVercel
          ? path.join('/tmp', 'test-mail')
          : path.join(__dirname, '..', '..', 'storage', 'test-mail');
        fs.mkdirSync(dir, { recursive: true });
        const att = message.attachments && message.attachments[0];
        const safeName = String(message.to).replace(/[^a-z0-9@.-]/gi, '_');
        const file = path.join(dir, `${Date.now()}-${safeName}.json`);
        fs.writeFileSync(file, JSON.stringify({
          to: message.to,
          subject: message.subject,
          text: message.text,
          attachment: att
            ? { filename: att.filename, bytes: att.content ? att.content.length : null, path: att.path || null }
            : null,
          receivedAt: new Date().toISOString(),
        }, null, 2));
        return { messageId: `json-${Date.now()}` };
      },
    };
  }

  const transporter = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.secure,
    auth: { user: env.smtp.user, pass: env.smtp.pass },
  });
  return { kind: 'smtp', send: (message) => transporter.sendMail(message) };
}

/**
 * Send one payslip email. Throws on failure so the caller can update
 * the notification state machine.
 */
async function sendPayslipEmail({ to, subject, text, attachmentPath }) {
  const transport = await buildTransport();
  const message = {
    from: `"${env.smtp.fromName}" <${env.smtp.fromAddress}>`,
    to,
    subject,
    text,
    attachments: attachmentPath
      ? [{ filename: path.basename(attachmentPath), path: attachmentPath }]
      : [],
  };
  return transport.send(message);
}

module.exports = { sendPayslipEmail, buildTransport };
