// Re-mounts on every dashboard navigation, so each page fades in. CSS only: no extra requests.
export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>
}
