// src/lib/email/sendSitterBookingNotificationEmail.js
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

function formatDateTime(value) {
  if (!value) return "—";

  return new Date(value).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function sendSitterBookingNotificationEmail({
  to,
  sitterName,
  clientName,
  serviceSummary,
  startTime,
  endTime,
  messageUrl,
}) {
  if (!to) {
    console.warn("Skipping sitter booking email: missing sitter email.");
    return null;
  }

  if (!process.env.RESEND_API_KEY) {
    console.warn("Skipping sitter booking email: missing RESEND_API_KEY.");
    return null;
  }

  if (!process.env.RESEND_FROM_EMAIL) {
    console.warn("Skipping sitter booking email: missing RESEND_FROM_EMAIL.");
    return null;
  }

  const safeSitterName = escapeHtml(sitterName || "there");
  const safeClientName = escapeHtml(clientName || "Client");
  const safeServiceSummary = escapeHtml(serviceSummary || "Pet care service");

  

  return resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to,
    subject: "New booking assigned to you 🐾",
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #18181b;">
        <h2>Hi ${safeSitterName},</h2>

        <p>A new booking has been assigned to you.</p>

        <div style="padding: 12px; border: 1px solid #e4e4e7; border-radius: 10px; margin: 16px 0;">
          <p><strong>Client:</strong> ${safeClientName}</p>
          <p><strong>Service:</strong> ${safeServiceSummary}</p>
          <p><strong>Start:</strong> ${formatDateTime(startTime)}</p>
          <p><strong>End:</strong> ${formatDateTime(endTime)}</p>
        </div>

        <p>You can open the message thread below to view the booking and contact the client:</p>

        <p>
          <a
            href="${messageUrl}"
            style="display: inline-block; background: #18181b; color: white; padding: 10px 14px; border-radius: 8px; text-decoration: none; font-weight: bold;"
          >
            Open booking messages
          </a>
        </p>

        <p style="font-size: 14px; color: #52525b;">
          If the button does not work, copy and paste this link into your browser:<br />
          <a href="${messageUrl}">${messageUrl}</a>
        </p>

        <p>Thank you,<br />The TaskWhisker Team</p>
      </div>
    `,
  });
}
