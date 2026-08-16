# Security Policy

## Supported Branches

| Branch | Deployment | Status |
|--------|-----------|--------|
| `main` | smknufa-bdp.vercel.app | ✅ Actively maintained |
| `nufabase` | nufabase.web.app | ✅ Actively maintained |

Older/experimental branches (QA-*, feature branches) are not covered by this policy.

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Instead, report privately via:
- 📧 Email: [smknufagwt@gmail.com](mailto:smknufagwt@gmail.com)
- 💬 WhatsApp: [+62 831-9975-3711](https://wa.me/6283199753711)

Include, if possible:
1. A description of the vulnerability and its impact
2. Steps to reproduce (PoC if applicable)
3. Affected branch/URL

You should expect an initial response within **72 hours**. Confirmed issues will be
patched and credited (if desired) once a fix is deployed.

## Scope Notes

- Firebase config exposed in `index.html` is a **public client key**, not a secret —
  access control is enforced via Firestore/Storage security rules, not key secrecy.
- The `/api/notify` endpoint is protected by an `x-notify-secret` header; the secret
  is never committed to the repo (see `.env.example`).
- Report exposed secrets, auth bypasses, XSS, or Firestore rule misconfigurations as
  high priority.
