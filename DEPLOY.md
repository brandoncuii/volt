# Deploying Volt

End-to-end walkthrough: AWS account → backend on Lambda → client on
Vercel. Written assuming you've never used AWS before.

Total time, first run: ~90 min (most of it is AWS account creation and
key restriction). Subsequent deploys: `cdk deploy` is ~3 min, `vercel
deploy` is ~1 min.

## What gets deployed

| Service | What it does | Cost |
|---|---|---|
| AWS Lambda | Runs the Express app on demand | $0 (under 1M req/mo free tier) |
| API Gateway HTTP API | Public HTTPS URL forwarding to Lambda | $0 first 12 mo, ~$1/M after |
| DynamoDB (on-demand) | Edge-weight cache | ~free for our usage |
| Vercel | Static client + edge CDN | $0 (hobby plan) |

Realistic monthly cost while in free tier: **$0**. Without free tier:
**~$2-5/mo** at hobby traffic. Set a billing alarm and you can't
surprise yourself.

---

## Part 1 — AWS account & toolchain (one-time)

### 1.1 Create an AWS account

Go to <https://aws.amazon.com> → **Create an AWS Account**. You'll need
an email, password, and a credit card (no charges in free tier; the card
is for identity).

After signup:

- **Turn on MFA on your root account.** Console → top-right account
  menu → Security credentials → Multi-factor authentication → assign an
  authenticator app. Skip this and your account is one phishing email
  away from a $10k crypto-mining bill.
- **Set a billing alarm.** Billing → Budgets → Create budget → Monthly
  cost budget → set threshold at $5 → notify your email. One-time, takes
  two minutes, prevents 99% of runaway-cost horror stories.

### 1.2 Create an IAM user for CLI access

Don't use the root account for CLI commands.

1. IAM → Users → Create user → name it `volt-cli` (or anything)
2. Permissions → **Attach policies directly** → search and check
   `AdministratorAccess` (overkill but fine for a personal sandbox; more
   careful with shared accounts)
3. Create user → click the user → Security credentials tab →
   **Create access key**
4. Choose "Command Line Interface (CLI)" → next → create. You'll see
   an Access Key ID and a Secret Access Key. **Copy both now** — the
   secret is shown once.

### 1.3 Install the AWS CLI

```bash
brew install awscli         # macOS
# or follow https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html
aws --version               # should print aws-cli/2.x
```

### 1.4 Configure credentials

```bash
aws configure
```

Paste in the Access Key ID and Secret Access Key from 1.2. Region:
**`us-west-2`**. Output format: `json` (or leave blank).

Verify:

```bash
aws sts get-caller-identity
```

Should print your account ID and the `volt-cli` user ARN.

### 1.5 Install CDK and bootstrap

```bash
npm install -g aws-cdk
cdk --version

# One-time per (account, region). Creates a small S3 bucket + IAM roles
# CDK uses to ship Lambda code.
cd infra
npx cdk bootstrap
```

Should end with something like `✅  Environment aws://123456789012/us-west-2 bootstrapped`.

---

## Part 2 — Deploy the backend (each time)

### 2.1 Set the Google Maps API key in your shell

The CDK stack reads `GOOGLE_MAPS_API_KEY` at deploy time and bakes it
into the Lambda's environment. Don't commit it.

```bash
export GOOGLE_MAPS_API_KEY=AIza...
```

### 2.2 Synth (sanity check) then deploy

```bash
cd infra
npx cdk synth                # prints CloudFormation, no AWS calls
npx cdk deploy               # asks for confirmation, then creates everything
```

First deploy takes ~3 min. CDK creates: DynamoDB table, Lambda function,
IAM role + policy, API Gateway HTTP API, integration, route, stage.

When it's done you'll see:

```
Outputs:
VoltStack.ApiUrl = https://abc123def.execute-api.us-west-2.amazonaws.com
VoltStack.EdgeCacheTableName = VoltStack-EdgeCache...
```

Copy the `ApiUrl` value. That's your live backend.

### 2.3 Smoke test

