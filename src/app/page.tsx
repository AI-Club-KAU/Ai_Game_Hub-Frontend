import { AccessScreen } from "@/features/access/access-screen";
import { SessionBoundary } from "@/features/access/session-renewal";
export default function Home() { return <SessionBoundary><AccessScreen /></SessionBoundary>; }
