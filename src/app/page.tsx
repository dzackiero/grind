import { redirect } from "next/navigation";

// Today decides the rest: sign in → onboarding → today
export default function Home() {
  redirect("/today");
}
