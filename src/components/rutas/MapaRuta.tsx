'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
// Sin esta hoja de estilos los tiles no se posicionan y el mapa se ve roto.
import 'leaflet/dist/leaflet.css';

export interface MapaRutaProps {
    deposito: { lat: number; lng: number; nombre: string };
    paradas: Array<{
        orden: number;
        lat: number;
        lng: number;
        clienteNombre: string;
        estado?: 'pendiente' | 'entregado' | 'fallido';
    }>;
    /** Trazado por calles (ORS Directions). null = líneas rectas punteadas. */
    geojsonRuta?: Record<string, unknown> | null;
}

const COLOR_RUTA = '#005088';
const COLOR_POR_ESTADO: Record<string, string> = {
    pendiente: '#005088',
    entregado: '#10B981',
    fallido: '#EF4444',
};

/** Los popups de Leaflet son HTML: el texto que viene de la BD se escapa (XSS). */
function escaparHtml(texto: string): string {
    return texto.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

// Los íconos PNG por defecto de Leaflet no resuelven sus URLs con el bundler
// de Next: todos los marcadores se construyen con divIcon.
function iconoParada(orden: number, estado?: string): L.DivIcon {
    const color = COLOR_POR_ESTADO[estado ?? 'pendiente'] ?? COLOR_RUTA;
    return L.divIcon({
        className: '',
        html: `<div style="background:${color};color:#fff;width:28px;height:28px;border-radius:9999px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">${orden}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
    });
}

function iconoDeposito(): L.DivIcon {
    return L.divIcon({
        className: '',
        html: '<div style="background:#1e293b;width:30px;height:30px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:15px;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">🏠</div>',
        iconSize: [30, 30],
        iconAnchor: [15, 15],
    });
}

export default function MapaRuta({ deposito, paradas, geojsonRuta }: MapaRutaProps) {
    const contenedorRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!contenedorRef.current) return;

        const mapa = L.map(contenedorRef.current, { scrollWheelZoom: false });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            maxZoom: 19,
        }).addTo(mapa);

        L.marker([deposito.lat, deposito.lng], { icon: iconoDeposito() })
            .addTo(mapa)
            .bindPopup(`<strong>${escaparHtml(deposito.nombre)}</strong><br/>Punto de origen`);

        paradas.forEach((p) => {
            L.marker([p.lat, p.lng], { icon: iconoParada(p.orden, p.estado) })
                .addTo(mapa)
                .bindPopup(`<strong>Parada ${p.orden}</strong><br/>${escaparHtml(p.clienteNombre)}`);
        });

        if (geojsonRuta && typeof geojsonRuta.type === 'string') {
            L.geoJSON(geojsonRuta as unknown as GeoJSON.GeoJsonObject, {
                style: { color: COLOR_RUTA, weight: 4, opacity: 0.8 },
            }).addTo(mapa);
        } else if (paradas.length > 0) {
            L.polyline(
                [
                    [deposito.lat, deposito.lng],
                    ...paradas.map((p) => [p.lat, p.lng] as L.LatLngTuple),
                    [deposito.lat, deposito.lng],
                ],
                { color: COLOR_RUTA, weight: 3, opacity: 0.7, dashArray: '6 8' } // punteado = aproximado
            ).addTo(mapa);
        }

        const puntos: L.LatLngTuple[] = [[deposito.lat, deposito.lng], ...paradas.map((p) => [p.lat, p.lng] as L.LatLngTuple)];
        if (puntos.length > 1) mapa.fitBounds(L.latLngBounds(puntos), { padding: [40, 40] });
        else mapa.setView([deposito.lat, deposito.lng], 13);

        return () => {
            mapa.remove();
        };
    }, [deposito, paradas, geojsonRuta]);

    return <div ref={contenedorRef} style={{ height: '100%', width: '100%' }} />;
}
