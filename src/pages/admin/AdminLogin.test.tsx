import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

// Mock useAuth so we don't have to spin up the full AuthProvider here.
const authMock = {
  user: null as { _id: string; email: string; role: string } | null,
  login: vi.fn(async () => ({})),
  logout: vi.fn(),
  loading: false,
  refreshUser: vi.fn(),
}
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => authMock,
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

import AdminLogin from '@/pages/admin/AdminLogin'

function renderPage(initialPath = '/admin/login') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin" element={<div data-testid="admin-home">admin</div>} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  window.localStorage.clear()
  authMock.user = null
  authMock.login.mockReset()
  authMock.logout.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('AdminLogin page — smoke', () => {
  it('renders the admin login form', () => {
    renderPage()
    expect(screen.getByText(/Connexion Admin/i)).toBeInTheDocument()
  })

  it('has accessible labels for email and password (fix #8)', () => {
    renderPage()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Mot de passe')).toBeInTheDocument()
  })

  it('renders the submit button and it is clickable', () => {
    renderPage()
    const button = screen.getByRole('button', { name: /Se connecter/i })
    expect(button).toBeInTheDocument()
    expect(button).not.toBeDisabled()
  })

  it('toggles password visibility when clicking the eye button', () => {
    renderPage()
    const pwd = screen.getByLabelText('Mot de passe') as HTMLInputElement
    expect(pwd.type).toBe('password')
    const toggle = screen.getByRole('button', { name: /Afficher le mot de passe/i })
    fireEvent.click(toggle)
    expect(pwd.type).toBe('text')
  })

  it('calls login() with email + password on submit', async () => {
    authMock.login.mockResolvedValue({})
    renderPage()
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: /Se connecter/i }))
    await waitFor(() => expect(authMock.login).toHaveBeenCalledWith('a@b.com', 'secret', undefined))
  })

  it('redirects to /admin when an admin user is already logged in', () => {
    authMock.user = { _id: '1', email: 'a@b.com', role: 'SUPER_ADMIN' }
    renderPage()
    expect(screen.getByTestId('admin-home')).toBeInTheDocument()
  })

  it('shows a "forgot password" link when not in 2FA mode', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /Mot de passe oublie/i })).toBeInTheDocument()
  })

  it('switches to 2FA mode when backend returns requires2FA', async () => {
    authMock.login.mockResolvedValue({ requires2FA: true })
    renderPage()
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: /Se connecter/i }))
    await waitFor(() => expect(screen.getByLabelText('Code 2FA')).toBeInTheDocument())
  })
})
