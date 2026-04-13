import { UserData } from "@/lib/datalayer";

// GET /api/login?email=user@example.com
// Returns the user record for the given email, or 404 if not found.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email")?.trim();

    if (!email) {
      return Response.json(
        { error: "Query param 'email' is required." },
        { status: 400 }
      );
    }

    const userData = new UserData();
    const user = await userData.getUser(email);

    if (!user) {
      return Response.json({ error: "User not found." }, { status: 404 });
    }

    return Response.json(user);
  } catch (err) {
    console.error("[GET /api/login]", err);
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }
}

// POST /api/login
// Body: { fname, lname, email }
// This route exists as a utility for manual user creation if needed.
// In practice, users are created automatically via the NextAuth signIn
// callback when they authenticate with Google for the first time.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { fname, lname, email } = body ?? {};

    // ── Input validation ────────────────────────────────────────────────────
    const missing: string[] = [];
    if (!fname || typeof fname !== "string") missing.push("fname");
    if (!lname || typeof lname !== "string") missing.push("lname");
    if (!email || typeof email !== "string") missing.push("email");

    if (missing.length > 0) {
      return Response.json(
        { error: `Missing or invalid fields: ${missing.join(", ")}.` },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return Response.json(
        { error: "Provided email address is not valid." },
        { status: 400 }
      );
    }

    // ── Duplicate check ─────────────────────────────────────────────────────
    const userData = new UserData();
    const existing = await userData.getUser(email.toLowerCase().trim());
    if (existing) {
      return Response.json(
        { error: "An account with this email already exists." },
        { status: 409 }
      );
    }

    // ── Create ──────────────────────────────────────────────────────────────
    const result = await userData.createUser({
      fname: fname.trim(),
      lname: lname.trim(),
      email: email.toLowerCase().trim(),
    });

    return Response.json({ insertedId: result.insertedId }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/login]", err);
    return Response.json({ error: "Internal server error." }, { status: 500 });
  }
}
