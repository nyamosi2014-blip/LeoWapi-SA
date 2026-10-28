import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, createUser, freshDatabase, type Db } from "./harness";

let db: Db;
let customer: string, otherCustomer: string, owner: string, moderator: string, moderatorOwner: string, admin: string;
let cityId: string, areaId: string;

beforeAll(async () => {
  db = await freshDatabase("lw_access_test");
  customer = await createUser(db, "customer@example.com");
  otherCustomer = await createUser(db, "other@example.com");
  owner = await createUser(db, "owner@example.com", ["venue_owner"]);
  moderator = await createUser(db, "mod@example.com", ["moderator"]);
  moderatorOwner = await createUser(db, "modowner@example.com", ["moderator", "venue_owner"]);
  admin = await createUser(db, "admin@example.com", ["admin"]);
  ({ rows: [{ id: cityId }] } = await db.query("insert into cities (slug, name) values ('johannesburg', 'Johannesburg') returning id"));
  ({ rows: [{ id: areaId }] } = await db.query("insert into areas (city_id, slug, name) values ($1, 'rosebank', 'Rosebank') returning id", [cityId]));
});

afterAll(async () => {
  await db?.end();
});

async function newVenue(by: string, slug: string, extra = "") {
  const { rows } = await as(
    db, by,
    `insert into venues (slug, name, city_id, area_id ${extra ? ", accepts_requests, contact_whatsapp, whatsapp_e164" : ""})
     values ($1, $2, $3, $4 ${extra ? ", true, true, '+27821234567'" : ""}) returning id, publication, created_by`,
    [slug, `Test ${slug}`, cityId, areaId],
  );
  return rows[0] as { id: string; publication: string; created_by: string };
}
const setPublication = (by: string | null, id: string, to: string) =>
  by ? as(db, by, "update venues set publication = $2 where id = $1 returning publication, ever_approved", [id, to])
     : db.query("update venues set publication = $2 where id = $1 returning publication, ever_approved", [id, to]);

describe("accounts", () => {
  it("creates a profile for each new user", async () => {
    const { rows } = await db.query("select id from profiles where id = $1", [customer]);
    expect(rows).toHaveLength(1);
  });
  it("does not let a customer give themselves a role", async () => {
    await expect(as(db, customer, "insert into user_roles (user_id, role) values ($1, 'admin')", [customer])).rejects.toThrow(/row-level security/);
  });
  it("lets an admin grant a role, and records who did it", async () => {
    await as(db, admin, "insert into user_roles (user_id, role) values ($1, 'organiser')", [otherCustomer]);
    const { rows } = await db.query("select granted_by from user_roles where user_id = $1 and role = 'organiser'", [otherCustomer]);
    expect(rows[0].granted_by).toBe(admin);
    const audit = await db.query("select action from audit_log where target_id = $1", [otherCustomer]);
    expect(audit.rows.map((r) => r.action)).toContain("role.grant");
  });
  it("hides other people's profiles", async () => {
    const { rows } = await as(db, customer, "select id from profiles");
    expect(rows.map((r) => r.id)).toEqual([customer]);
  });
});

