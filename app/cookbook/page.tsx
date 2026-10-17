import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { RecipeData } from "@/lib/datalayer";
import { CookbookTOC } from "@/components/cookbook/CookbookTOC";
import Link from "next/link";
import { Plus } from "lucide-react";
import { redirect } from "next/navigation";

export const metadata = { title: "Cookbook – NutriPlan" };

export default async function CookbookPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login");

  const data = new RecipeData();
  const recipes = await data.getRecipes(session.user.email);

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="container mx-auto px-4 py-6 max-w-5xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">My Cookbook</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {recipes.length} {recipes.length === 1 ? "recipe" : "recipes"}
            </p>
          </div>
          <Link
            href="/cookbook/new"
            className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
          >
            <Plus className="w-4 h-4" />
            New recipe
          </Link>
        </div>

        <CookbookTOC initialRecipes={recipes} />
      </div>
    </main>
  );
}
