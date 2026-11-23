import { redirect } from "next/navigation";

import { DEFAULT_NEXT } from "@/server/auth";
import { currentUser } from "@/server/session";

export default async function HomePage() {
  redirect((await currentUser()) ? DEFAULT_NEXT : "/sign-in");
}
