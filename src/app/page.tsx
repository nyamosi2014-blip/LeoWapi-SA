import { market } from "@/config/market";

// Placeholder until the design board is approved. Shows nothing that could pass for a real listing.
export default function Home() {
  const cities = market.launchCities.map((s) => s[0].toUpperCase() + s.slice(1)).join(" and ");
  return (
    <main className="page narrow stack">
      <p className="eyebrow">In development</p>
      <h1>Nightlife in {cities}, done properly.</h1>
      <p className="muted">
        {market.brand} is being built. Venue listings will appear here once venues have been verified.
      </p>
    </main>
  );
}
