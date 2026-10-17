import clientPromise from "./db";
import { User, UserPreferences, MealPlan, DayMeals, ChatMessage, MealRating, Recipe, ShoppingList } from "./interfaces";

// ─── Base ──────────────────────────────────────────────────────────────────────

class DataLayer {
  private dbName = "meal-recommendation-dev";

  protected async getDb() {
    if (!clientPromise) {
      throw new Error("MongoDB client is missing");
    }
    const client = await clientPromise;
    return client.db(this.dbName);
  }
}

// ─── Users ─────────────────────────────────────────────────────────────────────

export class UserData extends DataLayer {
  private collectionName = "users";

  private async getCollection() {
    const db = await this.getDb();
    return db.collection<User>(this.collectionName);
  }

  public async createUser(user: User) {
    const collection = await this.getCollection();
    return collection.insertOne(user);
  }

  public async getUser(email: string) {
    const collection = await this.getCollection();
    return collection.findOne({ email });
  }
}

// ─── User Preferences ──────────────────────────────────────────────────────────

export class UserPreferencesData extends DataLayer {
  private collectionName = "userPreferences";

  private async getCollection() {
    const db = await this.getDb();
    return db.collection<UserPreferences>(this.collectionName);
  }

  public async getPreferences(userId: string) {
    const collection = await this.getCollection();
    return collection.findOne({ userId });
  }

  /**
   * Creates preferences for a user if none exist, or fully replaces them.
   * The userId and updatedAt are always set server-side.
   */
  public async upsertPreferences(
    userId: string,
    preferences: Omit<UserPreferences, "_id" | "userId" | "updatedAt">
  ) {
    const collection = await this.getCollection();
    return collection.findOneAndUpdate(
      { userId },
      {
        $set: {
          ...preferences,
          userId,
          updatedAt: new Date(),
        },
      },
      { upsert: true, returnDocument: "after" }
    );
  }
}

// ─── Meal Plans ────────────────────────────────────────────────────────────────

export class MealPlanData extends DataLayer {
  private collectionName = "mealPlans";

  private async getCollection() {
    const db = await this.getDb();
    return db.collection<MealPlan>(this.collectionName);
  }

  /** Retrieve the meal plan for a specific week. */
  public async getMealPlan(userId: string, weekStartDate: string) {
    const collection = await this.getCollection();
    return collection.findOne({ userId, weekStartDate });
  }

  /** Retrieve all meal plans for a user, newest first. */
  public async getUserMealPlans(userId: string) {
    const collection = await this.getCollection();
    return collection.find({ userId }).sort({ weekStartDate: -1 }).toArray();
  }

  /**
   * Create a brand-new meal plan for a week.
   * Will reject if a plan for that (userId, weekStartDate) already exists.
   */
  public async createMealPlan(plan: Omit<MealPlan, "_id" | "createdAt" | "updatedAt">) {
    const collection = await this.getCollection();
    const now = new Date();
    return collection.insertOne({ ...plan, createdAt: now, updatedAt: now });
  }

  /**
   * Replace the days array of an existing meal plan.
   * Used when the LLM proposes changes that need to be persisted.
   */
  public async updateMealPlanDays(
    userId: string,
    weekStartDate: string,
    days: DayMeals[]
  ) {
    const collection = await this.getCollection();
    return collection.findOneAndUpdate(
      { userId, weekStartDate },
      { $set: { days, updatedAt: new Date() } },
      { returnDocument: "after" }
    );
  }

  /**
   * Insert or replace a single day within a week's meal plan.
   * If the week plan doesn't exist yet, creates it with just this one day.
   * Used by the PATCH endpoint so LLM actions can target a single day.
   */
  public async upsertDay(userId: string, weekStartDate: string, day: DayMeals) {
    const collection = await this.getCollection();
    const existing = await collection.findOne({ userId, weekStartDate });

    if (!existing) {
      const now = new Date();
      return collection.insertOne({
        userId,
        weekStartDate,
        days: [day],
        createdAt: now,
        updatedAt: now,
      });
    }

    // Replace the matching date entry or append if not present
    const dayExists = existing.days.some((d) => d.date === day.date);
    const updatedDays = dayExists
      ? existing.days.map((d) => (d.date === day.date ? day : d))
      : [...existing.days, day];

    return collection.findOneAndUpdate(
      { userId, weekStartDate },
      { $set: { days: updatedDays, updatedAt: new Date() } },
      { returnDocument: "after" }
    );
  }
}

// ─── Chat History ──────────────────────────────────────────────────────────────

export class ChatHistoryData extends DataLayer {
  private collectionName = "chatHistory";

  private async getCollection() {
    const db = await this.getDb();
    return db.collection<ChatMessage>(this.collectionName);
  }

  /**
   * Fetch the most recent messages for a user (ascending order for LLM context).
   * Default limit keeps context windows manageable.
   */
  public async getHistory(userId: string, limit = 50) {
    const collection = await this.getCollection();
    return collection
      .find({ userId })
      .sort({ timestamp: 1 })
      .limit(limit)
      .toArray();
  }

  /** Append a single message to the conversation history. */
  public async addMessage(message: Omit<ChatMessage, "_id" | "timestamp">) {
    const collection = await this.getCollection();
    return collection.insertOne({ ...message, timestamp: new Date() });
  }

