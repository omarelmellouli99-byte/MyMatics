import { useEffect, useState, useRef } from "react";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import axios from "axios";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Icône train personnalisée
const trainIcon = new L.DivIcon({
  html: `<div style="font-size: 28px; line-height: 1;">🚂</div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 15],
  className: ""
});

function RecenterMap({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.setView(position, map.getZoom());
  }, [position, map]);
  return null;
}

const POLL_INTERVAL = 2000;

export default function App() {
  const [positions, setPositions] = useState([]);
  const [current, setCurrent]     = useState(null);
  const [trail, setTrail]         = useState([]);
  const knownCount = useRef(0);
  const tableRef = useRef(null);

  useEffect(() => {
    const fetchPositions = async () => {
      try {
        const res = await axios.get("https://mymatics-production.up.railway.app/api/positions");
        const all = res.data;

        // Détecte si nouveau cycle (fichier remis à zéro)
        if (all.length < knownCount.current) {
          knownCount.current = 0;
          setTrail([]);
          setPositions([]);
        }

        // Récupère uniquement les nouveaux points
        const newPoints = all.slice(knownCount.current);
        if (newPoints.length > 0) {
          knownCount.current = all.length;
          setPositions(all);
          setCurrent(all[all.length - 1]);
          setTrail(all.map(p => [p.latitude, p.longitude]));

          // Scroll automatique vers le bas
          setTimeout(() => {
            if (tableRef.current) {
              tableRef.current.scrollTop = tableRef.current.scrollHeight;
            }
          }, 100);
        }
      } catch (err) {
        console.error("Erreur API :", err);
      }
    };

    fetchPositions();
    const interval = setInterval(fetchPositions, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  if (!current) return (
    <div style={{
      display: "flex", justifyContent: "center", alignItems: "center",
      height: "100vh", fontFamily: "sans-serif", fontSize: 18
    }}>
      ⏳ En attente des données...
    </div>
  );

  const position = [current.latitude, current.longitude];

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "sans-serif" }}>

      {/* ── GAUCHE : Carte ── */}
      <div style={{ width: "50%", position: "relative" }}>

        {/* Bandeau sur la carte */}
        <div style={{
          position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)",
          zIndex: 1000, background: "white", padding: "6px 16px", borderRadius: 8,
          boxShadow: "0 2px 8px rgba(0,0,0,0.2)", fontSize: 12,
          display: "flex", gap: 16, alignItems: "center", whiteSpace: "nowrap"
        }}>
          <span>📅 {current.date}</span>
          <span>🕐 {current.heure}</span>
          <span>🔢 {positions.length} points</span>
          <span style={{ color: "red", fontWeight: "bold" }}>● Live</span>
        </div>

        <MapContainer center={position} zoom={9} style={{ height: "100%", width: "100%" }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <RecenterMap position={position} />
          {trail.length > 1 && (
            <Polyline positions={trail} color="#2563eb" weight={3} opacity={0.7} />
          )}
          <Marker position={position} icon={trainIcon} />
        </MapContainer>
      </div>

      {/* ── DROITE : Tableau ── */}
      <div style={{
        width: "50%", display: "flex", flexDirection: "column",
        background: "#f8fafc", borderLeft: "1px solid #e2e8f0"
      }}>

        {/* Header */}
        <div style={{
          padding: "14px 20px", background: "#1e3a5f", color: "white",
          fontWeight: "bold", fontSize: 15, display: "flex",
          justifyContent: "space-between", alignItems: "center"
        }}>
          <span>🚂 Trajet Paris → Amiens</span>
          <span style={{
            background: "", padding: "3px 10px",
            borderRadius: 12, fontSize: 12
          }}>● LIVE</span>
        </div>

        {/* En-têtes colonnes */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "50px 100px 90px 110px 110px 70px 70px",
          background: "#e2e8f0", padding: "8px 12px",
          fontSize: 11, fontWeight: "bold", color: "#475569",
          borderBottom: "1px solid #cbd5e1"
        }}>
          <span>#</span>
          <span>Date</span>
          <span>Heure</span>
          <span>Latitude</span>
          <span>Longitude</span>
          <span>Alt (m)</span>
          <span>RPM</span>
        </div>

        {/* Lignes */}
        <div ref={tableRef} style={{ overflowY: "auto", flex: 1 }}>
          {positions.map((p, i) => (
            <div key={i} style={{
              display: "grid",
              gridTemplateColumns: "50px 100px 90px 110px 110px 70px 70px",
              padding: "7px 12px",
              fontSize: 12,
              background: i === positions.length - 1
                ? "#dbeafe"
                : i % 2 === 0 ? "white" : "#f8fafc",
              borderBottom: "1px solid #f1f5f9",
              transition: "background 0.3s"
            }}>
              <span style={{ color: "#94a3b8" }}>{i + 1}</span>
              <span>{p.date}</span>
              <span>{p.heure}</span>
              <span>{p.latitude.toFixed(5)}</span>
              <span>{p.longitude.toFixed(5)}</span>
              <span>{p.altitude.toFixed(0)}</span>
              <span>{p.rpm || '—'}</span>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          padding: "10px 20px", background: "#1e3a5f", color: "#94a3b8",
          fontSize: 11, display: "flex", justifyContent: "space-between"
        }}>
          <span>📍 {current.latitude.toFixed(5)}, {current.longitude.toFixed(5)}</span>
          <span>⛰️ Alt: {current.altitude.toFixed(0)} m</span>
        </div>
      </div>
    </div>
  );
}