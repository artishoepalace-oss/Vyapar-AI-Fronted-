# Vyapar AI 6.2.6

**Smart Business Management App for Small Retailers**

Vyapar AI is an Android-first, local-first business management application designed for small retailers, shop owners and growing businesses.

The app combines sales management, stock control, billing, customer Udhaar, profit tracking, business reports, GST tools, supplier management, backup, AI-assisted business insights and footwear-specific inventory features in one application.

The Android application uses a native Android WebView shell with an optimized mobile interface while preserving local-first business data.

---

# 1. App Overview

**App Name:** Vyapar AI
**Version:** 6.2.2
**Android Version Code:** 62200
**Primary Platform:** Android
**Secondary Platform:** Web
**Architecture:** Android WebView + HTML/CSS/JavaScript frontend + optional secure backend
**Storage Model:** Local-first
**Payments:** Razorpay subscription integration
**Cloud Backup:** Optional Google Drive
**Authentication:** OTP-based account authentication
**Business Type:** Retail / Small Business Management

Vyapar AI is intended to help a shop owner manage most daily business operations from a single application.

---

# 2. Main Navigation

The primary navigation contains:

* Home
* Business
* Sales
* Stock
* More

The original floating navigation design is retained.

The navigation is optimized for mobile use and provides quick access to the most frequently used business modules.

---

# 3. Login and Authentication

Vyapar AI includes an OTP-based authentication system.

The authentication system can be connected to the production backend for secure OTP delivery and verification.

Login flow:

1. User enters required account information.
2. OTP request is sent to the backend.
3. Backend sends OTP using the configured transactional email service.
4. User enters the OTP.
5. Backend verifies the OTP.
6. An authenticated session is created.
7. Subscription status is fetched from the backend.
8. The correct account plan is activated.

The production backend can use Brevo for transactional OTP delivery.

Authentication and paid-plan information are not trusted only from local storage.

---

# 4. Home Dashboard

The Home screen is designed as the main business overview.

It provides a quick snapshot of business activity.

Home can display:

* Current sales
* Profit
* Monthly profit
* Business goal progress
* Stock information
* Business summary
* Important metrics
* Quick business actions

Quick actions can provide access to:

* New Bill
* Add Sale
* Udhaar
* Products & Stock
* Business tools

Business name, location type and monthly goal can be configured from Settings.

---

# 5. Business Workspace

The Business section is the main advanced workspace of Vyapar AI.

It contains organized business modules rather than showing every feature on one screen.

Business tools are grouped around daily shop operations.

The complete Business Suite includes:

### Inventory & Barcode

Manage products and product variants.

Supported product information includes:

* Product name
* Brand
* Article
* SKU
* Size
* Color
* Category
* Barcode
* HSN/SAC
* GST percentage
* Purchase price
* Selling price
* MRP
* Opening stock
* Reorder point

Inventory tools include:

* Add product
* Delete product
* Barcode scanning hook
* Manual barcode fallback
* Bulk CSV import
* Stock ledger
* Stock reconciliation
* Low-stock detection
* Reorder suggestions
* Dead-stock analysis
* Product profit reports

---

# 6. Sales Management

Vyapar AI allows shop owners to record and analyze sales.

Sales information can include:

* Date
* Product
* Quantity
* Purchase price
* Selling price
* Customer
* Category
* Profit

Sales data is used throughout the application to calculate:

* Revenue
* Profit
* Product performance
* Monthly performance
* Business reports
* Stock movements
* AI insights

---

# 7. Billing / POS

Vyapar AI includes a billing and POS system.

Billing supports:

* Customer name
* Product
* Quantity
* Price
* GST
* Discount
* Invoice generation
* Invoice numbering
* Print / PDF support

The application can generate invoice numbers automatically using the configured invoice prefix and series.

Example:

`INV-000001`

The billing system can also post corresponding sale entries.

---

# 8. Sales Returns and Purchase Returns

The Business workspace includes return management.

Supported return types:

* Sales Return
* Purchase Return

