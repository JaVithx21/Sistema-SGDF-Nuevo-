'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { CENTRO_POR_DEFECTO, ZONA_OPERACION } from '@/lib/zona-operacion';

export interface SelectorUbicacionProps {
    /** Ubicación actual del cliente; null = sin ubicación (se centra en Santa Cruz). */
    inicial: { lat: number; lng: number } | null;
    onCambio: (ubicacion: { lat: number; lng: number }) => void;
}

// Mismo criterio que MapaRuta: divIcon, porque los PNG por defecto de Leaflet
// no resuelven sus URLs con el bundler de Next.
const ICONO_CLIENTE = L.divIcon({
    className: '',
    html: '<div style="background:#005088;width:22px;height:22px;border-radius:9999px 9999px 9999px 0;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>',
    iconSize: [22, 22],
    iconAnchor: [11, 22],
});

const LIMITES = L.latLngBounds(
    [ZONA_OPERACION.minLat, ZONA_OPERACION.minLng],
    [ZONA_OPERACION.maxLat, ZONA_OPERACION.maxLng]
);

/** PBI-01.1: el usuario arrastra el marcador (o hace clic en el mapa) para fijar la ubicación. */
export default function SelectorUbicacion({ inicial, onCambio }: SelectorUbicacionProps) {
    const contenedorRef = useRef<HTMLDivElement | null>(null);
    // El mapa se crea una sola vez; el callback más reciente se lee desde la ref.
    const onCambioRef = useRef(onCambio);
    const inicialRef = useRef(inicial);

    useEffect(() => {
        onCambioRef.current = onCambio;
    }, [onCambio]);

    useEffect(() => {
        if (!contenedorRef.current) return;

        const punto = inicialRef.current ?? CENTRO_POR_DEFECTO;
        const mapa = L.map(contenedorRef.current, {
            scrollWheelZoom: false,
            maxBounds: LIMITES.pad(0.05),
            maxBoundsViscosity: 1,
            minZoom: 8,
        }).setView([punto.lat, punto.lng], inicialRef.current ? 16 : 13);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            maxZoom: 19,
        }).addTo(mapa);

        const marcador = L.marker([punto.lat, punto.lng], { icon: ICONO_CLIENTE, draggable: true }).addTo(mapa);

        const fijar = (latlng: L.LatLng) => {
            const lat = Math.round(latlng.lat * 1e7) / 1e7;
            const lng = Math.round(latlng.lng * 1e7) / 1e7;
            marcador.setLatLng([lat, lng]);
            onCambioRef.current({ lat, lng });
        };

        marcador.on('dragend', () => fijar(marcador.getLatLng()));
        mapa.on('click', (e: L.LeafletMouseEvent) => fijar(e.latlng));

        return () => {
            mapa.remove();
        };
    }, []);

    return <div ref={contenedorRef} style={{ height: '100%', width: '100%' }} />;
}