describe("venue listings", () => {
  it("only lets venue owners and staff create venues", async () => {
    await expect(newVenue(customer, "not-allowed")).rejects.toThrow(/row-level security/);
  });

  it("starts a new venue as a draft owned by its creator, hidden from the public", async () => {
    const v = await newVenue(owner, "draft-only");
    expect(v).toMatchObject({ publication: "draft", created_by: owner });
    const member = await db.query("select member_role from venue_members where venue_id = $1 and user_id = $2", [v.id, owner]);
    expect(member.rows[0].member_role).toBe("owner");
    expect((await as(db, null, "select id from venues where id = $1", [v.id])).rows).toHaveLength(0);
    expect((await as(db, customer, "select id from venues where id = $1", [v.id])).rows).toHaveLength(0);
  });

  it("refuses a venue created as already published or verified", async () => {
    await expect(as(db, owner, "insert into venues (slug, name, city_id, area_id, publication) values ('sneaky', 'Sneaky', $1, $2, 'published')", [cityId, areaId]))
      .rejects.toThrow(/unverified draft/);
  });

  it("sends an owner's listing to review, and only an independent moderator can publish it", async () => {
    const v = await newVenue(owner, "reviewed");
    await expect(setPublication(owner, v.id, "published")).rejects.toThrow(/not allowed/);
    await setPublication(owner, v.id, "pending");
    await expect(setPublication(customer, v.id, "published")).resolves.toMatchObject({ rowCount: 0 }); // customers can't even see it
    const { rows } = await setPublication(moderator, v.id, "published");
    expect(rows[0]).toEqual({ publication: "published", ever_approved: true });
    expect((await as(db, null, "select id from venues where id = $1", [v.id])).rows).toHaveLength(1);
    const audit = await db.query("select details from audit_log where action = 'venue.publication' and target_id = $1", [v.id]);
    expect(audit.rows.at(-1).details).toMatchObject({ from: "pending", to: "published" });
  });

  it("never lets a moderator approve their own venue", async () => {
    const v = await newVenue(moderatorOwner, "self-review");
    await setPublication(moderatorOwner, v.id, "pending");
    await expect(setPublication(moderatorOwner, v.id, "published")).rejects.toThrow(/not allowed/);
  });

  it("lets an owner hide and re-show an approved listing without another review", async () => {
    const v = await newVenue(owner, "hide-show");
    await setPublication(owner, v.id, "pending");
    await setPublication(moderator, v.id, "published");
    await setPublication(owner, v.id, "unpublished");
    await expect(setPublication(owner, v.id, "published")).resolves.toBeTruthy();
  });

  it("does not let an owner fake the approval flag", async () => {
    const v = await newVenue(owner, "fake-approval");
    await expect(as(db, owner, "update venues set ever_approved = true where id = $1", [v.id])).rejects.toThrow(/ever_approved/);
  });

  it("does not let an owner verify their own venue or mark it as sample data", async () => {
    const v = await newVenue(owner, "self-verify");
    await expect(as(db, owner, "update venues set verification = 'verified' where id = $1", [v.id])).rejects.toThrow(/independent moderator/);
    await expect(as(db, owner, "insert into verifications (venue_id, check_type, passed, evidence) values ($1, 'contact', true, 'I said so')", [v.id]))
      .rejects.toThrow(/row-level security|venue you belong to/);
    await expect(as(db, owner, "update venues set is_sample = true where id = $1", [v.id])).rejects.toThrow(/sample flag/);
  });

  it("only marks a venue verified after a recorded, passed check", async () => {
    const v = await newVenue(owner, "verify-me");
    await expect(as(db, moderator, "update venues set verification = 'verified' where id = $1", [v.id])).rejects.toThrow(/passed verification check/);
    await as(db, moderator, "insert into verifications (venue_id, check_type, passed, evidence) values ($1, 'contact', true, 'Called the listed number on 28 Oct; manager confirmed')", [v.id]);
    const { rows } = await as(db, moderator, "update venues set verification = 'verified' where id = $1 returning verified_by, verified_at", [v.id]);
    expect(rows[0].verified_by).toBe(moderator);
    expect(rows[0].verified_at).not.toBeNull();
  });

  it("only lets an independent moderator mark a price as verified", async () => {
    const v = await newVenue(owner, "priced");
    await as(db, owner, "insert into price_items (venue_id, kind, lo_cents, hi_cents, source) values ($1, 'entry', 10000, 10000, 'venue')", [v.id]);
    await expect(as(db, owner, "insert into price_items (venue_id, kind, lo_cents, source) values ($1, 'drink', 4000, 'verified')", [v.id]))
      .rejects.toThrow(/independent moderator/);
    await expect(as(db, moderator, "insert into price_items (venue_id, kind, lo_cents, source) values ($1, 'drink', 4000, 'verified')", [v.id]))
      .resolves.toBeTruthy();
  });
});

