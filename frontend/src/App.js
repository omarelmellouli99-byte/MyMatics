import { useEffect, useState, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import axios from "axios";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import Plot from "react-plotly.js";
import dpeLogo from "./assets/dpe-logo.png";

// ════════════════════════════════════════════════════════════
// 📌 POUR REMPLACER LE LOGO PAR LE VRAI FICHIER :
//   1. Place ton logo dans :     frontend/public/dpe-logo.png  (ou .svg)
//   2. Cherche plus bas la ligne `<DpeLogo width={170} />`
//   3. Remplace-la par :         <img src="/dpe-logo.png" alt="DPE" style={{ width: 170 }} />
// ════════════════════════════════════════════════════════════

const API = "https://mymatics-production.up.railway.app";

const C = {
  navy:       "#0a1733",
  navyHover:  "#152347",
  navyLight:  "#1e2e54",
  yellow:     "#FFCD00",
  yellowSoft: "#FFF7CC",
  bg:         "#f5f7fb",
  card:       "#ffffff",
  border:     "#e5e7eb",
  borderSoft: "#f1f3f7",
  text:       "#0a1733",
  textSec:    "#475569",
  muted:      "#94a3b8",
  ok:         "#10b981",
  warn:       "#f59e0b",
  danger:     "#dc2626",
  accent:     "#1e40af",
};

const DPE_LOGO_SRC = dpeLogo;
const DpeLogo = ({ width = 120 }) => (
  <img
    src={DPE_LOGO_SRC}
    alt="Logo Colas Rail DPE"
    style={{
      width,
      height: "auto",
      display: "block",
      objectFit: "contain",
    }}
  />
);

const NAV_ITEMS = [
  { id: "live",      label: "Suivi en temps réel", icon: "📡" },
  { id: "analytics", label: "Analyse historique",  icon: "📊" },
  { id: "alerts",    label: "Alertes",             icon: "🔔" },
  { id: "assets",    label: "Engins & capteurs",   icon: "🚂" },
  { id: "reports",   label: "Rapports",            icon: "📋" },
  { id: "settings",  label: "Administration",      icon: "⚙️" },
];

// ✅ FIX : ajout de fuel_rate (consommation), fuel_level reste mais sera complété
const PARAMS = [
  { key: "temperature", label: "Température",    unit: "°C",  color: "#dc2626", icon: "🌡️" },
  { key: "fuel_rate",   label: "Consommation",   unit: "L/h", color: "#FFCD00", icon: "⛽" },
  { key: "fuel_level",  label: "Niveau Fuel",    unit: "%",   color: "#f59e0b", icon: "🛢️" },
  { key: "battery",     label: "Batterie",       unit: "V",   color: "#10b981", icon: "🔋" },
  { key: "load",        label: "Charge moteur",  unit: "%",   color: "#1e40af", icon: "⚙️" },
  { key: "p_oil",       label: "Pression huile", unit: "bar", color: "#7c3aed", icon: "🛢️" },
  { key: "altitude",    label: "Altitude",       unit: "m",   color: "#0891b2", icon: "⛰️" },
];

const trainIcon = new L.DivIcon({
  html: `
    <div style="position:relative;width:38px;height:38px;">
      <div style="position:absolute;inset:0;border-radius:50%;background:${C.yellow};border:3px solid ${C.navy};display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 4px 12px rgba(10,23,51,0.4);">🚂</div>
      <div style="position:absolute;inset:-4px;border-radius:50%;border:2px solid ${C.yellow};opacity:0.4;animation:pulse 2s infinite;"></div>
    </div>
    <style>@keyframes pulse{0%,100%{transform:scale(1);opacity:0.4}50%{transform:scale(1.2);opacity:0.1}}</style>
  `,
  iconSize: [38, 38], iconAnchor: [19, 19], className: ""
});

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `${r},${g},${b}`;
}