```bash
curl https://abc123def.execute-api.us-west-2.amazonaws.com/api/health
# {"status":"ok","service":"volt-api",...}

curl -X POST https://abc123def.execute-api.us-west-2.amazonaws.com/api/route \
  -H 'Content-Type: application/json' \
  -d '{"start":{"lat":37.77,"lng":-122.42},"end":{"lat":34.05,"lng":-118.24},"vehicleRangeKm":400,"startBatteryPct":90,"minArrivalBatteryPct":10}'
```

If the route call returns stops, the backend is healthy. First request
will be slow (cold start + first Distance Matrix calls); second is fast.

### 2.4 Watch the logs

```bash
aws logs tail /aws/lambda/VoltStack-ApiFunction... --follow
```

(Tab-complete the function name, or grab it from the CDK output.) You'll
see the same `[route] ...` log lines you see locally.

---

## Part 3 — Deploy the client to Vercel

### 3.1 Install + sign in

```bash
npm install -g vercel
vercel login                 # opens browser
```

### 3.2 Link the project

From the repo root:

```bash
vercel link
```

When prompted:

- Set up and deploy: `Y`
- Scope: your personal account
- Link to existing project: `N`
- Project name: `volt` (or anything)
- Directory: `./client`
- Override settings: `N`

### 3.3 Set production env vars

```bash
vercel env add VITE_GOOGLE_MAPS_API_KEY production    # paste your client key
vercel env add VITE_API_URL production                # paste the CDK ApiUrl from 2.2
```

### 3.4 Deploy

```bash
vercel --prod
```

Vercel runs `tsc -b && vite build` against `client/`, then deploys. You
get a URL like `https://volt-xyz.vercel.app`.

Open it. Pick a start and destination. Plan a route. Restaurants should
populate. The Network tab in DevTools should show requests going to your
AWS API Gateway URL.

---

## Part 4 — Lock down the Google Maps API key

After the first successful Vercel deploy, the client key is exposed in
the browser. Restrict it.

Google Cloud Console → APIs & Services → Credentials → click your key:

- **Application restrictions** → HTTP referrers → add:
  - `https://volt-xyz.vercel.app/*`
  - (and the preview-deploy pattern: `https://volt-*.vercel.app/*` if you
    want PR preview deploys to work)
  - `http://localhost:5173/*` (so local dev still works)
- **API restrictions** → Restrict key → check **Maps JavaScript API**,
  **Places API (new)**, **Geocoding API**

Save. The server-side key (`GOOGLE_MAPS_API_KEY` baked into Lambda) is
already protected because Lambda functions don't have static IPs you
could allowlist — leave it without IP restrictions, but check **API
restrictions** → **Distance Matrix API** + **Places API (new)** so it
can't be used for anything else if leaked.

---

## Updating

After code changes:

```bash
# backend
cd infra && npx cdk deploy

# client
vercel --prod
```

Both pick up automatically.

---

## Teardown

When you're done with the project (or moving accounts), remove all AWS
resources to be safe:

```bash
cd infra
npx cdk destroy
```

This deletes the Lambda, API Gateway, IAM role, and the DynamoDB table
(including cached edges). Vercel projects can be deleted from the
dashboard.

---

## Troubleshooting

**`cdk deploy` fails with `Need to perform AWS calls for account ..., but no credentials`**
→ `aws configure` wasn't run, or `AWS_PROFILE` is pointing at an empty
profile. Re-run 1.4.

**Lambda returns 502 / `Internal Server Error`**
→ Check CloudWatch (`aws logs tail ...`). Most common cause is missing
`GOOGLE_MAPS_API_KEY` at deploy time, or a runtime error you can see in
the log lines.

**Lambda is slow on every request**
→ Cold starts. Each Lambda container handles many requests once warm,
but warming only happens with traffic. For a demo, just open the URL
once before showing it.

**`cdk bootstrap` fails on permissions**
→ The IAM user from 1.2 needs `AdministratorAccess` or at least the
bootstrap-specific policy. Re-attach.

**Restaurants don't load, route works**
→ Server-side `GOOGLE_MAPS_API_KEY` doesn't have **Places API (new)**
enabled, or the key has API restrictions excluding it.

**CORS error in browser**
→ The CDK stack uses `allowOrigins: ['*']` for v1. If you tightened it
to a specific Vercel URL, make sure you used the exact URL (including
`https://`, no trailing slash).
