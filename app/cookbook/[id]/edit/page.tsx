import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { RecipeData } from "@/lib/datalayer";
import { RecipeForm } from "@/components/cookbook/RecipeForm";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";

export const metadata = { title: "Edit Recipe – NutriPlan" };

export default async function EditRecipePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login");

  const { id } = await params;
  const data = new RecipeData();
  const recipe = await data.getRecipe(session.user.email, id);
  if (!recipe) notFound();

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="container mx-auto px-4 py-6 max-w-2xl">
        <Link
          href={`/cookbook/${id}`}
          className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors mb-5"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to recipe
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Edit recipe</h1>
        <RecipeForm
          recipeId={id}
          initialData={{
            title: recipe.title,
            photoUrl: recipe.photoUrl,
            ingredients: recipe.ingredients,
            steps: recipe.steps,
            servings: recipe.servings,
            macros: recipe.macros,
            tags: recipe.tags,
            notes: recipe.notes ?? "",
          }}
        />
      </div>
    </main>
  );
}
