import React, { useEffect, useMemo, useRef, useState } from 'react'

/* ----------------------------------------------------------------
   Constants
------------------------------------------------------------------- */

const CATEGORIES = [
  { name: 'Biceps', color: '#2F6FED' },
  { name: 'Triceps', color: '#6C5CE7' },
  { name: 'Chest', color: '#E4572E' },
  { name: 'Back', color: '#16A38A' },
  { name: 'Shoulders', color: '#D9A441' },
  { name: 'Legs', color: '#2E9E5B' },
  { name: 'Abs', color: '#C2404D' },
  { name: 'Cardio', color: '#E23E57' },
  { name: 'Forearms', color: '#8A6D3B' },
  { name: 'Calves', color: '#4A5568' },
]

const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.name, c]))

// A permanent, recurring weekly schedule — no calendar dates.
// Thursday and Sunday are rest days by default (matches a 5-day training week).
const WEEK_DAYS = [
  { key: 'Monday', short: 'Mon' },
  { key: 'Tuesday', short: 'Tue' },
  { key: 'Wednesday', short: 'Wed' },
  { key: 'Thursday', short: 'Thu' },
  { key: 'Friday', short: 'Fri' },
  { key: 'Saturday', short: 'Sat' },
  { key: 'Sunday', short: 'Sun' },
]

// Rest days are user-configurable now. This is only the starting default,
// used the very first time the app runs before anything is saved.
const DEFAULT_REST_DAYS = ['Thursday', 'Sunday']
const REST_DAYS_STORAGE_KEY = 'fitplan_rest_days_v1'

const THEME_STORAGE_KEY = 'fitplan_theme_v1'

const USERS_STORAGE_KEY = 'fitplan_users_v1'
const CURRENT_USER_KEY = 'fitplan_current_user_v1'
const REMEMBERED_USERNAME_KEY = 'fitplan_remembered_username_v1'

const WEEKS = [
  { key: 'thisWeek', label: 'This Week' },
  { key: 'nextWeek', label: 'Next Week' },
]
const STORAGE_KEY_PREFIX = 'fitplan_workouts_v2'
const DB_NAME = 'fitplan_video_db'
const DB_STORE = 'videos'

// Allowed length range (in seconds) for an uploaded reference video.
const MIN_VIDEO_SECONDS = 1
const MAX_VIDEO_SECONDS = 60
const MAX_VIDEOS_PER_CATEGORY = 3

/* ----------------------------------------------------------------
   IndexedDB helpers (persistent video storage)
------------------------------------------------------------------- */

function openVideoDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function putVideo(id, file) {
  const db = await openVideoDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite')
    tx.objectStore(DB_STORE).put({ id, blob: file, type: file.type, name: file.name })
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function getVideo(id) {
  const db = await openVideoDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readonly')
    const req = tx.objectStore(DB_STORE).get(id)
    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => reject(req.error)
  })
}

