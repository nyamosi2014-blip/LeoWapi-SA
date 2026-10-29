"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { safeNext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type SignInState =
  | { step: "email"; error?: string }
  | { step: "code"; email: string; next: string; error?: string };

const emailSchema = z.email("Enter a valid email address.").transform((s) => s.trim().toLowerCase());
const codeSchema = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code from the email.");

/** Step 1: email the visitor a one-time code. New addresses get a customer account. */
export async function sendCode(_: SignInState, form: FormData): Promise<SignInState> {
  const email = emailSchema.safeParse(form.get("email"));
  if (!email.success) return { step: "email", error: email.error.issues[0].message };
  const next = safeNext(form.get("next"));
  const supabase = await createClient();
  if (!supabase) return { step: "email", error: "Sign-in isn't set up in this environment yet." };

  const { error } = await supabase.auth.signInWithOtp({ email: email.data, options: { shouldCreateUser: true } });
  if (error) {
    return { step: "email", error: error.status === 429 ? "Too many attempts. Wait a minute and try again." : "We couldn't send the code. Try again." };
  }
  return { step: "code", email: email.data, next };
}

/** Step 2: check the code, which sets the session cookie, then go where the visitor was heading. */
export async function verifyCode(state: SignInState, form: FormData): Promise<SignInState> {
  if (state.step !== "code") return { step: "email" };
  const code = codeSchema.safeParse(form.get("code"));
  if (!code.success) return { ...state, error: code.error.issues[0].message };
  const supabase = await createClient();
  if (!supabase) return { step: "email", error: "Sign-in isn't set up in this environment yet." };

  const { error } = await supabase.auth.verifyOtp({ email: state.email, token: code.data, type: "email" });
  if (error) return { ...state, error: "That code is wrong or has expired. Check the latest email, or send a new code." };
  redirect(state.next);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase?.auth.signOut();
  redirect("/");
}
