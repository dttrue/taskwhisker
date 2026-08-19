"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import {
  Button,
  Card,
  FormFeedback,
  FormField,
  PageHeader,
  PageShell,
} from "@/components/ui/Foundation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl: "/dashboard",
    });

    setLoading(false);

    if (res?.error) {
      setError("Invalid email or password.");
      return;
    }

    router.push("/dashboard");
  }

  return (
    <PageShell className="flex items-center" containerClassName="max-w-md">
      <Card className="p-6 sm:p-8">
        <PageHeader
          eyebrow="TaskWhisker team"
          title="Welcome back"
          description="Sign in to manage bookings, schedules, visits, and client communication."
        />

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <FormField
            id="email"
            name="email"
            type="email"
            label="Email address"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
            disabled={loading}
          />

          <FormField
            id="password"
            name="password"
            type="password"
            label="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
            disabled={loading}
          />

          {error ? <FormFeedback>{error}</FormFeedback> : null}

          <Button
            type="submit"
            className="w-full"
            disabled={loading}
            aria-busy={loading}
          >
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </form>

        <div className="mt-6 border-t border-[var(--task-border)] pt-5 text-center">
          <Button href="/" variant="quiet" className="min-h-10 px-3 py-2">
            Return to TaskWhisker
          </Button>
        </div>
      </Card>
    </PageShell>
  );
}