async function deleteVideo(id) {
  const db = await openVideoDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite')
    tx.objectStore(DB_STORE).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/* ----------------------------------------------------------------
   localStorage helpers (workout schedule data)
------------------------------------------------------------------- */

function loadWorkouts(username, week) {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}_${username}_${week}`)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveWorkouts(username, week, workouts) {
  localStorage.setItem(`${STORAGE_KEY_PREFIX}_${username}_${week}`, JSON.stringify(workouts))
}

function loadRestDays(username) {
  try {
    const raw = localStorage.getItem(`${REST_DAYS_STORAGE_KEY}_${username}`)
    return raw ? JSON.parse(raw) : DEFAULT_REST_DAYS
  } catch {
    return DEFAULT_REST_DAYS
  }
}

function saveRestDays(username, restDayArray) {
  localStorage.setItem(`${REST_DAYS_STORAGE_KEY}_${username}`, JSON.stringify(restDayArray))
}

function loadTheme() {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY)
    if (saved === 'dark' || saved === 'light') return saved
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark'
  }
  return 'light'
}

function saveTheme(theme) {
  localStorage.setItem(THEME_STORAGE_KEY, theme)
}

// NOTE: this is a simple, non-cryptographic hash for a browser-only demo
// account system — it is NOT secure and should never be used for real
// credentials or a production login system.
function simpleHash(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return String(hash)
}

function loadUsers() {
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveUsers(users) {
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users))
}

function loadCurrentUser() {
  try {
    return localStorage.getItem(CURRENT_USER_KEY) || null
  } catch {
    return null
  }
}

function saveCurrentUser(username) {
  if (username) {
    localStorage.setItem(CURRENT_USER_KEY, username)
  } else {
    localStorage.removeItem(CURRENT_USER_KEY)
  }
}

function loadRememberedUsername() {
  try {
    return localStorage.getItem(REMEMBERED_USERNAME_KEY) || ''
  } catch {
    return ''
  }
}

function saveRememberedUsername(username) {
  if (username) {
    localStorage.setItem(REMEMBERED_USERNAME_KEY, username)
  } else {
    localStorage.removeItem(REMEMBERED_USERNAME_KEY)
  }
}

/* ----------------------------------------------------------------
   Small utilities
------------------------------------------------------------------- */

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

const DAY_NAMES_BY_JS_INDEX = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

function getTodayDayName() {
  return DAY_NAMES_BY_JS_INDEX[new Date().getDay()]
}

function isRestDay(dayKey, restDaySet) {
  return restDaySet.has(dayKey)
}

function todayDateKey() {
  return new Date().toISOString().slice(0, 10)
}

// Formats a number of seconds into a short human label, e.g. 90 -> "1 min 30 sec".
function formatRestTime(seconds) {
  const s = Number(seconds)
  if (!Number.isFinite(s) || s <= 0) return null
  if (s < 60) return `${s} sec`
  const mins = Math.floor(s / 60)
  const rem = s % 60
  return rem === 0 ? `${mins} min` : `${mins} min ${rem} sec`
}

/* ----------------------------------------------------------------
   Icon set — one consistent line-icon per muscle group / category
------------------------------------------------------------------- */

function Icon({ name, size = 18, color = 'currentColor' }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  }
  switch (name) {
    case 'Biceps':
      return (
        <svg {...common}><path d="M6 20c0-5 1-8 4-10 2-1.3 2-3 1-4M6 20c-1.4 0-2-1-2-2 0-3 1-6 3-8" /><path d="M11 6c1.5-1 3.5-1 5 .5 1.8 1.8 1.5 4.5-1 6-1 .6-1.5 1.6-1.5 3v4.5" /></svg>
      )
    case 'Triceps':
      return (
        <svg {...common}><rect x="9" y="3" width="6" height="7" rx="1.5" /><rect x="9" y="10" width="6" height="4" rx="1" /><path d="M10 14v6M14 14v6M8 20h8" /></svg>
      )
    case 'Chest':
      return (
        <svg {...common}><path d="M12 6c-1.5-2-4.5-2.5-6.5-.8C3.5 7 3.3 10 5 12.5c1.8 2.6 5 5.3 7 6.5 2-1.2 5.2-3.9 7-6.5 1.7-2.5 1.5-5.5-.5-7.3-2-1.7-5-1.2-6.5.8z" /></svg>
      )
    case 'Back':
      return (
        <svg {...common}><path d="M12 3v18" /><path d="M12 6c-3 0-6 1.5-7 4 1.8.3 3.5 0 4.8-1M12 6c3 0 6 1.5 7 4-1.8.3-3.5 0-4.8-1M12 12c-3.2 0-6.2 1.6-7.2 4.2 1.9.4 3.7 0 5-1.1M12 12c3.2 0 6.2 1.6 7.2 4.2-1.9.4-3.7 0-5-1.1" /></svg>
      )
    case 'Shoulders':
      return (
        <svg {...common}><circle cx="6" cy="8" r="2.4" /><circle cx="18" cy="8" r="2.4" /><path d="M6 10.4V15M18 10.4V15M3 20c1-3 2.5-4.5 3-5M21 20c-1-3-2.5-4.5-3-5M9 20h6" /></svg>
      )
    case 'Legs':
      return (
        <svg {...common}><path d="M9 3h6l.6 6-1.6 4 .6 8h-3l-.6-7-1.6-3.5L8.4 17l-.6 4h-3l.6-8-1.6-4L4 3h5z" /></svg>
      )
    case 'Abs':
      return (
        <svg {...common}><rect x="7" y="3" width="10" height="18" rx="3" /><path d="M7 8h10M7 13h10M12 3v18" /></svg>
      )
    case 'Cardio':
      return (
        <svg {...common}><path d="M20.5 8.5c0 5-8.5 10-8.5 10s-8.5-5-8.5-10a4.5 4.5 0 0 1 8.5-2 4.5 4.5 0 0 1 8.5 2z" /><path d="M4 12h3l1.5-3 2 5 1.5-3H18" /></svg>
      )
    case 'Forearms':
      return (
        <svg {...common}><path d="M4 15c2 1 4 1 5.5-.3M4 15c0-2 .5-3.5 2-4.5M4 15c-.5 1.5-.5 3 .5 4" /><path d="M9.5 14.7C11 13.5 12 11.7 12 9c0-2.5 1.3-4 3-4.5 2-.6 3.7.5 4 2.5.3 2-1 3.3-2.5 4-1.2.5-2 1.5-2.3 3-.3 1.6.2 2.7 1.3 3.7" /></svg>
      )
    case 'Calves':
      return (
        <svg {...common}><path d="M9 2c-.5 4 0 7-2 10-1.4 2.1-1.5 4-1 6h9c1-3-1-5-1.5-7.5C13 8 13.5 5 13 2z" /><path d="M6 18h9" /></svg>
      )
    default:
      return (
        <svg {...common}><circle cx="12" cy="12" r="9" /></svg>
      )
  }
}

/* Simple UI icons (not tied to a muscle group) */
function UIIcon({ name, size = 18 }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  }
  switch (name) {
    case 'plus':
      return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>
    case 'search':
      return <svg {...common}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
    case 'edit':
      return <svg {...common}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
    case 'trash':
      return <svg {...common}><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /></svg>
    case 'video':
      return <svg {...common}><rect x="3" y="6" width="12" height="12" rx="2" /><path d="M15 10l6-3v10l-6-3" /></svg>
    case 'upload':
      return <svg {...common}><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>
    case 'x':
      return <svg {...common}><path d="M6 6l12 12M18 6L6 18" /></svg>
    case 'calendar':
      return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></svg>
    case 'filter':
      return <svg {...common}><path d="M4 5h16M7 12h10M10 19h4" /></svg>
    case 'check':
      return <svg {...common}><path d="M20 6L9 17l-5-5" /></svg>
    case 'sparkle':
      return <svg {...common}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" /></svg>
    case 'alert':
      return <svg {...common}><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>
    case 'chevron':
      return <svg {...common}><path d="M6 9l6 6 6-6" /></svg>
    case 'layers':
      return <svg {...common}><path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 13l9 5 9-5" /></svg>
    case 'repeat':
      return <svg {...common}><path d="M17 2l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>
    case 'clock':
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>
    case 'gauge':
      return <svg {...common}><path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" /><path d="M12 12l4-4" /><path d="M12 7v1M17 12h1M7 12H6" /></svg>
    case 'info':
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>
    case 'stopwatch':
      return <svg {...common}><circle cx="12" cy="13" r="8" /><path d="M12 13l3-2.5" /><path d="M9 2h6" /><path d="M12 2v2" /></svg>
    case 'sun':
      return <svg {...common}><circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2.5M12 19v2.5M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M2.5 12H5M19 12h2.5M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8" /></svg>
    case 'moon':
      return <svg {...common}><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.7 6.7 0 0 0 10.5 10.5z" /></svg>
    case 'user':
      return <svg {...common}><circle cx="12" cy="8" r="3.4" /><path d="M5 20c1.2-4 4-6 7-6s5.8 2 7 6" /></svg>
    case 'log-out':
      return <svg {...common}><path d="M9 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3" /><path d="M15 16l4-4-4-4" /><path d="M19 12H9" /></svg>
    case 'eye':
      return <svg {...common}><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" /><circle cx="12" cy="12" r="3" /></svg>
    case 'eye-off':
      return <svg {...common}><path d="M3 3l18 18" /><path d="M10.6 5.1A11.5 11.5 0 0 1 12 5c7 0 11 7 11 7a13.6 13.6 0 0 1-3.2 3.9M6.5 6.6C3.4 8.5 1 12 1 12s4 7 11 7a11 11 0 0 0 4.2-.8" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
    case 'copy':
      return <svg {...common}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
    case 'menu':
      return <svg {...common}><path d="M3 6h18M3 12h18M3 18h18" /></svg>
    case 'menu':
      return <svg {...common}><path d="M3 6h18M3 12h18M3 18h18" /></svg>
    case 'check-circle':
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" /></svg>
    default:
      return null
  }
}

/* ----------------------------------------------------------------
   Video player — pulls the blob out of IndexedDB and plays it
------------------------------------------------------------------- */

function VideoThumb({ src }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <div className="video-thumb" onClick={() => setOpen(true)}>
        <video className="video-player" src={src} muted playsInline preload="metadata" />
        <span className="video-thumb-play">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
      </div>
      {open && (
        <div className="video-lightbox-overlay" onClick={() => setOpen(false)}>
          <div className="video-lightbox" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="icon-btn video-lightbox-close"
              onClick={() => setOpen(false)}
              aria-label="Close video"
            >
              <UIIcon name="x" />
            </button>
            <video className="video-lightbox-player" src={src} controls autoPlay playsInline />
          </div>
        </div>
      )}
    </>
  )
}

function VideoPlayer({ videoId, refreshKey }) {
  const [url, setUrl] = useState(null)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    let objectUrl = null
    let cancelled = false
    setUrl(null)
    setMissing(false)
    if (!videoId) return
    getVideo(videoId).then((record) => {
      if (cancelled) return
      if (!record) {
        setMissing(true)
        return
      }
      objectUrl = URL.createObjectURL(record.blob)
      setUrl(objectUrl)
    })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [videoId, refreshKey])

  if (missing) return <div className="video-missing">Video could not be loaded.</div>
  if (!url) return <div className="video-loading">Loading video…</div>
  return <VideoThumb src={url} />
}

/* ----------------------------------------------------------------
   Auth screen — local, browser-only accounts (sign up / log in)
------------------------------------------------------------------- */

function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState('login') // 'login' | 'signup'
  const [username, setUsername] = useState(() => loadRememberedUsername())
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [rememberUsername, setRememberUsername] = useState(() => Boolean(loadRememberedUsername()))
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const uname = username.trim().toLowerCase()
    if (!uname || !password) {
      setError('Please fill in all fields.')
      return
    }

    const users = loadUsers()

    if (mode === 'signup') {
      if (password !== confirmPassword) {
        setError('Passwords do not match.')
        return
      }
      if (users[uname]) {
        setError('That username is already taken.')
        return
      }
      users[uname] = simpleHash(password)
      saveUsers(users)
      saveCurrentUser(uname)
      saveRememberedUsername(rememberUsername ? uname : '')
      onAuth(uname)
    } else {
      const existing = users[uname]
      if (!existing || existing !== simpleHash(password)) {
        setError('Incorrect username or password.')
        return
      }
      saveCurrentUser(uname)
      saveRememberedUsername(rememberUsername ? uname : '')
      onAuth(uname)
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="brand auth-brand">
          <span className="brand-mark">
            <UIIcon name="stopwatch" size={20} />
          </span>
          FitPlan
        </div>
        <p className="auth-sub">
          {mode === 'login' ? 'Log in to your training schedule.' : 'Create an account to start planning.'}
        </p>

        <div className="tabs auth-mode-tabs">
          <button
            type="button"
            className={`tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => {
              setMode('login')
              setError('')
            }}
          >
            Log in
          </button>
          <button
            type="button"
            className={`tab ${mode === 'signup' ? 'active' : ''}`}
            onClick={() => {
              setMode('signup')
              setError('')
            }}
          >
            Sign up
          </button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-row">
            <label htmlFor="auth-username">Username</label>
            <input
              id="auth-username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className="form-row">
            <label htmlFor="auth-password">Password</label>
            <div className="password-input-wrap">
              <input
                id="auth-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                tabIndex={-1}
              >
                <UIIcon name={showPassword ? 'eye-off' : 'eye'} size={17} />
              </button>
            </div>
          </div>
          {mode === 'signup' && (
            <div className="form-row">
              <label htmlFor="auth-confirm">Confirm password</label>
              <div className="password-input-wrap">
                <input
                  id="auth-confirm"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  <UIIcon name={showConfirmPassword ? 'eye-off' : 'eye'} size={17} />
                </button>
              </div>
            </div>
          )}

          <label className="remember-username-row">
            <input
              type="checkbox"
              checked={rememberUsername}
              onChange={(e) => setRememberUsername(e.target.checked)}
            />
            Remember my username
          </label>

          {error && (
            <p className="form-warning">
              <UIIcon name="alert" size={14} />
              <span>{error}</span>
            </p>
          )}

          <button type="submit" className="btn btn-primary auth-submit-btn">
            <UIIcon name="check" size={16} /> {mode === 'login' ? 'Log in' : 'Create account'}
          </button>
        </form>

        <p className="auth-footnote">Accounts are stored only in this browser — nothing is sent to a server.</p>
      </div>
    </div>
  )
}

