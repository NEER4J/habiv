import { Suspense } from "react";
import { HomeView } from "@/components/habiv/home-view";
import { loadHome } from "@/lib/habiv/page-data";

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <Home />
    </Suspense>
  );
}

async function Home() {
  const data = await loadHome();
  return <HomeView data={data} />;
}
