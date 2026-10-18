export function KeycloakLogin({ upstreamPending = false }: { upstreamPending?: boolean }) {
  const message = upstreamPending ? 'Signed out of this admin app. Identity-provider sign-out could not be confirmed; your single sign-on session may remain active.' : ''
  return <main className="flex min-h-screen items-center justify-center bg-background p-8">
    <section className="max-w-md space-y-6 rounded-2xl border bg-card p-8">
      <h1 className="text-2xl font-semibold">Admin Login</h1>
      <p>Continue to the House of Diams identity service to sign in.</p>
      {message && <p role="status">{message}</p>}
      <form action="/api/auth/login" method="post">
        <button className="rounded-lg bg-primary px-4 py-3 text-white">Continue to secure sign-in</button>
      </form>
    </section>
  </main>
}
