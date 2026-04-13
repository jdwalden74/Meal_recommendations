import clientPromise from "./db";
import { User, UserPreferences, MealPlan, DayMeals, ChatMessage } from "./interfaces";

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