Return records can contain:

* Invoice or purchase reference
* Amount
* Quantity
* Reason
* Return type
* Date

This provides a foundation for reversing or tracking returned transactions.

---

# 9. Customers & Udhaar

Vyapar AI includes customer credit management.

Customer records can contain:

* Customer name
* Mobile number
* Address
* Opening due
* Current outstanding amount

Available actions include:

* Add customer
* Record payment received
* Track outstanding balance
* Generate customer statement
* Export due reminders
* Send WhatsApp due reminders

Example use case:

A customer purchases footwear on credit.

The shop owner can record the customer's outstanding amount and later reduce the balance when payment is received.

---

# 10. Supplier & Purchase Management

The application also contains supplier and purchase management.

Supplier information can include:

* Supplier name
* Phone number
* Outstanding amount

Purchase information can include:

* Product
* Quantity
* Unit cost
* Total purchase amount
* Date
* Supplier

Available tools include:

* Record purchase
* Supplier ledger
* Purchase history
* Supplier outstanding tracking
* Supplier ledger CSV export

---

# 11. Stock Management

Stock management is integrated with the Business Suite.

Features include:

* Product catalog
* Opening quantity
* Stock quantity
* Reorder point
* Stock ledger
* Stock reconciliation
* Low-stock reporting
* Dead-stock reporting
* Smart reorder suggestions
* Product variants
* SKU tracking
* Barcode tracking

The app is especially suitable for footwear inventory where one product may have several sizes and colors.

---

# 12. Footwear Pro

Vyapar AI includes dedicated features for footwear businesses.

Footwear-specific product data includes:

* Size
* Color
* Brand
* Article
* SKU
* Barcode
* MRP
* Purchase price
* Selling price
* Quantity

Footwear tools include:

* Size matrix
* Color matrix
* Brand performance
* Article tracking
* Pair tracking
* Carton-related inventory foundation
* MRP vs selling-price analysis
* Smart pair reorder
* Product-level profit analysis

This allows the same shoe design to be managed across different sizes, colors and articles.

---

# 13. Expenses

Businesses can record operating expenses.

Expenses are included when calculating actual net profit.

Example expenses:

* Shop electricity
* Transport
* Staff expense
* Packaging
* Rent
* Maintenance
* Miscellaneous costs

Business calculations can distinguish between:

* Sales
* Gross profit
* Expenses
* Net profit

---

# 14. Payments

Vyapar AI supports multiple payment methods.

Supported payment categories include:

* Cash
* UPI
* Card
* Bank

Payment entries can be recorded as:

* Money In
* Money Out

Each entry can include:

* Amount
* Payment method
* Direction
* Note

---

# 15. Daily Cash Closing

The Finance module contains a daily cash-closing tool.

The shop owner can enter:

* Opening cash
* Actual closing cash

The application can calculate expected cash using recorded cash transactions.

This helps identify differences between expected and actual cash.

---

# 16. Payment Reconciliation

Payment reconciliation tools help compare recorded transactions.

Supported payment sources include:

* Cash
* UPI
* Card
* Bank

The application contains a local reconciliation foundation that can later be connected to external banking/payment APIs if required.

---

# 17. GST Tools

Vyapar AI includes GST-related business tools for Indian retailers.

GST configuration includes:

* GSTIN
* Default HSN/SAC
* GST percentage
* Invoice prefix
* Invoice series

GST tools include:

* GST calculation
* GST-inclusive calculation
* GST-exclusive calculation
* GST reports
* Output GST
* Input GST
* Net GST calculation
* Intra/inter-state GST helper foundation
* e-Invoice payload preparation

Important:

Direct GSTN/e-Invoice submission requires an authorized GST/e-Invoice provider or backend integration.

The app currently prepares the required business information and payload foundation.

---

# 18. Full Calculator

Vyapar AI includes a complete calculator rather than only a simple business calculator.

The calculator section includes normal calculations and business calculations.

Business calculations can include:

* Purchase price
* Selling price
* Discount
* GST
* Net selling price
* Profit
* Profit margin
* GST amount
* GST-inclusive price

