#!/usr/bin/env node

// Branded Supabase Auth emails. Writes every template to supabase/templates/ and, with --push,
// patches only the mailer subjects/templates on the linked project through the Management API.
//
//   node scripts/auth-emails.mjs            # write the HTML files
//   node scripts/auth-emails.mjs --push     # write them and update the live project
//
// --push needs SUPABASE_ACCESS_TOKEN (a personal access token) and uses supabase/.temp/project-ref
// unless SUPABASE_PROJECT_REF is set.
//
// Links go to {{ .SiteURL }}/auth/confirm (app/auth/confirm/route.ts), which calls verifyOtp with the
// token hash. They don't use {{ .RedirectTo }} because it falls back to the bare site URL whenever
// the redirect isn't on the project's allow list.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const LOGO = "https://www.habiv.com/apple-icon";
const SITE = "https://www.habiv.com";

const confirmLink = (type) => `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=${type}`;

const font = "'Space Grotesk',Helvetica,Arial,sans-serif";
const mono = "'IBM Plex Mono',ui-monospace,Menlo,Consolas,monospace";

function button(href, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 8px;">
<tr><td style="background:#050505;border-radius:10px;">
<a href="${href}" style="display:inline-block;padding:14px 26px;font:600 15px/1 ${font};color:#f3f3f1;text-decoration:none;border-radius:10px;">${label}</a>
</td></tr></table>
<p style="margin:20px 0 0;font:13px/1.55 ${font};color:#636360;">Button not working? Paste this link into your browser:<br>
<a href="${href}" style="color:#050505;word-break:break-all;">${href}</a></p>`;
}

function code(token) {
  return `<p style="margin:26px 0 8px;padding:18px 0;background:#f3f3f1;border:1px solid #e4e4e1;border-radius:10px;text-align:center;font:600 30px/1 ${mono};letter-spacing:8px;color:#050505;">${token}</p>`;
}

function layout({ preheader, heading, body, footer }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${heading}</title>
</head>
<body style="margin:0;padding:0;background:#f3f3f1;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f3f1;">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
<tr><td style="padding:0 4px 18px;">
<a href="${SITE}" style="text-decoration:none;color:#050505;">
<img src="${LOGO}" width="36" height="36" alt="" style="display:inline-block;vertical-align:middle;border-radius:9px;border:0;">
<span style="display:inline-block;vertical-align:middle;margin-left:10px;font:700 20px/1 ${font};letter-spacing:-0.3px;color:#050505;">Habiv</span>
</a>
</td></tr>
<tr><td style="background:#ffffff;border:1px solid #e4e4e1;border-radius:16px;padding:36px 32px;">
<h1 style="margin:0 0 14px;font:700 24px/1.25 ${font};letter-spacing:-0.4px;color:#050505;">${heading}</h1>
${body}
</td></tr>
<tr><td style="padding:22px 4px 0;font:12px/1.6 ${font};color:#9b9b98;">
${footer}<br>
<a href="${SITE}" style="color:#636360;text-decoration:none;">habiv.com</a> &middot; Tiny games, made with AI.
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`;
}

const p = (text) => `<p style="margin:0 0 12px;font:15px/1.6 ${font};color:#2b2b29;">${text}</p>`;

const notSentByYou = "If you didn't ask for this, you can ignore this email. Nothing changes until the link is used.";
const notYou = `If this wasn't you, reset your password from the sign-in screen at <a href="${SITE}" style="color:#636360;">habiv.com</a> and reply to this email.`;

