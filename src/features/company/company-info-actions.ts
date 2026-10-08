"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/session";
import { withTransaction } from "@/server/db";
import { updateCompanyInfo } from "@/server/company-settings";
import { WorkOrderError } from "@/features/work-orders/model";

export type CompanyInfoState = { error?: string } | undefined;

/** 회사 정보 저장. 저장하면 보기 화면(`/company`)으로 돌아간다 (헌법 5장). */
export async function updateCompanyInfoAction(
  _prev: CompanyInfoState,
  form: FormData,
): Promise<CompanyInfoState> {
  try {
    const session = await getCurrentSession();
    if (!session?.membership || session.membership.status !== "ACTIVE")
      throw new WorkOrderError("로그인과 회사 소속을 확인하세요.");
    const text = (key: string) => {
      const v = form.get(key);
      return typeof v === "string" ? v : "";
    };
    await withTransaction((c) =>
      updateCompanyInfo(
        c,
        { companyId: session.membership!.company_id, userId: session.user.id },
        {
          name: text("name"),
          business_type: text("business_type"),
          initial_employee_size_band: text("initial_employee_size_band"),
          business_start_date: text("business_start_date"),
          expected_annual_revenue_manwon: text("expected_annual_revenue_manwon"),
          company_code: text("company_code"),
          version: text("version"),
        },
      ),
    );
  } catch (error) {
    if (error instanceof WorkOrderError) return { error: error.message };
    throw error;
  }
  // 회사명은 사이드바 회사 카드에도 나온다 — 모든 화면을 다시 그린다.
  revalidatePath("/", "layout");
  redirect("/company?saved=1");
}
