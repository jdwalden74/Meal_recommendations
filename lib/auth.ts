import Google from "next-auth/providers/google";
import { NextAuthOptions } from "next-auth";
import { UserData } from "./datalayer";

export const authOptions: NextAuthOptions = {
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID ?? "",
      clientSecret: process.env.AUTH_GOOGLE_SECRET ?? "",
    }),
  ],

  session: {
    strategy: "jwt",
  },

  secret: process.env.NEXTAUTH_SECRET,

  callbacks: {
    /**
     * Auto-create a user record in our DB the first time someone signs in
     * with Google, so the rest of the app can reference them by email.
     */
    async signIn({ user, account }) {
      if (account?.provider === "google" && user.email) {
        try {
          const userData = new UserData();
          const existing = await userData.getUser(user.email);

          if (!existing) {
            const nameParts = (user.name ?? "").split(" ");
            await userData.createUser({
              fname: nameParts[0] ?? "",
              lname: nameParts.slice(1).join(" ") ?? "",
              email: user.email,
            });
          }
        } catch (err) {
          console.error("[auth signIn callback]", err);
          // Don't block sign-in if the DB write fails — JWT still works
        }
      }
      return true;
    },

    async jwt({ token, user }) {
      if (user) {
        token.email = user.email;
        token.name = user.name;
        token.picture = user.image;
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.email = token.email as string;
        session.user.name = token.name as string;
        session.user.image = token.picture as string;
      }
      return session;
    },
  },

  pages: {
    signIn: "/login",
    error: "/login",
  },
};
