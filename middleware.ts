import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/login",
  },
});

export const config = {
  // Define which routes to protect
  matcher: [
    "/play/:path*",
    "/dashboard/:path*",
    // Add other protected routes here
  ],
};
