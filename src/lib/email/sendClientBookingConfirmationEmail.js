// src/lib/email/sendClientBookingConfirmationEmail.js
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

export async function sendClientBookingConfirmationEmail({
  to,
  clientName,
  serviceSummary,
  startTime,
  endTime,
  bookingUrl,
  messageUrl,
}) {
  if (!to) {
    console.warn("Skipping client booking email: missing recipient email.");
    return null;
  }

  if (!process.env.RESEND_API_KEY) {
    console.warn("Skipping client booking email: missing RESEND_API_KEY.");
    return null;
  }

  if (!process.env.RESEND_FROM_EMAIL) {
    console.warn("Skipping client booking email: missing RESEND_FROM_EMAIL.");
    return null;
  }

  const safeClientName = escapeHtml(clientName || "there");
  const safeServiceSummary = escapeHtml(serviceSummary || "Pet care service");

  

  return resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to,
    subject: "Booking request received ✅",
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #18181b;">
        <h2>Hi ${safeClientName},</h2>

        <p>Your booking request has been received.</p>

        <div style="padding: 12px; border: 1px solid #e4e4e7; border-radius: 10px; margin: 16px 0;">
          <p><strong>Service:</strong> ${safeServiceSummary}</p>
          <p><strong>Start:</strong> ${formatDateTime(startTime)}</p>
          <p><strong>End:</strong> ${formatDateTime(endTime)}</p>
        </div>

        <p>You can use the link below to view your booking details and message your sitter:</p>

<p>
  <a 
    href="${bookingUrl}" 
    style="display: inline-block; background: #18181b; color: white; padding: 10px 14px; border-radius: 8px; text-decoration: none; font-weight: bold;"
  >
    View booking details
  </a>
</p>

<p style="font-size: 14px; color: #52525b;">
  Need to send a message? You can message your sitter from your booking page.
</p>

        <p style="font-size: 14px; color: #52525b;">
          If the button does not work, copy and paste this link into your browser:<br />
          <a href="${bookingUrl}">${bookingUrl}</a>
        </p>

        ${
          bookingUrl && bookingUrl !== messageUrl
            ? `<p style="font-size: 14px;"><a href="${bookingUrl}">View booking details</a></p>`
            : ""
        }

        <p>Thank you,<br />The TaskWhisker Team</p>
      </div>
    `,
  });
}
