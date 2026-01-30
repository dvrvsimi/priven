/**
 * Priven QuickNode Streams Webhook Server
 *
 * Receives real-time blockchain events from QuickNode Streams
 * and processes Priven-related transactions.
 */

const express = require("express");
const app = express();

const PORT = process.env.PORT || 3001;

// Store recent events for viewing
const recentEvents = [];
const MAX_EVENTS = 100;

// Parse JSON bodies (QuickNode sends JSON)
app.use(express.json({ limit: "10mb" }));

// Health check endpoint (QuickNode pings this)
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "Priven QuickNode Streams Webhook",
    eventsReceived: recentEvents.length,
  });
});

// View recent events (for debugging)
app.get("/events", (req, res) => {
  res.json({
    count: recentEvents.length,
    events: recentEvents.slice(-20), // Last 20
  });
});

// Clear events
app.delete("/events", (req, res) => {
  recentEvents.length = 0;
  res.json({ status: "cleared" });
});

// Main webhook endpoint - receives Stream data
app.post("/webhook", (req, res) => {
  const timestamp = new Date().toISOString();

  try {
    const payload = req.body;

    console.log("\n" + "=".repeat(60));
    console.log(`[${timestamp}] STREAM EVENT RECEIVED`);
    console.log("=".repeat(60));

    // Handle the filtered data from our Stream
    if (payload.data && Array.isArray(payload.data)) {
      console.log(`Events in payload: ${payload.data.length}`);

      for (const event of payload.data) {
        console.log("\n--- Priven Event ---");
        console.log(`  Type: ${event.type || "unknown"}`);
        console.log(`  Signature: ${event.signature || "N/A"}`);
        console.log(`  Slot: ${event.slot || "N/A"}`);
        console.log(`  Block Time: ${event.blockTime ? new Date(event.blockTime * 1000).toISOString() : "N/A"}`);

        if (event.accounts) {
          console.log(`  Accounts: ${event.accounts.join(", ")}`);
        }

        if (event.logs) {
          console.log(`  Logs:`);
          event.logs.forEach(log => console.log(`    ${log}`));
        }

        // Store event
        recentEvents.push({
          receivedAt: timestamp,
          ...event,
        });

        // Trim old events
        if (recentEvents.length > MAX_EVENTS) {
          recentEvents.shift();
        }

        // Handle specific event types
        handlePrivenEvent(event);
      }
    } else {
      // Raw block data (if filter returns full blocks)
      console.log("Raw payload received (no filtered events)");
      console.log(JSON.stringify(payload, null, 2).slice(0, 500) + "...");
    }

    // Always respond 200 OK quickly (QuickNode expects fast response)
    res.status(200).json({ received: true });

  } catch (error) {
    console.error("Error processing webhook:", error);
    // Still return 200 to prevent retries for bad data
    res.status(200).json({ received: true, error: error.message });
  }
});

// Also accept POST to root (some configs use this)
app.post("/", (req, res) => {
  // Forward to /webhook handler
  req.url = "/webhook";
  app.handle(req, res);
});

/**
 * Handle specific Priven events
 */
function handlePrivenEvent(event) {
  switch (event.type) {
    case "query_submitted":
      console.log("\n  [ACTION] New private query submitted!");
      console.log("  -> User wants to filter pools/tokens privately");
      // Could trigger: notification, analytics, etc.
      break;

    case "query_delegated":
      console.log("\n  [ACTION] Query delegated to TEE!");
      console.log("  -> Account ownership transferred to MagicBlock");
      break;

    case "query_executed":
      console.log("\n  [ACTION] Query executed in TEE!");
      console.log("  -> Private computation completed");
      break;

    case "result_committed":
      console.log("\n  [ACTION] Result committed to L1!");
      console.log("  -> Encrypted result available on-chain");
      break;

    default:
      console.log(`\n  [INFO] Unknown event type: ${event.type}`);
  }
}

// Start server
app.listen(PORT, () => {
  console.log("\n" + "=".repeat(60));
  console.log("  PRIVEN QUICKNODE STREAMS WEBHOOK SERVER");
  console.log("=".repeat(60));
  console.log(`\n  Local:    http://localhost:${PORT}`);
  console.log(`  Webhook:  http://localhost:${PORT}/webhook`);
  console.log(`  Events:   http://localhost:${PORT}/events`);
  console.log("\n  Next steps:");
  console.log("  1. Run: ngrok http " + PORT);
  console.log("  2. Copy the https URL");
  console.log("  3. Use it in QuickNode Streams dashboard");
  console.log("\n" + "=".repeat(60) + "\n");
});
