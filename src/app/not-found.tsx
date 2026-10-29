import Link from "next/link";

export default function NotFound() {
  return (
    <main className="page narrow stack">
      <h1>This page isn&apos;t on LeoWapi</h1>
      <p className="muted">It may have been moved or taken down.</p>
      <p><Link href="/">Go to the homepage</Link></p>
    </main>
  );
}