/* ----------------------------------------------------------------
   Workout form (add / edit) — rendered inside a modal
------------------------------------------------------------------- */

function WorkoutForm({ initial, defaultDay, restDays, onCancel, onSave }) {
  const [day, setDay] = useState(initial?.day || defaultDay || getTodayDayName())
  const [categories, setCategories] = useState(
    initial?.categories || (initial?.category ? [initial.category] : [CATEGORIES[0].name])
  )

  function toggleCategory(name) {
    setCategories((prev) => {
      if (prev.includes(name)) {
        if (prev.length === 1) return prev // keep at least 1 selected
        return prev.filter((c) => c !== name)
      }
      if (prev.length >= 4) return prev // cap at 4
      return [...prev, name]
    })
    setCategoryPlans((prev) => {
      if (prev[name]) return prev // already has data (e.g. re-toggled on) — keep it
      return { ...prev, [name]: makeDefaultSets(name) }
    })
    setCategoryVideoSlots((prev) => {
      if (prev[name]) return prev
      return { ...prev, [name]: [] }
    })
  }
  const [instructions, setInstructions] = useState(initial?.instructions || '')
  function makeDefaultSets(cat) {
    if (cat === 'Cardio') {
      return [{ id: uid(), reps: '20' }]
    }
    return [
      { id: uid(), reps: '12' },
      { id: uid(), reps: '12' },
      { id: uid(), reps: '12' },
    ]
  }

  const [categoryPlans, setCategoryPlans] = useState(() => {
    if (initial?.categoryPlans) return initial.categoryPlans
    // Migrate old data (single shared set list) onto whichever categories were selected.
    const cats = initial?.categories || (initial?.category ? [initial.category] : [CATEGORIES[0].name])
    const legacyEntries =
      initial?.setEntries && initial.setEntries.length
        ? initial.setEntries
        : initial?.sets
          ? Array.from({ length: initial.sets }, () => ({ id: uid(), reps: String(initial?.reps ?? '12') }))
          : null
    return Object.fromEntries(
      cats.map((c) => [c, (legacyEntries || makeDefaultSets(c)).map((s) => ({ ...s, id: s.id || uid() }))]),
    )
  })
  const [restSeconds, setRestSeconds] = useState(initial?.restSeconds ?? 60)

  function addSetToCategory(cat) {
    setCategoryPlans((prev) => {
      const list = prev[cat] || []
      const lastReps = list[list.length - 1]?.reps || '12'
      return { ...prev, [cat]: [...list, { id: uid(), reps: lastReps }] }
    })
  }
  function removeSetFromCategory(cat, id) {
    setCategoryPlans((prev) => {
      const list = prev[cat] || []
      if (list.length <= 1) return prev
      return { ...prev, [cat]: list.filter((s) => s.id !== id) }
    })
  }
  function updateSetReps(cat, id, value) {
    setCategoryPlans((prev) => ({
      ...prev,
      [cat]: (prev[cat] || []).map((s) => (s.id === id ? { ...s, reps: value } : s)),
    }))
  }

  // Per-category reference video slots — each muscle group gets its own
  // set of up to MAX_VIDEOS_PER_CATEGORY clips.
  const [categoryVideoSlots, setCategoryVideoSlots] = useState(() => {
    const cats = initial?.categories || (initial?.category ? [initial.category] : [CATEGORIES[0].name])
    const existing = initial?.categoryVideos || (initial?.videoId ? { [cats[0]]: [initial.videoId] } : {})
    return Object.fromEntries(
      cats.map((c) => [
        c,
        (existing[c] || []).map((videoId) => ({
          id: uid(),
          existingVideoId: videoId,
          file: null,
          previewUrl: null,
          durationError: '',
          checkingDuration: false,
          pendingDuration: null,
        })),
      ]),
    )
  })
  const [videosToDelete, setVideosToDelete] = useState([])
  const [saving, setSaving] = useState(false)
  const [collapsedSections, setCollapsedSections] = useState({ sets: false, videos: false })

  function toggleSection(key) {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  function addVideoSlot(cat) {
    setCategoryVideoSlots((prev) => {
      const list = prev[cat] || []
      if (list.length >= MAX_VIDEOS_PER_CATEGORY) return prev
      return {
        ...prev,
        [cat]: [
          ...list,
          {
            id: uid(),
            existingVideoId: null,
            file: null,
            previewUrl: null,
            durationError: '',
            checkingDuration: false,
            pendingDuration: null,
          },
        ],
      }
    })
  }

  function removeVideoSlot(cat, slotId) {
    setCategoryVideoSlots((prev) => {
      const slot = (prev[cat] || []).find((s) => s.id === slotId)
      if (slot?.existingVideoId) {
        setVideosToDelete((d) => [...d, slot.existingVideoId])
      }
      return { ...prev, [cat]: (prev[cat] || []).filter((s) => s.id !== slotId) }
    })
  }

  function updateSlot(cat, slotId, patch) {
    setCategoryVideoSlots((prev) => ({
      ...prev,
      [cat]: (prev[cat] || []).map((s) => (s.id === slotId ? { ...s, ...patch } : s)),
    }))
  }

  // Returns an error message if the duration falls outside the allowed
  // range (1s up to, but not including, 60s), otherwise null.
  function validateDuration(d) {
    if (d < MIN_VIDEO_SECONDS) {
      return `Too short — min ${MIN_VIDEO_SECONDS}s.`
    }
    if (d >= MAX_VIDEO_SECONDS) {
      return `Too long (${d.toFixed(0)}s) — max ${MAX_VIDEO_SECONDS - 1}s.`
    }
    return null
  }

  function handleSlotFileChange(cat, slotId, e) {
    const f = e.target.files?.[0]
    if (!f) return
    const previewUrl = URL.createObjectURL(f)
    updateSlot(cat, slotId, {
      file: f,
      previewUrl,
      durationError: '',
      pendingDuration: null,
      checkingDuration: true,
    })

    const tempUrl = URL.createObjectURL(f)
    const probe = document.createElement('video')
    probe.preload = 'metadata'
    probe.src = tempUrl
    probe.onloadedmetadata = () => {
      const d = probe.duration
      const err = Number.isFinite(d) ? validateDuration(d) : null
      updateSlot(cat, slotId, {
        checkingDuration: false,
        pendingDuration: Number.isFinite(d) ? d : null,
        durationError: err || '',
      })
      URL.revokeObjectURL(tempUrl)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!day) return

    for (const cat of categories) {
      for (const slot of categoryVideoSlots[cat] || []) {
        if (slot.file && slot.pendingDuration != null) {
          const err = validateDuration(slot.pendingDuration)
          if (err) {
            updateSlot(cat, slot.id, { durationError: err })
            return
          }
        }
      }
    }

    setSaving(true)

    const categoryVideos = {}
    for (const cat of categories) {
      const ids = []
      for (const slot of categoryVideoSlots[cat] || []) {
        if (slot.file) {
          if (slot.existingVideoId) {
            try {
              await deleteVideo(slot.existingVideoId)
            } catch {
              /* ignore */
            }
          }
          const newId = uid()
          await putVideo(newId, slot.file)
          ids.push(newId)
        } else if (slot.existingVideoId) {
          ids.push(slot.existingVideoId)
        }
      }
      categoryVideos[cat] = ids
    }

    for (const vid of videosToDelete) {
      try {
        await deleteVideo(vid)
      } catch {
        /* ignore */
      }
    }

    // Clean up videos belonging to categories that were deselected entirely.
    if (initial?.categoryVideos) {
      for (const cat of Object.keys(initial.categoryVideos)) {
        if (!categories.includes(cat)) {
          for (const vid of initial.categoryVideos[cat]) {
            try {
              await deleteVideo(vid)
            } catch {
              /* ignore */
            }
          }
        }
      }
    }

    onSave({
      id: initial?.id || uid(),
      day,
      categories,
      instructions: instructions.trim(),
      categoryPlans: Object.fromEntries(
        categories.map((cat) => [
          cat,
          (categoryPlans[cat] || []).map((s) => ({ id: s.id, reps: String(s.reps).trim() })),
        ]),
      ),
      restSeconds: restSeconds === '' ? null : Number(restSeconds),
      categoryVideos,
      createdAt: initial?.createdAt || Date.now(),
    })
  }

  const blockSubmit =
    saving ||
    categories.some((cat) =>
      (categoryVideoSlots[cat] || []).some(
        (s) =>
          s.checkingDuration || (s.file && s.pendingDuration != null && Boolean(validateDuration(s.pendingDuration))),
      ),
    )

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{initial ? 'Edit workout' : 'Schedule a workout'}</h2>
          <button type="button" className="icon-btn" onClick={onCancel} aria-label="Close">
            <UIIcon name="x" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="workout-form">
          <div className="form-row">
            <label>Day of the week</label>
            <p className="form-hint">This exercise repeats on this day every week.</p>
            <div className="day-picker">
              {WEEK_DAYS.map((d) => {
                const rest = restDays?.has(d.key)
                return (
                  <button
                    type="button"
                    key={d.key}
                    className={`day-chip ${day === d.key ? 'active' : ''} ${rest ? 'rest' : ''}`}
                    onClick={() => setDay(d.key)}
                  >
                    {d.short}
                    {rest && <span className="rest-dot" title="Usually a rest day" />}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="form-row">
            <label>Exercise</label>
            <p className="form-hint">Select 1–4 muscle groups worked by this exercise.</p>
            <div className="category-picker">
              {CATEGORIES.map((c) => (
                <button
                  type="button"
                  key={c.name}
                  className={`category-chip ${categories.includes(c.name) ? 'active' : ''}`}
                  style={{ '--chip-color': c.color }}
                  onClick={() => toggleCategory(c.name)}
                >
                  <Icon name={c.name} size={16} />
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          <div className="form-row">
            <label htmlFor="wf-instructions">Instructions</label>
            <p className="form-hint">How to perform this exercise correctly, step by step.</p>
            <textarea
              id="wf-instructions"
              placeholder="e.g. Stand tall with a dumbbell in each hand, palms facing forward. Curl the weights toward your shoulders, then lower slowly…"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={3}
            />
          </div>

          <div className="form-row">
            <div className="form-row-header">
              <label>Sets &amp; reps per exercise</label>
              <button type="button" className="btn btn-ghost small" onClick={() => toggleSection('sets')}>
                {collapsedSections.sets ? 'Show' : 'Hide'}
              </button>
            </div>
            {!collapsedSections.sets && (
              <p className="form-hint">
                Each muscle group you picked gets its own targets — set reps (or minutes for Cardio) individually.
              </p>
            )}
            {collapsedSections.sets && (
              <p className="form-hint">
                {categories.length} muscle group{categories.length > 1 ? 's' : ''} · sets hidden
              </p>
            )}
            {!collapsedSections.sets && <div className="category-set-groups">
              {categories.map((cat) => {
                const catInfo = CATEGORY_MAP[cat]
                const list = categoryPlans[cat] || []

                if (cat === 'Cardio') {
                  const entry = list[0] || { id: uid(), reps: '' }
                  return (
                    <div className="category-set-group" key={cat} style={{ '--chip-color': catInfo?.color }}>
                      <div className="category-set-group-head">
                        <Icon name={cat} size={16} color={catInfo?.color} />
                        <span>{cat}</span>
                      </div>
                      <div className="cardio-duration-row">
                        <UIIcon name="clock" size={16} />
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="e.g. 20"
                          value={entry.reps}
                          onChange={(e) => updateSetReps(cat, entry.id, e.target.value)}
                        />
                        <span className="set-row-unit">minutes</span>
                      </div>
                    </div>
                  )
                }

                return (
                  <div className="category-set-group" key={cat} style={{ '--chip-color': catInfo?.color }}>
                    <div className="category-set-group-head">
                      <Icon name={cat} size={16} color={catInfo?.color} />
                      <span>{cat}</span>
                    </div>
                    <div className="set-list">
                      {list.map((s, i) => (
                        <div className="set-row" key={s.id}><span className="set-row-index">{cat === 'Cardio' ? `Round ${i + 1}` : `Set ${i + 1}`}</span><span className="set-row-index">Set {i + 1}</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            placeholder="e.g. 12 or 8-12"
                            value={s.reps}
                            onChange={(e) => updateSetReps(cat, s.id, e.target.value)}
                          />
                          <span className="set-row-unit">reps</span>
                          <button
                            type="button"
                            className="icon-btn small danger"
                            onClick={() => removeSetFromCategory(cat, s.id)}
                            disabled={list.length <= 1}
                            aria-label={`Remove set ${i + 1} for ${cat}`}
                          >
                            <UIIcon name="x" size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost small add-set-btn"
                      onClick={() => addSetToCategory(cat)}
                    >
                      <UIIcon name="plus" size={14} /> {cat === 'Cardio' ? 'Add another round' : 'Add another set'}
                    </button>
                  </div>
                )
              })}
            </div>}
          </div>

          <div className="form-row">
            <label htmlFor="wf-rest">
              <UIIcon name="clock" size={14} /> Rest between sets (sec)
            </label>
            <input
              id="wf-rest"
              type="number"
              min="0"
              step="5"
              value={restSeconds}
              onChange={(e) => setRestSeconds(e.target.value)}
            />
          </div>

          <div className="form-row">
            <div className="form-row-header">
              <label>Reference videos per exercise</label>
              <button type="button" className="btn btn-ghost small" onClick={() => toggleSection('videos')}>
                {collapsedSections.videos ? 'Show' : 'Hide'}
              </button>
            </div>
            {!collapsedSections.videos && (
              <p className="form-hint">
                Upload up to {MAX_VIDEOS_PER_CATEGORY} clips per muscle group ({MIN_VIDEO_SECONDS}–{MAX_VIDEO_SECONDS - 1}s each).
              </p>
            )}
            {collapsedSections.videos && <p className="form-hint">Videos hidden</p>}
            {!collapsedSections.videos && <div className="category-video-groups">
              {categories.map((cat) => {
                const catInfo = CATEGORY_MAP[cat]
                const slots = categoryVideoSlots[cat] || []
                return (
                  <div className="category-video-group" key={cat} style={{ '--chip-color': catInfo?.color }}>
                    <div className="category-set-group-head">
                      <Icon name={cat} size={16} color={catInfo?.color} />
                      <span>{cat}</span>
                      <span className="video-slot-count">
                        {slots.length}/{MAX_VIDEOS_PER_CATEGORY}
                      </span>
                    </div>

                    <div className="video-slot-list">
                      {slots.map((slot) => {
                        const hasDraft = Boolean(slot.file)
                        const hasExisting = Boolean(slot.existingVideoId)
                        return (
                          <div className="video-slot" key={slot.id}>
                            {hasDraft ? (
                              <>
                                <VideoThumb src={slot.previewUrl} />
                                <div className="existing-video-actions">
                                  <label className="btn btn-ghost small">
                                    <UIIcon name="upload" size={16} /> Choose different clip
                                    <input
                                      type="file"
                                      accept="video/*"
                                      hidden
                                      onChange={(e) => handleSlotFileChange(cat, slot.id, e)}
                                    />
                                  </label>
                                  <button
                                    type="button"
                                    className="btn btn-ghost small danger"
                                    onClick={() =>
                                      hasExisting
                                        ? updateSlot(cat, slot.id, {
                                            file: null,
                                            previewUrl: null,
                                            durationError: '',
                                            pendingDuration: null,
                                          })
                                        : removeVideoSlot(cat, slot.id)
                                    }
                                  >
                                    <UIIcon name="x" size={16} /> Cancel
                                  </button>
                                </div>
                                {slot.checkingDuration && <p className="form-hint">Checking clip length…</p>}
                                {slot.durationError && (
                                  <p className="form-warning">
                                    <UIIcon name="alert" size={14} />
                                    <span>{slot.durationError}</span>
                                  </p>
                                )}
                              </>
                            ) : hasExisting ? (
                              <>
                                <VideoPlayer videoId={slot.existingVideoId} />
                                <div className="existing-video-actions">
                                  <label className="btn btn-ghost small">
                                    <UIIcon name="upload" size={16} /> Replace
                                    <input
                                      type="file"
                                      accept="video/*"
                                      hidden
                                      onChange={(e) => handleSlotFileChange(cat, slot.id, e)}
                                    />
                                  </label>
                                  <button
                                    type="button"
                                    className="btn btn-ghost small danger"
                                    onClick={() => removeVideoSlot(cat, slot.id)}
                                  >
                                    <UIIcon name="trash" size={16} /> Remove
                                  </button>
                                </div>
                              </>
                            ) : (
                              <>
                                <label className="upload-dropzone">
                                  <UIIcon name="upload" size={20} />
                                  <span>Tap to upload a clip</span>
                                  <span className="upload-hint">MP4 or MOV, under {MAX_VIDEO_SECONDS} seconds</span>
                                  <input
                                    type="file"
                                    accept="video/*"
                                    hidden
                                    onChange={(e) => handleSlotFileChange(cat, slot.id, e)}
                                  />
                                </label>
                                <button
                                  type="button"
                                  className="btn btn-ghost small danger remove-empty-slot"
                                  onClick={() => removeVideoSlot(cat, slot.id)}
                                >
                                  <UIIcon name="x" size={14} /> Remove this slot
                                </button>
                              </>
                            )}
                          </div>
                        )
                      })}
                    </div>

                    {slots.length < MAX_VIDEOS_PER_CATEGORY && (
                      <button
                        type="button"
                        className="btn btn-ghost small add-set-btn"
                        onClick={() => addVideoSlot(cat)}
                      >
                        <UIIcon name="plus" size={14} /> Add a video for {cat}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>}
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={blockSubmit}>
              <UIIcon name="check" size={16} /> Save workout
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ----------------------------------------------------------------
   Workout card
------------------------------------------------------------------- */

function WorkoutCard({ workout, onEdit, onDelete, onToggleComplete, completedToday }) {
  const [expanded, setExpanded] = useState(false)
  const workoutCategories = workout.categories || (workout.category ? [workout.category] : [])
  const cat = CATEGORY_MAP[workoutCategories[0]] || { color: '#4A5568' }
  const restLabel = formatRestTime(workout.restSeconds)
  const legacyEntries =
    workout.setEntries && workout.setEntries.length
      ? workout.setEntries
      : workout.reps
        ? Array.from({ length: workout.sets || 1 }, () => ({ reps: workout.reps }))
        : []
  const categoryPlans =
    workout.categoryPlans || Object.fromEntries(workoutCategories.map((c) => [c, legacyEntries]))
  const totalSets = Object.values(categoryPlans).reduce((sum, list) => sum + (list?.length || 0), 0)
  const hasSetsReps = totalSets > 0
  const allEntriesFlat = Object.values(categoryPlans).flat()
  const repsAllSame = allEntriesFlat.length > 0 && allEntriesFlat.every((s) => s.reps === allEntriesFlat[0].reps)
  const categoryVideos =
    workout.categoryVideos || (workout.videoId ? { [workoutCategories[0]]: [workout.videoId] } : {})
  const totalVideos = Object.values(categoryVideos).reduce((sum, list) => sum + (list?.length || 0), 0)

  return (
    <div
      className={`workout-card ${expanded ? 'expanded' : ''} ${completedToday ? 'completed' : ''}`}
      style={{ '--chip-color': cat.color }}
    >
      <button
        type="button"
        className="workout-card-head"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <div className="workout-card-head-top">
          <div className="workout-card-title">
            <span className="workout-icon-row">
              {workoutCategories.map((name) => (
                <span
                  key={name}
                  className="workout-icon-badge"
                  style={{ '--chip-color': (CATEGORY_MAP[name] || {}).color }}
                >
                  <Icon name={name} size={16} color={(CATEGORY_MAP[name] || {}).color} />
                </span>
              ))}
            </span>
            <div className="workout-card-title-text">
              <h3>
                {workoutCategories[0]}
                {workoutCategories.length > 1 && (
                  <span className="title-extra-count"> +{workoutCategories.length - 1}</span>
                )}
              </h3>
              <span className="workout-date">
                <UIIcon name="calendar" size={13} /> Every {workout.day}
              </span>
            </div>
          </div>

          <div className="workout-card-head-actions">
            <span
              className={`icon-btn complete-toggle-btn ${completedToday ? 'done' : ''}`}
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation()
                onToggleComplete(workout.id)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation()
                  onToggleComplete(workout.id)
                }
              }}
              aria-label={completedToday ? 'Mark as not done for today' : 'Mark as done for today'}
              title={completedToday ? 'Done today — tap to undo' : 'Mark done for today'}
            >
              <UIIcon name="check-circle" size={16} />
            </span>
            {expanded && (
              <>
                <span
                  className="icon-btn"
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation()
                    onEdit(workout)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.stopPropagation()
                      onEdit(workout)
                    }
                  }}
                  aria-label="Edit workout"
                  title="Edit"
                >
                  <UIIcon name="edit" size={16} />
                </span>
                <span
                  className="icon-btn danger"
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(workout.id)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.stopPropagation()
                      onDelete(workout.id)
                    }
                  }}
                  aria-label="Delete workout"
                  title="Delete"
                >
                  <UIIcon name="trash" size={16} />
                </span>
              </>
            )}
            <span className={`chevron-btn ${expanded ? 'open' : ''}`}>
              <UIIcon name="chevron" size={16} />
            </span>
          </div>
        </div>

        {!expanded && (hasSetsReps || totalVideos > 0) && (
          <div className="workout-preview-chips">
            {hasSetsReps && (
              <span className="mini-chip">
                {totalSets} set{totalSets > 1 ? 's' : ''}{workoutCategories.length > 1 ? ' total' : ''}
                {repsAllSame ? ` × ${allEntriesFlat[0].reps} reps` : ' · varied reps'}
              </span>
            )}
            {totalVideos > 0 && (
              <span className="mini-chip video-chip">
                <UIIcon name="video" size={12} /> {totalVideos} video{totalVideos > 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}
      </button>

      {!expanded && workout.instructions && (
        <p className="workout-preview-text" onClick={() => setExpanded(true)}>
          {workout.instructions}
        </p>
      )}

      {expanded && (
        <div className="workout-card-body">
          {restLabel && (
            <div className="rest-banner">
              <UIIcon name="clock" size={15} />
              <span>
                <strong>{restLabel}</strong> rest between sets
              </span>
            </div>
          )}

          {hasSetsReps && (
            <div className="detail-block">
              <h4>
                <UIIcon name="layers" size={14} /> Sets &amp; reps
              </h4>
              <div className="category-set-readouts">
                {workoutCategories.map((c) => {
                  const list = categoryPlans[c] || []
                  if (!list.length) return null
                  const info = CATEGORY_MAP[c]
                  return (
                    <div className="category-set-readout" key={c} style={{ '--chip-color': info?.color }}>
                      <div className="category-set-readout-head">
                        <Icon name={c} size={14} color={info?.color} />
                        <span>{c}</span>
                      </div>
                      {c === 'Cardio' ? (
                        <div className="cardio-readout">
                          <UIIcon name="clock" size={14} />
                          <span>{list[0]?.reps || '—'} minutes</span>
                        </div>
                      ) : (
                        <div className="set-readout">
                          {list.map((s, i) => (
                            <span className="set-readout-pill" key={s.id || i}>
                              <span className="set-readout-pill-num">{i + 1}</span>
                              {s.reps || '—'} reps
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {workout.instructions && (
            <div className="detail-block">
              <h4>
                <UIIcon name="info" size={14} /> How to perform it
              </h4>
              <p>{workout.instructions}</p>
            </div>
          )}

          <div className="detail-block">
            <h4>
              <UIIcon name="video" size={14} /> Reference videos
            </h4>
            {totalVideos > 0 ? (
              <div className="category-video-readouts">
                {workoutCategories.map((c) => {
                  const vids = categoryVideos[c] || []
                  if (!vids.length) return null
                  const info = CATEGORY_MAP[c]
                  return (
                    <div className="category-video-readout" key={c} style={{ '--chip-color': info?.color }}>
                      <div className="category-set-readout-head">
                        <Icon name={c} size={14} color={info?.color} />
                        <span>{c}</span>
                      </div>
                      <div className="video-readout-grid">
                        {vids.map((vid) => (
                          <VideoPlayer key={vid} videoId={vid} />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="video-missing">
                <UIIcon name="video" size={16} /> No reference videos attached
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ----------------------------------------------------------------
   Main app
------------------------------------------------------------------- */

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => loadCurrentUser())
  const [theme, setTheme] = useState(() => loadTheme())
  const [activeWeek, setActiveWeek] = useState('thisWeek') // 'thisWeek' | 'nextWeek'
  const [workouts, setWorkouts] = useState(() => (currentUser ? loadWorkouts(currentUser, 'thisWeek') : []))
  const [view, setView] = useState('dashboard') // 'dashboard' | 'all'
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('All')
  const [formOpen, setFormOpen] = useState(false)
  const [editingWorkout, setEditingWorkout] = useState(null)
  const [prefillDay, setPrefillDay] = useState(null)
  const [restDays, setRestDays] = useState(
    () => new Set(currentUser ? loadRestDays(currentUser) : DEFAULT_REST_DAYS),
  )

  const today = getTodayDayName()
  // The day currently selected in the clickable weekly schedule.
  const [selectedDay, setSelectedDay] = useState(today)
  const [navOpen, setNavOpen] = useState(false)

  useEffect(() => {
    if (!currentUser) return
    saveWorkouts(currentUser, activeWeek, workouts)
  }, [workouts, activeWeek, currentUser])

  function switchWeek(weekKey) {
    if (weekKey === activeWeek) return
    setActiveWeek(weekKey)
    setWorkouts(loadWorkouts(currentUser, weekKey))
  }

  useEffect(() => {
    if (!currentUser) return
    saveRestDays(currentUser, Array.from(restDays))
  }, [restDays, currentUser])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    saveTheme(theme)
  }, [theme])

  function toggleTheme() {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  }

  function handleAuthSuccess(username) {
    setCurrentUser(username)
    setActiveWeek('thisWeek')
    setWorkouts(loadWorkouts(username, 'thisWeek'))
    setRestDays(new Set(loadRestDays(username)))
    setView('dashboard')
  }

  function handleLogout() {
    saveCurrentUser(null)
    setCurrentUser(null)
    setWorkouts([])
    setRestDays(new Set(DEFAULT_REST_DAYS))
    setFormOpen(false)
    setEditingWorkout(null)
    setPendingDeleteId(null)
  }

  function toggleRestDay(dayKey) {
    setRestDays((prev) => {
      const next = new Set(prev)
      if (next.has(dayKey)) next.delete(dayKey)
      else next.add(dayKey)
      return next
    })
  }

  function toggleWorkoutComplete(id) {
    const key = todayDateKey()
    setWorkouts((prev) =>
      prev.map((w) => {
        if (w.id !== id) return w
        const dates = w.completedDates || []
        const has = dates.includes(key)
        return { ...w, completedDates: has ? dates.filter((d) => d !== key) : [...dates, key] }
      }),
    )
  }

  async function copyWeekPlan(fromWeek, toWeek) {
    const fromLabel = WEEKS.find((w) => w.key === fromWeek)?.label || fromWeek
    const toLabel = WEEKS.find((w) => w.key === toWeek)?.label || toWeek
    const confirmed = window.confirm(
      `Copy ${fromLabel}'s plan to ${toLabel}? This replaces everything currently scheduled in ${toLabel}.`,
    )
    if (!confirmed) return

    const sourceWorkouts = fromWeek === activeWeek ? workouts : loadWorkouts(fromWeek)
    const copied = []

    for (const w of sourceWorkouts) {
      const newCategoryVideos = {}
      if (w.categoryVideos) {
        for (const [cat, ids] of Object.entries(w.categoryVideos)) {
          const newIds = []
          for (const oldId of ids) {
            try {
              const record = await getVideo(oldId)
              if (record) {
                const newId = uid()
                await putVideo(newId, record.blob)
                newIds.push(newId)
              }
            } catch {
              /* skip missing video */
            }
          }
          newCategoryVideos[cat] = newIds
        }
      }
      copied.push({
        ...w,
        id: uid(),
        completedDates: [],
        categoryVideos: newCategoryVideos,
        createdAt: Date.now(),
      })
    }

    saveWorkouts(toWeek, copied)
    if (toWeek === activeWeek) {
      setWorkouts(copied)
    }
  }

  const todayIsRest = isRestDay(today, restDays)

  const todaysWorkouts = useMemo(
    () => workouts.filter((w) => w.day === today).sort((a, b) => a.createdAt - b.createdAt),
    [workouts, today],
  )

  const completedTodayCount = todaysWorkouts.filter((w) => (w.completedDates || []).includes(todayDateKey())).length

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return workouts
      .filter((w) => {
        if (filterCategory === 'All') return true
        const cats = w.categories || (w.category ? [w.category] : [])
        return cats.includes(filterCategory)
      })
      .filter((w) => {
        if (!q) return true
        const cats = w.categories || (w.category ? [w.category] : [])
        return (
          cats.some((c) => c.toLowerCase().includes(q)) ||
          (w.notes || '').toLowerCase().includes(q) ||
          (w.instructions || '').toLowerCase().includes(q) ||
          (w.tips || '').toLowerCase().includes(q)
        )
      })
  }, [workouts, search, filterCategory])

  // Always grouped Monday -> Sunday, in the fixed weekly order, regardless of when entries were added.
  function groupByDay(list) {
    const byDay = new Map(WEEK_DAYS.map((d) => [d.key, []]))
    for (const w of list) {
      if (!byDay.has(w.day)) byDay.set(w.day, [])
      byDay.get(w.day).push(w)
    }
    for (const arr of byDay.values()) {
      arr.sort((a, b) => a.createdAt - b.createdAt)
    }
    return WEEK_DAYS.map((d) => [d.key, byDay.get(d.key) || []])
  }

  const grouped = useMemo(() => groupByDay(filtered), [filtered])

  // Unfiltered grouping — used by the clickable weekly schedule so search/filter
  // in the "All workouts" tab never hides a day's plan on the dashboard.
  const groupedAll = useMemo(() => groupByDay(workouts), [workouts])

  const selectedDayWorkouts = useMemo(
    () => groupedAll.find(([key]) => key === selectedDay)?.[1] || [],
    [groupedAll, selectedDay],
  )

  function openAddForm(day) {
    setEditingWorkout(null)
    setPrefillDay(day || null)
    setFormOpen(true)
  }

  function openEditForm(workout) {
    setEditingWorkout(workout)
    setPrefillDay(null)
    setFormOpen(true)
  }

  const [pendingDeleteId, setPendingDeleteId] = useState(null)

  function handleDelete(id) {
    setPendingDeleteId(id)
  }

  async function confirmDelete() {
    const id = pendingDeleteId
    setPendingDeleteId(null)
    const target = workouts.find((w) => w.id === id)
    if (!target) return
    const videoIds = target.categoryVideos
      ? Object.values(target.categoryVideos).flat()
      : target.videoId
        ? [target.videoId]
        : []
    for (const vid of videoIds) {
      try {
        await deleteVideo(vid)
      } catch {
        /* ignore */
      }
    }
    setWorkouts((prev) => prev.filter((w) => w.id !== id))
  }

  const pendingDeleteWorkout = workouts.find((w) => w.id === pendingDeleteId) || null
  const pendingDeleteLabel = pendingDeleteWorkout
    ? (pendingDeleteWorkout.categories || (pendingDeleteWorkout.category ? [pendingDeleteWorkout.category] : [])).join(' + ')
    : ''

  function handleSaveWorkout(data) {
    // Video uploads/deletes are already resolved inside WorkoutForm before
    // this is called, so we just persist the final workout record.
    setWorkouts((prev) => {
      const exists = prev.some((w) => w.id === data.id)
      if (exists) return prev.map((w) => (w.id === data.id ? data : w))
      return [...prev, data]
    })

    setFormOpen(false)
    setEditingWorkout(null)
    setPrefillDay(null)
  }

  if (!currentUser) {
    return <AuthScreen onAuth={handleAuthSuccess} />
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">
            <UIIcon name="stopwatch" size={20} />
          </span>
          FitPlan
        </div>

        <button
          type="button"
          className="icon-btn hamburger-btn"
          onClick={() => setNavOpen((v) => !v)}
          aria-label={navOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={navOpen}
        >
          <UIIcon name={navOpen ? 'x' : 'menu'} size={18} />
        </button>

        {navOpen && <div className="nav-drawer-backdrop" onClick={() => setNavOpen(false)} />}

        <div className={`header-nav-drawer ${navOpen ? 'open' : ''}`}>
          <nav className="tabs">
            <button
              className={`tab ${view === 'dashboard' ? 'active' : ''}`}
              onClick={() => {
                setView('dashboard')
                setNavOpen(false)
              }}
            >
              Dashboard
            </button>
            <button
              className={`tab ${view === 'all' ? 'active' : ''}`}
              onClick={() => {
                setView('all')
                setNavOpen(false)
              }}
            >
              All workouts
            </button>
          </nav>

          <nav className="tabs week-tabs" aria-label="Select week">
            {WEEKS.map((w) => (
              <button
                key={w.key}
                className={`tab ${activeWeek === w.key ? 'active' : ''}`}
                onClick={() => {
                  switchWeek(w.key)
                  setNavOpen(false)
                }}
              >
                {w.label}
              </button>
            ))}
          </nav>

          <button
            type="button"
            className="btn btn-ghost small copy-week-btn"
            onClick={() => {
              copyWeekPlan(
                activeWeek === 'thisWeek' ? 'thisWeek' : 'nextWeek',
                activeWeek === 'thisWeek' ? 'nextWeek' : 'thisWeek',
              )
              setNavOpen(false)
            }}
          >
            <UIIcon name="copy" size={14} />
            {activeWeek === 'thisWeek' ? 'Copy to Next Week' : 'Copy to This Week'}
          </button>
        </div>

        <button
          type="button"
          className="icon-btn theme-toggle-btn"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          <UIIcon name={theme === 'dark' ? 'sun' : 'moon'} size={17} />
        </button>

        <div className="auth-status">
          <span className="auth-username">
            <UIIcon name="user" size={14} /> {currentUser}
          </span>
          <button
            type="button"
            className="icon-btn logout-btn"
            onClick={handleLogout}
            aria-label="Log out"
            title="Log out"
          >
            <UIIcon name="log-out" size={16} />
          </button>
        </div>

        </header>

      <main className="app-main">
        {view === 'dashboard' && (
          <section className="dashboard-section">
            <div className="section-heading">
              <h1>Today · {today}</h1>
              <p className="section-sub">
                {todaysWorkouts.length
                  ? `${todaysWorkouts.length} exercise${todaysWorkouts.length > 1 ? 's' : ''} scheduled`
                  : todayIsRest
                    ? 'Rest day — recover and stretch'
                    : 'Nothing scheduled for today'}
              </p>
            </div>

            {todaysWorkouts.length > 0 && (
              <div className="today-progress">
                <div className="today-progress-bar">
                  <div
                    className="today-progress-fill"
                    style={{ width: `${(completedTodayCount / todaysWorkouts.length) * 100}%` }}
                  />
                </div>
                <span className="today-progress-label">
                  {completedTodayCount} of {todaysWorkouts.length} done today
                </span>
              </div>
            )}

            {todaysWorkouts.length === 0 ? (
              <div className="empty-state">
                <UIIcon name={todayIsRest ? 'sparkle' : 'calendar'} size={28} />
                <p>{todayIsRest ? 'Today is a scheduled rest day.' : 'No workout scheduled for today.'}</p>
                <button className="btn btn-primary" onClick={() => openAddForm(today)}>
                  <UIIcon name="plus" size={16} /> {todayIsRest ? 'Add something anyway' : 'Schedule one now'}
                </button>
              </div>
            ) : (
              <div className="workout-grid">
                {todaysWorkouts.map((w) => (
                  <WorkoutCard
                    key={w.id}
                    workout={w}
                    onEdit={openEditForm}
                    onDelete={handleDelete}
                    onToggleComplete={toggleWorkoutComplete}
                    completedToday={(w.completedDates || []).includes(todayDateKey())}
                  />
                ))}
              </div>
            )}

            <div className="section-heading upcoming-heading">
              <h2>Your permanent weekly schedule</h2>
              <p className="section-sub">Click any day to see its full workout plan. Repeats automatically every week.</p>
            </div>

            <div className="week-selector">
              {WEEK_DAYS.map((d, i) => {
                const count = groupedAll.find(([key]) => key === d.key)?.[1]?.length || 0
                const rest = isRestDay(d.key, restDays)
                const isToday = d.key === today
                const isSelected = d.key === selectedDay
                return (
                  <button
                    type="button"
                    key={d.key}
                    className={`week-day-btn ${isSelected ? 'selected' : ''} ${rest ? 'is-rest' : ''} ${isToday ? 'is-today' : ''}`}
                    onClick={() => setSelectedDay(d.key)}
                    aria-pressed={isSelected}
                  >
                    <span className="week-day-ordinal">{String(i + 1).padStart(2, '0')}</span>
                    <span className="week-day-btn-name">{d.key}</span>
                    {isToday && <span className="today-pill">Today</span>}
                    <span className="week-day-btn-meta">
                      {count > 0
                        ? `${count} exercise${count > 1 ? 's' : ''}`
                        : rest
                          ? 'Rest day'
                          : 'Nothing planned'}
                    </span>
                  </button>
                )
              })}
            </div>

            <div className="day-detail-panel">
              <div className="day-detail-head">
                <div>
                  <h3>
                    {selectedDay} plan
                    {isRestDay(selectedDay, restDays) && selectedDayWorkouts.length === 0 && (
                      <span className="rest-pill inline">Usually rest</span>
                    )}
                  </h3>
                  <p className="section-sub" style={{ margin: 0 }}>
                    {selectedDayWorkouts.length
                      ? `${selectedDayWorkouts.length} exercise${selectedDayWorkouts.length > 1 ? 's' : ''} every ${selectedDay}`
                      : 'No exercises assigned to this day yet.'}
                  </p>
                </div>
                <div className="day-detail-actions">
                  <button
                    type="button"
                    className={`btn btn-ghost small rest-toggle-btn ${isRestDay(selectedDay, restDays) ? 'active' : ''}`}
                    onClick={() => toggleRestDay(selectedDay)}
                  >
                    <UIIcon name="sparkle" size={15} />
                    {isRestDay(selectedDay, restDays) ? 'Unmark rest day' : 'Mark as rest day'}
                  </button>
                  <button className="btn btn-ghost small" onClick={() => openAddForm(selectedDay)}>
                    <UIIcon name="plus" size={15} /> Add to {selectedDay}
                  </button>
                </div>
              </div>

              {selectedDayWorkouts.length === 0 ? (
                <div className="empty-state small">
                  <UIIcon name={isRestDay(selectedDay, restDays) ? 'sparkle' : 'calendar'} size={24} />
                  <p>
                    {isRestDay(selectedDay, restDays)
                      ? `${selectedDay} is usually a rest day.`
                      : `Nothing scheduled for ${selectedDay} yet.`}
                  </p>
                </div>
              ) : (
                <div className="workout-grid">
                  {selectedDayWorkouts.map((w) => (
                    <WorkoutCard
                      key={w.id}
                      workout={w}
                      onEdit={openEditForm}
                      onDelete={handleDelete}
                      onToggleComplete={toggleWorkoutComplete}
                      completedToday={(w.completedDates || []).includes(todayDateKey())}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {view === 'all' && (
          <section className="all-section">
            <div className="section-heading">
              <h1>All workouts</h1>
              <p className="section-sub">{workouts.length} total exercise{workouts.length === 1 ? '' : 's'} scheduled</p>
            </div>

            <div className="toolbar">
              <div className="search-box">
                <UIIcon name="search" size={16} />
                <input
                  type="text"
                  placeholder="Search by exercise or notes…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="filter-box">
                <UIIcon name="filter" size={16} />
                <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
                  <option value="All">All categories</option>
                  {CATEGORIES.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="empty-state">
                <UIIcon name="search" size={28} />
                <p>No workouts match your search or filter.</p>
              </div>
            ) : (
              grouped
                .filter(([, items]) => items.length > 0)
                .map(([dayKey, items]) => (
                  <div key={dayKey} className="date-group">
                    <h3 className="date-group-heading">
                      {dayKey}
                      {isRestDay(dayKey, restDays) && <span className="rest-pill inline">Usually rest</span>}
                    </h3>
                    <div className="workout-grid">
                      {items.map((w) => (
                        <WorkoutCard
                          key={w.id}
                          workout={w}
                          onEdit={openEditForm}
                          onDelete={handleDelete}
                          onToggleComplete={toggleWorkoutComplete}
                          completedToday={(w.completedDates || []).includes(todayDateKey())}
                        />
                      ))}
                    </div>
                  </div>
                ))
            )}
          </section>
        )}
      </main>

      {formOpen && (
        <WorkoutForm
          initial={editingWorkout}
          defaultDay={prefillDay}
          restDays={restDays}
          onCancel={() => {
            setFormOpen(false)
            setEditingWorkout(null)
            setPrefillDay(null)
          }}
          onSave={handleSaveWorkout}
        />
      )}

      {pendingDeleteWorkout && (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setPendingDeleteId(null)}>
          <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Delete workout?</h2>
              <button type="button" className="icon-btn" onClick={() => setPendingDeleteId(null)} aria-label="Close">
                <UIIcon name="x" />
              </button>
            </div>
            <div className="confirm-modal-body">
              <p>
                Delete this <strong>{pendingDeleteLabel || 'workout'}</strong>? This can't be undone.
              </p>
              <div className="form-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setPendingDeleteId(null)}>
                  Cancel
                </button>
                <button type="button" className="btn btn-primary danger-btn" onClick={confirmDelete}>
                  <UIIcon name="trash" size={16} /> Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}