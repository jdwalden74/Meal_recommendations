import { ObjectId } from "mongodb";

export interface Attempt {
  guess: string;
  similarityScore: number;
}

export interface UserGameDataRecord {
  _id?: ObjectId;
  // metadata will be generated server side
  metadata: {
    date: string | null;
    user: string | null;
  };
  consensusId: ObjectId | null | undefined;
  attempts: Attempt[];
  highestSimilarityScore: number | null;
}

export interface User {
    _id?: ObjectId;
    fname: string;
    lname: string;
    email: string;
    password: string;
}