function Sparkline({ data, color, width=110, height=22 }) {
  const vals = (data||[]).filter(v => v > 0);
  if (vals.length < 2) return <div style={{ width, height }} />;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const step = width / (vals.length - 1);
  const pts = vals.map((v,i) => `${i*step},${height - ((v-min)/range)*height}`).join(' ');
  const areaPts = `0,${height} ` + pts + ` ${width},${height}`;
  return (
    <svg width={width} height={height}>
      <polygon points={areaPts} fill={color} opacity="0.1" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RecenterMap({ position }) {
  const map = useMap();
  useEffect(() => { if (position) map.setView(position, map.getZoom()); }, [position, map]);
  return null;
}

function getStatus(key, val) {
  if (key === "temperature") {
    if (val > 90) return { label:"Critique", color:C.danger };
    if (val > 80) return { label:"Élevée",   color:C.warn   };
    return               { label:"Normale",  color:C.ok     };
  }
  if (key === "fuel_rate") {
    if (val > 15) return { label:"Élevée",   color:C.warn   };
    if (val < 3)  return { label:"Ralenti",  color:C.muted  };
    return               { label:"Normale",  color:C.ok     };
  }
  if (key === "battery") {
    if (val < 22) return { label:"Faible",   color:C.danger };
    if (val < 24) return { label:"Moyen",    color:C.warn   };
    return               { label:"Bon",      color:C.ok     };
  }
  if (key === "altitude") return { label:"GPS Actif", color:C.accent };
  return { label:"Normal", color:C.ok };
}

export default function App() {
  const [page, setPage]               = useState("live");
  const [positions, setPositions]     = useState([]);
  const [current, setCurrent]         = useState(null);
  const [trail, setTrail]             = useState([]);
  const [progress, setProgress]       = useState({ current: 0, total: 0 });
  const [activeParam, setActiveParam] = useState("temperature");
  const [mapFullscreen, setMapFullscreen] = useState(false);  // ✅ Plein écran

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await axios.get(`${API}/api/positions`);
        const { data, total, current: idx } = res.data;
        if (!data || data.length === 0) return;
        if (data[0].index === 1 && data[data.length-1].index < 50) {
          setPositions([]); setTrail([]);
        }
        setPositions(data);
        setCurrent(data[data.length - 1]);
        setTrail(data.map(p => [p.latitude, p.longitude]));
        setProgress({ current: idx, total });
        // ✅ FIX scroll : ne plus forcer le scroll automatique
      } catch (e) { console.error(e); }
    };
    fetchData();
    const iv = setInterval(fetchData, 3000);
    return () => clearInterval(iv);
  }, []);

  const pct      = progress.total ? ((progress.current / progress.total) * 100).toFixed(1) : 0;
  const mapPos   = current ? [current.latitude, current.longitude] : [48.44, 1.77];
  const last10   = positions.slice(-10).reverse();
  const param    = PARAMS.find(p => p.key === activeParam);
  const vals     = positions.map(p => p[activeParam]).filter(v => v > 0);
  const statCurrent = vals[vals.length-1] ?? 0;
  const statAvg  = vals.length ? (vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1) : 0;
  const statMax  = vals.length ? Math.max(...vals).toFixed(1) : 0;
  const statMin  = vals.length ? Math.min(...vals).toFixed(1) : 0;

  const tempVals = positions.map(p => p.temperature).filter(v => v > 0);
  const tempDist = [
    { label:"< 60°C",  count: tempVals.filter(v=>v<60).length,        color:"#94a3b8" },
    { label:"60-70°C", count: tempVals.filter(v=>v>=60&&v<70).length, color:C.ok      },
    { label:"70-80°C", count: tempVals.filter(v=>v>=70&&v<80).length, color:C.yellow  },
    { label:"80-90°C", count: tempVals.filter(v=>v>=80&&v<90).length, color:C.warn    },
    { label:"> 90°C",  count: tempVals.filter(v=>v>=90).length,       color:C.danger  },
  ];
  const tempTotal = tempDist.reduce((s,d)=>s+d.count,0) || 1;

  const chartData = positions.filter(p => p[activeParam] > 0).sort((a,b) => a.heure.localeCompare(b.heure));
  const chartX    = chartData.map(p => p.heure.replace(' ', 'T'));
  const chartY    = chartData.map(p => p[activeParam]);

  const cardStyle = {
    background: C.card,
    borderRadius: 12,
    border: `1px solid ${C.border}`,
    boxShadow: "0 1px 3px rgba(10,23,51,0.04), 0 1px 2px rgba(10,23,51,0.06)",
  };

  // ────── Rendu du contenu de la carte (réutilisé en plein écran) ──────
  const renderMap = (height = "100%") => current && (
    <MapContainer center={mapPos} zoom={11} style={{ height, width:"100%" }}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
      <TileLayer url="https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png" attribution="© OpenRailwayMap" opacity={0.7} />
      <RecenterMap position={mapPos} />
      {trail.length > 1 && <Polyline positions={trail} color={C.navy} weight={3.5} opacity={0.85} />}
      <Marker position={mapPos} icon={trainIcon}>
        <Popup maxWidth={250}>
          <div style={{ fontFamily:"'Inter',sans-serif", fontSize:12, lineHeight:1.7, color:C.text, padding:"3px 0" }}>
            <div style={{ fontWeight:"700", fontSize:13, color:C.navy, marginBottom:6 }}>🚂 Train CR-4521</div>
            <div style={{ color:C.textSec, marginBottom:2 }}><b>Date :</b> {current.date?.slice(0,10)}</div>
            <div style={{ color:C.textSec, marginBottom:2 }}><b>Heure :</b> {current.heure?.slice(11,19)}</div>
            <div style={{ color:C.textSec, marginBottom:2 }}><b>Position :</b> {current.latitude.toFixed(4)}, {current.longitude.toFixed(4)}</div>
            <div style={{ color:C.textSec, marginBottom:2 }}><b>Cap :</b> {current.cap}°</div>
          </div>
        </Popup>
      </Marker>
    </MapContainer>
  );

  return (
    <div style={{ display:"flex", height:"100vh", background:C.bg, fontFamily:"'Inter', 'Segoe UI', system-ui, sans-serif", color:C.text, overflow:"hidden" }}>

      {/* ══════════ SIDEBAR ══════════ */}
      <aside style={{ width:240, background:C.navy, display:"flex", flexDirection:"column", flexShrink:0, color:"#cbd5e1" }}>

        <div style={{ padding:"22px 22px 18px", borderBottom:`1px solid ${C.navyLight}` }}>
          <div style={{ display:"flex", alignItems:"center", gap:11 }}>
            <div style={{ width:36, height:36, borderRadius:9, background:C.yellow, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, color:C.navy, fontWeight:"900" }}>M</div>
            <div>
              <div style={{ fontSize:16, fontWeight:"700", color:"#ffffff", letterSpacing:0.3 }}>MyMatics</div>
              <div style={{ fontSize:10, color:"#94a3b8", letterSpacing:0.8, textTransform:"uppercase", marginTop:1 }}>Rail Telemetry</div>
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════════════════ */}
        {/* 📌 EMPLACEMENT DU LOGO DPE                            */}
        {/*   Remplace <DpeLogo width={170} /> par :              */}
        {/*   <img src="/dpe-logo.png" alt="DPE" style={{width:170}} /> */}
        {/*   (mets le fichier dans frontend/public/)             */}
        {/* ════════════════════════════════════════════════════ */}
        <div style={{ padding:"18px 22px", borderBottom:`1px solid ${C.navyLight}`, display:"flex", justifyContent:"center" }}>
          <DpeLogo width={170} />
        </div>

        <nav style={{ flex:1, padding:"14px 0", overflowY:"auto" }}>
          {NAV_ITEMS.map(item => (
            <button key={item.id} onClick={() => setPage(item.id)} style={{ width:"100%", display:"flex", alignItems:"center", gap:12, padding:"11px 22px", border:"none", background: page===item.id ? "rgba(255,205,0,0.1)" : "transparent", color: page===item.id ? C.yellow : "#cbd5e1", fontSize:13, cursor:"pointer", textAlign:"left", borderLeft: page===item.id ? `3px solid ${C.yellow}` : "3px solid transparent", transition:"all 0.15s", fontFamily:"inherit", fontWeight: page===item.id ? "600" : "400" }}>
              <span style={{ fontSize:15 }}>{item.icon}</span>{item.label}
            </button>
          ))}
        </nav>

        <div style={{ padding:"18px 22px", borderTop:`1px solid ${C.navyLight}`, fontSize:11 }}>
          <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:6 }}>
            <span style={{ width:8, height:8, borderRadius:"50%", background:C.ok, display:"block", boxShadow:`0 0 8px ${C.ok}` }} />
            <span style={{ color:"#ffffff", fontWeight:"600" }}>Système opérationnel</span>
          </div>
          <div style={{ color:"#94a3b8", fontSize:10 }}>
            {current ? `${current.date?.slice(0,10)} · ${current.heure?.slice(11,19)}` : "—"}
          </div>
          <div style={{ marginTop:12, padding:"10px 0 0", borderTop:`1px solid ${C.navyLight}`, display:"flex", alignItems:"center", gap:9 }}>
            <div style={{ width:30, height:30, borderRadius:"50%", background:`linear-gradient(135deg,${C.yellow},#ffa500)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, color:C.navy, fontWeight:"700" }}>OG</div>
            <div>
              <div style={{ color:"#ffffff", fontSize:11, fontWeight:"600" }}>Othmane GAMZI</div>
              <div style={{ color:"#94a3b8", fontSize:9 }}>Admin</div>
            </div>
          </div>
        </div>
      </aside>

      {/* ══════════ MAIN ══════════ */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>

        <header style={{ height:60, borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", padding:"0 24px", justifyContent:"space-between", flexShrink:0, background:C.card }}>
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              <span style={{ fontSize:17, fontWeight:"700", color:C.text }}>{NAV_ITEMS.find(n=>n.id===page)?.label}</span>
              {page==="live" && (
                <span style={{ fontSize:10, background:C.ok+"15", color:C.ok, padding:"3px 10px", borderRadius:12, border:`1px solid ${C.ok}33`, fontWeight:"600", letterSpacing:0.5 }}>● LIVE</span>
              )}
            </div>
            <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>
              {page==="live" ? "Supervision des trains et équipements" : page==="analytics" ? "Analyse des performances et indicateurs" : ""}
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:14 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, background:C.bg, border:`1px solid ${C.border}`, borderRadius:9, padding:"7px 12px", fontSize:12, cursor:"pointer", color:C.text }}>
              <span style={{ width:8, height:8, borderRadius:"50%", background:C.yellow, display:"block" }} />
              <span style={{ fontWeight:"600" }}>Train CR-4521</span>
              <span style={{ color:C.muted, fontSize:10 }}>▾</span>
            </div>
            <div style={{ fontSize:11, color:C.muted }}>
              {current?.date?.slice(0,10)} · {current?.heure?.slice(11,16)}
            </div>
          </div>
        </header>

        {/* ════ LIVE ════ */}
        {page === "live" && (
          <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", padding:16, gap:12 }}>

            {/* ✅ KPI Cards plus compacts pour donner plus de place à la map */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, flexShrink:0 }}>
              {[
                { key:"temperature", label:"Température moteur", value:current?.temperature??0, unit:"°C",  icon:"🌡️" },
                { key:"fuel_rate",   label:"Consommation",       value:current?.fuel_rate??0,   unit:"L/h", icon:"⛽" },
                { key:"battery",     label:"Tension batterie",   value:current?.battery??0,     unit:"V",   icon:"🔋" },
                { key:"altitude",    label:"Altitude",           value:current?.altitude??0,    unit:"m",   icon:"⛰️" },
              ].map(kpi => {
                const st = getStatus(kpi.key, kpi.value);
                const sparkData = positions.slice(-20).map(p => p[kpi.key]);
                const col = PARAMS.find(p=>p.key===kpi.key)?.color ?? C.accent;
                return (
                  <div key={kpi.key} style={{ ...cardStyle, padding:"11px 14px" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:6 }}>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:9, color:C.muted, textTransform:"uppercase", letterSpacing:1, fontWeight:"600", marginBottom:4 }}>{kpi.label}</div>
                        <div style={{ display:"flex", alignItems:"baseline", gap:4 }}>
                          <span style={{ fontSize:22, fontWeight:"700", color:C.text, letterSpacing:-0.5 }}>{kpi.value.toFixed(1)}</span>
                          <span style={{ fontSize:11, color:C.muted, fontWeight:"500" }}>{kpi.unit}</span>
                        </div>
                        <div style={{ fontSize:10, color:st.color, marginTop:3, fontWeight:"600", display:"flex", alignItems:"center", gap:4 }}>
                          <span style={{ width:5, height:5, borderRadius:"50%", background:st.color, display:"block" }} />
                          {st.label}
                        </div>
                      </div>
                      <div style={{ width:30, height:30, borderRadius:7, background:col+"15", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14 }}>{kpi.icon}</div>
                    </div>
                    <Sparkline data={sparkData} color={col} width={200} height={22} />
                  </div>
                );
              })}
            </div>

            <div style={{ flex:1, display:"grid", gridTemplateColumns:"1fr 380px", gap:12, minHeight:0 }}>

              {/* ════ MAP avec bouton plein écran ════ */}
              <div style={{ ...cardStyle, overflow:"hidden", position:"relative", display:"flex", flexDirection:"column" }}>
                <div style={{ padding:"12px 18px", borderBottom:`1px solid ${C.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:"600", color:C.text }}>Carte réseau ferroviaire</div>
                    <div style={{ fontSize:10, color:C.muted, marginTop:1 }}>OpenRailwayMap · Position en temps réel</div>
                  </div>
                  <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                    <span style={{ fontSize:10, background:C.yellowSoft, color:C.navy, padding:"4px 9px", borderRadius:6, fontWeight:"600" }}>● GPS</span>
                    <span style={{ fontSize:10, background:C.bg, color:C.textSec, padding:"4px 9px", borderRadius:6, border:`1px solid ${C.border}` }}>{trail.length} pts</span>
                    {/* ✅ Bouton plein écran */}
                    <button onClick={() => setMapFullscreen(true)} title="Agrandir la carte" style={{ background:C.navy, color:"#fff", border:"none", borderRadius:6, padding:"5px 9px", fontSize:11, cursor:"pointer", display:"flex", alignItems:"center", gap:5, fontFamily:"inherit", fontWeight:"500" }}>
                      ⛶ Agrandir
                    </button>
                  </div>
                </div>
                <div style={{ flex:1, position:"relative" }}>
                  {renderMap()}
                </div>
              </div>

              {/* ════ TABLE — Scroll naturel, latest en haut ════ */}
              <div style={{ ...cardStyle, display:"flex", flexDirection:"column", overflow:"hidden" }}>
                <div style={{ padding:"12px 18px", borderBottom:`1px solid ${C.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:"600", color:C.text }}>Données télémétriques</div>
                    <div style={{ fontSize:10, color:C.muted, marginTop:1 }}>10 dernières mesures</div>
                  </div>
                  <span style={{ fontSize:10, background:C.ok+"15", color:C.ok, padding:"3px 9px", borderRadius:12, border:`1px solid ${C.ok}33`, fontWeight:"600" }}>● Live</span>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"34px 1fr 56px 50px 50px", padding:"10px 16px", fontSize:9, color:C.muted, letterSpacing:1, textTransform:"uppercase", borderBottom:`1px solid ${C.borderSoft}`, background:C.bg, fontWeight:"600" }}>
                  <span>#</span><span>Date & heure</span><span>Temp</span><span>Carb</span><span>Bat</span>
                </div>
                <div style={{ overflowY:"auto", flex:1 }}>
                  {last10.map((p, i) => (
                    <div key={i} style={{ display:"grid", gridTemplateColumns:"34px 1fr 56px 50px 50px", padding:"10px 16px", fontSize:11, borderBottom:`1px solid ${C.borderSoft}`, background: i===0 ? C.yellowSoft+"60" : "transparent", borderLeft: i===0 ? `3px solid ${C.yellow}` : "3px solid transparent" }}>
                      <span style={{ color:C.muted, fontWeight:"600" }}>{p.index}</span>
                      <span style={{ color:C.textSec, fontSize:10 }}>{p.date?.slice(0,10)} {p.heure?.slice(11,19)}</span>
                      <span style={{ color: p.temperature>85?C.danger:p.temperature>75?C.warn:C.ok, fontWeight:"600" }}>{p.temperature.toFixed(1)}°</span>
                      <span style={{ color:C.text, fontWeight:"500" }}>{p.fuel_rate.toFixed(1)}</span>
                      <span style={{ color:C.text, fontWeight:"500" }}>{p.battery.toFixed(1)}V</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ ...cardStyle, padding:"12px 22px", display:"flex", alignItems:"center", gap:18, flexShrink:0 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ width:9, height:9, borderRadius:"50%", background:C.yellow, display:"block" }} />
                <span style={{ fontSize:12, fontWeight:"600", color:C.text }}>Progression du trajet</span>
                <span style={{ fontSize:10, color:C.muted, background:C.bg, padding:"2px 8px", borderRadius:5, border:`1px solid ${C.border}` }}>Mode replay</span>
              </div>
              <div style={{ flex:1, height:8, background:C.borderSoft, borderRadius:4, overflow:"hidden", position:"relative" }}>
                <div style={{ height:"100%", width:`${pct}%`, background:`linear-gradient(90deg,${C.yellow},#ffa500)`, borderRadius:4, transition:"width 0.5s", boxShadow:`0 0 8px ${C.yellow}66` }} />
              </div>
              <span style={{ fontSize:11, color:C.textSec, whiteSpace:"nowrap" }}>
                <b style={{ color:C.text }}>{progress.current.toLocaleString()}</b> / {progress.total.toLocaleString()} enregistrements
              </span>
              <span style={{ fontSize:14, fontWeight:"700", color:C.navy, minWidth:48, textAlign:"right" }}>{pct}%</span>
            </div>
          </div>
        )}

        {/* ════ ANALYTICS ════ */}
        {page === "analytics" && (
          <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", padding:20, gap:16 }}>

            <div style={{ display:"flex", gap:8, flexShrink:0, alignItems:"center", justifyContent:"space-between" }}>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                {PARAMS.map(p => (
                  <button key={p.key} onClick={() => setActiveParam(p.key)} style={{ padding:"9px 16px", borderRadius:9, border: activeParam===p.key ? `1px solid ${p.color}66` : `1px solid ${C.border}`, cursor:"pointer", fontSize:12, fontFamily:"inherit", background: activeParam===p.key ? `rgba(${hexToRgb(p.color)},0.08)` : C.card, color: activeParam===p.key ? p.color : C.textSec, fontWeight: activeParam===p.key ? "600" : "500", transition:"all 0.15s", boxShadow: activeParam===p.key ? "0 1px 3px rgba(10,23,51,0.06)" : "none" }}>
                    {p.icon} {p.label}
                  </button>
                ))}
              </div>
              <div style={{ fontSize:11, color:C.textSec, background:C.card, border:`1px solid ${C.border}`, borderRadius:8, padding:"8px 14px", whiteSpace:"nowrap", display:"flex", alignItems:"center", gap:7 }}>
                <span>📅</span>
                <span style={{ fontWeight:"500" }}>
                  {positions[0]?.date?.slice(0,10)} — {positions[positions.length-1]?.date?.slice(0,10)}
                </span>
              </div>
            </div>

            <div style={{ flex:1, display:"grid", gridTemplateColumns:"1fr 330px", gap:16, minHeight:0 }}>

              <div style={{ ...cardStyle, overflow:"hidden", display:"flex", flexDirection:"column" }}>
                <div style={{ padding:"14px 18px", borderBottom:`1px solid ${C.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div>
                    <div style={{ fontSize:14, fontWeight:"600", color:C.text }}>{param.icon} Évolution {param.label.toLowerCase()}</div>
                    <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>{vals.length.toLocaleString()} mesures · Unité : {param.unit}</div>
                  </div>
                </div>
                <div style={{ flex:1, minHeight:0, padding:8 }}>
                  {chartData.length > 0 ? (
                    <Plot
                      data={[{
                        x: chartX, y: chartY,
                        type:"scatter", mode:"lines",
                        line:{ color:param.color, width:2, shape:"linear" },
                        fill:"tozeroy", fillcolor: param.color+"12",
                        name: param.label,
                        hovertemplate: `<b>${param.label}</b><br>%{x}<br>%{y} ${param.unit}<extra></extra>`,
                      }]}
                      layout={{
                        paper_bgcolor:"rgba(0,0,0,0)", plot_bgcolor:"rgba(0,0,0,0)",
                        font:{ family:"'Inter',sans-serif", color:C.textSec, size:11 },
                        margin:{ t:10, r:14, b:50, l:55 },
                        xaxis:{ gridcolor:C.borderSoft, tickcolor:C.muted, linecolor:C.border, type:"date", tickformat:"%d/%m %H:%M" },
                        yaxis:{ gridcolor:C.borderSoft, tickcolor:C.muted, linecolor:C.border, title:{ text:`${param.label} (${param.unit})`, font:{color:C.textSec, size:11} } },
                        showlegend:false, hovermode:"x unified",
                      }}
                      config={{ displayModeBar:true, responsive:true, displaylogo:false, modeBarButtonsToRemove:["lasso2d","select2d"] }}
                      style={{ width:"100%", height:"100%" }}
                      useResizeHandler
                    />
                  ) : (
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100%", color:C.muted }}>⏳ En attente des données pour ce paramètre...</div>
                  )}
                </div>
              </div>

              <div style={{ display:"flex", flexDirection:"column", gap:12, overflowY:"auto" }}>
                {[
                  { label:"Valeur actuelle", value:statCurrent.toFixed(1), sub: current ? `${current.date?.slice(0,10)} · ${current.heure?.slice(11,19)}` : "", color:param.color },
                  { label:"Moyenne",         value:statAvg,                sub:"Sur la période",   color:C.accent },
                  { label:"Maximum",         value:statMax,                sub:"Pic enregistré",   color:C.warn },
                ].map((s,i) => (
                  <div key={i} style={{ ...cardStyle, padding:"14px 16px" }}>
                    <div style={{ fontSize:10, color:C.muted, marginBottom:6, textTransform:"uppercase", letterSpacing:1, fontWeight:"600" }}>{s.label}</div>
                    <div style={{ display:"flex", alignItems:"baseline", gap:4 }}>
                      <span style={{ fontSize:24, fontWeight:"700", color:s.color, letterSpacing:-0.5 }}>{s.value}</span>
                      <span style={{ fontSize:12, color:C.muted, fontWeight:"500" }}>{param.unit}</span>
                    </div>
                    <div style={{ fontSize:10, color:C.muted, marginTop:4 }}>{s.sub}</div>
                  </div>
                ))}

                <div style={{ ...cardStyle, padding:"14px 16px" }}>
                  <div style={{ fontSize:12, fontWeight:"700", color:C.text, marginBottom:10 }}>Statistiques détaillées</div>
                  {[
                    { label:"Minimum",      value:`${statMin} ${param.unit}` },
                    { label:"Maximum",      value:`${statMax} ${param.unit}` },
                    { label:"Moyenne",      value:`${statAvg} ${param.unit}` },
                    { label:"Échantillons", value:vals.length.toLocaleString() },
                  ].map((r,i) => (
                    <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom: i<3 ? `1px solid ${C.borderSoft}` : "none", fontSize:11 }}>
                      <span style={{ color:C.muted }}>{r.label}</span>
                      <span style={{ fontWeight:"600", color:C.text }}>{r.value}</span>
                    </div>
                  ))}
                </div>

                <div style={{ ...cardStyle, padding:"14px 16px" }}>
                  <div style={{ fontSize:12, fontWeight:"700", color:C.text, marginBottom:8 }}>Distribution température</div>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <Plot
                      data={[{ type:"pie", hole:0.6, values:tempDist.map(d=>d.count), labels:tempDist.map(d=>d.label), marker:{ colors:tempDist.map(d=>d.color), line:{color:C.card,width:2} }, textinfo:"none", hovertemplate:"%{label}: %{percent}<extra></extra>" }]}
                      layout={{ paper_bgcolor:"rgba(0,0,0,0)", plot_bgcolor:"rgba(0,0,0,0)", margin:{t:0,r:0,b:0,l:0}, showlegend:false, width:95, height:95 }}
                      config={{ displayModeBar:false }}
                      style={{ width:95, height:95 }}
                    />
                    <div style={{ flex:1 }}>
                      {tempDist.map((d,i) => (
                        <div key={i} style={{ display:"flex", justifyContent:"space-between", fontSize:10, marginBottom:4 }}>
                          <span style={{ display:"flex", alignItems:"center", gap:5 }}>
                            <span style={{ width:7, height:7, borderRadius:2, background:d.color, display:"block" }} />
                            <span style={{ color:C.textSec }}>{d.label}</span>
                          </span>
                          <span style={{ color:C.text, fontWeight:"600" }}>{((d.count/tempTotal)*100).toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {["assets","alerts","reports","settings"].includes(page) && (
          <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:14, padding:40 }}>
            <div style={{ width:80, height:80, borderRadius:20, background:C.card, border:`1px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:36, boxShadow:"0 1px 3px rgba(10,23,51,0.04)" }}>
              {NAV_ITEMS.find(n=>n.id===page)?.icon}
            </div>
            <div style={{ fontSize:20, color:C.text, fontWeight:"600" }}>{NAV_ITEMS.find(n=>n.id===page)?.label}</div>
            <div style={{ fontSize:12, color:C.muted }}>Module en cours de développement</div>
            <div style={{ fontSize:10, color:C.muted, background:C.yellowSoft, padding:"5px 12px", borderRadius:12, fontWeight:"600", letterSpacing:0.5 }}>● BIENTÔT DISPONIBLE</div>
          </div>
        )}
      </div>

      {/* ════════════ MAP FULLSCREEN OVERLAY ════════════ */}
      {mapFullscreen && (
        <div style={{ position:"fixed", inset:0, zIndex:9999, background:C.card, display:"flex", flexDirection:"column" }}>
          <div style={{ padding:"14px 24px", borderBottom:`1px solid ${C.border}`, display:"flex", justifyContent:"space-between", alignItems:"center", background:C.navy, color:"#fff" }}>
            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              <DpeLogo width={110} />
              <div>
                <div style={{ fontSize:15, fontWeight:"700" }}>Carte réseau ferroviaire — Plein écran</div>
                <div style={{ fontSize:11, color:"#cbd5e1", marginTop:2 }}>Train CR-4521 · {current?.date?.slice(0,10)} {current?.heure?.slice(11,19)}</div>
              </div>
            </div>
            <button onClick={() => setMapFullscreen(false)} style={{ background:C.yellow, color:C.navy, border:"none", borderRadius:8, padding:"8px 14px", fontSize:13, fontWeight:"600", cursor:"pointer", display:"flex", alignItems:"center", gap:6, fontFamily:"inherit" }}>
              ✕ Fermer
            </button>
          </div>
          <div style={{ flex:1 }}>
            {renderMap("100%")}
          </div>
        </div>
      )}
    </div>
  );
}