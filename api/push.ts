import type { VercelRequest, VercelResponse } from "@vercel/node";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  // Optional fields you might have:
  user_id?: string | null;
  machine_id?: string | null;
};

function getEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only POST allowed
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  // Verify webhook secret (prevents random calls)
  const secretHeader = req.headers["x-webhook-secret"];
  const expectedSecret = process.env.WEBHOOK_SECRET;

  if (expectedSecret) {
    if (!secretHeader || secretHeader !== expectedSecret) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  try {
    const vapidPublic = getEnv("VITE_VAPID_PUBLIC_KEY");
    const vapidPrivate = getEnv("VAPID_PRIVATE_KEY");
    const vapidSubject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";

    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

    const supabaseUrl = getEnv("SUPABASE_URL");
    const supabaseServiceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Supabase webhook payload includes record info; handle safely
    const body: any = req.body || {};
    const record = body.record || body.new || body; // fallback
    const machineId =
  record.unit_id || record.machine_id || record.device_id || "Unknown Machine";
    const title = record.title || record.type || "System Alert";
    const message =
      record.message ||
      record.description ||
      record.details ||
      "A new alert was triggered.";

    // Fetch subscriptions from DB
    // Change table name if needed:
    const { data, error } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth, user_id, machine_id");

    if (error) throw error;

    const subs = (data || []) as PushSubscriptionRow[];

    if (subs.length === 0) {
      return res.status(200).json({ ok: true, sent: 0, note: "No subscribers" });
    }

    const payload = JSON.stringify({
      title: `${machineId}: ${title}`,
      body: message,
      url: `/alerts?machine=${encodeURIComponent(machineId)}`,
      machine_id: machineId,
    });

    let sent = 0;
    const failedIds: string[] = [];

    // Send to all subscribers
    for (const s of subs) {
      const subscription = {
        endpoint: s.endpoint,
        keys: { p256dh: s.p256dh, auth: s.auth },
      };

      try {
        await webpush.sendNotification(subscription as any, payload);
        sent += 1;
      } catch (err: any) {
        // Remove dead subscriptions (common)
        const status = err?.statusCode;
        if (status === 404 || status === 410) {
          failedIds.push(s.id);
        }
      }
    }

    // Cleanup expired subscriptions
    if (failedIds.length > 0) {
      await supabase.from("push_subscriptions").delete().in("id", failedIds);
    }

    return res.status(200).json({ ok: true, sent, cleaned: failedIds.length });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Push failed" });
  }
}