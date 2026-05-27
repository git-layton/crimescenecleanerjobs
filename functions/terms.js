import { html } from './_lib/http.js';

export async function onRequestGet({ env }) {
  const siteName = env.SITE_NAME || 'This Site';
  const siteUrl = env.PUBLIC_SITE_URL || '';
  const year = new Date().getFullYear();

  return html(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Terms of Service — ${siteName}</title>
  <meta name="robots" content="index,follow">
  ${siteUrl ? `<link rel="canonical" href="${siteUrl}/terms">` : ''}
  <style>
    :root { color-scheme: dark; font-family: Arial, sans-serif; background: #09090b; color: #f4f4f5; }
    body { margin: 0; }
    main { max-width: 720px; margin: 0 auto; padding: 48px 24px 80px; }
    a { color: #f59e0b; }
    h1 { font-size: 2rem; font-weight: 800; letter-spacing: -0.03em; margin: 0 0 6px; }
    .sub { color: #71717a; font-size: 0.85rem; margin: 0 0 40px; }
    h2 { font-size: 1rem; font-weight: 700; margin: 2rem 0 0.5rem; color: #e4e4e7; text-transform: uppercase; letter-spacing: 0.06em; }
    p, li { color: #a1a1aa; line-height: 1.7; font-size: 0.95rem; }
    ul { padding-left: 1.4rem; margin: 0.25rem 0 1rem; }
    li { margin: 0.3rem 0; }
    .back { display: inline-block; color: #71717a; font-size: 0.8rem; text-decoration: none; margin-bottom: 32px; }
    .back:hover { color: #f59e0b; }
  </style>
</head>
<body>
<main>
  <a href="/" class="back">← Back to ${siteName}</a>
  <h1>Terms of Service</h1>
  <p class="sub">Last updated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

  <h2>1. Acceptance</h2>
  <p>By posting a job listing on ${siteName} ("the Site"), you agree to these Terms of Service. If you do not agree, do not submit a listing.</p>

  <h2>2. Listing Requirements</h2>
  <ul>
    <li>You may only post genuine job openings for real, currently open positions.</li>
    <li>All information in your listing must be accurate and not misleading.</li>
    <li>You must have the authority to post on behalf of the hiring company.</li>
    <li>Listings must be for positions relevant to the niche served by this site.</li>
  </ul>

  <h2>3. Prohibited Content</h2>
  <p>The following are not permitted and will be removed without refund:</p>
  <ul>
    <li>Spam, duplicate listings, or listings for non-existent positions</li>
    <li>Multi-level marketing, commission-only, or unpaid "internship" schemes</li>
    <li>Listings that discriminate based on race, gender, age, religion, disability, or any protected class</li>
    <li>Any content that is illegal, fraudulent, or deceptive</li>
    <li>Scraping or automated submissions</li>
  </ul>

  <h2>4. Listing Duration &amp; Removal</h2>
  <p>Listings are active for 45 days from the date of publication. We reserve the right to remove any listing at any time that violates these terms or that we determine is no longer accurate, without notice or refund.</p>

  <h2>5. No Guarantee of Applicants</h2>
  <p>We do not guarantee any specific number of views, clicks, or applicants. Listing fees, where applicable, are for placement on the Site only.</p>

  <h2>6. Intellectual Property</h2>
  <p>By submitting a listing, you grant ${siteName} a non-exclusive, royalty-free license to display, reproduce, and distribute the listing content on the Site and in promotional materials.</p>

  <h2>7. Disclaimer of Warranties</h2>
  <p>The Site is provided "as is" without warranty of any kind. We are not responsible for the accuracy of listings, the conduct of employers or applicants, or any damages arising from your use of the Site.</p>

  <h2>8. Limitation of Liability</h2>
  <p>To the maximum extent permitted by law, ${siteName} shall not be liable for any indirect, incidental, or consequential damages arising from your use of the Site.</p>

  <h2>9. Changes to Terms</h2>
  <p>We may update these terms at any time. Continued use of the Site constitutes acceptance of the updated terms.</p>

  <h2>10. Contact</h2>
  <p>Questions about these terms? Contact us through the Site.</p>

  <p style="margin-top:3rem;color:#52525b;font-size:0.8rem;">&copy; ${year} ${siteName}. All rights reserved.</p>
</main>
</body>
</html>`);
}
