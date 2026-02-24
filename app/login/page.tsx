"use client"

import AuthButton from "@/components/auth/AuthButton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ParticlesBackground from "@/components/styling/ParticleEffect";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function Login() {
  return (
    <div className="flex flex-col gap-4 items-center justify-center min-h-screen py-2">
      <ParticlesBackground count={100}/>
      <Card>
        <CardHeader>
          <div className="flex flex-row space-between">
            <CardTitle>Login</CardTitle>
            <Link href="/login/create" className="text-sm underline-offset-4 hover:underline">Create an account</Link>
          </div>
        </CardHeader>
        <CardContent>
          <form>
          <div className="flex flex-col gap-6 mb-6">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="m@example.com"
                required
              />
            </div>
            <div className="grid gap-2">
              <div className="flex items-center">
                <Label htmlFor="password">Password</Label>
                <a
                  href="#"
                  className="ml-auto inline-block text-sm underline-offset-4 hover:underline"
                >
                  Forgot your password?
                </a>
              </div>
              <Input id="password" type="password" required />
            </div>
          </div>
        </form>
          <div className="flex flex-col gap-4">
            <AuthButton provider="google" />
            <AuthButton provider="anonymous" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}