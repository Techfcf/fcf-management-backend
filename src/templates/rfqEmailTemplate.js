// rfqEmailTemplate.js
const EMAIL_CONFIG = {
  companyName: "FOF India",
  logoUrl: "https://storage.googleapis.com/fitclimatevideoimg/logo/FCF%20India%20logo%20-%20white%20(1).png", // apna real logo URL daalo
  logoAlt: "FOF India logo",
  colors: {
    primary: "#E07A2C",
    primaryDark: "#B85F1D",
    text: "#3A2A1E",
    textMuted: "#8A7A6E",
    accentGreen: "#6B8E4E",
    bgSoft: "#FBF6EF",
    border: "#EFE3D3",
    white: "#FFFFFF",
  },
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  contact: {
    email: "admin@fcfindia.in",
    phone: "+91 12345 67890",
    website: "https://fcfindia.in/",
  },
  socials: {
    linkedin: "https://www.linkedin.com/company/fcf-india/posts/?feedView=all",
    twitter: "https://x.com/FCF_India",
    youtube: "https://www.youtube.com/@fcfindia",
    facebook: "https://www.facebook.com/p/FCF-India-100093362305578/",
  },    
  footerNote: "This is an automated email, please do not reply.",
  copyrightLine: `© ${new Date().getFullYear()} FOF India. All rights reserved.`,
};

function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "https://fcf-management.fitclimate.com/")
    .replace(/</g, "https://fcf-management.fitclimate.com/")
    .replace(/>/g, "https://fcf-management.fitclimate.com/")
    .replace(/"/g, "https://fcf-management.fitclimate.com/");
}

function buildItemsRows(items) {
  const { colors } = EMAIL_CONFIG;
  return items
    .map(
      (item, idx) => `
        <tr>
          <td style="padding:10px 12px; font-size:12.5px; color:${colors.textMuted}; border-bottom:1px solid ${colors.border};">${idx + 1}</td>
          <td style="padding:10px 12px; font-size:12.5px; color:${colors.text}; border-bottom:1px solid ${colors.border};">${escapeHtml(item.particulars)}</td>
          <td style="padding:10px 12px; font-size:12.5px; color:${colors.textMuted}; border-bottom:1px solid ${colors.border};">${escapeHtml(item.category || "-")}</td>
          <td style="padding:10px 12px; font-size:12.5px; color:${colors.text}; text-align:right; border-bottom:1px solid ${colors.border};">${escapeHtml(item.quantity)}</td>
          <td style="padding:10px 12px; font-size:12.5px; color:${colors.textMuted}; border-bottom:1px solid ${colors.border};">${escapeHtml(item.unit || "-")}</td>
        </tr>`
    )
    .join("");
}

