import { ObjectId } from "mongodb";
import clientPromise from "./db";
import { User } from "./interfaces";

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
  private collectionName = "user";

  private async getCollection() {
    const db = await this.getDb();
    return db.collection(this.collectionName);
  }

  public async createUser(user: User) {
    const collection = await this.getCollection();
    const result = await collection.insertOne(user);
    return result;
  }

  public async getUser(email: string) {
    const collection = await this.getCollection();
    const result = await collection.findOne({ email });
    return result;
  }

}