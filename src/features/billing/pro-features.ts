import type { LucideIcon } from "lucide-react";
import {
  BellRing,
  Camera,
  FolderOpen,
  FileBarChart2,
  History,
  MessageSquare,
  Smartphone,
} from "lucide-react";

export type ProFeature = {
  key: string;
  icon: LucideIcon;
  title: string;
  description: string;
  freeBehavior: string;
  proBehavior: string;
};

export const PRO_FEATURES: ProFeature[] = [
  {
    key: "sms-notification",
    icon: MessageSquare,
    title: "문자(SMS) 알림",
    description: "작업 배정·불량 조치 등 중요한 알림을 문자로 즉시 전달합니다.",
    freeBehavior: "메일 알림만",
    proBehavior: "메일 + 문자",
  },
  {
    key: "photo-attachment",
    icon: Camera,
    title: "사진 첨부",
    description:
      "표준서·점검·안전사고 기록에 사진을 첨부해 현장 상황을 그대로 남깁니다.",
    freeBehavior: "텍스트 기록만",
    proBehavior: "사진 첨부",
  },
  {
    key: "board",
    icon: FolderOpen,
    title: "공지·자료실 첨부와 푸시 알림",
    description:
      "공지사항·자료실 글에 사진·동영상을 넣고(회사당 1GB), 발행하면 구성원 기기로 푸시 알림을 보냅니다.",
    freeBehavior: "글자만 · 알림 없음",
    proBehavior: "사진·동영상 첨부 + 푸시 알림",
  },
  {
    key: "inspection-monitoring",
    icon: BellRing,
    title: "점검 모니터링 대시보드",
    description:
      "전체 작업의 TBM 확인·점검 결과·미조치 불량을 한 화면에서 확인합니다.",
    freeBehavior: "개별 지시서에서만 확인",
    proBehavior: "통합 대시보드",
  },
  {
    key: "inspection-report",
    icon: FileBarChart2,
    title: "점검 결과 보고서 출력",
    description:
      "월간·회차별 점검 결과를 인쇄용 보고서로 출력해 심사·감사에 대응합니다.",
    freeBehavior: "화면 열람만",
    proBehavior: "PDF·인쇄 보고서",
  },
  {
    key: "mobile-management",
    icon: Smartphone,
    title: "모바일 관리 업무",
    description:
      "외근·이동 중에도 표준서 열람·지시서/PTW 생성·점검 기록 관리를 할 수 있습니다.",
    freeBehavior: "모바일은 현장 기능만 (지시서 확인·TBM·점검)",
    proBehavior: "모바일에서 관리 업무 전체",
  },
  {
    key: "full-history",
    icon: History,
    title: "전체 기록 조회",
    description:
      "작업지시·점검 기록을 기간 제한 없이 조회해 반복 작업 복사·감사 대응에 활용합니다.",
    freeBehavior: "최근 1주일 (이전은 건수만 표시)",
    proBehavior: "보관 기간 전체",
  },
];
