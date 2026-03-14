import { MeetingRoom } from "@/components/meeting-room";
import { getServerLocale } from "@/lib/i18n/server";

export default function MeetingPage() {
  const locale = getServerLocale();

  return <MeetingRoom locale={locale} settingsHref="/settings" />;
}