This makes it possible to calculate selling prices while billing or purchasing products.

---

# 19. Monthly Profit

The app includes monthly profit tracking.

Users can create monthly profit records and analyze performance over time.

Features include:

* Monthly profit entry
* Edit monthly profit
* Monthly records
* Year-based profit data
* Monthly profit graph
* Average calculations
* Business trend analysis

JSON and CSV profit imports are handled separately from normal sales imports.

When the same month is imported again, the existing month can be updated instead of creating unnecessary duplicates.

---

# 20. Reports

Vyapar AI contains several business reporting tools.

Available or prepared reports include:

* Business CSV
* Sales report
* Product profit report
* Category report
* Brand report
* Reorder report
* Low-stock report
* Dead-stock report
* Price history
* Customer outstanding report
* Supplier ledger
* Due reminders
* GST report
* Finance export
* AI business report

Reports are generated on demand to improve performance on low-end Android devices.

---

# 21. Product Profit Analysis

The app can analyze performance at product level.

Product reports can calculate:

* Quantity sold
* Revenue
* Cost
* Gross profit

This helps identify which products make the most money rather than only which products sell the most units.

---

# 22. Price History

Vyapar AI can maintain a foundation for product price history.

Tracked values can include:

* Purchase price
* Selling price
* MRP
* Date
* Product reference

This makes it easier to see how purchase and sale prices have changed.

---

# 23. Smart Reorder

Products can have a reorder point.

When stock reaches or falls below the configured reorder level, the system can include the product in a reorder report.

Example:

Stock: `3 pairs`
Reorder level: `5 pairs`

The product can be suggested for reorder.

---

# 24. Dead Stock Detection

The application can identify products that have not recently appeared in sales.

This helps shop owners identify stock that is occupying money and storage space without generating sales.

---

# 25. AI Business Assistant

Vyapar AI contains an AI Business Assistant framework.

The app can prepare business data and send it to a secure AI backend.

Possible AI use cases include:

* Which products should I reorder?
* Which products are selling slowly?
* Which products generate the highest profit?
* What should I focus on this month?
* Business performance summary
* Smart pricing suggestions
* Reorder suggestions
* Trend forecasting
* Expense anomaly analysis

API secrets should never be embedded directly inside the APK.

Live generative AI requires a secure backend endpoint.

---

# 26. OCR / Smart Document Reading

The application contains hooks for AI-assisted document extraction.

Potential supported inputs include:

* Product box image
* Bill image
* Invoice
* PDF
* CSV
* JSON

CSV and JSON imports can operate locally.

Photo/PDF intelligent extraction requires the configured secure AI extraction backend.

---

# 27. Import and Export

Vyapar AI supports business data portability.

Available or prepared formats include:

* JSON
* CSV
* Text reports
* Secure backup JSON

Import tools include:

* Product CSV import
* Profit CSV import
* JSON backup restore

Export tools include:

* Product reports
* Finance reports
* Customer due reports
* Supplier ledger
* Business data
* Profit information
* Secure backup

---

# 28. Backup System

Vyapar AI uses a local-first backup model.

Users can create device backups of their business data.

Backup options include:

* Local JSON backup
* Restore from JSON
* Encrypted backup
* Google Drive backup

Business-data restore does not replace authenticated subscription entitlement.

A modified local backup must not be able to unlock a paid account plan.

---

# 29. Encrypted Backup

Vyapar AI includes password-based encrypted backup functionality.

When Web Crypto is available, secure backups use:

* PBKDF2 key derivation
* SHA-256
* AES-GCM encryption
* Random salt
* Random IV

The user must remember the backup password.

The backup password cannot automatically be recovered if lost.

---

# 30. Google Drive Backup

Android users can optionally connect Google Drive.

The app uses Google's Android authorization flow.

It requests the narrow:

`drive.file`

scope.

This means the app does not request unrestricted access to the user's entire Google Drive.

The backup file created by the app is named:

