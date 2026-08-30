# Vyapar AI — Security Policy

Vyapar AI follows a **local-first + backend-verified security model**.

The application handles business information such as sales, stock, customers, invoices, Udhaar, subscriptions and backups. Security is therefore implemented in multiple layers instead of relying on a single frontend check.

---

## 1. Core Security Principles

- Never trust the frontend for paid-plan authorization.
- Never store production secrets inside the APK or frontend assets.
- Keep payment verification on the backend.
- Use HTTPS for production API communication.
- Request only the minimum Android permissions required.
- Protect sensitive backups with encryption.
- Validate imported and restored data.
- Keep authentication and authorization server-side.
- Treat APK/frontend code as publicly inspectable.

---

## 2. OTP Authentication Security

The secure OTP flow is:

1. User requests an OTP.
2. Frontend sends the request to the production backend.
3. Backend generates the OTP.
4. Backend sends the OTP using the configured transactional email provider.
5. User submits the OTP.
6. Backend verifies the OTP.
7. Backend creates an authenticated session/token.
8. Frontend receives only the authentication result.

Production OTPs must never be generated or permanently validated only in frontend code.

Recommended OTP protections:

- OTP expiration
- One-time usage
- Limited verification attempts
- Request throttling
- Rate limiting
- Secure random OTP generation
- OTP hashing
- OTP pepper stored only on the backend
- Replay protection

---

## 3. JWT / Session Security

Authenticated sessions should be issued and verified by the backend.

Recommended protections:

- Strong JWT secret
- Short/controlled expiry
- Secure signature verification
- No secrets inside JWT payloads
- Logout/session invalidation support
- Server-side authorization checks
- Backend-verified subscription entitlement

The app must not trust local values such as:

```text
plan=business
subscription=true
isPremium=true
```

as proof of paid access.

---

## 4. Subscription Security

Subscription status must remain a backend-controlled entitlement.

Secure flow:

```text
Login
  ↓
Authenticated user
  ↓
Backend subscription check
  ↓
Verified entitlement
  ↓
Free / Pro / Business access
```

The following must not unlock Business features:

- Editing LocalStorage
- Editing IndexedDB
- Changing JavaScript variables
- Importing a modified backup
- Editing frontend files
- Faking a payment-success callback

Paid access should unlock only after backend verification.

---

## 5. Razorpay Security

Razorpay private credentials must remain on the server.

Never include these in the APK/frontend:

```text
RAZORPAY_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET
Private payment API credentials
```

The public Razorpay Key ID may be exposed only where Razorpay Checkout requires it.

Secure payment flow:

```text
Android App
    ↓
Vyapar AI Backend
    ↓
Razorpay
    ↓
Payment
    ↓
Backend verification
    ↓
Verified subscription
    ↓
Feature unlock
```

The frontend must never trust payment success alone.

---

## 6. Razorpay Webhook Security

Production webhook events must be verified cryptographically before processing.

Webhook handling should:

- Validate Razorpay signature
- Reject unsigned/invalid requests
- Prevent replay where possible
- Update subscription only after successful verification

Typical verified events may include:

- Payment completed
- Subscription activated
- Subscription cancelled
- Subscription expired
- Payment failed

---

## 7. UPI Security

Vyapar AI may route supported UPI/payment intents through Android.

Supported schemes can include:

```text
upi://
intent://
https://
```

The app must never request or store:

- UPI PIN
- ATM PIN
- Card PIN
- CVV
- Internet banking password
- Bank OTP

Final payment authorization remains inside the user's banking or UPI application.

---

## 8. HTTPS Network Security

Production endpoints must use:

```text
https://
```

instead of:

```text
http://
```

Cleartext production traffic should be disabled wherever possible.

HTTPS protects information such as:

- Authentication tokens
- OTP requests
- Subscription status
- Business sync data
- AI requests
- Customer data

---

## 9. Secret Management

Private secrets should be stored in backend environment variables.

Examples:

