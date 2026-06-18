import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Sidebar from './components/Sidebar'
import EmailList from './components/EmailList'
import ReadingPane from './components/ReadingPane'
import Composer from './components/Composer'
import { ShortcutsOverlay, useKeyboardShortcuts } from './components/Shortcuts'
import { useAppStore } from './store'
import { useAuth } from './queries'
import LoginPage from './pages/Login'
import SettingsPanel from './components/SettingsPanel'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

function AppShell() {
  useKeyboardShortcuts()
  const composerOpen = useAppStore((s) => s.composerOpen)
  const composerReplyToId = useAppStore((s) => s.composerReplyToId)
  const selectedAccountId = useAppStore((s) => s.selectedAccountId)
  const toasts = useAppStore((s) => s.toasts)
  const removeToast = useAppStore((s) => s.removeToast)

  // Auth guard
  const auth = useAuth()
  if (auth.isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-base)' }}>
        <div style={{
          width: 40, height: 40,
          border: '3px solid var(--border)',
          borderTopColor: 'var(--accent)',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (auth.isError || !auth.data) {
    return <LoginPage />
  }

  const isSettingsView = window.location.pathname === '/settings'

  return (
    <>
      <div className="app-shell">
        <Sidebar />
        {isSettingsView ? <SettingsPanel /> : (
          <>
            <EmailList />
            <ReadingPane />
          </>
        )}
      </div>

      {/* Composer */}
      {composerOpen && selectedAccountId && (
        <Composer
          accountId={selectedAccountId}
          replyToEmailId={composerReplyToId}
        />
      )}

      {/* Shortcuts overlay */}
      <ShortcutsOverlay />

      {/* Toast notifications */}
      <div className="toast-container" aria-live="polite" role="status">
        {toasts.map((toast) => (
          <div key={toast.id} className="toast">
            <span>
              {toast.type === 'success' ? '✅' : toast.type === 'error' ? '❌' : 'ℹ️'}
            </span>
            {toast.message}
            {toast.action && (
              <button
                onClick={toast.action.onClick}
                style={{
                  marginLeft: 8, background: 'none', border: '1px solid var(--border)',
                  borderRadius: 6, color: 'var(--accent-light)', cursor: 'pointer',
                  fontSize: 12, padding: '2px 8px', fontFamily: 'inherit',
                }}
              >
                {toast.action.label}
              </button>
            )}
            <button
              onClick={() => removeToast(toast.id)}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16 }}
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppShell />
    </QueryClientProvider>
  )
}
