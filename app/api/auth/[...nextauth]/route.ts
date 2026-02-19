import NextAuth from "next-auth"
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { v4 as uuidv4 } from "uuid";
import { MongoDBAdapter } from "@next-auth/mongodb-adapter";
import clientPromise from "@/lib/db";

const authOptions = {
  adapter: MongoDBAdapter(clientPromise),
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID ?? "",
      clientSecret: process.env.AUTH_GOOGLE_SECRET ?? "",
    }),
    Credentials({
      id: "anonymous",
      name: "anonymous",
      credentials: {},
      async authorize() {
        return {
          id: uuidv4(),
          name: "Guest",
          email: `guest-${uuidv4()}@example.com`,
          image: "https://www.svgrepo.com/show/508699/landscape-placeholder.svg",
        };
      },
    }),
  ],
};

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }