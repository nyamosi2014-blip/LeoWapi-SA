import type { Metadata } from "next";
import { Suspense } from "react";
import { safeNext } from "@/lib/auth";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <main className="page narrow">
      <h1>Sign in</h1>
      <Suspense>
        <Form searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Form({ searchParams }: Pick<PageProps<"/sign-in">, "searchParams">) {
  const { next } = await searchParams;
  return <SignInForm next={safeNext(next)} />;
}