`Vyapar AI Backup.json`

Available functionality includes:

* Connect Google Drive
* Manual backup
* Update existing app-created backup
* Automatic backup foundation

Google Drive API and OAuth configuration must be completed in Google Cloud before production use.

---

# 31. Staff Management

The Business Suite includes staff account foundations.

Staff information can contain:

* Staff name
* Role
* Permissions
* Active status

Available roles include:

* Cashier
* Sales
* Inventory
* Manager
* Admin

Permissions can be configured for areas such as:

* Sales
* Inventory
* Billing

A production multi-user system requires a secure server and authentication backend.

---

# 32. Multi-Store Foundation

The application includes foundations for multiple store profiles and cloud synchronization.

Possible future use includes:

* Main shop
* Branch shop
* Warehouse
* Additional outlet

Real-time synchronization between stores requires a configured backend/cloud endpoint.

---

# 33. Cloud Sync

A secure cloud synchronization endpoint can be configured.

The app can send local business state to the configured backend.

Cloud sync status can include:

* Connected
* Syncing
* Synced
* Error

Real conflict resolution between multiple devices requires server-side implementation.

---

# 34. Security

Security features include:

* OTP authentication
* Backend-verified subscription
* Local PIN-lock foundation
* Encrypted backup
* Data integrity checks
* Audit log
* Safe data migration
* No hardcoded production API secrets
* Restricted Google Drive permissions
* HTTPS network configuration

The Android project does not require unrestricted installation permissions.

---

# 35. Audit Log

Important advanced operations can be recorded in an audit log.

Audit information can contain:

* Time
* Action
* Details

Examples:

* Product added
* Product deleted
* Invoice created
* Customer added
* Cloud sync completed
* Data migration performed

---

# 36. Data Integrity Check

The app can inspect stored data for common problems.

Examples include:

* Invalid product records
* Missing product IDs
* Negative stock
* Invalid customer balance

This can help detect corrupted or incorrectly imported local data.

---

# 37. Data Migration and Repair

When application structures change between versions, Vyapar AI contains migration and repair foundations.

It can normalize information such as:

* Product IDs
* SKU
* Quantity
* Customer IDs
* Customer balance

Migration is designed to preserve existing business data wherever possible.

---

# 38. Local-First Operation

Vyapar AI is designed to work primarily from locally stored business data.

Advantages include:

* Faster app operation
* Business records available without constant internet
* Reduced server dependency
* Better use on unstable mobile networks
* User control over business information

Online services are required for features such as:

* OTP authentication
* Subscription verification
* Razorpay payment
* Live AI
* Cloud sync
* Google Drive backup authorization

---

# 39. Performance Modes

Vyapar AI contains performance controls for different Android devices.

Modes include:

* Auto
* Smooth
* Lite

Performance features include:

* Adaptive blur
* Reduced animation support
* Lite rendering
* Lazy report generation
* Bounded table rendering
* IndexedDB cache foundation
* Debounced processing
* Low-end WebView fallback

Lite Mode can reduce visual effects on older or slower Android devices.

---

# 40. Appearance

The app supports multiple presentation modes.

Options include:

* Light mode
* Dark mode
* Liquid Glass interface

The current Android UI keeps the app mobile-friendly while preserving the original floating navigation style.

---

# 41. Delete Protection

Important delete, remove and clear actions use confirmation before destructive operations.

Destructive actions are visually separated using solid warning/red buttons.

This reduces accidental deletion of business records.

---

# 42. Subscription System

Vyapar AI supports multiple subscription levels:

* Free
* Pro
* Business

The exact production pricing can be configured through the backend/payment system.

The Business plan is intended to unlock the complete business workspace.

Business-level features can include:

* Complete Business workspace
* Billing
* POS
* Udhaar
* Stock
* GST tools
* Inventory intelligence
* Multi-store features
* Business reports

The application does not trust a locally edited plan value.

Paid access depends on an authenticated and backend-verified subscription.

---

# 43. Business Plan Lock

Version 6.0.10 includes improved Business plan protection.

