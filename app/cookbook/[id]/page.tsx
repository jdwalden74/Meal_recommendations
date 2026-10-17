import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { RecipeData } from "@/lib/datalayer";
import { RecipeBook } from "@/components/cookbook/RecipeBook";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";

export default async function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login");

  const { id } = await params;
  const data = new RecipeData();

  // Load all recipes so the book can swipe between them
  const recipes = await data.getRecipes(session.user.email);
  const index = recipes.findIndex((r) => String(r._id) === id);
  if (index === -1) notFound();

  return (
    <main className="min-h-screen bg-white dark:bg-slate-950">
      <div className="sticky top-16 z-10 bg-white/80 dark:bg-slate-950/80 backdrop-blur-sm border-b border-slate-100 dark:border-slate-800 px-4 py-2">
        <Link
          href="/cookbook"
          className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          All recipes
        </Link>
      </div>

      <RecipeBook recipes={recipes} initialIndex={index} />
    </main>
  );
}
