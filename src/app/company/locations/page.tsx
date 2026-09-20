import { workSession, listLocationSuggestions } from "@/server/work-orders";
import { OrderShell } from "@/features/work-orders/order-shell";
import { LocationForm } from "@/features/ptw/forms";
import "@/features/profile/profile.css";
export default async function LocationsPage() {
  const { session, actor } = await workSession("/company/locations", true);
  const locations = await listLocationSuggestions(actor.companyId);
  return (
    <OrderShell session={session} title="장소관리">
      <h1>작업 장소관리</h1>
      <section className="account-panel">
        <h2>장소 등록</h2>
        <LocationForm />
      </section>
      <section className="account-panel">
        <h2>등록된 장소</h2>
        {locations.length ? (
          <ul>
            {locations.map((l) => (
              <li key={l.id}>{l.label}</li>
            ))}
          </ul>
        ) : (
          <p>장소를 등록하면 PTW 신청에서 선택할 수 있습니다.</p>
        )}
      </section>
    </OrderShell>
  );
}