function buildRfqEmailHtml(data) {
  const { colors, fontFamily } = EMAIL_CONFIG;

  const deadlineBlock = data.submissionDeadline
    ? `
    <tr>
      <td style="padding:0 28px 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${colors.bgSoft}; border-radius:10px;">
          <tr>
            <td style="padding:16px 20px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-family:${fontFamily};">
                    <p style="margin:0; font-size:12px; font-weight:700; color:${colors.primaryDark};">SUBMISSION DEADLINE</p>
                    <p style="margin:2px 0 0; font-size:13px; color:${colors.text};">${escapeHtml(data.submissionDeadline)}</p>
                  </td>
                  <td align="right">
                    <a href="${escapeHtml(data.viewRfqUrl)}" style="display:inline-block; background:${colors.primary}; color:${colors.white}; font-family:${fontFamily}; font-size:12.5px; font-weight:700; padding:12px 22px; border-radius:8px; text-decoration:none;">
                      VIEW RFQ &amp; SUBMIT QUOTATION &rarr;
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>`
    : `
    <tr>
      <td style="padding:0 28px 24px;" align="center">
        <a
        href="https://fcf-management.fitclimate.com/"
        style="display:inline-block; background:${colors.primary}; color:${colors.white}; font-family:${fontFamily}; font-size:12.5px; font-weight:700; padding:12px 22px; border-radius:8px; text-decoration:none;"
        >
        VIEW RFQ &amp; SUBMIT QUOTATION &rarr;
        </a>
      </td>
    </tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>RFQ ${escapeHtml(data.rfqNumber)}</title>
</head>
<body style="margin:0; padding:0; background:#F3F1EA; font-family:${fontFamily};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F1EA; padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="background:${colors.white}; border-radius:8px; overflow:hidden; border:1px solid ${colors.border};">

          <tr>
            <td style="background:${colors.primary}; padding:20px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td valign="middle">
                    <img src="${EMAIL_CONFIG.logoUrl}" alt="${escapeHtml(EMAIL_CONFIG.logoAlt)}" width="72" style="display:block; border:0;" />
                  </td>
                  <td valign="middle" align="right">
                    <p style="margin:0; font-family:${fontFamily}; font-size:19px; font-weight:700; color:${colors.white}; letter-spacing:0.3px;">REQUEST FOR QUOTATION</p>
                    <p style="margin:4px 0 0; font-family:${fontFamily}; font-size:15px; font-weight:700; color:${colors.text}; background:${colors.white}; display:inline-block; padding:2px 10px; border-radius:5px;">${escapeHtml(data.rfqNumber)}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:26px 28px 8px; font-family:${fontFamily};">
              <p style="margin:0 0 10px; font-size:16px; font-weight:700; color:${colors.text};">Dear ${escapeHtml(data.vendorName)},</p>
              <p style="margin:0 0 20px; font-size:13px; line-height:1.7; color:${colors.textMuted};">
                You are invited to submit your quotation for the requirement below. Please review the details and share your best pricing before the deadline.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:0 28px 20px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${colors.border}; border-radius:10px;">
                <tr>
                  <td style="padding:16px 20px 8px; width:50%; font-family:${fontFamily};">
                    <p style="margin:0; font-size:11px; color:${colors.textMuted}; text-transform:uppercase; letter-spacing:0.3px;">Project name</p>
                    <p style="margin:2px 0 0; font-size:13px; font-weight:700; color:${colors.text};">${escapeHtml(data.projectName)}</p>
                  </td>
                  <td style="padding:16px 20px 8px; width:50%; font-family:${fontFamily};">
                    <p style="margin:0; font-size:11px; color:${colors.textMuted}; text-transform:uppercase; letter-spacing:0.3px;">Project code</p>
                    <p style="margin:2px 0 0; font-size:13px; font-weight:700; color:${colors.text};">${escapeHtml(data.projectCode)}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 20px 16px; width:50%; font-family:${fontFamily}; border-top:1px solid ${colors.border};">
                    <p style="margin:0; font-size:11px; color:${colors.textMuted}; text-transform:uppercase; letter-spacing:0.3px;">Section</p>
                    <p style="margin:2px 0 0; font-size:13px; font-weight:700; color:${colors.accentGreen};">${escapeHtml(data.section)}</p>
                  </td>
                  <td style="padding:8px 20px 16px; width:50%; font-family:${fontFamily}; border-top:1px solid ${colors.border};">
                    <p style="margin:0; font-size:11px; color:${colors.textMuted}; text-transform:uppercase; letter-spacing:0.3px;">RFQ date</p>
                    <p style="margin:2px 0 0; font-size:13px; font-weight:700; color:${colors.text};">${escapeHtml(data.rfqDate)}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:0 28px 4px; font-family:${fontFamily};">
              <p style="margin:0 0 10px; font-size:13px; font-weight:700; color:${colors.text};">REQUIRED ITEMS</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 22px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${colors.border}; border-radius:8px; overflow:hidden;">
                <tr style="background:${colors.primaryDark};">
                  <th align="left" style="padding:10px 12px; font-family:${fontFamily}; font-size:11px; color:${colors.white}; font-weight:700;">Sr. No.</th>
                  <th align="left" style="padding:10px 12px; font-family:${fontFamily}; font-size:11px; color:${colors.white}; font-weight:700;">Particulars</th>
                  <th align="left" style="padding:10px 12px; font-family:${fontFamily}; font-size:11px; color:${colors.white}; font-weight:700;">Category</th>
                  <th align="right" style="padding:10px 12px; font-family:${fontFamily}; font-size:11px; color:${colors.white}; font-weight:700;">Quantity</th>
                  <th align="left" style="padding:10px 12px; font-family:${fontFamily}; font-size:11px; color:${colors.white}; font-weight:700;">Unit</th>
                </tr>
                ${buildItemsRows(data.items)}
              </table>
            </td>
          </tr>

          ${deadlineBlock}

          <tr>
            <td style="padding:0 28px 26px; font-family:${fontFamily};">
              <p style="margin:0 0 4px; font-size:13px; color:${colors.textMuted}; line-height:1.7;">Please submit your quotation at your earliest convenience.</p>
              <p style="margin:0 0 16px; font-size:13px; color:${colors.textMuted}; line-height:1.7;">For any queries, feel free to contact us.</p>
              <p style="margin:0 0 2px; font-size:13px; color:${colors.textMuted};">Thank you,</p>
              <p style="margin:0; font-size:13px; font-weight:700; color:${colors.primaryDark};">${escapeHtml(EMAIL_CONFIG.companyName)} Team</p>
            </td>
          </tr>

          <tr>
            <td style="background:${colors.primary}; padding:14px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="font-family:${fontFamily}; font-size:12px; color:${colors.white}; padding:0 10px;">${escapeHtml(EMAIL_CONFIG.contact.email)}</td>
                  <td align="center" style="font-family:${fontFamily}; font-size:12px; color:${colors.white}; padding:0 10px;">${escapeHtml(EMAIL_CONFIG.contact.phone)}</td>
                  <td align="center" style="font-family:${fontFamily}; font-size:12px; color:${colors.white}; padding:0 10px;">${escapeHtml(EMAIL_CONFIG.contact.website)}</td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:14px 28px; font-family:${fontFamily};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <p style="margin:0; font-size:11px; color:${colors.textMuted};">${escapeHtml(EMAIL_CONFIG.copyrightLine)}</p>
                    <p style="margin:2px 0 0; font-size:11px; font-weight:700; color:${colors.text};">${escapeHtml(EMAIL_CONFIG.footerNote)}</p>
                  </td>
                  <td align="right">
                    <a href="${EMAIL_CONFIG.socials.linkedin}" style="text-decoration:none; margin-left:6px; font-size:11px; color:${colors.primaryDark};">LinkedIn</a>
                    <a href="${EMAIL_CONFIG.socials.twitter}" style="text-decoration:none; margin-left:10px; font-size:11px; color:${colors.primaryDark};">Twitter</a>
                    <a href="${EMAIL_CONFIG.socials.youtube}" style="text-decoration:none; margin-left:10px; font-size:11px; color:${colors.primaryDark};">YouTube</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

module.exports = { buildRfqEmailHtml, EMAIL_CONFIG };