  /** Wipe the full conversation history for a user (e.g. "start over"). */
  public async clearHistory(userId: string) {
    const collection = await this.getCollection();
    return collection.deleteMany({ userId });
  }
}

// ─── Meal Ratings ──────────────────────────────────────────────────────────────

export class MealRatingData extends DataLayer {
  private collectionName = "mealRatings";

  private async getCollection() {
    const db = await this.getDb();
    return db.collection<MealRating>(this.collectionName);
  }

  /** Insert or replace a rating for a (userId, mealId) pair. */
  public async addRating(rating: MealRating) {
    const collection = await this.getCollection();
    return collection.findOneAndUpdate(
      { userId: rating.userId, mealId: rating.mealId },
      { $set: { ...rating, ratedAt: new Date() } },
      { upsert: true, returnDocument: "after" }
    );
  }

  /** Return the most recent ratings for a user, newest first. */
  public async getRecentRatings(userId: string, limit = 30) {
    const collection = await this.getCollection();
    return collection
      .find({ userId })
      .sort({ ratedAt: -1 })
      .limit(limit)
      .toArray();
  }

  /** Return the mean rating across all ratings for a specific meal. */
  public async getAverageRating(userId: string, mealId: string) {
    const collection = await this.getCollection();
    const result = await collection
      .aggregate<{ avg: number }>([
        { $match: { userId, mealId } },
        { $group: { _id: null, avg: { $avg: "$rating" } } },
      ])
      .toArray();
    return result[0]?.avg ?? null;
  }
}

// ─── Recipes ───────────────────────────────────────────────────────────────────

export class RecipeData extends DataLayer {
  private collectionName = "recipes";

  private async getCollection() {
    const db = await this.getDb();
    return db.collection<Recipe>(this.collectionName);
  }

  /** List all recipes for a user with optional search/tag/favorites filtering. */
  public async getRecipes(
    userId: string,
    opts: { search?: string; tag?: string; favoritesOnly?: boolean } = {}
  ) {
    const collection = await this.getCollection();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter: Record<string, any> = { userId };
    if (opts.favoritesOnly) filter.isFavorite = true;
    if (opts.tag) filter.tags = opts.tag;
    if (opts.search) filter.title = { $regex: opts.search, $options: "i" };
    return collection.find(filter).sort({ createdAt: -1 }).toArray();
  }

  /** Fetch a single recipe by id, scoped to the user. */
  public async getRecipe(userId: string, id: string) {
    const { ObjectId } = await import("mongodb");
    const collection = await this.getCollection();
    return collection.findOne({ userId, _id: new ObjectId(id) });
  }

  /** Create a new recipe. */
  public async createRecipe(recipe: Omit<Recipe, "_id" | "createdAt" | "updatedAt">) {
    const collection = await this.getCollection();
    const now = new Date();
    return collection.insertOne({ ...recipe, createdAt: now, updatedAt: now });
  }

  /** Replace all mutable fields of a recipe. */
  public async updateRecipe(
    userId: string,
    id: string,
    updates: Partial<Omit<Recipe, "_id" | "userId" | "createdAt">>
  ) {
    const { ObjectId } = await import("mongodb");
    const collection = await this.getCollection();
    return collection.findOneAndUpdate(
      { userId, _id: new ObjectId(id) },
      { $set: { ...updates, updatedAt: new Date() } },
      { returnDocument: "after" }
    );
  }

  /** Delete a recipe, ensuring it belongs to the user. */
  public async deleteRecipe(userId: string, id: string) {
    const { ObjectId } = await import("mongodb");
    const collection = await this.getCollection();
    return collection.deleteOne({ userId, _id: new ObjectId(id) });
  }
}

// ─── Shopping Lists ────────────────────────────────────────────────────────────

export class ShoppingListData extends DataLayer {
  private collectionName = "shoppingLists";

  private async getCollection() {
    const db = await this.getDb();
    return db.collection<ShoppingList>(this.collectionName);
  }

  /** List all shopping lists for a user, newest first. */
  public async getLists(userId: string) {
    const collection = await this.getCollection();
    return collection.find({ userId }).sort({ createdAt: -1 }).toArray();
  }

  /** Fetch a single shopping list by id, scoped to the user. */
  public async getList(userId: string, id: string) {
    const { ObjectId } = await import("mongodb");
    const collection = await this.getCollection();
    return collection.findOne({ userId, _id: new ObjectId(id) });
  }

  /** Create a new shopping list. */
  public async createList(list: Omit<ShoppingList, "_id" | "createdAt" | "updatedAt">) {
    const collection = await this.getCollection();
    const now = new Date();
    return collection.insertOne({ ...list, createdAt: now, updatedAt: now });
  }

  /** Update a shopping list's name or items. */
  public async updateList(
    userId: string,
    id: string,
    updates: Partial<Pick<ShoppingList, "name" | "items">>
  ) {
    const { ObjectId } = await import("mongodb");
    const collection = await this.getCollection();
    return collection.findOneAndUpdate(
      { userId, _id: new ObjectId(id) },
      { $set: { ...updates, updatedAt: new Date() } },
      { returnDocument: "after" }
    );
  }

  /** Delete a shopping list. */
  public async deleteList(userId: string, id: string) {
    const { ObjectId } = await import("mongodb");
    const collection = await this.getCollection();
    return collection.deleteOne({ userId, _id: new ObjectId(id) });
  }
}
