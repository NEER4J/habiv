import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAdminContext, listCategoriesAdmin } from "@/lib/db/admin";
import { PageHeader } from "@/components/admin/chrome";
import { Empty } from "@/components/admin/table";
import { CategoryEditor } from "@/components/admin/category-editor";

export default function CategoriesPage() {
  return (
    <Suspense fallback={<PageHeader title="Categories" />}>
      <Categories />
    </Suspense>
  );
}

async function Categories() {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/");
  const categories = await listCategoriesAdmin(ctx);
  return (
    <>
      <PageHeader title="Categories" count={categories.length} />
      {categories.length === 0 && <Empty>No categories yet — add one below.</Empty>}
      <CategoryEditor categories={categories} />
    </>
  );
}
