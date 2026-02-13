# Priven QuickNode Streams Integration

Real-time **monitoring** of Priven transactions using QuickNode Streams.

> **Note:** This webhook is for observing events only. It does NOT execute queries.
> Query execution happens in the TEE (see main README for TEE options).

## What This Does

- Receives real-time blockchain events from QuickNode Streams
- Logs Priven-related transactions (query submissions, delegations, executions)
- Provides an API to view recent events

## What This Does NOT Do

- Execute queries (that happens in TEE)
- Decrypt predicates or results
- Submit query results

## Setup Guide

### Step 1: Start the Webhook Server

```bash
cd webhook
npm install
npm start
```

You should see:
```
  PRIVEN QUICKNODE STREAMS WEBHOOK SERVER
============================================================
  Local:    http://localhost:3001
  Webhook:  http://localhost:3001/webhook
```

### Step 2: Expose with ngrok

In a new terminal:
```bash
ngrok http 3001
```

Copy the HTTPS URL (e.g., `https://abc123.ngrok.io`)

### Step 3: Create QuickNode Stream

1. Go to https://dashboard.quicknode.com/streams
2. Click **"Create Stream"**
3. Configure:

| Field | Value |
|-------|-------|
| Name | `priven-monitor` |
| Network | `Solana Devnet` |
| Dataset | `Block` |
| Region | Your closest region |
| Start | `Latest block` |

4. **Destination**: Select `Webhook`
   - URL: `https://YOUR-NGROK-URL/webhook`
   - Compression: `None`
   - Max Retry: `3`

5. **Filter Function**: Click "Edit" and paste the contents of `stream-filter.js`

6. Click **"Create Stream"**

### Step 4: Test the Stream

**Option A: Test in QuickNode Dashboard**
1. Go to Stream settings
2. Use "Payload testing" panel on the right
3. Enter a recent block number
4. Click "Fetch" then "Run test"
5. Check if events are detected

**Option B: Submit a Priven query**
```bash
priven query --filter tvl:gte:1000000 --local
```

Watch the webhook terminal for events!

### Step 5: Verify Events

Check received events:
```bash
curl http://localhost:3001/events
```

## Filter Details

The filter monitors these Priven events:

| Event | Description |
|-------|-------------|
| `query_submitted` | User submitted encrypted query |
| `query_delegated` | Query delegated to TEE |
| `query_executed` | TEE executed the private query |
| `result_committed` | Encrypted result committed to L1 |
| `query_expired` | Query timed out (1 hour) |

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Health check |
| `/events` | GET | View last 20 events |
| `/events` | DELETE | Clear stored events |
| `/webhook` | POST | Receive Stream events |

## Troubleshooting

### Stream keeps stopping
- Check ngrok is still running
- Verify webhook URL is correct (with `/webhook` path)
- Check QuickNode dashboard for error logs

### No events received
- Make sure you're on `Solana Devnet`
- Submit a test query to generate events
- Check filter is correctly detecting Priven program ID

### Test filter returns empty
- The test block might not have Priven transactions
- Find a block with your transactions: check Solana Explorer for your recent tx signatures

## Production Deployment

For production, replace ngrok with:

1. **Vercel/Netlify Serverless Function**
2. **Railway/Render/Fly.io** (free tiers available)
3. **AWS Lambda + API Gateway**

Example Vercel deployment:
```bash
cd webhook
vercel deploy
```

Then use the Vercel URL in QuickNode Streams.

## Integration with TEE Executor

If you're building a TEE executor service, you could extend this webhook to:

1. Detect `query_submitted` events
2. Trigger TEE execution
3. Submit results back to chain

See `tee-executor/` (if implemented) for the execution logic.