For accounts without an active Business entitlement, protected areas can remain locked.

Protected entry points include:

* Business navigation
* Stock
* New Bill
* Udhaar
* POS
* Business modules
* Business Home shortcuts

After a successful payment:

1. Razorpay completes checkout.
2. Payment details are sent to the backend.
3. Backend verifies the transaction.
4. Subscription status is fetched.
5. Business entitlement is enabled only after verification.

---

# 44. Razorpay Payments

Vyapar AI uses Razorpay for subscription payments.

The secure payment flow is designed so sensitive payment credentials remain on the backend.

General flow:

1. User chooses a paid plan.
2. Frontend requests subscription creation from backend.
3. Backend communicates with Razorpay.
4. Razorpay Checkout opens.
5. User completes payment.
6. Payment response is sent to backend.
7. Backend verifies the Razorpay payment/subscription.
8. Frontend fetches final subscription status.
9. Paid features unlock only after backend confirmation.

---

# 45. Android UPI Support

Version 6.0.10 specifically improves UPI checkout inside the Android APK.

Android WebView handles:

* `intent://`
* UPI schemes
* Installed UPI applications
* Generic UPI chooser
* HTTPS fallback
* Unsupported payment schemes

Instead of allowing unsupported UPI links to generate a WebView error, the native Android layer attempts to route the payment to a compatible installed application.

If no supported application exists, the user receives a clear error rather than a broken browser page.

---

# 46. Android Application Architecture

The Android app uses a native Android project containing the Vyapar AI frontend inside WebView assets.

Main Android source:

`android-app/app/src/main/java/com/vyaparai/app/MainActivity.java`

Main Android assets:

`android-app/app/src/main/assets/`

Web version:

`web/`

Both web and Android assets are maintained with feature parity.

---

# 47. Android Permissions and Security

The Android application avoids unnecessary broad permissions.

Security-related design includes:

* No `REQUEST_INSTALL_PACKAGES`
* No self-installing APK update system
* No dynamic downloaded-code execution
* Cleartext network traffic disabled
* Broad storage permission removed
* Camera requested only when required
* Notification permission requested at runtime where applicable
* Google Drive restricted to `drive.file`
* HTTPS used for production network services

For Play Store distribution, use a properly signed release build.

---

# 48. Developer Mode

Vyapar AI contains a hidden Developer Mode.

To open Developer Mode:

**Tap the Vyapar AI logo 7 times.**

Developer Mode can contain configuration such as:

* AI extraction endpoint
* Backend connection
* Backend health check
* Billing configuration

Developer Mode is primarily intended for setup and debugging rather than everyday shop operation.

---

# 49. Backend

The frontend package contains a legacy Firebase Functions template:

`backend-firebase-functions/`

However, current production OTP and subscription functionality is designed to work with the separate production backend.

The production backend is responsible for services such as:

* OTP generation
* OTP verification
* Email delivery
* Authentication
* Subscription creation
* Razorpay verification
* Subscription status
* Secure AI requests
* Optional cloud synchronization

Never put private production secrets directly inside frontend JavaScript or the APK.

---

# 50. Production Environment Variables

Depending on the production backend, environment variables may include configuration for:

* Database
* JWT
* OTP security
* Brevo API
* Brevo sender
* Razorpay
* Razorpay webhook
* Razorpay plan IDs
* Frontend origin
* AI provider
* Cloud services

Actual secret values must stay on the backend.

Do not commit real secrets to GitHub.

---

# 51. Brevo OTP Email

Production OTP email can be delivered through Brevo.

Required production configuration generally includes:

* Brevo API key
* Verified sender email
* Verified sender identity
* Correct backend environment configuration

The frontend should communicate only with the backend.

It should never contain the private Brevo API key.

---

# 52. Project Structure

