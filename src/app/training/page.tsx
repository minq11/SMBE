import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { HelpDialog } from "@/components/ui/help-dialog";
import { workSession } from "@/server/work-orders";
import { withTransaction } from "@/server/db";
import { listTrainingSessions, trainingOverview } from "@/server/training";
import { PeopleTable } from "@/features/training/people-table";
import { TrainingListView } from "@/features/training/list-view";
import { TbmSetting } from "@/features/training/tbm-setting";
import { halfLabelOf } from "@/features/training/model";

/**
 * 안전보건교육 (산안법 29조). 숫자 셋 → 사람별 현황(누가 무엇이 필요한가) → 교육 기록.
 * 감독관이 "교육 명부 보여 주세요" 에 이 화면과 인쇄물로 답한다.
 */
export default async function TrainingPage() {
  const { actor } = await workSession("/training", true);
  const { overview, sessions } = await withTransaction(async (c) => ({
    overview: await trainingOverview(c, actor),
    sessions: await listTrainingSessions(c, actor),
  }));
  return (
    <>
      <PageHeader
        title="안전보건교육"
        actions={
          <Link href="/training/new" className="btn-primary">
            <Plus size={15} /> 교육 등록
          </Link>
        }
      />
      <div className="asmt-tiles" aria-label="현황">
        <div
          className={`asmt-tile${overview.regularShortCount > 0 ? " is-alert" : ""}`}
        >
          <strong>{overview.regularShortCount}명</strong>
          <small>
            {overview.year}년 {halfLabelOf(overview.half)} 정기교육 부족
          </small>
        </div>
        <div
          className={`asmt-tile${overview.hireMissingCount > 0 ? " is-alert" : ""}`}
        >
          <strong>{overview.hireMissingCount}명</strong>
          <small>채용 시 교육 필요</small>
        </div>
        <div
          className={`asmt-tile${overview.specialCheckCount > 0 ? " is-alert" : ""}`}
        >
          <strong>{overview.specialCheckCount}명</strong>
          <small>특별교육 확인</small>
        </div>
      </div>

      <section className="policy-card policy-fields" aria-label="사람별 현황">
        <div className="training-head-row">
          <div className="wo-section-head">
            <h2>사람별 현황</h2>
            <HelpDialog title="사람별 현황" variant="icon">
              <dl className="help-rows">
                <dt>채용 시</dt>
                <dd>
                  1년 안에 들어온 사람에게 채용 시 교육 기록이 없으면 필요.
                </dd>
                <dt>정기</dt>
                <dd>
                  이 반기 정기교육 시간 + TBM 산입 시간. 작업자 12시간,
                  관리감독자 8시간(연 16시간) 기준으로 모자라면 빨갛게.
                </dd>
                <dt>특별</dt>
                <dd>
                  최근 1년 PTW 작업에 배정됐는데 특별교육 기록이 없으면 확인.
                </dd>
              </dl>
            </HelpDialog>
          </div>
          <TbmSetting minutes={overview.tbmMinutes} />
        </div>
        <PeopleTable
          people={overview.people}
          tbmMinutes={overview.tbmMinutes}
        />
      </section>

      <section className="stack" aria-label="교육 기록">
        <h2 className="training-list-title">교육 기록</h2>
        <TrainingListView items={sessions} />
      </section>
    </>
  );
}
