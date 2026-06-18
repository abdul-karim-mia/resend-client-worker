import { useEffect } from 'react'
import { useAppStore } from '../store'

/**
 * Global keyboard shortcuts hook
 * Shortcuts:
 * - C        → Open composer
 * - R        → Reply to selected email
 * - E        → Archive
 * - #        → Trash
 * - U        → Mark unread
 * - /        → Focus search (future)
 * - Cmd+K    → Command palette
 * - ?        → Shortcuts overlay
 * - Esc      → Close modals
 * - J/K      → Next/prev email (future)
 */
export function useKeyboardShortcuts() {
  const openComposer = useAppStore((s) => s.openComposer)
  const closeComposer = useAppStore((s) => s.closeComposer)
  const composerOpen = useAppStore((s) => s.composerOpen)
  const selectedEmailId = useAppStore((s) => s.selectedEmailId)
  const toggleCommandPalette = useAppStore((s) => s.toggleCommandPalette)
  const toggleShortcuts = useAppStore((s) => s.toggleShortcuts)
  const commandPaletteOpen = useAppStore((s) => s.commandPaletteOpen)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't fire in inputs/textareas/TipTap
      const target = e.target as HTMLElement
      const isEditing = target.tagName === 'INPUT'
        || target.tagName === 'TEXTAREA'
        || target.isContentEditable
        || target.closest('.ProseMirror')

      if (isEditing) {
        if (e.key === 'Escape') closeComposer()
        return
      }

      if (e.metaKey || e.ctrlKey) {
        if (e.key === 'k') { e.preventDefault(); toggleCommandPalette(); return }
      }

      switch (e.key) {
        case 'c': case 'C': openComposer(); break
        case 'r': case 'R': if (selectedEmailId) openComposer(selectedEmailId); break
        case '?': toggleShortcuts(); break
        case 'Escape':
          if (composerOpen) closeComposer()
          if (commandPaletteOpen) toggleCommandPalette()
          break
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [composerOpen, commandPaletteOpen, selectedEmailId])
}

export function ShortcutsOverlay() {
  const open = useAppStore((s) => s.shortcutsOverlayOpen)
  const toggle = useAppStore((s) => s.toggleShortcuts)

  if (!open) return null

  const shortcuts = [
    { key: 'C', desc: 'Compose new email' },
    { key: 'R', desc: 'Reply to selected email' },
    { key: 'E', desc: 'Archive' },
    { key: '#', desc: 'Move to trash' },
    { key: 'U', desc: 'Toggle read/unread' },
    { key: '/', desc: 'Focus search' },
    { key: '⌘ K', desc: 'Command palette' },
    { key: '?', desc: 'Show shortcuts' },
    { key: 'Esc', desc: 'Close modals' },
  ]

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center',
        justifyContent: 'center', zIndex: 500,
      }}
      onClick={toggle}
    >
      <div
        className="glass-card"
        style={{ padding: 28, minWidth: 360, maxWidth: 440, animation: 'fadeIn 0.2s var(--ease-out)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginBottom: 20, fontSize: 16, fontWeight: 600 }}>⌨️ Keyboard Shortcuts</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {shortcuts.map(({ key, desc }) => (
            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{desc}</span>
              <kbd style={{
                padding: '2px 8px', background: 'var(--bg-overlay)',
                border: '1px solid var(--border-hover)',
                borderRadius: 5, fontSize: 12, fontFamily: 'JetBrains Mono, monospace',
                color: 'var(--text-primary)',
              }}>{key}</kbd>
            </div>
          ))}
        </div>
        <button className="btn btn-ghost" onClick={toggle} style={{ width: '100%', justifyContent: 'center', marginTop: 20 }}>
          Close
        </button>
      </div>
    </div>
  )
}
