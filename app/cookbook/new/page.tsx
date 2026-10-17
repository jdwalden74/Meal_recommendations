import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { RecipeForm } from "@/components/cookbook/RecipeForm";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { redirect } from "next/navigation";

export const metadata = { title: "New Recipe – NutriPlan" };

export default async function NewRecipePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login");

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="container mx-auto px-4 py-6 max-w-2xl">
        <Link
          href="/cookbook"
          className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors mb-5"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Cookbook
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">New recipe</h1>
        <RecipeForm />
      </div>
    </main>
  );
}
