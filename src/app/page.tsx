import { Dashboard } from "@/features/dashboard/dashboard";
import { connection } from "next/server";
export default async function Home() {
  await connection();
  const date = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date());
  return <Dashboard date={date} />;
}