```text
Vyapar-AI-Frontend-6.3.4-Clean-Auth-Perf/
│
├── README.md
├── FEATURES_70.md
├── SECURITY.md
├── PLAY_STORE_SECURITY.md
├── GOOGLE_DRIVE_SETUP.md
├── version.json
│
├── web/
│   ├── index.html      # app shell
│   ├── auth.js         # sign-in / create-account / OTP recovery
│   ├── app.js          # consolidated application runtime
│   ├── app.css         # consolidated responsive Liquid Glass UI
│   ├── logo.png
│   ├── legal.css
│   ├── privacy.html
│   ├── terms.html
│   ├── refund.html
│   ├── delete-account.html
│   └── public-invoice.html
│
└── android-app/app/src/main/assets/
    └── exact synchronized copy of web/ for APK builds
```

---

# 53. Run Web Version

The web application entry point is:

```text
web/index.html
```

For proper backend authentication and production testing, deploy the `web` directory using a static web host.

---

# 54. Build Android APK Using GitHub Actions

A GitHub Actions workflow is included:

```text
.github/workflows/build-android.yml
```

Repository structure should contain:

```text
android-app/
.github/
```

at the repository root.

Then:

```text
GitHub
→ Actions
→ Build Vyapar AI Android APK
→ Run workflow
```

Depending on workflow configuration, build artifacts can include:

```text
VyaparAI-debug-apk
VyaparAI-debug-aab
```

For Google Play production release, create and sign a proper release AAB rather than distributing only a debug APK.

---

# 55. Google Play Production

Before publishing on Google Play:

* Configure final package name
* Configure app signing
* Generate signed AAB
* Configure privacy policy
* Configure Data Safety information
* Confirm account deletion flow
* Verify permissions
* Test OTP
* Test subscription
* Test Razorpay
* Test UPI
* Test backup
* Test Android versions
* Enable Play App Signing

A Play Protect warning on an unsigned or sideloaded APK cannot always be solved by source-code changes alone.

Production builds should be properly signed and distributed through Google Play.

---

# 56. Legal Pages

The project contains pages for:

* Privacy Policy
* Terms & Conditions
* Refund Policy
* Account Deletion

Files include:

```text
web/privacy.html
web/terms.html
web/refund.html
web/delete-account.html
```

These should be reviewed and updated with the final business/company information before public release.

---

# 57. Complete 70-Feature Pack

The application includes or contains foundations/hooks for the following feature set:

1. Barcode scanner with manual fallback
2. Product size/color/brand/article/SKU variants
3. Stock ledger reconciliation
4. Sales returns
5. Purchase and supplier ledger
6. Customer statements
7. Due reminders and WhatsApp sharing
8. Daily cash closing
9. Payment reconciliation
10. GST reports
11. Low-stock report
12. Dead-stock report
13. Best-seller analysis
14. Product-level profit report
15. Category and brand profit export
16. Discount report foundation
17. Price history
18. CSV product import
19. Product catalog export
20. Duplicate-product detection
21. Bill/box OCR backend hook
22. OCR job metadata
23. AI daily summary
24. AI business recommendation hook
25. Trend forecast foundation
26. Reorder recommendation
27. Smart pricing suggestion foundation
28. Expense anomaly report foundation
29. Natural-language product/customer search foundation
30. AI business report export
31. Local multi-store profiles
32. Staff accounts
33. Roles and permissions
34. Configurable cloud-sync endpoint
35. Encrypted backup export
36. Local session tracking
37. Audit log
38. Local-first operation
39. Cloud conflict-policy foundation
40. Subscription entitlement integration
41. UPI payment intent
42. Payment reference/UTR logging foundation
43. GSTIN settings
44. HSN/SAC settings
45. Intra/inter-state GST helper
46. Invoice numbering series
47. e-Invoice payload preparation
48. INR formatting
49. Language-selection foundation
50. Local PIN-lock foundation
51. IndexedDB advanced-state cache
52. Global error logging
53. Data migration and repair
54. Data-integrity checks
55. Import snapshot and rollback foundation
56. Encrypted backup restore foundation
57. Large-table safety
58. Incremental/Lite rendering
59. IndexedDB caching
60. On-demand report calculation
61. Low-end Android Lite mode
62. Web Worker export readiness
63. Bounded large-table rendering
64. Footwear size matrix
65. Footwear color matrix
66. Footwear brand analysis
67. Footwear article tracking
68. Pair/carton tracking foundation
69. MRP-vs-selling-price analysis
70. Smart reorder and stock intelligence

