import clientPromise from "@/lib/db";

export async function GET() {
    const client = await clientPromise;
    const db = client.db("meal-recommendation-dev");
    const users = await db.collection("users").find({}).toArray();
    return Response.json(users);
}