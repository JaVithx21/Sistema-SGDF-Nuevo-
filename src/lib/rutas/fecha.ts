/** Fecha de hoy en Chile como "YYYY-MM-DD" (en-CA usa ese formato). */
export function hoyEnChile(): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
}

export function esFechaIso(valor: unknown): valor is string {
    return typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor) && !Number.isNaN(Date.parse(valor));
}