describe("customer requests", () => {
  let venueId: string;
  beforeAll(async () => {
    venueId = (await newVenue(owner, "takes-requests", "requests")).id;
    await setPublication(owner, venueId, "pending");
    await setPublication(moderator, venueId, "published");
  });
  const table = (by: string, venue: string) =>
    as(db, by,
      `insert into requests (type, venue_id, name, contact, visit_date, arrival_time, guests)
       values ('table', $1, 'Thandi', '+27821234567', current_date + 2, '21:00', 4) returning id, reference, status, customer_id`, [venue]);

  it("accepts a signed-in customer's table request and gives it a reference", async () => {
    const { rows } = await table(customer, venueId);
    expect(rows[0]).toMatchObject({ status: "submitted", customer_id: customer });
    expect(rows[0].reference).toMatch(/^REQ-[0-9A-F]{8}$/);
  });

  it("refuses requests to a venue that isn't published or isn't taking them", async () => {
    const draft = await newVenue(owner, "not-yet");
    await expect(table(customer, draft.id)).rejects.toThrow(/not taking requests/);
  });

  it("requires sign-in to send a request", async () => {
    await expect(as(db, null, "insert into requests (type, name, contact) values ('recommendation', 'Anon', 'a@b.co')"))
      .rejects.toThrow(/permission denied|row-level security/);
  });

  it("follows the request workflow and records who moved it", async () => {
    const { rows: [r] } = await table(customer, venueId);
    // The customer cannot confirm their own booking.
    await expect(as(db, customer, "update requests set status = 'confirmed' where id = $1", [r.id])).rejects.toThrow(/not allowed/);
    // The venue cannot confirm before the request has reached it.
    await expect(as(db, owner, "update requests set status = 'confirmed' where id = $1", [r.id])).rejects.toThrow(/not allowed/);
    await db.query("update requests set status = 'delivered' where id = $1", [r.id]); // system delivery
    await as(db, owner, "update requests set status = 'confirmed' where id = $1", [r.id]);
    await as(db, customer, "update requests set status = 'cancelled' where id = $1", [r.id]);
    const { rows } = await db.query("select from_status, to_status, actor_kind from request_status_history where request_id = $1 order by id", [r.id]);
    expect(rows).toEqual([
      { from_status: null, to_status: "submitted", actor_kind: "customer" },
      { from_status: "submitted", to_status: "delivered", actor_kind: "system" },
      { from_status: "delivered", to_status: "confirmed", actor_kind: "venue" },
      { from_status: "confirmed", to_status: "cancelled", actor_kind: "customer" },
    ]);
  });

  it("keeps requests private to the customer, the venue and staff", async () => {
    const { rows: [r] } = await table(customer, venueId);
    expect((await as(db, otherCustomer, "select id from requests where id = $1", [r.id])).rows).toHaveLength(0);
    expect((await as(db, owner, "select id from requests where id = $1", [r.id])).rows).toHaveLength(1);
    expect((await as(db, moderator, "select id from requests where id = $1", [r.id])).rows).toHaveLength(1);
  });

  it("does not let anyone rewrite what the customer asked for", async () => {
    const { rows: [r] } = await table(customer, venueId);
    await expect(as(db, owner, "update requests set guests = 20 where id = $1", [r.id])).rejects.toThrow(/Only the status/);
    await expect(as(db, customer, "update requests set note = 'changed' where id = $1", [r.id])).rejects.toThrow(/Only the status/);
  });
});

describe("events and offers", () => {
  it("only lets the venue list an event at its venue, and a moderator publish it", async () => {
    const v = await newVenue(owner, "event-host");
    const ins = `insert into events (venue_id, city_id, slug, title, starts_at) values ($1, $2, $3, 'Friday Amapiano', now() + interval '3 days') returning id`;
    await expect(as(db, otherCustomer, ins, [v.id, cityId, "hijack"])).rejects.toThrow(/Only the venue/);
    const { rows: [e] } = await as(db, owner, ins, [v.id, cityId, "friday-amapiano"]);
    await expect(as(db, owner, "update events set status = 'published' where id = $1", [e.id])).rejects.toThrow(/not allowed/);
    await as(db, owner, "update events set status = 'pending' where id = $1", [e.id]);
    await as(db, moderator, "update events set status = 'published' where id = $1", [e.id]);
    expect((await as(db, null, "select id from events where id = $1", [e.id])).rows).toHaveLength(1);
  });

  it("hides a published offer while its venue is not public", async () => {
    const v = await newVenue(owner, "offer-venue");
    const { rows: [o] } = await as(db, owner, "insert into offers (venue_id, title, starts_on, ends_on) values ($1, 'Two-for-one cocktails', current_date, current_date + 7) returning id", [v.id]);
    await as(db, owner, "update offers set status = 'pending' where id = $1", [o.id]);
    await as(db, moderator, "update offers set status = 'published' where id = $1", [o.id]);
    expect((await as(db, null, "select id from offers where id = $1", [o.id])).rows).toHaveLength(0);
  });
});

describe("sample data", () => {
  it("can never exist in production", async () => {
    await db.query("insert into venues (slug, name, city_id, area_id, is_sample, created_by) values ('sample-lounge', 'Sample Lounge', $1, $2, true, $3)", [cityId, areaId, admin]);
    await expect(db.query("update app_settings set value = 'production' where key = 'environment'")).rejects.toThrow(/Remove sample/);
    await db.query("delete from venues where is_sample");
    await db.query("update app_settings set value = 'production' where key = 'environment'");
    await expect(db.query("insert into venues (slug, name, city_id, area_id, is_sample, created_by) values ('sample-2', 'Sample Two', $1, $2, true, $3)", [cityId, areaId, admin]))
      .rejects.toThrow(/not allowed in production/);
    await db.query("update app_settings set value = 'development' where key = 'environment'");
  });

  it("keeps settings and the audit log away from customers", async () => {
    expect((await as(db, customer, "select * from app_settings")).rows).toHaveLength(0);
    expect((await as(db, customer, "select * from audit_log")).rows).toHaveLength(0);
    await expect(as(db, admin, "update app_settings set value = 'production'")).resolves.toMatchObject({ rowCount: 0 });
  });
});
