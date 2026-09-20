"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentSession } from "@/server/session";
import { withTransaction } from "@/server/db";
import {
  ProfileError,
  updateOwnProfile,
  leaveOwnCompany,
} from "@/server/profile-service";
export type ProfileState =
  { error?: string; message?: string; version?: string } | undefined;
function errorState(error: unknown): ProfileState {
  return {
    error:
      error instanceof ProfileError
        ? error.message
        : "처리하지 못했습니다. 새로고침 후 다시 시도하세요.",
  };
}
export async function saveProfileAction(
  _previous: ProfileState,
  form: FormData,
): Promise<ProfileState> {
  try {
    const session = await getCurrentSession();
    if (!session) throw new ProfileError("로그인이 필요합니다.");
    const version = await withTransaction((c) =>
      updateOwnProfile(c, session.user.id, {
        displayName: form.get("displayName"),
        phone: form.get("phone"),
        version: form.get("version"),
      }),
    );
    revalidatePath("/", "layout");
    return { message: "내 정보를 저장했습니다.", version };
  } catch (error) {
    return errorState(error);
  }
}
export async function leaveCompanyAction(
  _previous: ProfileState,
  form: FormData,
): Promise<ProfileState> {
  try {
    const session = await getCurrentSession();
    if (!session) throw new ProfileError("로그인이 필요합니다.");
    const id = z.string().uuid().parse(form.get("memberId"));
    if (form.get("confirm") !== "on")
      throw new ProfileError("소속 해제 안내를 확인해 주세요.");
    await withTransaction((c) => leaveOwnCompany(c, session.user.id, id));
    revalidatePath("/", "layout");
  } catch (error) {
    return errorState(error);
  }
  redirect("/my-page?left=1");
}
