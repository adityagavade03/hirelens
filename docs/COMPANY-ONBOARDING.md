# Company onboarding and recruitment — 2 October 2026

This increment extends the existing User, Company, Job, Application, Interview and Notification models. Existing cookie sessions, company membership, candidate applications, mock interviews, assessments and reports remain in place. No duplicate dashboard or authentication system was added.

## Entry and access

The first page presents Company, HR / Interviewer and Candidate entry cards. Each role has a named sign-in/sign-up page at `/auth/company`, `/auth/hr` or `/auth/candidate`. Login accepts email or username and checks the selected role against the account stored in MongoDB. Company registration requires a username; existing email-only accounts remain usable.

Company overview lives at `/company`, HR overview at `/hr`, candidate overview at `/candidate`. Role guards reject other-role pages. The backend independently checks roles and company/job membership for every protected operation. Company dashboard totals use MongoDB aggregation across the company's records, not the limited lists used for recent activity.

## Verification adapter

Configure `COMPANY_VERIFICATION_URL` and `COMPANY_VERIFICATION_API_KEY`. This URL is an adapter endpoint you control, connected to your chosen business-verification provider. It is not a claim of native compatibility with a particular registry. The adapter must verify the submitted business identity and official contact details using its provider, not merely echo a positive response.

HireLens makes an authenticated JSON POST with `Authorization: Bearer <key>`:

```json
{
  "companyName": "Registered business name",
  "officialEmail": "recruiting@company.example",
  "registrationNumber": "REGISTRATION-CODE-IF-APPLICABLE",
  "country": "IN",
  "website": "https://company.example",
  "industry": "Software",
  "companyType": "Private company",
  "address": "Official registered address",
  "phone": "Company contact number",
  "location": "City, country"
}
```

Positive adapter contract:

```json
{
  "verified": true,
  "legalName": "Provider-confirmed registered business name",
  "reference": "Verification audit reference",
  "officialEmail": "recruiting@company.example",
  "registrationNumber": "REGISTRATION-CODE-IF-APPLICABLE",
  "country": "IN"
}
```

Use `{ "verified": false }` for an unverified business. A positive result must include a legal name, reference, and matching email/country/registration number; malformed or mismatched results fail closed. Registration number is optional only when the provider can verify without one. The name stored in Company comes from the provider. Official email and normalized country/registration key have unique indexes. Passwords never go to the verification provider.

`POST /api/auth/company/verify` validates details and duplicates, calls the provider, and returns a random single-use receipt. Only its hash is stored in CompanyVerification, with verified details and a 15-minute expiry. Registration binds the receipt to the official email, consumes it, creates the existing bcrypt-protected User and Company records, and asks the user to sign in. Verification is checked on the server; frontend flags cannot bypass it.

No provider configured means the verification endpoint returns HTTP 503 with an explicit setup message. Production registration requires the verified receipt. Existing companies verify or update legal identity through Company profile, using `POST /api/company/verify`. Verified name and website cannot be silently overwritten by ordinary profile editing. Company verification is distinct from email possession, which is checked during sign-in.

### Local development without a verification provider

Set `ALLOW_LOCAL_COMPANY_REGISTRATION=true` explicitly in the development `.env` and restart the API. It is enabled in this local workspace. The option works only outside production, with a loopback `HOST` and a localhost `APP_ORIGIN`; it is unavailable for a public origin or wildcard bind. The example environment defaults to false. No account or company is created automatically.

Open **Company → Sign up**, enter company details and choose **Continue with local setup**. Then enter your own administrator name, username and confirmed password. The existing registration endpoint accepts `localCompanyDetails` instead of a verification receipt, validates email identity and uniqueness, hashes the password, and creates the company with `localDevelopment=true`, `sample=false` and `verification.status=unverified`. It never fabricates a registry receipt, verification reference or timestamp. Candidate/HR requests cannot use this option.

Sign in normally. Company OTP remains required. With `MESSAGE_PREVIEW=true`, open the newest matching JSON file in `.data/messages` and enter the six-digit code from its `text` field. These local previews are not delivered to a mailbox and do not prove real email ownership. The screen identifies preview mode; codes are not exposed in API responses.

Local companies can publish jobs for testing while the local option is enabled. Their dashboard/profile identifies them as unverified development companies. Disabling the option, changing to a public bind/origin, or using production blocks their logins and existing authenticated sessions, including linked HR membership. Keep development data separate from production. The production compose template uses separate volumes. Later, real verification through **Company profile** clears the development marker only after a matching positive provider result; OTP remains in place.

