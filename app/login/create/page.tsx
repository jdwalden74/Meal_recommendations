import { redirect } from "next/navigation";

// Account creation is handled automatically by Google OAuth.
// Anyone who lands here gets sent to the login page instead.
export default function CreateAccountPage() {
  redirect("/login");
}