// key: the Management API suffix (mailer_subjects_<key>, mailer_templates_<key>_content).
const emails = [
  {
    key: "confirmation",
    subject: "Confirm your email for Habiv",
    heading: "Confirm your email",
    preheader: "One click and your Habiv account is ready.",
    body: p("Thanks for signing up. Confirm this address and you can start playing and publishing games on Habiv.") + button(confirmLink("email"), "Confirm email"),
    footer: `This email was sent to {{ .Email }}. ${notSentByYou}`,
  },
  {
    key: "invite",
    subject: "You're invited to Habiv",
    heading: "You're invited",
    preheader: "Someone invited you to Habiv.",
    body: p("You've been invited to join Habiv, the home for tiny browser games made with AI. Accept the invite to set up your account.") + button(confirmLink("invite"), "Accept invite"),
    footer: `This invite was sent to {{ .Email }}. If you weren't expecting it, you can ignore this email.`,
  },
  {
    key: "magic_link",
    subject: "Your Habiv sign-in link",
    heading: "Sign in to Habiv",
    preheader: "Your one-time sign-in link.",
    body: p("Use the button below to sign in. The link works once and expires soon.") + button(confirmLink("email"), "Sign in"),
    footer: `This email was sent to {{ .Email }}. ${notSentByYou}`,
  },
  {
    key: "recovery",
    subject: "Reset your Habiv password",
    heading: "Reset your password",
    preheader: "Choose a new password for your Habiv account.",
    body: p("We got a request to reset the password for your Habiv account. Use the button below to choose a new one. The link works once and expires soon.") + button(confirmLink("recovery"), "Choose a new password"),
    footer: `This email was sent to {{ .Email }}. If you didn't ask for a reset, ignore this email and your password stays the same.`,
  },
  {
    key: "email_change",
    subject: "Confirm your new email for Habiv",
    heading: "Confirm your new email",
    preheader: "Confirm the new address on your Habiv account.",
    body: p("You asked to change your Habiv email from {{ .Email }} to <strong>{{ .NewEmail }}</strong>. Confirm the change with the button below.") + button(confirmLink("email_change"), "Confirm new email"),
    footer: `${notSentByYou}`,
  },
  {
    key: "reauthentication",
    subject: "{{ .Token }} is your Habiv code",
    heading: "Your verification code",
    preheader: "Your Habiv verification code.",
    body: p("Enter this code in Habiv to confirm it's you. It expires soon.") + code("{{ .Token }}"),
    footer: `This email was sent to {{ .Email }}. If you didn't ask for a code, you can ignore this email.`,
  },
  {
    key: "password_changed_notification",
    subject: "Your Habiv password was changed",
    heading: "Your password was changed",
    preheader: "The password on your Habiv account was just changed.",
    body: p("The password for your Habiv account ({{ .Email }}) was just changed."),
    footer: notYou,
  },
  {
    key: "email_changed_notification",
    subject: "Your Habiv email was changed",
    heading: "Your email was changed",
    preheader: "The email on your Habiv account was changed.",
    body: p("The email address on your Habiv account was changed from {{ .OldEmail }} to <strong>{{ .Email }}</strong>."),
    footer: notYou,
  },
  {
    key: "phone_changed_notification",
    subject: "Your Habiv phone number was changed",
    heading: "Your phone number was changed",
    preheader: "The phone number on your Habiv account was changed.",
    body: p("The phone number on your Habiv account ({{ .Email }}) was changed from {{ .OldPhone }} to <strong>{{ .Phone }}</strong>."),
    footer: notYou,
  },
  {
    key: "mfa_factor_enrolled_notification",
    subject: "A verification method was added to your Habiv account",
    heading: "Verification method added",
    preheader: "A new verification method is on your Habiv account.",
    body: p("A {{ .FactorType }} verification method was added to your Habiv account ({{ .Email }})."),
    footer: notYou,
  },
  {
    key: "mfa_factor_unenrolled_notification",
    subject: "A verification method was removed from your Habiv account",
    heading: "Verification method removed",
    preheader: "A verification method was removed from your Habiv account.",
    body: p("A {{ .FactorType }} verification method was removed from your Habiv account ({{ .Email }})."),
    footer: notYou,
  },
  {
    key: "identity_linked_notification",
    subject: "A new sign-in method was linked to your Habiv account",
    heading: "New sign-in method linked",
    preheader: "A new way to sign in was added to your Habiv account.",
    body: p("Your {{ .Provider }} account can now be used to sign in to Habiv as {{ .Email }}."),
    footer: notYou,
  },
  {
    key: "identity_unlinked_notification",
    subject: "A sign-in method was removed from your Habiv account",
    heading: "Sign-in method removed",
    preheader: "A way to sign in was removed from your Habiv account.",
    body: p("Your {{ .Provider }} account can no longer be used to sign in to Habiv as {{ .Email }}."),
    footer: notYou,
  },
];

const dir = join(process.cwd(), "supabase", "templates");
mkdirSync(dir, { recursive: true });

const patch = {};
for (const e of emails) {
  const html = layout(e);
  writeFileSync(join(dir, `${e.key}.html`), html);
  patch[`mailer_subjects_${e.key}`] = e.subject;
  patch[`mailer_templates_${e.key}_content`] = html;
}
console.log(`Wrote ${emails.length} templates to supabase/templates/`);

if (process.argv.includes("--push")) {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) throw new Error("Set SUPABASE_ACCESS_TOKEN to push.");
  const ref = process.env.SUPABASE_PROJECT_REF ?? readFileSync(join(process.cwd(), "supabase", ".temp", "project-ref"), "utf8").trim();
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Push failed: ${res.status} ${await res.text()}`);
  console.log(`Updated ${emails.length} subjects and templates on ${ref}`);
}
