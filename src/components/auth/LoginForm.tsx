'use client';

import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Mail, AlertTriangle } from 'lucide-react';
import { login } from '@/app/(auth)/login/actions';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Input } from '@/components/ui/Input';
import { PasswordInput } from '@/components/ui/PasswordInput';

// ─── SVG del logo oficial de Google ─────────────────────────────────────────

function GoogleIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
        </svg>
    );
}

// ─── Componente Principal ───────────────────────────────────────────────────

export function LoginForm() {
    const searchParams = useSearchParams();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [rememberMe, setRememberMe] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isGoogleLoading, setIsGoogleLoading] = useState(false);
    // Errores de OAuth/middleware llegan en la URL (?error_description=...).
    // Se leen como estado inicial: un efecto con setState provoca un render en cascada.
    const [error, setError] = useState<string | null>(() => {
        const errorDesc = searchParams.get('error_description');
        return errorDesc ? decodeURIComponent(errorDesc) : null;
    });

    // ─── Login con email/password ───────────────────────────────────────

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setIsLoading(true);
        setError(null);

        const formData = new FormData();
        formData.append('email', email);
        formData.append('password', password);
        formData.append('rememberMe', String(rememberMe));

        const result = await login(formData);
        if (result?.error) {
            setError(result.error);
            setIsLoading(false);
        }
    };

    // ─── Login con Google OAuth ─────────────────────────────────────────

    const handleGoogleLogin = async () => {
        setIsGoogleLoading(true);
        setError(null);

        try {
            const supabase = createClient();
            const { error: oauthError } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: `${window.location.origin}/auth/callback`,
                },
            });

            if (oauthError) {
                setError(oauthError.message);
                setIsGoogleLoading(false);
            }
            // Si no hay error, el navegador se redirige automáticamente a Google
        } catch {
            setError('Error inesperado al conectar con Google.');
            setIsGoogleLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* ─── Alerta de error (incluye errores de OAuth) ───────────── */}
            {error && (
                <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                    <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
                    <p className="text-sm text-red-700 font-medium">{error}</p>
                </div>
            )}

            {/* ─── Formulario de email/password ──────────────────────────── */}
            <form onSubmit={handleSubmit} className="space-y-6">
                <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    label="Correo Electrónico"
                    leadingIcon={<Mail className="h-5 w-5 text-gray-400" aria-hidden="true" />}
                    placeholder="ejemplo@distribuidora.com"
                />

                <PasswordInput
                    id="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    label="Contraseña"
                    placeholder="••••••••"
                />

                <div className="flex items-center justify-between mb-8">
                    <Checkbox
                        id="remember-me"
                        checked={rememberMe}
                        onChange={(event) => setRememberMe(event.target.checked)}
                        label="Mantener sesión"
                    />

                    <Link href="/recover" className="text-sm font-medium text-[#005088] hover:text-[#003d66] hover:underline focus:outline-none transition-colors">
                        ¿Olvidaste tu contraseña?
                    </Link>
                </div>

                <Button type="submit" disabled={isLoading || isGoogleLoading}>
                    {isLoading ? 'Autenticando...' : 'Iniciar Sesión'}
                </Button>
            </form>

            {/* ─── Divisor ───────────────────────────────────────────────── */}
            <div className="flex items-center gap-4">
                <div className="h-px flex-1 bg-gray-300/80" />
                <span className="text-sm text-gray-500 font-medium">
                    O iniciar sesión con
                </span>
                <div className="h-px flex-1 bg-gray-300/80" />
            </div>

            {/* ─── Botón de Google ────────────────────────────────────────── */}
            <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={isLoading || isGoogleLoading}
                className="w-full flex items-center justify-center gap-3 rounded-xl border border-white/60 bg-white/50 px-4 py-3 text-sm font-semibold text-gray-700 shadow-sm transition-all duration-200 hover:bg-white/80 hover:border-gray-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#005088] focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isGoogleLoading ? (
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-[#005088]" />
                ) : (
                    <GoogleIcon />
                )}
                {isGoogleLoading
                    ? 'Conectando con Google...'
                    : 'Iniciar Sesión con Google'}
            </button>
        </div>
    );
}