---

# 58. Features Requiring External Services

Not every advanced feature can operate completely inside the APK.

The following require external APIs, secure backend services or native-provider integrations for full production operation:

* Live generative AI
* Live OCR / vision
* Production OTP
* Email delivery
* Razorpay subscription verification
* Payment webhook verification
* Real cloud synchronization
* Multi-device conflict resolution
* Google Drive authorization
* GSTN submission
* Production e-Invoice submission
* Biometric authentication
* External banking reconciliation

The frontend contains hooks or foundations for these integrations but private credentials must remain server-side.

---

# 59. Data Safety

Business information should remain under the user's control.

The application follows a local-first approach.

Users should regularly create backups.

Before changing devices or reinstalling the application:

1. Export a local backup.
2. Verify that the backup file exists.
3. Optionally create a Google Drive backup.
4. Keep encrypted-backup passwords safe.

Never depend on only one copy of important business data.

---

# 60. Intended Users

Vyapar AI is suitable for:

* Footwear shops
* Clothing retailers
* General stores
* Small wholesalers
* Electronics stores
* Cosmetic shops
* Local retailers
* Family businesses
* Small multi-branch businesses

Footwear stores receive additional benefits from size, color, brand, article, SKU and pair-level inventory tracking.

---

# 61. Version 6.0.10 Improvements

Vyapar AI 6.0.10 focuses on Android payment behavior and Business plan protection.

Major improvements include:

* Android UPI deep-link handling
* Razorpay `intent://` handling
* Installed UPI app routing
* Generic UPI chooser
* Safe payment fallback
* Business plan workspace
* Business feature locking
* Backend-verified paid entitlement
* Duplicate subscription protection
* Web and Android asset parity
* Android-focused Login interface
* Android-focused Home interface
* Original floating main navigation preserved

---

# 62. Development Philosophy

Vyapar AI is built around five principles:

**Simple**
Daily tasks should be available quickly.

**Local First**
Business information should remain usable even with unreliable internet.

**Android Friendly**
The application should feel usable on a phone rather than like a desktop website squeezed into a small screen.

**Secure Integrations**
Private payment, AI and email credentials must stay on the backend.

**Expandable**
A small shop should be able to start with basic sales tracking and later use billing, stock, staff, cloud, reports and AI tools.

---

# 63. Current Production Checklist

Before considering the app production-ready, verify:

* OTP sending
* OTP verification
* Login persistence
* Logout
* Razorpay checkout
* UPI redirect
* Subscription verification
* Business-plan unlocking
* Free-plan restrictions
* Billing
* Stock update
* Sales
* Returns
* Udhaar
* Customer payments
* GST calculation
* CSV import
* Backup
* Restore
* Google Drive backup
* Android file picker
* Android downloads
* Camera permission
* Notification permission
* Dark mode
* Light mode
* Lite mode
* Low-end Android performance
* Privacy page
* Terms page
* Refund page
* Account deletion
* Signed release AAB

---

# 64. Support

For support related to Vyapar AI:

**Email:** [anujguptaofficial09@gmail.com](mailto:anujguptaofficial09@gmail.com)

---

# 65. Final Note

Vyapar AI 6.0.10 is designed as a complete small-business operating system rather than only a sales-entry application.

A business owner can use the app to manage:

**Login → Dashboard → Sales → Billing → Stock → Products → Customers → Udhaar → Suppliers → Purchases → Expenses → Payments → GST → Profit → Reports → Backup → Subscription → AI Business Insights**

from one Android application.

Core business functionality is local-first, while sensitive online functionality such as OTP authentication, payments, AI processing and cloud services is designed to operate through secure external services.

**Vyapar AI — Manage. Understand. Grow.**