```text
JWT_SECRET
OTP_PEPPER
BREVO_API_KEY
RAZORPAY_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET
DATABASE_URL
AI_API_KEY
```

Never commit production secrets to GitHub.

Never store real secrets in:

```text
index.html
app.js
auth.js
APK assets
public .env files
```

---

## 10. Brevo Email Security

Brevo API credentials must remain server-side.

Recommended architecture:

```text
Android/Web App
      ↓
Vyapar AI Backend
      ↓
Brevo
```

The frontend should only request actions such as `request OTP`.

It must never directly contain the private Brevo API key.

---

## 11. Environment Variable Security

Production values should be configured on the hosting platform.

Example:

```text
NODE_ENV=production
JWT_SECRET=<strong-secret>
OTP_PEPPER=<strong-secret>
BREVO_API_KEY=<private>
BREVO_SENDER_EMAIL=<verified-email>
RAZORPAY_KEY_ID=<public-key-id>
RAZORPAY_KEY_SECRET=<private>
RAZORPAY_WEBHOOK_SECRET=<private>
```

Sensitive `.env` files should be excluded using `.gitignore`.

If a secret is ever committed publicly, rotate it immediately.

---

## 12. Local Business Data Security

Vyapar AI is local-first.

Local data may contain:

- Sales
- Products
- Stock
- Customers
- Udhaar
- Suppliers
- Expenses
- Profit records
- Settings

Users should protect their device using:

- Screen lock
- PIN/password
- Fingerprint/biometric lock
- Device encryption
- Android security updates

---

## 13. App PIN Lock

A local PIN lock can provide an additional protection layer.

Recommended safeguards:

- Do not store the PIN in plain text
- Limit repeated failed attempts
- Add delay after repeated failures
- Support secure reset
- Optionally add biometric unlock

A local PIN does not replace backend account authentication.

---

## 14. Encrypted Backup Security

Secure backup can use password-based encryption.

Recommended design:

- PBKDF2
- SHA-256
- AES-GCM
- Random salt
- Random IV

Example:

```text
Business Data
    ↓
JSON serialization
    ↓
User backup password
    ↓
PBKDF2
    ↓
Encryption key
    ↓
AES-GCM
    ↓
Encrypted backup
```

The backup password must never be stored in plain text.

---

## 15. Backup Restore Security

A backup may restore business information, but it must not grant account entitlements.

For example, this must not unlock Business plan:

```json
{
  "plan": "business"
}
```

After restore:

```text
Business data → restored locally
Subscription → fetched again from backend
```

---

## 16. Google Drive Security

Google Drive backup should request only the minimum scope required.

Recommended scope:

```text
drive.file
```

Avoid unnecessary unrestricted Drive access.

OAuth configuration must match:

- Android package name
- SHA signing certificate fingerprint
- Google Cloud project
- OAuth client

---

## 17. Android Permission Security

Request only permissions actually required by the app.

Possible permissions:

- Internet
- Camera when barcode/OCR requires it
- Notifications where required

Avoid broad or unnecessary permissions.

Do not request `REQUEST_INSTALL_PACKAGES` for normal app operation.

---

## 18. WebView Security

Because Vyapar AI uses Android WebView, harden WebView behavior.

Recommended protections:

- Validate external URLs
- Restrict unknown URL schemes
- Avoid unnecessary JavaScript bridges
- Use HTTPS
- Disable unnecessary file access
- Avoid loading unknown remote scripts
- Keep Android WebView updated
- Validate payment/UPI intents

Any JavaScript-to-native bridge should expose only the minimum required functionality.

---

## 19. External URL Protection

Special schemes such as:

```text
intent://
upi://
tel:
mailto:
```

should be handled intentionally.

Unknown or unsafe schemes should be rejected.

External pages should not automatically receive access to sensitive native bridges.

---

## 20. Import Security

CSV/JSON files must be treated as untrusted input.

Validate:

- Data types
- Product IDs
- Numeric fields
- Quantities
- Prices
- Customer balances
- Duplicate records
- Unsupported fields

