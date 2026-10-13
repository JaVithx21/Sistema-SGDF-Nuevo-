import { AUTH_ROUTES } from '@/constants/auth';
import { ROLE_HOME, ROLE_PROTECTED_ROUTES, isUserRole } from '@/constants/roles';
import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const updateSession = async (request: NextRequest) => {
    // 1. Generar nonce para CSP (OWASP A05) ANTES de procesar la respuesta
    const isDev = process.env.NODE_ENV === 'development';
    const nonce = isDev ? '' : btoa(crypto.randomUUID());

    // 2. Pasar el nonce en los headers de la request para que Next.js lo lea
    const requestHeaders = new Headers(request.headers);
    if (!isDev && nonce) {
        requestHeaders.set('x-nonce', nonce);
    }

    // 3. Crear la respuesta con los headers actualizados
    let supabaseResponse = NextResponse.next({
        request: {
            headers: requestHeaders,
        },
    });

    const supabase = createServerClient(
        supabaseUrl!,
        supabaseKey!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
                    supabaseResponse = NextResponse.next({
                        request: {
                            headers: requestHeaders,
                        },
                    })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    )
                },
            },
        },
    );

    // Refreshing the auth token
    const {
        data: { user },
    } = await supabase.auth.getUser();

    // Rutas públicas que no requieren autenticación
    // Incluye '/' para evitar bucle de redirección (page.tsx maneja esa ruta)
    const publicRoutes = [AUTH_ROUTES.login, '/auth/callback', '/recover', '/update-password', '/'];
    const isPublicRoute = publicRoutes.some((route) =>
        route === '/'
            ? request.nextUrl.pathname === '/'
            : request.nextUrl.pathname.startsWith(route)
    );


    // Si no hay usuario autenticado y la ruta no es pública, redirigir a /login
    if (!user && !isPublicRoute) {
        const url = request.nextUrl.clone();
        url.pathname = AUTH_ROUTES.login;
        return NextResponse.redirect(url);
    }

    // --- Protección de rutas por rol (Zero Trust: fail-closed) ---
    if (user) {
        let { data: perfil } = await supabase
            .from('usuarios')
            .select('rol')
            .eq('id', user.id)
            .single();

        if (!perfil && user.email) {
            const { data: perfilEmail } = await supabase
                .from('usuarios')
                .select('rol')
                .eq('email', user.email)
                .single();
            if (perfilEmail) perfil = perfilEmail;
        }

        // Un rol fuera de la fuente única se trata igual que no tener perfil (fail-closed)
        if (!perfil?.rol || !isUserRole(perfil.rol)) {
            // Si el usuario ya está en /login, dejarlo ahí sin redirigir (rompe el bucle)
            if (request.nextUrl.pathname.startsWith(AUTH_ROUTES.login)) {
                // Cerrar sesión para que no vuelva a entrar al bucle
                await supabase.auth.signOut();

                // Limpiar cookies de sesión de Supabase en la respuesta
                const response = NextResponse.next({
                    request: { headers: requestHeaders },
                });
                request.cookies.getAll().forEach((cookie) => {
                    if (cookie.name.startsWith('sb-')) {
                        response.cookies.delete(cookie.name);
                    }
                });
                return response;
            }

            // Si está en otra ruta, redirigir a /login con el mensaje de error
            const url = request.nextUrl.clone();
            url.pathname = AUTH_ROUTES.login;
            url.searchParams.set(
                'error_description',
                'Tu cuenta no tiene un perfil asignado. Contacta al administrador.'
            );
            return NextResponse.redirect(url);
        }

        const userRole = perfil.rol;

        // Si tiene perfil válido y está en /login, llevarlo a la pantalla de inicio de su rol
        if (request.nextUrl.pathname.startsWith(AUTH_ROUTES.login)) {
            const url = request.nextUrl.clone();
            url.pathname = ROLE_HOME[userRole];
            return NextResponse.redirect(url);
        }

        const protectedRoute = ROLE_PROTECTED_ROUTES.find((route) =>
            request.nextUrl.pathname.startsWith(route.prefix)
        );

        // Sin permiso: volver a su inicio. ROLE_HOME de cada rol siempre le está
        // permitido, así que esta redirección no puede entrar en bucle.
        if (protectedRoute && !protectedRoute.roles.includes(userRole)) {
            const url = request.nextUrl.clone();
            url.pathname = ROLE_HOME[userRole];
            url.search = '';
            return NextResponse.redirect(url);
        }
    }

    // ─── Cabeceras de Seguridad HTTP (OWASP A05) ────────────────────────
    const supabaseOrigin = supabaseUrl ? new URL(supabaseUrl).origin : '';

    const scriptSrc = isDev
        ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
        : "script-src 'self' 'unsafe-inline' https://accounts.google.com";

    const cspHeader = [
        "default-src 'self'",
        scriptSrc,
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "img-src 'self' data: blob: https:",
        "font-src 'self' https://fonts.gstatic.com",
        `connect-src 'self' ${supabaseOrigin} https://accounts.google.com https://oauth2.googleapis.com`,
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self' https://accounts.google.com",
        "frame-ancestors 'none'",
    ].join('; ');

    supabaseResponse.headers.set('Content-Security-Policy', cspHeader);
    supabaseResponse.headers.set('X-Frame-Options', 'DENY');
    supabaseResponse.headers.set('X-Content-Type-Options', 'nosniff');
    supabaseResponse.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    supabaseResponse.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

    return supabaseResponse;
};