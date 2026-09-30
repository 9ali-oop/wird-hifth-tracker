import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAction, useConvexAuth, useMutation, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { createWirdApp, stableKey } from '@/wird/app'
import { AccountChip, type SyncStatus } from '@/components/account-chip'
import '@/wird/wird.css'

export const Route = createFileRoute('/')({ component: App })

type WirdApp = ReturnType<typeof createWirdApp>

function App() {
  const rootRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<WirdApp | null>(null)
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  const [status, setStatus] = useState<SyncStatus>('idle')
  const { isAuthenticated } = useConvexAuth()
  const remote = useQuery(api.wird.getMine, isAuthenticated ? {} : 'skip')
  const saveMine = useMutation(api.wird.saveMine)
  const fetchCalendar = useAction(api.prayer.fetchCalendar)
  const fetchCalendarRef = useRef(fetchCalendar)
  fetchCalendarRef.current = fetchCalendar

  const authedRef = useRef(false)
  authedRef.current = isAuthenticated
  // Never upload before the server copy has been merged in, or a fresh device could overwrite it.
  const mergedOnce = useRef(false)
  if (!isAuthenticated) mergedOnce.current = false
  const timer = useRef<number | undefined>(undefined)
  const pushRef = useRef<() => void>(() => {})

  pushRef.current = () => {
    if (!authedRef.current || !mergedOnce.current || !appRef.current) return
    window.clearTimeout(timer.current)
    setStatus(navigator.onLine === false ? 'offline' : 'saving')
    timer.current = window.setTimeout(async () => {
      const app = appRef.current
      if (!app) return
      const s = app.getState()
      try {
        const r = await saveMine({ data: JSON.stringify(s), updatedAt: s.updatedAt || Date.now() })
        if (r.ok) setStatus('saved')
        else if (r.code === 'STALE') {
          app.applyRemote(JSON.parse(r.data))
          pushRef.current()
        } else setStatus('error')
      } catch {
        setStatus(navigator.onLine === false ? 'offline' : 'error')
      }
    }, 600)
  }

  useEffect(() => {
    if (!rootRef.current) return
    const app = createWirdApp(rootRef.current, {
      onChange: () => pushRef.current(),
      onHome: (el: HTMLElement) => setSlot(el),
      fetchCalendar: (url: string) => fetchCalendarRef.current({ url }),
    })
    appRef.current = app
    if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
    const onOnline = () => pushRef.current()
    window.addEventListener('online', onOnline)
    return () => {
      app.destroy()
      window.removeEventListener('online', onOnline)
      appRef.current = null
    }
  }, [])

  // Whenever the server copy changes (another device saved), merge it in.
  useEffect(() => {
    const app = appRef.current
    if (!app || !remote || !remote.ok) return
    mergedOnce.current = true
    if (!remote.data) {
      pushRef.current() // first sign-in: upload what's on this device
      return
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(remote.data)
    } catch {
      return
    }
    const merged = app.applyRemote(parsed)
    if (stableKey(merged) !== stableKey(parsed)) pushRef.current()
    else setStatus('saved')
  }, [remote])

  const profile = remote && remote.ok ? { name: remote.name, email: remote.email, image: remote.image } : null

  return (
    <>
      <div ref={rootRef} className="wird-app" />
      {slot ? createPortal(<AccountChip status={status} profile={profile} />, slot) : null}
    </>
  )
}