Malformed imports should not silently overwrite valid business data.

---

## 21. Data Integrity Checks

The app should detect issues such as:

- Negative stock
- Missing IDs
- Invalid prices
- Invalid quantities
- Duplicate product identifiers
- Broken customer balances
- Invalid references

Data repair actions should be logged where possible.

---

## 22. Safe Data Migration

Before modifying stored data between versions:

1. Read existing records.
2. Validate their structure.
3. Convert required fields.
4. Preserve supported information.
5. Write migrated records.
6. Verify integrity.

Create a backup before major migrations when possible.

---

## 23. Delete Protection

Destructive actions should always require confirmation.

Examples:

- Delete product
- Delete sale
- Delete customer
- Remove supplier
- Clear business data
- Reset application

Use visually distinct destructive controls and confirmation dialogs.

---

## 24. Audit Logging

Important operations should be recorded.

Examples:

- Product created/deleted
- Sale recorded
- Invoice generated
- Customer added
- Payment recorded
- Import completed
- Restore completed
- Cloud sync performed
- Staff settings changed

Logs must not include secrets.

---

## 25. Staff & Role Security

For multi-user deployments, use role-based access control.

Example roles:

- Cashier
- Sales
- Inventory
- Manager
- Admin

Example permissions:

```text
Cashier:
✓ Create bill
✓ Record payment
✗ Delete products
✗ Change security settings

Inventory:
✓ Manage stock
✓ Add products
✗ Subscription settings

Admin:
✓ Full authorized access
```

True multi-user authorization must be enforced by the backend.

---

## 26. Multi-Store Security

For each protected API request, verify:

- User identity
- Business identity
- Store identity
- Staff role
- Permission
- Subscription entitlement

Never trust a store/business ID simply because the client sends it.

---

## 27. Backend Authorization

Authentication and authorization are different.

Authentication answers:

> Who is the user?

Authorization answers:

> What is the user allowed to do?

Protected backend flow:

```text
Request
  ↓
Valid authentication?
  ↓
Correct business?
  ↓
Correct role?
  ↓
Correct subscription?
  ↓
Allow operation
```

---

## 28. Database Security

Recommended backend database protections:

- Parameterized queries
- Input validation
- Unique constraints
- Access controls
- Backups
- Private database credentials
- Principle of least privilege

Database credentials must never be included in frontend code.

---

## 29. Input Validation

Always validate critical inputs on the backend.

Examples:

- Email
- Mobile number
- Product price
- Quantity
- GST percentage
- Invoice ID
- Customer ID
- Payment amount
- Subscription plan

Client-side validation improves UX.

Backend-side validation provides actual security.

---

## 30. Rate Limiting

Sensitive endpoints should be rate-limited.

Examples:

```text
/request-otp
/verify-otp
/login
/subscription/create
/payment/verify
```

This reduces:

- OTP spam
- Brute-force attacks
- Automated abuse
- Payment endpoint abuse

---

## 31. CORS Security

Sensitive backend APIs should allow only trusted origins where practical.

Avoid unrestricted:

```text
Access-Control-Allow-Origin: *
```

for authenticated production APIs unless there is a specific reason.

---

## 32. Error Security

Production errors must not expose:

- API secrets
- Database credentials
- Internal stack traces
- Private file paths
- SQL queries
- Authentication secrets

Frontend errors should be safe and user-readable.

Detailed logs should remain server-side.

---

## 33. Logging Security

Do not log:

- Passwords
- OTP values
- JWT secrets
- Razorpay secrets
- Webhook secrets
- UPI PIN
- Card PIN/CVV
- Database passwords

Sensitive values should be redacted.

---

## 34. GitHub Security

Do not commit:

```text
.env
API secrets
JWT secrets
OTP pepper
Razorpay secret
Webhook secret
Brevo secret
Database passwords
Private signing keys
Keystore passwords
```

Use `.gitignore`.

If a secret has already been pushed to a public repository, deleting the file is not enough — rotate the secret.

---

## 35. Android Signing Security

