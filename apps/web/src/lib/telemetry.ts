// The one way app code records a product event. The active edition decides whether it goes
// anywhere (DashDB Community: only after the user opts in, and it has no destination); props are
// checked against the catalogue in @dashdb/edition, so schema content and names never leave.
// Marketing pages load this lazily (`void import('@/lib/telemetry')`) to stay light.
import {
  sanitizeTelemetryEvent,
  type TelemetryEventName,
  type TelemetryEvents,
  type TelemetryProvider,
} from '@dashdb/edition';
import { edition } from '@/edition/active';

export function track<E extends TelemetryEventName>(
  event: E,
  props: TelemetryEvents[E],
  provider: TelemetryProvider = edition.providers.telemetry,
): void {
  const clean = sanitizeTelemetryEvent(event, props);
  if (!clean) return;
  try {
    provider.track(event, clean as TelemetryEvents[E]);
  } catch {
    // Telemetry never breaks the app.
  }
}
