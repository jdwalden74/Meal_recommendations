import clientPromise from "@/lib/db";
import { UserData } from "@/lib/datalayer";

//Get all users
export async function GET() {
    const client = await clientPromise;
    const db = client.db("meal-recommendation-dev");
    const users = await db.collection("users").find({}).toArray();
    return Response.json(users);
}

//Create a user
export async function POST(request: Request) {

    const body = await request.json();
    const userData = new UserData();
    const user = await userData.createUser(body);
    return Response.json(user);
}