Production releases should be signed securely.

Recommended:

- Use release signing
- Protect keystore passwords
- Never publish private keystore files
- Enable Google Play App Signing
- Separate debug and production keys

Debug builds are for testing only.

---

## 36. Reverse Engineering Awareness

APK/frontend code must be treated as inspectable.

Attackers may inspect:

- HTML
- CSS
- JavaScript
- API URLs
- WebView assets
- Public configuration

Therefore:

> Never rely on hidden frontend code for security.

All important authorization must be enforced on the backend.

---

## 37. XSS Protection

User-generated content rendered into HTML should be escaped or sanitized.

Avoid inserting untrusted content using unsafe DOM APIs.

Do not execute user-provided HTML or JavaScript.

---

## 38. File Upload Security

If OCR/cloud features accept files, validate:

- File size
- MIME type
- File extension
- Content
- Upload count

Uploaded files must never automatically execute as code.

---

## 39. AI Security

AI provider keys must remain on the backend.

Recommended flow:

```text
Vyapar AI
   ↓
Secure backend
   ↓
AI provider
```

Only send the minimum required business data to external AI services.

AI-generated suggestions must not silently:

- Delete stock
- Modify accounting
- Issue refunds
- Change subscriptions
- Transfer money

Sensitive actions should require explicit confirmation.

---

## 40. Payment Data Security

Vyapar AI must not store:

- CVV
- Card PIN
- UPI PIN
- Banking password
- Bank OTP

Payment authentication should remain inside Razorpay or banking applications.

---

## 41. Privacy by Design

Collect only information required for the requested business feature.

Avoid unnecessary access to:

- Contacts
- Precise location
- Photos
- Device information

Users should know when data is uploaded, synced or backed up.

---

## 42. Account Deletion Security

Account deletion should require authenticated confirmation.

The deletion process should clearly explain:

- What account data is removed
- What local data remains
- What cloud data remains
- Subscription impact
- Any legally required retention

---

## 43. Security Responsibilities

### Android App

Responsible for:

- Secure UI
- Safe intents
- Permissions
- Local data handling
- WebView protection

### Backend

Responsible for:

- Authentication
- Authorization
- OTP
- Subscription
- Payment verification
- Rate limiting
- Secret management
- Cloud access

### User Device

Responsible for:

- Device lock
- OS updates
- Backup password
- Preventing unauthorized physical access

---

## 44. Production Security Checklist

- [ ] No production secrets inside APK
- [ ] No secrets in GitHub
- [ ] `.env` excluded
- [ ] Strong JWT secret configured
- [ ] Strong OTP pepper configured
- [ ] OTP expiration enabled
- [ ] OTP attempt limits enabled
- [ ] OTP rate limiting enabled
- [ ] HTTPS enabled
- [ ] Backend input validation enabled
- [ ] Razorpay backend verification enabled
- [ ] Razorpay webhook verification enabled
- [ ] Subscription checked server-side
- [ ] Business plan cannot unlock via LocalStorage
- [ ] Restore cannot alter entitlement
- [ ] Import files validated
- [ ] Encrypted backup tested
- [ ] Google Drive scope restricted
- [ ] Android permissions minimized
- [ ] Unknown WebView schemes blocked
- [ ] External intents validated
- [ ] Production CORS configured
- [ ] Database credentials kept server-side
- [ ] Sensitive values removed from logs
- [ ] Release APK/AAB signed
- [ ] Debug mode disabled in production
- [ ] Privacy Policy reviewed
- [ ] Account deletion tested
- [ ] Backup/restore tested
- [ ] Security headers configured for web deployment

---

## 45. Security Notice

No application should be described as **100% hack-proof**.

Production security also depends on:

- Backend configuration
- Database security
- Hosting security
- Dependency updates
- API configuration
- Android signing
- Device security

The most important rule is:

> **Never trust the APK with a secret and never trust the frontend with authorization.**

OTP verification, subscription entitlement, payment verification and sensitive account operations should always be verified by the secure backend.
