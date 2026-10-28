import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { isStaff, requireUser } from "@/lib/auth";
import { REQUEST_STATUS_LABEL, type RequestStatus } from "@/lib/domain/requests";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "../sign-in/actions";

export const metadata: Metadata = { title: "Your account" };

const ROLE_LABEL = { venue_owner: "Venue owner", organiser: "Event organiser", moderator: "Moderator", admin: "Administrator" };

export default function AccountPage() {
  return (
    <main className="page narrow">
      <h1>Your account</h1>
      <Suspense fallback={<p className="muted">Loading…</p>}>
        <Account />
      </Suspense>
    </main>
  );
}

async function Account() {
  const user = await requireUser("/account");
  const supabase = (await createClient())!;
  const { data: requests } = await supabase
    .from("requests")
    .select("reference, type, status, visit_date, created_at")
    .eq("customer_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <div className="stack">
      <section className="card stack">
        <p>Signed in as <strong>{user.email}</strong></p>
        {user.roles.length > 0 && <p>Roles: {user.roles.map((r) => ROLE_LABEL[r]).join(", ")}</p>}
        {isStaff(user) && <p><Link href="/admin">Open the admin dashboard</Link></p>}
        <form action={signOut}>
          <button type="submit" className="secondary">Sign out</button>
        </form>
      </section>

      <section className="stack">
        <h2>Your requests</h2>
        {!requests?.length ? (
          <p className="muted">You haven&apos;t sent any requests yet.</p>
        ) : (
          <ul className="list">
            {requests.map((r) => (
              <li key={r.reference}>
                <strong>{r.reference}</strong> · {r.type.replace("_", " ")} · {REQUEST_STATUS_LABEL[r.status as RequestStatus]}
                {r.visit_date && <> · {r.visit_date}</>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
