import { OfflineSyncIndicator } from "../components/apiary/OfflineSyncIndicator";

export default function ApiariesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <OfflineSyncIndicator />
      {children}
    </div>
  );
}