## Email OTP adapter

Configure `EMAIL_DELIVERY_URL`, `EMAIL_DELIVERY_API_KEY`, `EMAIL_FROM`, and a random `OTP_HASH_SECRET` of at least 32 characters. Keep them exclusively in the server environment. One way to generate the secret locally is `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`; copy the generated value into `.env` without committing it.

HireLens posts `{from,to,subject,text}` to the email adapter with Bearer authorization. Return `{ "accepted": true, "messageId": "provider-message-id" }` only after the actual email provider accepts the message. Acceptance is not proof of mailbox delivery. Errors, invalid responses and 15-second timeouts produce a clear error. HTTPS is required except localhost HTTP adapters during development. Redirects are rejected.

The flow is password verification → HTTP 202 challenge → emailed code → `POST /api/auth/otp/verify` → existing HttpOnly session cookie. The session is never created by the company login endpoint before successful OTP verification. Successful login rotates the current cookie session.

- Cryptographically random six-digit code; 10-minute expiry.
- Random 256-bit challenge token; only its SHA-256 hash is persisted.
- Code stored as a secret-keyed HMAC bound to the challenge token, not plaintext or a brute-forceable unkeyed hash.
- Five verification attempts and five sends within a 20-minute per-account window; at least 60 seconds between sends. Starting another login or resending cannot reset this window's attempt counter.
- Atomic attempt counting and one-time consumption prevent concurrent replay.
- Resend invalidates the earlier challenge and code. Codes never appear in browser responses, application logs or notification records.
- Missing email configuration/secret blocks required OTP login with HTTP 503.

`COMPANY_LOGIN_OTP_REQUIRED=true` is the default. Production always enforces company OTP, even if this variable is set to false. It may be disabled explicitly for nonproduction adapter development. Sample accounts marked in the database can skip OTP/verification publishing checks only when `ALLOW_DEMO_LOGIN` is enabled outside production; they remain labeled **sample, not verified**. Production disables all sample logins. Do not mark real users or businesses as sample.

## Recruitment and assignment

Jobs add role, department, preferred skills, education, work mode, optional annual salary range/currency, openings, deadline, ordered interview rounds and additional requirements. Existing core fields and routes are reused. Job updates accept partial fields and preserve omitted fields. Draft/publish/unpublish/close preserve submitted applications. Expired deadlines block applications on the server. Job-specific links and filters connect job cards to applications and interviewer selection.

Company → HR & assignments lists only HR accounts that accepted membership in that company. Profiles and self-declared availability come from User; assigned jobs and upcoming/completed interview counts are computed from stored records. There is no invented ranking or rating. HRs can update availability and accept/decline recruitment assignments. Unavailable HRs cannot receive new assignments.

Job stores a required HR count, multiple HR requests and interview instructions. A request starts pending and must be explicitly accepted or rejected by that HR. The company then manually distributes shortlisted applications to accepted HRs. Each application stores one assigned HR; stale or duplicate distributions are rejected. HR can see only their distributed candidates and resumes.

Company users create jobs, shortlist, request HRs, distribute candidates and monitor progress/results. Only the assigned, accepted HR can schedule, enter, conduct, assess or finalize a hiring interview. Candidate attendance and private mock practice remain in their existing flows. Notifications reuse the current collection for requests, responses and distribution.

At startup, old single-HR job assignments migrate to request records. Only an explicit legacy accepted status remains accepted; missing or unassigned metadata becomes pending. Existing applications/interviews/results are preserved. Old scheduled interviews must be linked from job details to their original HR after acceptance; no candidate is distributed automatically. Already completed records remain readable. The current process assigns one HR per application; the rounds list supplies instructions and does not create additional simultaneous assignees.

Company: Manage jobs → Job details & HR requests → View applications → Shortlist → Set HR count → Send requests → Wait for acceptance → Save candidate distribution. HR: My assignments → View job & instructions → Accept request → View assigned candidates → Schedule/conduct interview → Submit feedback. Existing styles, layout, navigation and components are retained.

## Provider verification status

Automated tests use clearly labeled verification and email contract fixtures with isolated real MongoDB. These test receipt/OTP handling, security, and workflow persistence; they do not certify registry checks or deliver real email. Connect real adapters, then test registration → official verification → password → received email code → company overview before onboarding actual businesses. HR and candidate signups continue using the existing session flow without company OTP. Password recovery, HR/candidate email verification and SMS remain outside this increment.
