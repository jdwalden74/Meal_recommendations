"use client";

import AuthButton from "@/components/auth/AuthButton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import ParticlesBackground from "@/components/styling/ParticleEffect";

export default function Login() {
  return (
    <div className="flex flex-col gap-4 items-center justify-center min-h-screen py-2">
      <ParticlesBackground count={100} />
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Welcome to NutriPlan</CardTitle>
          <CardDescription>
            Sign in with your Google account to get started.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AuthButton />
        </CardContent>
      </Card>
    </div>
  );
}
