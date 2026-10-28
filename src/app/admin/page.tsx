import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { isStaff, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { reviewVenue } from "./actions";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

export default function AdminPage() {
  return (
    <main className="page">
      <h1>Admin</h1>
      <Suspense fallback={<p className="muted">Loading…</p>}>
        <Dashboard />
      </Suspense>
    </main>
  );
}

async function Dashboard() {
  const user = await requireUser("/admin");
  // Staff only. Others get a plain 404, so the page doesn't advertise itself.
  if (!isStaff(user)) notFound();
  const supabase = (await createClient())!;

  const [pending, reports, requests, published] = await Promise.all([
    supabase.from("venues").select("id, name, is_sample, created_at, areas(name), cities(name)").eq("publication", "pending").order("created_at"),
    supabase.from("reports").select("id", { count: "exact", head: true }).in("status", ["open", "in_review"]),
    supabase.from("requests").select("id", { count: "exact", head: true }).in("status", ["submitted", "delivered"]),
    supabase.from("venues").select("id", { count: "exact", head: true }).eq("publication", "published").eq("is_sample", false),
  ]);

  return (
    <div className="stack">
      <section className="stats">
        <Stat label="Real venues published" value={published.count} />
        <Stat label="Venues waiting for review" value={pending.data?.length} />
        <Stat label="Open reports" value={reports.count} />
        <Stat label="Requests not yet answered" value={requests.count} />
      </section>

      <section className="stack">
        <h2>Waiting for review</h2>
        {!pending.data?.length ? (
          <p className="muted">Nothing waiting.</p>
        ) : (
          <ul className="list">
            {pending.data.map((v) => (
              <li key={v.id} className="card stack">
                <p>
                  <strong>{v.name}</strong> · {(v.areas as unknown as { name: string } | null)?.name},{" "}
                  {(v.cities as unknown as { name: string } | null)?.name}
                  {v.is_sample && <span className="tag">Sample</span>}
                </p>
                <form action={reviewVenue} className="row">
                  <input type="hidden" name="venueId" value={v.id} />
                  <input name="note" placeholder="Note to the owner (needed to reject)" aria-label="Note to the owner" />
                  <button type="submit" name="decision" value="published">Approve</button>
                  <button type="submit" name="decision" value="rejected" className="secondary">Reject</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <div className="card">
      <p className="stat">{value ?? "–"}</p>
      <p className="muted">{label}</p>
    </div>
  );
}
