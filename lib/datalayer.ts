import { ObjectId } from "mongodb";
import clientPromise from "./db";

export class DataLayer {
  private dbName = "meal-recommendation-dev";

  protected async getDb() {
    if (!clientPromise) {
      throw new Error("client is missing");
    }
    const client = await clientPromise;

    return client.db(this.dbName);
  }
}


export class UserData extends DataLayer {
  private collectionName = "users";

  private async getCollection() {
    const db = await this.getDb();
    return db.collection(this.collectionName);
  }
}