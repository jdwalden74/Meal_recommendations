"use client"

import AuthButton from "@/components/auth/AuthButton";

export default function Login() {
  return (
    <div className="flex flex-col gap-4 items-center justify-center min-h-screen py-2">
      <h1 className="text-2xl font-bold mb-4">Login</h1>
      <AuthButton provider="google" />
      <AuthButton provider="anonymous" />
    </div>
  );
}