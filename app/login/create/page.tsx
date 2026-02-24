"use client"
import { motion } from "motion/react";
import { signIn} from "next-auth/react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import axios from "axios";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import ParticlesBackground from "@/components/styling/ParticleEffect";

export default function CreateAccountPage() {

    const [fname, setFname] = useState("");
    const [lname, setLname] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    // function to create an account
    async function createAccount(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        try {
            const response = await axios.post("/api/login/create", {
            fname,
            lname,
            email,
            password,
        });
            console.log(response);

        } catch (error) {
            console.log(error);
        }
    }


    return (
       <div className="flex flex-col gap-4 items-center justify-center min-h-screen py-2">
      <ParticlesBackground count={100}/>
      <Card>
        <CardHeader>
          <CardTitle>Login</CardTitle>
          <CardDescription>Login to your account</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={createAccount} className="space-y-4 max-w-md mx-auto">
  
            {/* First + Last Name */}
            <div className="grid grid-cols-2 gap-4">
                <div>
                <label className="block text-sm font-medium">First Name</label>
                <input
                    type="text"
                    name="firstName"
                    required
                    className="w-full border rounded-md p-2"
                />
                </div>

                <div>
                <label className="block text-sm font-medium">Last Name</label>
                <input
                    type="text"
                    name="lastName"
                    required
                    className="w-full border rounded-md p-2"
                />
                </div>
            </div>

            {/* Email */}
            <div>
                <label className="block text-sm font-medium">Email</label>
                <input
                type="email"
                name="email"
                required
                pattern="^[^\s@]+@[^\s@]+\.[^\s@]+$"
                className="w-full border rounded-md p-2"
                />
            </div>

            {/* Password */}
            <div>
                <label className="block text-sm font-medium">Password</label>
                <input
                type="password"
                name="password"
                required
                minLength={8}
                className="w-full border rounded-md p-2"
                />
            </div>

            <button
                type="submit"
                className="w-full bg-black text-white py-2 rounded-md"
            >
                Create Account
            </button>
            </form>

        </CardContent>
      </Card>
    </div>
    );
}