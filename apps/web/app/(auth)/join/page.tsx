"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { organization, useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function JoinPage() {
  return (
    <Suspense
      fallback={
        <div className="text-sm text-muted-foreground">Loading...</div>
      }
    >
      <JoinContent />
    </Suspense>
  );
}

function JoinContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const { data: session } = useSession();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [accepted, setAccepted] = useState(false);

  async function handleAccept() {
    if (!token) return;
    setError("");
    setLoading(true);

    try {
      const result = await organization.acceptInvitation({
        invitationId: token,
      });

      if (result.error) {
        setError(result.error.message ?? "Failed to accept invitation");
      } else {
        setAccepted(true);
        // Redirect to dashboard after a brief moment
        setTimeout(() => router.push("/dashboard"), 1500);
      }
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Invalid Invitation</CardTitle>
          <CardDescription>
            No invitation token found in the URL.
          </CardDescription>
        </CardHeader>
        <CardFooter className="justify-center">
          <Link href="/login" className="text-primary hover:underline text-sm">
            Go to login
          </Link>
        </CardFooter>
      </Card>
    );
  }

  if (!session) {
    return (
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <span className="text-lg font-bold text-primary">AF</span>
          </div>
          <CardTitle className="text-2xl">Join a Team</CardTitle>
          <CardDescription>
            You need to sign in before accepting this invitation.
          </CardDescription>
        </CardHeader>
        <CardFooter className="flex flex-col gap-2">
          <Link
            href={`/login?redirect=/join?token=${token}`}
            className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/80 transition-colors"
          >
            Sign in
          </Link>
          <Link
            href={`/signup?redirect=/join?token=${token}`}
            className="inline-flex w-full items-center justify-center rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            Create account
          </Link>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <span className="text-lg font-bold text-primary">AF</span>
        </div>
        <CardTitle className="text-2xl">Join a Team</CardTitle>
        <CardDescription>
          You&apos;ve been invited to join an AgentFleet team.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        {accepted && (
          <div className="rounded-md bg-primary/10 p-3 text-sm text-primary">
            Invitation accepted! Redirecting to dashboard...
          </div>
        )}
      </CardContent>
      {!accepted && (
        <CardFooter>
          <Button
            onClick={handleAccept}
            className="w-full"
            disabled={loading}
          >
            {loading ? "Accepting..." : "Accept Invitation"}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
