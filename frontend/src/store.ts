// Zustand store — client UI state (NOT server data, that's TanStack Query)
// Pattern: cc-skill-backend-patterns + react-state-management skill

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
  action?: { label: string; onClick: () => void }
  duration?: number
}

interface AppState {
  // Selected email/account
  selectedAccountId: string | null
  selectedEmailId: string | null
  selectedFolder: 'inbox' | 'sent' | 'drafts' | 'trash' | 'archive'

  // UI state
  composerOpen: boolean
  composerReplyToId: string | null
  commandPaletteOpen: boolean
  shortcutsOverlayOpen: boolean
  sidebarOpen: boolean // Mobile

  // Toasts
  toasts: Toast[]

  // Actions
  setAccount: (id: string) => void
  setEmail: (id: string | null) => void
  setFolder: (folder: AppState['selectedFolder']) => void
  openComposer: (replyToId?: string) => void
  closeComposer: () => void
  toggleCommandPalette: () => void
  toggleShortcuts: () => void
  toggleSidebar: () => void
  addToast: (message: string, type: Toast['type'], action?: Toast['action'], duration?: number) => void
  removeToast: (id: string) => void
}

export const useAppStore = create<AppState>()(
  devtools(
    (set, get) => ({
      selectedAccountId: null,
      selectedEmailId: null,
      selectedFolder: 'inbox',
      composerOpen: false,
      composerReplyToId: null,
      commandPaletteOpen: false,
      shortcutsOverlayOpen: false,
      sidebarOpen: false,
      toasts: [],

      setAccount: (id) => set({ selectedAccountId: id, selectedEmailId: null }),
      setEmail: (id) => set({ selectedEmailId: id }),
      setFolder: (folder) => set({ selectedFolder: folder, selectedEmailId: null }),
      openComposer: (replyToId) =>
        set({ composerOpen: true, composerReplyToId: replyToId ?? null }),
      closeComposer: () => set({ composerOpen: false, composerReplyToId: null }),
      toggleCommandPalette: () => set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),
      toggleShortcuts: () => set((s) => ({ shortcutsOverlayOpen: !s.shortcutsOverlayOpen })),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

      addToast: (message, type, action, duration = 4000) => {
        const id = crypto.randomUUID()
        set((s) => ({ toasts: [...s.toasts, { id, message, type, action, duration }] }))
        setTimeout(() => get().removeToast(id), duration)
      },
      removeToast: (id) =>
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    }),
    { name: 'resend-client' }
  )
)
