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
 
const API = "http://127.0.0.1:5000";
 
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
  { id: "history",   label: "Historique parcours", icon: "🗺️" },
  { id: "alerts",    label: "Alertes",             icon: "🔔" },
  { id: "assets",    label: "Engins & capteurs",   icon: "🚂" },
  { id: "reports",   label: "Rapports",            icon: "📋" },
  { id: "settings",  label: "Administration",      icon: "⚙️" },
];
 
// ✅ FIX : ajout de fuel_rate (consommation), fuel_level reste mais sera complété
const PARAMS = [
  { key: "temperature", label: "Température liquide",    unit: "°C",  color: "#dc2626", icon: "🌡️" },
  { key: "fuel_rate",   label: "Consommation",   unit: "L/h", color: "#FFCD00", icon: "⛽" },
  { key: "fuel_level",  label: "Niveau Fuel",    unit: "%",   color: "#f59e0b", icon: "🛢️" },
  { key: "battery",     label: "Batterie",       unit: "V",   color: "#10b981", icon: "🔋" },
  { key: "load",        label: "Charge moteur",  unit: "%",   color: "#1e40af", icon: "⚙️" },
  { key: "p_oil",       label: "Pression huile", unit: "bar", color: "#7c3aed", icon: "🛢️" },
  { key: "rpm",         label: "Régime moteur",  unit: "tr/min", color: "#ec4899", icon: "🔄" },
  { key: "altitude",    label: "Altitude",       unit: "m",   color: "#0891b2", icon: "⛰️" },
];
 
const DEFAULT_FLEET_COLUMNS = [
  { key: 'id',          label: 'ID Engin',     width: 90  },
  { key: 'numero_gm',   label: 'N° GM',        width: 100 },
  { key: 'agence',      label: 'Agence',       width: 200 },
  { key: 'type',        label: 'Type',         width: 150 },
  { key: 'marque',      label: 'Marque',       width: 130 },
  { key: 'last_update', label: 'Dernière MAJ', width: 140 },
  { key: 'position',    label: 'Position',     width: 90  },
  { key: 'temperature', label: 'Temp liquide °C',      width: 90  },
  { key: 'fuel_rate',   label: 'Carb L/h',     width: 90  },
  { key: 'fuel_level',  label: 'Fuel %',       width: 90  },
  { key: 'battery',     label: 'Bat V',        width: 90  },
  { key: 'etat',        label: 'État',         width: 80  },
  { key: 'engine_hours', label: 'H. moteur',   width: 90  },
  { key: 'p_oil',        label: 'P. huile',    width: 90  },
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

const ChatViz = ({ viz }) => {
  if (!viz) return null;
  const titre = <div style={{ fontSize:11, fontWeight:"700", color:C.navy, margin:"2px 2px 6px" }}>{viz.titre}</div>;

  if (viz.type === "chart") {
    return (
      <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:10, padding:8, marginTop:6 }}>
        {titre}
        <Plot
          data={[{
            x: viz.x, y: viz.y, type:"scatter", mode:"lines",
            line:{ color:C.navy, width:2 }, fill:"tozeroy", fillcolor:"rgba(10,23,51,0.07)",
          }]}
          layout={{
            autosize:true, height:210,
            margin:{ l:38, r:12, t:6, b:30 },
            xaxis:{ tickformat:"%d/%m %H:%M", tickfont:{ size:9 }, nticks:5 },
            yaxis:{ tickfont:{ size:9 } },
            font:{ family:"Inter, sans-serif" },
            showlegend:false, paper_bgcolor:"transparent", plot_bgcolor:"transparent",
          }}
          config={{ displayModeBar:false, responsive:true }}
          style={{ width:"100%" }}
          useResizeHandler
        />
      </div>
    );
  }

  if (viz.type === "map") {
    const pts = viz.points.map(p => [p.lat, p.lng]);
    if (!pts.length) return null;
    const center = pts[Math.floor(pts.length / 2)];
    return (
      <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:10, padding:8, marginTop:6 }}>
        {titre}
        <MapContainer center={center} zoom={11} scrollWheelZoom={false} style={{ height:240, width:"100%", borderRadius:8 }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
          <TileLayer url="https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png" opacity={0.7} />
          {pts.length > 1 && <Polyline positions={pts} color={C.navy} weight={3.5} opacity={0.85} />}
          <Marker position={pts[0]} icon={trainIcon}><Popup>Départ · {viz.points[0].heure}</Popup></Marker>
          {pts.length > 1 && <Marker position={pts[pts.length-1]} icon={trainIcon}><Popup>Fin · {viz.points[pts.length-1].heure}</Popup></Marker>}
        </MapContainer>
      </div>
    );
  }
  return null;
};

// État machine basé sur le régime moteur (RPM)
// État machine basé sur le régime moteur (RPM) et la charge
function getEngineState(rpm, load) {
  const rpmVal  = rpm  || 0;
  const loadVal = load || 0;
  
  // Complètement arrêté : RPM ET charge à 0
  if (rpmVal === 0 && loadVal === 0) {
    return { label: "Arrêté",    color: "#dc2626", bg: "#fef2f2", dot: "#dc2626" };
  }
  // Ralenti : RPM < 600 (mais une activité résiduelle)
  if (rpmVal < 600) {
    return { label: "Ralenti",   color: "#f59e0b", bg: "#fffbeb", dot: "#f59e0b" };
  }
  // En marche : RPM ≥ 600
  return         { label: "En marche", color: "#10b981", bg: "#ecfdf5", dot: "#10b981" };
}
 
export default function App() {
  const [page, setPage]               = useState("live");
  const [positions, setPositions]     = useState([]);
  const [current, setCurrent]         = useState(null);
  const [trail, setTrail]             = useState([]);
  const [progress, setProgress]       = useState({ current: 0, total: 0 });
  const [activeParams, setActiveParams] = useState(["temperature"]);
  const [mapFullscreen, setMapFullscreen] = useState(false);  // ✅ Plein écran

  const [chatOpen, setChatOpen]         = useState(false);
  const [chatMessages, setChatMessages] = useState([
    { role: "bot", text: "Bonjour ! Je suis l'assistant MyMatics. Pose-moi des questions sur les données télématiques 🚂" }
  ]);
  const [chatInput, setChatInput]       = useState("");
  const [chatLoading, setChatLoading]   = useState(false);

  const [alertsTab, setAlertsTab]       = useState("config");  // 'config' ou 'history'
  const [alerts, setAlerts]             = useState([]);
  const [alertsHistory, setAlertsHistory] = useState([]);
  const [showNewAlert, setShowNewAlert] = useState(false);
  const [newAlert, setNewAlert]         = useState({
  name: "",
  recipients: "",
  conditions: [{ parameter: "temperature", operator: ">", value: "" }],
});

const [fleet, setFleet] = useState([]);
const [fleetCols, setFleetCols] = useState(DEFAULT_FLEET_COLUMNS);
const [draggedColIdx, setDraggedColIdx] = useState(null);
const [mapPopup, setMapPopup] = useState(null);  // {lat, lon, id, name}
const [historyEngines, setHistoryEngines] = useState([]);
const [historyEngine,  setHistoryEngine]  = useState("CR-4521");
const [historyStart,   setHistoryStart]   = useState("");
const [historyEnd,     setHistoryEnd]     = useState("");
const [historyPoints,  setHistoryPoints]  = useState([]);
const [historyLoading, setHistoryLoading] = useState(false);
const downloadFleetReport = () => {
  const headers = ['ID Engin','Numéro GM','Agence','Type','Marque','Dernière MAJ',
    'Latitude','Longitude','Altitude (m)','Température (°C)','Consommation (L/h)',
    'Niveau Fuel (%)','Batterie (V)','Charge moteur (%)','Pression huile (bar)',
    'Heures moteur','Cap (°)','Température essieux (°C)','RPM','État'];

  const rows = fleet.map(m => [
    m.id, m.numero_gm, m.agence, m.type, m.marque, m.last_update,
    m.latitude.toFixed(6), m.longitude.toFixed(6), m.altitude.toFixed(0),
    m.temperature.toFixed(1), m.fuel_rate.toFixed(1), m.fuel_level.toFixed(1),
    m.battery.toFixed(1), m.load.toFixed(1), m.p_oil.toFixed(2),
    m.engine_hours.toFixed(1), m.cap.toFixed(0),
    m.axle_temp?.toFixed(1) ?? '', m.rpm?.toFixed(0) ?? '',
    getEngineState(m.rpm, m.load).label
  ]);
  
  const csvContent = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `rapport_flotte_${new Date().toISOString().slice(0,10)}.csv`;
  link.click();
};

useEffect(() => {
  if (page === "reports") {
    axios.get(`${API}/api/fleet`).then(res => setFleet(res.data)).catch(console.error);
  }
}, [page]);

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
  const param    = PARAMS.find(p => p.key === activeParams[0]);
const vals     = positions.map(p => p[activeParams[0]]).filter(v => v > 0);
const statCurrent = vals[vals.length-1] ?? 0;
const statAvg  = vals.length ? (vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1) : 0;
const statMax  = vals.length ? Math.max(...vals).toFixed(1) : 0;
const statMin  = vals.length ? Math.min(...vals).toFixed(1) : 0;

const toggleParam = (key) => {
  if (activeParams.includes(key)) {
    if (activeParams.length > 1) setActiveParams(activeParams.filter(p => p !== key));
  } else {
    setActiveParams([...activeParams, key]);
  }
};

// Build multi-trace data for Plotly overlay
const plotTraces = activeParams.map((paramKey, idx) => {
  const p = PARAMS.find(x => x.key === paramKey);
  const data = positions.filter(pt => pt[paramKey] > 0).sort((a,b) => a.heure.localeCompare(b.heure));
  return {
    x: data.map(pt => pt.heure.replace(' ', 'T')),
    y: data.map(pt => pt[paramKey]),
    type: "scatter",
    mode: "lines",
    name: `${p.label} (${p.unit})`,
    line: { color: p.color, width: 2 },
    yaxis: idx === 0 ? 'y' : `y${idx+1}`,
    hovertemplate: `<b>${p.label}</b>: %{y} ${p.unit}<br>%{x}<extra></extra>`,
  };
});

const plotLayout = (() => {
  const firstParam = PARAMS.find(p => p.key === activeParams[0]);
  const layout = {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: "'Inter',sans-serif", color: C.textSec, size: 11 },
    margin: { t: 30, r: 60 + Math.max(0, activeParams.length - 2) * 55, b: 50, l: 60 },
    xaxis: { gridcolor: C.borderSoft, tickcolor: C.muted, linecolor: C.border, type: "date", tickformat: "%d/%m %H:%M" },
    yaxis: {
      gridcolor: C.borderSoft,
      tickfont: { color: firstParam.color },
      linecolor: firstParam.color,
      title: { text: `${firstParam.label} (${firstParam.unit})`, font: { color: firstParam.color, size: 11 } },
    },
    showlegend: activeParams.length > 1,
    legend: { orientation: "h", y: 1.12, x: 0, font: { size: 11 } },
    hovermode: "x unified",
  };
  activeParams.slice(1).forEach((paramKey, idx) => {
    const p = PARAMS.find(x => x.key === paramKey);
    layout[`yaxis${idx + 2}`] = {
      overlaying: 'y',
      side: 'right',
      tickfont: { color: p.color },
      linecolor: p.color,
      title: { text: `${p.label} (${p.unit})`, font: { color: p.color, size: 11 } },
      position: idx === 0 ? 1 : Math.max(0.7, 1 - idx * 0.08),
      anchor: idx === 0 ? 'x' : 'free',
      showgrid: false,
    };
  });
  return layout;
})();
 
  const tempVals = positions.map(p => p.temperature).filter(v => v > 0);
  const tempDist = [
    { label:"< 60°C",  count: tempVals.filter(v=>v<60).length,        color:"#94a3b8" },
    { label:"60-70°C", count: tempVals.filter(v=>v>=60&&v<70).length, color:C.ok      },
    { label:"70-80°C", count: tempVals.filter(v=>v>=70&&v<80).length, color:C.yellow  },
    { label:"80-90°C", count: tempVals.filter(v=>v>=80&&v<90).length, color:C.warn    },
    { label:"> 90°C",  count: tempVals.filter(v=>v>=90).length,       color:C.danger  },
  ];
  const tempTotal = tempDist.reduce((s,d)=>s+d.count,0) || 1;
 
 
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
      <Marker position={mapPos} icon={trainIcon}>
        <Popup maxWidth={300}>
          <div style={{ fontFamily:"'Inter',sans-serif", fontSize:12, lineHeight:1.6, color:C.text, padding:"3px 0", minWidth:240 }}>
            
            {/* Header */}
            <div style={{ fontWeight:"700", fontSize:14, color:C.navy, marginBottom:8, paddingBottom:6, borderBottom:`1px solid ${C.borderSoft}` }}>
              🚂 Train CR-4521
            </div>
            
            {/* Localisation */}
            <div style={{ fontSize:9, color:C.muted, textTransform:"uppercase", letterSpacing:1, fontWeight:"600", margin:"6px 0 4px" }}>📍 Localisation</div>
            <div style={{ color:C.textSec, marginBottom:2 }}><b>Date :</b> {current.date?.slice(0,10)} · {current.heure?.slice(11,19)}</div>
            <div style={{ color:C.textSec, marginBottom:2 }}><b>Position :</b> {current.latitude.toFixed(4)}, {current.longitude.toFixed(4)}</div>
            <div style={{ color:C.textSec, marginBottom:2 }}><b>Altitude :</b> {current.altitude?.toFixed(0)} m · <b>Cap :</b> {current.cap?.toFixed(0)}°</div>
            
            {/* Télémétrie */}
            <div style={{ fontSize:9, color:C.muted, textTransform:"uppercase", letterSpacing:1, fontWeight:"600", margin:"10px 0 6px" }}>⚙️ Télémétrie</div>
            
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px 12px", fontSize:11 }}>
              <div>
                <span style={{ color:C.muted, fontSize:10 }}>🌡️ Température</span><br/>
                <b style={{ color: current.temperature > 85 ? C.danger : current.temperature > 75 ? C.warn : C.ok, fontSize:13 }}>
                  {current.temperature?.toFixed(1)} °C
                </b>
              </div>
              <div>
                <span style={{ color:C.muted, fontSize:10 }}>🔋 Batterie</span><br/>
                <b style={{ color: current.battery < 22 ? C.danger : current.battery < 24 ? C.warn : C.ok, fontSize:13 }}>
                  {current.battery?.toFixed(1)} V
                </b>
              </div>
              <div>
                <span style={{ color:C.muted, fontSize:10 }}>⛽ Consommation</span><br/>
                <b style={{ color:C.text, fontSize:13 }}>{current.fuel_rate?.toFixed(1)} L/h</b>
              </div>
              <div>
                <span style={{ color:C.muted, fontSize:10 }}>🛢️ Pression huile</span><br/>
                <b style={{ color:C.text, fontSize:13 }}>{current.p_oil?.toFixed(2)} bar</b>
              </div>
              <div>
                <span style={{ color:C.muted, fontSize:10 }}>⚙️ Charge moteur</span><br/>
                <b style={{ color:C.text, fontSize:13 }}>{current.load?.toFixed(0)} %</b>
              </div>
              <div>
                <span style={{ color:C.muted, fontSize:10 }}>⏱️ Heures moteur</span><br/>
                <b style={{ color:C.text, fontSize:13 }}>{current.engine_hours?.toFixed(0)} h</b>
              </div>
            </div>
            
            {/* État */}
            {(() => {
              const st = getEngineState(current.rpm, current.load);
              return (
                <div style={{ marginTop:10, paddingTop:8, borderTop:`1px solid ${C.borderSoft}`,
                  display:"flex", alignItems:"center", justifyContent:"space-between", gap:6 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <span style={{ width:9, height:9, borderRadius:"50%", background:st.dot, display:"inline-block",
                      boxShadow:`0 0 8px ${st.dot}` }} />
                    <span style={{ color:st.color, fontSize:11, fontWeight:"700" }}>{st.label}</span>
                  </div>
                  <div style={{ fontSize:10, color:C.muted }}>
                    RPM : <b style={{ color:C.text }}>{current.rpm?.toFixed(0) ?? 0}</b> tr/min
                  </div>
                </div>
              );
            })()}
            
          </div>
        </Popup>
      </Marker>
    </MapContainer>
  );

// ─── Reconnaissance vocale (Web Speech API) ───
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);

  const toggleVoice = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("La reconnaissance vocale n'est pas supportée ici. Utilise Chrome ou Edge.");
      return;
    }
    if (isListening) {                       // déjà en écoute → on arrête
      recognitionRef.current?.stop();
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "fr-FR";
    recognition.interimResults = true;       // affiche le texte en direct
    recognition.continuous = false;          // s'arrête tout seul après une phrase
    recognition.onstart  = () => setIsListening(true);
    recognition.onresult = (e) => {
      const transcript = Array.from(e.results).map(r => r[0].transcript).join("");
      setChatInput(transcript);              // remplit le champ au fur et à mesure
    };
    recognition.onerror  = () => setIsListening(false);
    recognition.onend    = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
  };

 const sendChat = async () => {
  if (!chatInput.trim() || chatLoading) return;
  const question = chatInput;
  setChatMessages(m => [...m, { role: "user", text: question }]);
  setChatInput("");
  setChatLoading(true);
  try {
    // ✅ Envoie l'historique (sans le message d'accueil)
    const history = chatMessages.slice(1).map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      text: m.text
    }));
    const res = await axios.post(`${API}/api/chat`, { question, history });
    setChatMessages(m => [...m, { role: "bot", text: res.data.response, viz: res.data.visualization }]);
  } catch (e) {
    setChatMessages(m => [...m, { role: "bot", text: "❌ Erreur de connexion à l'assistant." }]);
  }
  setChatLoading(false);
};

  const loadHistoryInfo = async () => {
  try {
    const res = await axios.get(`${API}/api/dataset/info`);
    setHistoryEngines(res.data.engines || []);
    if (res.data.engines?.length && !historyStart) {
      setHistoryStart(res.data.engines[0].first_date);
      setHistoryEnd(res.data.engines[0].last_date);
    }
  } catch (e) { console.error(e); }
};

const searchHistory = async () => {
  setHistoryLoading(true);
  try {
    const res = await axios.get(`${API}/api/history`, {
      params: { engine_id: historyEngine, start_date: historyStart, end_date: historyEnd }
    });
    setHistoryPoints(res.data.points || []);
  } catch (e) { console.error(e); }
  setHistoryLoading(false);
};

useEffect(() => {
  if (page === "history") loadHistoryInfo();
}, [page]);

useEffect(() => {
  const e = historyEngines.find(x => x.id === historyEngine);
  if (e) { setHistoryStart(e.first_date); setHistoryEnd(e.last_date); }
}, [historyEngine, historyEngines]);

  const loadAlerts = async () => {
  try {
    const res = await axios.get(`${API}/api/alerts`);
    setAlerts(res.data);
  } catch (e) { console.error(e); }
};

const loadAlertsHistory = async () => {
  try {
    const res = await axios.get(`${API}/api/alerts/history`);
    setAlertsHistory(res.data.reverse());
  } catch (e) { console.error(e); }
};

const createAlert = async () => {
  if (!newAlert.name.trim()) { alert("Donne un nom à l'alerte"); return; }
  if (!newAlert.recipients.trim()) { alert("Ajoute au moins un destinataire"); return; }
  if (newAlert.conditions.some(c => !c.value)) { alert("Remplis toutes les valeurs"); return; }
  
  try {
    await axios.post(`${API}/api/alerts`, {
      name: newAlert.name,
      conditions: newAlert.conditions.map(c => ({ ...c, value: parseFloat(c.value) })),
      recipients: newAlert.recipients.split(",").map(e => e.trim()).filter(Boolean),
    });
    setNewAlert({ name: "", recipients: "", conditions: [{ parameter: "temperature", operator: ">", value: "" }] });
    setShowNewAlert(false);
    loadAlerts();
  } catch (e) { console.error(e); }
};

const deleteAlert = async (id) => {
  if (!window.confirm("Supprimer cette alerte ?")) return;
  await axios.delete(`${API}/api/alerts/${id}`);
  loadAlerts();
};

const toggleAlert = async (id) => {
  await axios.post(`${API}/api/alerts/${id}/toggle`);
  loadAlerts();
};

useEffect(() => {
  if (page === "alerts") {
    loadAlerts();
    loadAlertsHistory();
    const iv = setInterval(() => {
      if (alertsTab === "history") loadAlertsHistory();
    }, 5000);
    return () => clearInterval(iv);
  }
}, [page, alertsTab]);

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
          {(() => {
            const st = getEngineState(current?.rpm, current?.load);
            return (
              <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:6 }}>
                <span style={{ width:8, height:8, borderRadius:"50%", background:st.dot, display:"block", boxShadow:`0 0 8px ${st.dot}` }} />
                <span style={{ color:"#ffffff", fontWeight:"600" }}>Engin {st.label.toLowerCase()}</span>
              </div>
            );
          })()}
          <div style={{ color:"#94a3b8", fontSize:10 }}>
            {current ? `${current.date?.slice(0,10)} · ${current.heure?.slice(11,19)}` : "—"}
          </div>
          <div style={{ marginTop:12, padding:"10px 0 0", borderTop:`1px solid ${C.navyLight}`, display:"flex", alignItems:"center", gap:9 }}>
            <div style={{ width:30, height:30, borderRadius:"50%", background:`linear-gradient(135deg,${C.yellow},#ffa500)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, color:C.navy, fontWeight:"700" }}>OG</div>
            <div>
              <div style={{ color:"#ffffff", fontSize:11, fontWeight:"600" }}>Taibi BENHIMA</div>
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
              <span style={{ fontWeight:"600" }}> F3000039</span>
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
                {PARAMS.map(p => {
                  const isActive = activeParams.includes(p.key);
                  return (
                    <button key={p.key} onClick={() => toggleParam(p.key)} style={{
                    padding:"9px 14px", borderRadius:9,
                    border: isActive ? `1.5px solid ${p.color}` : `1px solid ${C.border}`,
                    cursor:"pointer", fontSize:12, fontFamily:"inherit",
                    background: isActive ? `rgba(${hexToRgb(p.color)},0.08)` : C.card,
                    color: isActive ? p.color : C.textSec,
                    fontWeight: isActive ? "600" : "500",
                    transition:"all 0.15s",
                    boxShadow: isActive ? "0 1px 3px rgba(10,23,51,0.08)" : "none",
                    display:"flex", alignItems:"center", gap:6
              }}>
                    {isActive && <span style={{ fontSize:10 }}>✓</span>}
                    {p.icon} {p.label}
                </button>
              );
            })}
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
                    <div style={{ fontSize:14, fontWeight:"600", color:C.text }}>
                      {activeParams.length === 1
                        ? `${param.icon} Évolution ${param.label.toLowerCase()}`
                        : `📊 Comparaison de ${activeParams.length} paramètres`}
                    </div>
                    <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>
                      {activeParams.length === 1
                        ? `${vals.length.toLocaleString()} mesures · Unité : ${param.unit}`
                        : activeParams.map(k => PARAMS.find(p => p.key === k)?.label).join(' · ')}
                    </div>
                  </div>
                </div>
                <div style={{ flex:1, minHeight:0, padding:8 }}>
                  {plotTraces.length > 0 && plotTraces[0].x.length > 0 ? (
                    <Plot
                      data={plotTraces}
                      layout={plotLayout}
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
 
        {/* ════ PAGE ALERTES ════ */}
{page === "alerts" && (
  <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", padding:20, gap:16 }}>

    {/* Tabs + bouton créer */}
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexShrink:0 }}>
      <div style={{ display:"flex", gap:6 }}>
        <button onClick={() => setAlertsTab("config")} style={{
          padding:"9px 16px", borderRadius:9, border:`1px solid ${alertsTab==="config" ? C.navy : C.border}`,
          background: alertsTab==="config" ? C.navy : C.card, color: alertsTab==="config" ? "#fff" : C.text,
          cursor:"pointer", fontSize:12, fontWeight:"600", fontFamily:"inherit"
        }}>⚙️ Configuration ({alerts.length})</button>
        <button onClick={() => setAlertsTab("history")} style={{
          padding:"9px 16px", borderRadius:9, border:`1px solid ${alertsTab==="history" ? C.navy : C.border}`,
          background: alertsTab==="history" ? C.navy : C.card, color: alertsTab==="history" ? "#fff" : C.text,
          cursor:"pointer", fontSize:12, fontWeight:"600", fontFamily:"inherit"
        }}>📬 Historique ({alertsHistory.length})</button>
      </div>
      {alertsTab === "config" && (
        <button onClick={() => setShowNewAlert(true)} style={{
          padding:"9px 16px", borderRadius:9, border:"none",
          background:C.yellow, color:C.navy, cursor:"pointer",
          fontSize:12, fontWeight:"700", fontFamily:"inherit"
        }}>+ Nouvelle alerte</button>
      )}
    </div>

    {/* TAB CONFIG */}
    {alertsTab === "config" && (
      <div style={{ ...cardStyle, flex:1, overflow:"auto" }}>
        {alerts.length === 0 ? (
          <div style={{ padding:40, textAlign:"center", color:C.muted }}>
            <div style={{ fontSize:36, marginBottom:10 }}>🔔</div>
            <div style={{ fontSize:14, fontWeight:"600", color:C.text, marginBottom:6 }}>Aucune alerte configurée</div>
            <div style={{ fontSize:12 }}>Clique sur "+ Nouvelle alerte" pour commencer</div>
          </div>
        ) : (
          <div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 2fr 1fr 90px 60px", padding:"12px 18px", fontSize:9, color:C.muted, letterSpacing:1, textTransform:"uppercase", borderBottom:`1px solid ${C.borderSoft}`, background:C.bg, fontWeight:"600" }}>
              <span>Nom</span><span>Conditions</span><span>Destinataires</span><span>Statut</span><span></span>
            </div>
            {alerts.map(a => (
              <div key={a.id} style={{ display:"grid", gridTemplateColumns:"1fr 2fr 1fr 90px 60px", padding:"14px 18px", fontSize:12, borderBottom:`1px solid ${C.borderSoft}`, alignItems:"center" }}>
                <div style={{ fontWeight:"600", color:C.text }}>{a.name}</div>
                <div style={{ fontSize:11, color:C.textSec }}>
                  {a.conditions.map((c,i) => (
                    <span key={i} style={{ display:"inline-block", background:C.bg, padding:"2px 8px", borderRadius:4, marginRight:5, border:`1px solid ${C.border}` }}>
                      {PARAMS.find(p=>p.key===c.parameter)?.label} {c.operator} {c.value}
                    </span>
                  ))}
                </div>
                <div style={{ fontSize:10, color:C.muted }}>{a.recipients.join(", ")}</div>
                <button onClick={() => toggleAlert(a.id)} style={{
                  padding:"4px 10px", borderRadius:6, border:"none", cursor:"pointer",
                  background: a.active ? C.ok+"20" : C.muted+"20",
                  color: a.active ? C.ok : C.muted,
                  fontSize:10, fontWeight:"700", fontFamily:"inherit"
                }}>● {a.active ? "ACTIVE" : "INACTIVE"}</button>
                <button onClick={() => deleteAlert(a.id)} style={{
                  background:"transparent", border:"none", color:C.danger,
                  cursor:"pointer", fontSize:16, padding:4
                }}>🗑️</button>
              </div>
            ))}
          </div>
        )}
      </div>
    )}

    {/* TAB HISTORIQUE */}
    {alertsTab === "history" && (
      <div style={{ ...cardStyle, flex:1, overflow:"auto" }}>
        {alertsHistory.length === 0 ? (
          <div style={{ padding:40, textAlign:"center", color:C.muted }}>
            <div style={{ fontSize:36, marginBottom:10 }}>📬</div>
            <div style={{ fontSize:14, fontWeight:"600", color:C.text, marginBottom:6 }}>Aucune alerte déclenchée</div>
            <div style={{ fontSize:12 }}>L'historique apparaîtra ici dès qu'une alerte se déclenche</div>
          </div>
        ) : (
          <div>
            <div style={{ display:"grid", gridTemplateColumns:"180px 1fr 2fr 80px", padding:"12px 18px", fontSize:9, color:C.muted, letterSpacing:1, textTransform:"uppercase", borderBottom:`1px solid ${C.borderSoft}`, background:C.bg, fontWeight:"600" }}>
              <span>Date & heure</span><span>Alerte</span><span>Conditions déclenchées</span><span>Email</span>
            </div>
            {alertsHistory.map(h => (
              <div key={h.id} style={{ display:"grid", gridTemplateColumns:"180px 1fr 2fr 80px", padding:"12px 18px", fontSize:11, borderBottom:`1px solid ${C.borderSoft}`, alignItems:"center", borderLeft:`3px solid ${C.danger}` }}>
                <div style={{ fontSize:11, color:C.textSec }}>{h.data_date?.slice(0,10)} {h.data_heure?.slice(11,19)}</div>
                <div style={{ fontWeight:"600", color:C.text }}>{h.alert_name}</div>
                <div style={{ fontSize:10, color:C.textSec }}>
                  {h.conditions.map((c,i) => (
                    <div key={i} style={{ marginBottom:2 }}>• {c}</div>
                  ))}
                </div>
                <span style={{
                  fontSize:10, padding:"3px 8px", borderRadius:5, fontWeight:"600",
                  background: h.email_sent ? C.ok+"15" : C.danger+"15",
                  color: h.email_sent ? C.ok : C.danger
                }}>{h.email_sent ? "✅ Envoyé" : "❌ Échec"}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    )}

    {/* MODAL Nouvelle alerte */}
    {showNewAlert && (
      <div style={{ position:"fixed", inset:0, background:"rgba(10,23,51,0.5)", zIndex:9500, display:"flex", alignItems:"center", justifyContent:"center" }}>
        <div style={{ background:C.card, borderRadius:14, width:560, maxHeight:"90vh", overflow:"auto", boxShadow:"0 20px 60px rgba(0,0,0,0.3)" }}>
          <div style={{ padding:"18px 24px", borderBottom:`1px solid ${C.border}`, display:"flex", justifyContent:"space-between", alignItems:"center", background:C.navy, color:"#fff", borderRadius:"14px 14px 0 0" }}>
            <div style={{ fontSize:16, fontWeight:"700" }}>🔔 Nouvelle alerte</div>
            <button onClick={() => setShowNewAlert(false)} style={{ background:"transparent", border:"none", color:"#fff", fontSize:22, cursor:"pointer" }}>✕</button>
          </div>

          <div style={{ padding:24, display:"flex", flexDirection:"column", gap:16 }}>
            <div>
              <label style={{ fontSize:11, color:C.muted, fontWeight:"600", textTransform:"uppercase", letterSpacing:1, marginBottom:6, display:"block" }}>Nom de l'alerte</label>
              <input value={newAlert.name} onChange={e => setNewAlert({...newAlert, name: e.target.value})}
                placeholder="Ex: Surchauffe moteur critique"
                style={{ width:"100%", padding:"10px 14px", borderRadius:8, border:`1px solid ${C.border}`, fontSize:13, outline:"none", fontFamily:"inherit", boxSizing:"border-box" }} />
            </div>

            <div>
              <label style={{ fontSize:11, color:C.muted, fontWeight:"600", textTransform:"uppercase", letterSpacing:1, marginBottom:6, display:"block" }}>Conditions (toutes doivent être vraies)</label>
              {newAlert.conditions.map((cond, i) => (
                <div key={i} style={{ display:"flex", gap:6, marginBottom:6 }}>
                  <select value={cond.parameter} onChange={e => {
                    const cs = [...newAlert.conditions]; cs[i].parameter = e.target.value;
                    setNewAlert({...newAlert, conditions: cs});
                  }} style={{ flex:1, padding:"8px 10px", borderRadius:8, border:`1px solid ${C.border}`, fontSize:12, fontFamily:"inherit" }}>
                    {PARAMS.map(p => <option key={p.key} value={p.key}>{p.icon} {p.label}</option>)}
                  </select>
                  <select value={cond.operator} onChange={e => {
                    const cs = [...newAlert.conditions]; cs[i].operator = e.target.value;
                    setNewAlert({...newAlert, conditions: cs});
                  }} style={{ width:60, padding:"8px 10px", borderRadius:8, border:`1px solid ${C.border}`, fontSize:12, fontFamily:"inherit" }}>
                    <option value=">">&gt;</option>
                    <option value="<">&lt;</option>
                    <option value=">=">≥</option>
                    <option value="<=">≤</option>
                    <option value="==">=</option>
                  </select>
                  <input type="number" value={cond.value} onChange={e => {
                    const cs = [...newAlert.conditions]; cs[i].value = e.target.value;
                    setNewAlert({...newAlert, conditions: cs});
                  }} placeholder="Valeur" style={{ width:90, padding:"8px 10px", borderRadius:8, border:`1px solid ${C.border}`, fontSize:12, fontFamily:"inherit", outline:"none" }} />
                  {newAlert.conditions.length > 1 && (
                    <button onClick={() => {
                      const cs = newAlert.conditions.filter((_,j) => j !== i);
                      setNewAlert({...newAlert, conditions: cs});
                    }} style={{ width:32, background:C.danger+"15", color:C.danger, border:"none", borderRadius:6, cursor:"pointer", fontSize:14 }}>×</button>
                  )}
                </div>
              ))}
              <button onClick={() => setNewAlert({...newAlert, conditions: [...newAlert.conditions, { parameter:"temperature", operator:">", value:"" }]})}
                style={{ padding:"6px 12px", background:C.bg, border:`1px dashed ${C.border}`, borderRadius:6, fontSize:11, cursor:"pointer", color:C.textSec, marginTop:4, fontFamily:"inherit" }}>
                + Ajouter une condition
              </button>
            </div>

            <div>
              <label style={{ fontSize:11, color:C.muted, fontWeight:"600", textTransform:"uppercase", letterSpacing:1, marginBottom:6, display:"block" }}>Destinataires (séparés par des virgules)</label>
              <input value={newAlert.recipients} onChange={e => setNewAlert({...newAlert, recipients: e.target.value})}
                placeholder="email1@colas.com, email2@colas.com"
                style={{ width:"100%", padding:"10px 14px", borderRadius:8, border:`1px solid ${C.border}`, fontSize:13, outline:"none", fontFamily:"inherit", boxSizing:"border-box" }} />
            </div>

            <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:8 }}>
              <button onClick={() => setShowNewAlert(false)} style={{ padding:"10px 18px", background:C.bg, border:`1px solid ${C.border}`, borderRadius:8, cursor:"pointer", fontSize:13, fontFamily:"inherit", color:C.text }}>Annuler</button>
              <button onClick={createAlert} style={{ padding:"10px 18px", background:C.yellow, color:C.navy, border:"none", borderRadius:8, cursor:"pointer", fontSize:13, fontWeight:"700", fontFamily:"inherit" }}>✓ Créer l'alerte</button>
            </div>
          </div>
        </div>
      </div>
    )}
  </div>
)}


{/* ════ PAGE RAPPORTS ════ */}
{page === "reports" && (() => {
  
  // Fonction pour rendre une cellule selon la colonne
  const renderCell = (m, key) => {
    const tempColor = m.temperature > 85 ? C.danger : m.temperature > 75 ? C.warn : C.ok;
    const batColor  = m.battery < 22 ? C.danger : m.battery < 24 ? C.warn : C.ok;
    const empty = (v) => v && v.trim() ? v : <span style={{ color:C.muted, fontStyle:"italic" }}>—</span>;
    
    switch(key) {
      case 'id':          return <span style={{ fontWeight:"700", color:C.navy }}>{m.id}</span>;
      case 'numero_gm':   return <span style={{ color:C.textSec }}>{empty(m.numero_gm)}</span>;
      case 'agence':      return <span style={{ color:C.text, fontSize:10 }}>{empty(m.agence)}</span>;
      case 'type':        return <span style={{ color:C.text }}>{empty(m.type)}</span>;
      case 'marque':      return <span style={{ color:C.textSec, fontSize:10 }}>{empty(m.marque)}</span>;
      case 'last_update': return <span style={{ color:C.muted, fontSize:10 }}>{m.last_update.slice(0,10)} {m.last_update.slice(11,19)}</span>;
      case 'temperature': return <span style={{ color:tempColor, fontWeight:"600" }}>{m.temperature.toFixed(1)}</span>;
      case 'fuel_rate':   return <span style={{ color:C.text, fontWeight:"500" }}>{m.fuel_rate.toFixed(1)}</span>;
      case 'fuel_level':  return <span style={{ color:C.text, fontWeight:"500" }}>{m.fuel_level.toFixed(1)}</span>;
      case 'battery':     return <span style={{ color:batColor, fontWeight:"600" }}>{m.battery.toFixed(1)}</span>;
      case 'etat': {
        const st = getEngineState(m.rpm, m.load);
        return (
          <span style={{ background:st.bg, color:st.color, padding:"3px 8px",
            borderRadius:5, fontSize:10, fontWeight:"700", display:"inline-flex", alignItems:"center", gap:4 }}>
            <span style={{ width:5, height:5, borderRadius:"50%", background:st.dot }} />
            {st.label}
          </span>
        );
      }
      case 'position': return (
        <button onClick={() => setMapPopup({ lat: m.latitude, lon: m.longitude, id: m.id })}
          style={{ background:C.yellowSoft, color:C.navy, border:`1px solid ${C.yellow}88`,
            borderRadius:6, padding:"4px 10px", fontSize:10, cursor:"pointer",
            fontWeight:"600", fontFamily:"inherit", display:"flex", alignItems:"center", gap:4 }}>
        📍 Voir
        </button>
      );

      case 'engine_hours': return <span style={{ color:C.text, fontWeight:"500" }}>{m.engine_hours?.toFixed(0)} h</span>;
      case 'p_oil':        return <span style={{ color:C.text, fontWeight:"500" }}>{m.p_oil?.toFixed(2)} bar</span>;
      case 'axle_temp': {
        const c = m.axle_temp > 80 ? C.danger : m.axle_temp > 60 ? C.warn : C.ok;
        return <span style={{ color: c, fontWeight:"600" }}>{m.axle_temp?.toFixed(1)} °C</span>;
      }
      default: return null;
    }
  };
  
  const handleDragStart = (idx) => setDraggedColIdx(idx);
  const handleDragOver  = (e) => e.preventDefault();
  const handleDrop      = (dropIdx) => {
    if (draggedColIdx === null || draggedColIdx === dropIdx) return;
    const newCols = [...fleetCols];
    const [removed] = newCols.splice(draggedColIdx, 1);
    newCols.splice(dropIdx, 0, removed);
    setFleetCols(newCols);
    setDraggedColIdx(null);
  };
  
  const gridTemplate = fleetCols.map(c => `${c.width}px`).join(' ');
  const totalWidth = fleetCols.reduce((s,c) => s + c.width, 0);
  
  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", padding:20, gap:16 }}>
      
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexShrink:0 }}>
        <div>
          <div style={{ fontSize:16, fontWeight:"700", color:C.text }}>📋 Rapport de flotte</div>
          <div style={{ fontSize:11, color:C.muted, marginTop:3 }}>
            {fleet.length} engins • Dernières données par machine • 👉 Glisse les colonnes pour les réorganiser
          </div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={() => setFleetCols(DEFAULT_FLEET_COLUMNS)}
            style={{ padding:"9px 14px", borderRadius:8, border:`1px solid ${C.border}`,
              background:C.card, color:C.textSec, cursor:"pointer", fontSize:11, fontFamily:"inherit" }}>
            ↺ Réinitialiser
          </button>
          <button onClick={() => axios.get(`${API}/api/fleet`).then(r => setFleet(r.data))}
            style={{ padding:"9px 14px", borderRadius:8, border:`1px solid ${C.border}`,
              background:C.card, color:C.text, cursor:"pointer", fontSize:12, fontFamily:"inherit", fontWeight:"500" }}>
            🔄 Actualiser
          </button>
          <button onClick={downloadFleetReport}
            style={{ padding:"9px 18px", borderRadius:8, border:"none",
              background:C.yellow, color:C.navy, cursor:"pointer",
              fontSize:12, fontWeight:"700", fontFamily:"inherit",
              display:"flex", alignItems:"center", gap:6 }}>
            📥 Télécharger Excel
          </button>
        </div>
      </div>

      <div style={{ ...cardStyle, flex:1, overflow:"auto" }}>
        <div style={{ minWidth: totalWidth }}>
          
          {/* Headers draggables */}
          <div style={{
            display:"grid", gridTemplateColumns: gridTemplate,
            padding:"12px 16px", fontSize:9, color:C.muted, letterSpacing:1, textTransform:"uppercase",
            borderBottom:`2px solid ${C.border}`, background:C.bg, fontWeight:"700",
            position:"sticky", top:0, zIndex:1
          }}>
            {fleetCols.map((col, idx) => (
              <span key={col.key}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(idx)}
                style={{
                  cursor: "grab",
                  padding: "4px 6px",
                  borderRadius: 4,
                  background: draggedColIdx === idx ? C.yellowSoft : "transparent",
                  border: draggedColIdx === idx ? `1px dashed ${C.yellow}` : "1px dashed transparent",
                  transition: "all 0.15s",
                  userSelect: "none",
                  display: "flex", alignItems: "center", gap: 4
                }}
                onMouseEnter={e => e.currentTarget.style.background = C.borderSoft}
                onMouseLeave={e => { if (draggedColIdx !== idx) e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{ color:C.muted, fontSize:10, fontWeight:"400" }}>⋮⋮</span>
                {col.label}
              </span>
            ))}
          </div>
          
          {/* Lignes */}
          {fleet.map((m, i) => (
            <div key={m.id} style={{
              display:"grid", gridTemplateColumns: gridTemplate,
              padding:"12px 16px", fontSize:11, borderBottom:`1px solid ${C.borderSoft}`,
              background: i%2===0 ? C.card : C.bg,
              alignItems:"center"
            }}>
              {fleetCols.map(col => (
                <div key={col.key} style={{ padding:"0 6px" }}>
                  {renderCell(m, col.key)}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      
      <div style={{ fontSize:10, color:C.muted, textAlign:"center", flexShrink:0 }}>
        Affichage de {fleet.length} engins • Mis à jour {new Date().toLocaleString('fr-FR')}
      </div>
    </div>
  );
})()}

{/* ════ PAGE HISTORIQUE PARCOURS ════ */}
{page === "history" && (
  <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", padding:20, gap:16 }}>
    
    {/* Barre de filtres */}
    <div style={{ ...cardStyle, padding:"14px 18px", display:"flex", gap:14, alignItems:"flex-end", flexShrink:0, flexWrap:"wrap" }}>
      <div>
        <div style={{ fontSize:10, color:C.muted, fontWeight:"600", textTransform:"uppercase", letterSpacing:1, marginBottom:5 }}>🚂 Engin</div>
        <select value={historyEngine} onChange={e => setHistoryEngine(e.target.value)}
          style={{ padding:"9px 12px", borderRadius:8, border:`1px solid ${C.border}`, fontSize:13, fontFamily:"inherit", minWidth:140, background:C.card }}>
          {historyEngines.map(e => <option key={e.id} value={e.id}>{e.id}</option>)}
        </select>
      </div>
      
      <div>
        <div style={{ fontSize:10, color:C.muted, fontWeight:"600", textTransform:"uppercase", letterSpacing:1, marginBottom:5 }}>📅 Date début</div>
        <input type="date" value={historyStart} onChange={e => setHistoryStart(e.target.value)}
          style={{ padding:"9px 12px", borderRadius:8, border:`1px solid ${C.border}`, fontSize:13, fontFamily:"inherit", background:C.card }} />
      </div>
      
      <div>
        <div style={{ fontSize:10, color:C.muted, fontWeight:"600", textTransform:"uppercase", letterSpacing:1, marginBottom:5 }}>📅 Date fin</div>
        <input type="date" value={historyEnd} onChange={e => setHistoryEnd(e.target.value)}
          style={{ padding:"9px 12px", borderRadius:8, border:`1px solid ${C.border}`, fontSize:13, fontFamily:"inherit", background:C.card }} />
      </div>
      
      <button onClick={searchHistory} disabled={historyLoading}
        style={{ padding:"10px 22px", borderRadius:8, border:"none",
          background:C.yellow, color:C.navy, cursor:"pointer",
          fontSize:13, fontWeight:"700", fontFamily:"inherit" }}>
        {historyLoading ? "⏳ Chargement..." : "🔍 Rechercher"}
      </button>
      
      <div style={{ marginLeft:"auto", fontSize:11, color:C.muted }}>
        {historyPoints.length > 0 && (
          <>📍 <b style={{ color:C.text }}>{historyPoints.length}</b> points · 
          du {historyPoints[0].date} au {historyPoints[historyPoints.length-1].date}</>
        )}
      </div>
    </div>
    
    {/* Carte */}
    <div style={{ ...cardStyle, flex:1, overflow:"hidden" }}>
      {historyPoints.length > 0 ? (
        <MapContainer center={[historyPoints[0].latitude, historyPoints[0].longitude]} zoom={9} style={{ height:"100%", width:"100%" }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
          <TileLayer url="https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png" attribution="© OpenRailwayMap" opacity={0.7} />
          
          <Polyline positions={historyPoints.map(p => [p.latitude, p.longitude])} color={C.navy} weight={3.5} opacity={0.85} />
          
          <Marker position={[historyPoints[0].latitude, historyPoints[0].longitude]}
            icon={new L.DivIcon({
              html: `<div style="width:32px;height:32px;border-radius:50%;background:${C.ok};border:3px solid white;display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,0.3);">D</div>`,
              iconSize:[32,32], iconAnchor:[16,16], className:""
            })}>
            <Popup><b>🏁 Départ</b><br/>{historyPoints[0].date} {historyPoints[0].heure?.slice(11,19)}</Popup>
          </Marker>
          
          <Marker position={[historyPoints[historyPoints.length-1].latitude, historyPoints[historyPoints.length-1].longitude]}
            icon={new L.DivIcon({
              html: `<div style="width:32px;height:32px;border-radius:50%;background:${C.danger};border:3px solid white;display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,0.3);">F</div>`,
              iconSize:[32,32], iconAnchor:[16,16], className:""
            })}>
            <Popup><b>🎯 Arrivée</b><br/>{historyPoints[historyPoints.length-1].date} {historyPoints[historyPoints.length-1].heure?.slice(11,19)}</Popup>
          </Marker>
        </MapContainer>
      ) : (
        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100%", flexDirection:"column", gap:10, color:C.muted }}>
          <div style={{ fontSize:48 }}>🗺️</div>
          <div style={{ fontSize:14, fontWeight:"600", color:C.text }}>Aucun trajet à afficher</div>
          <div style={{ fontSize:12 }}>Sélectionne un engin et une période, puis clique sur "Rechercher"</div>
        </div>
      )}
    </div>
  </div>
)}

{/* Pages encore vides */}
{["assets","settings"].includes(page) && (
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
                <div style={{ fontSize:11, color:"#cbd5e1", marginTop:2 }}> F3000039 · {current?.date?.slice(0,10)} {current?.heure?.slice(11,19)}</div>
              </div>
            </div>
            <button onClick={() => setMapFullscreen(false)} style={{ background:C.yellow, color:C.navy, border:"none", borderRadius:8, padding:"8px 14px", fontSize:13, fontWeight:"600", cursor:"pointer", display:"flex", alignItems:"center", gap:6, fontFamily:"inherit" }}>
              ✕ Fermer
            </button>
          </div>
          <div style={{ flex:1 }}>
            {renderMap("100%")}
          </div>
          const API = "http://127.0.0.1:5000";
        </div>
      )}
      {/* ════════════ CHATBOT FLOTTANT ════════════ */}
      {!chatOpen && (
        <button onClick={() => setChatOpen(true)} style={{
          position:"fixed", bottom:24, right:24, zIndex:9000,
          width:60, height:60, borderRadius:"50%",
          background:`linear-gradient(135deg, ${C.yellow}, #ffa500)`,
          border:"none", cursor:"pointer", fontSize:26,
          boxShadow:"0 6px 24px rgba(10,23,51,0.3)",
          display:"flex", alignItems:"center", justifyContent:"center"
        }}>
          💬
        </button>
      )}

      {chatOpen && (
        <div style={{
          position:"fixed", bottom:24, right:24, zIndex:9000,
          width:380, height:520, background:C.card, borderRadius:16,
          boxShadow:"0 12px 40px rgba(10,23,51,0.25)",
          display:"flex", flexDirection:"column", overflow:"hidden",
          border:`1px solid ${C.border}`
        }}>
          <div style={{ padding:"14px 18px", background:C.navy, color:"#fff", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:36, height:36, borderRadius:"50%", background:`linear-gradient(135deg, ${C.yellow}, #ffa500)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>🤖</div>
              <div>
                <div style={{ fontSize:14, fontWeight:"700" }}>Assistant MyMatics</div>
                <div style={{ fontSize:10, color:"#94a3b8", display:"flex", alignItems:"center", gap:5 }}>
                  <span style={{ width:6, height:6, borderRadius:"50%", background:C.ok }}></span>
                  En ligne · Gemini AI
                </div>
              </div>
            </div>
            <div style={{ display:"flex", gap:4 }}>
              <button onClick={() => setChatMessages([
                { role: "bot", text: "Bonjour ! Je suis l'assistant MyMatics. Pose-moi des questions sur les données télémétriques du train CR-4521 🚂" }
              ])} title="Nouvelle conversation"
                style={{ background:"transparent", border:"none", color:"#fff", fontSize:16, cursor:"pointer", padding:4 }}>
                🔄
              </button>
              <button onClick={() => setChatOpen(false)} style={{ background:"transparent", border:"none", color:"#fff", fontSize:20, cursor:"pointer", padding:4 }}>✕</button>
            </div>

          </div>

          <div style={{ flex:1, overflowY:"auto", padding:"14px", background:C.bg }}>
            {chatMessages.map((m, i) => (
              <div key={i} style={{ marginBottom:10 }}>
                <div style={{ display:"flex", justifyContent: m.role==="user" ? "flex-end" : "flex-start" }}>
                  <div style={{
                    maxWidth:"80%", padding:"9px 13px", borderRadius:12,
                    background: m.role==="user" ? C.navy : C.card,
                    color: m.role==="user" ? "#fff" : C.text,
                    fontSize:12.5, lineHeight:1.5,
                    border: m.role==="user" ? "none" : `1px solid ${C.border}`,
                    whiteSpace:"pre-wrap"
                  }}>
                    {m.text}
                  </div>
                </div>
                {m.viz && <ChatViz viz={m.viz} />}
              </div>
            ))}
            {chatLoading && (
              <div style={{ display:"flex", justifyContent:"flex-start" }}>
                <div style={{ padding:"9px 13px", borderRadius:12, background:C.card, border:`1px solid ${C.border}`, fontSize:12, color:C.muted }}>
                  ● ● ●
                </div>
              </div>
            )}
          </div>

          <div style={{ padding:"12px 14px", borderTop:`1px solid ${C.border}`, background:C.card }}>
            <div style={{ display:"flex", gap:8 }}>
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") sendChat(); }}
                placeholder={isListening ? "🎤 Je vous écoute..." : "Posez votre question..."}
                disabled={chatLoading}
                style={{ flex:1, padding:"9px 12px", borderRadius:8, border:`1px solid ${C.border}`, fontSize:12.5, outline:"none", fontFamily:"inherit", background:C.bg }}
              />
              <button
                onClick={toggleVoice}
                disabled={chatLoading}
                title={isListening ? "Arrêter l'écoute" : "Parler"}
                style={{
                  padding:"0 12px", borderRadius:8, cursor:"pointer",
                  border:`1px solid ${isListening ? C.danger : C.border}`,
                  background: isListening ? C.danger : C.bg,
                  color: isListening ? "#fff" : C.navy,
                  fontSize:15, fontFamily:"inherit"
                }}
              >
                {isListening ? "⏹" : "🎙️"}
              </button>
              <button onClick={sendChat} disabled={chatLoading || !chatInput.trim()} style={{
                padding:"0 16px", borderRadius:8, border:"none", cursor:"pointer",
                background: chatInput.trim() && !chatLoading ? C.yellow : C.border,
                color: C.navy, fontWeight:"700", fontSize:13, fontFamily:"inherit"
              }}>
                ➤
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════ POPUP MINI CARTE ════ */}
{mapPopup && (
  <div onClick={() => setMapPopup(null)} style={{
    position:"fixed", inset:0, background:"rgba(10,23,51,0.5)", zIndex:9500,
    display:"flex", alignItems:"center", justifyContent:"center"
  }}>
    <div onClick={e => e.stopPropagation()} style={{
      background:C.card, borderRadius:14, width:600, height:500,
      boxShadow:"0 20px 60px rgba(0,0,0,0.3)", display:"flex", flexDirection:"column", overflow:"hidden"
    }}>
      <div style={{ padding:"14px 20px", background:C.navy, color:"#fff",
        display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div>
          <div style={{ fontSize:14, fontWeight:"700" }}>📍 Position — {mapPopup.id}</div>
          <div style={{ fontSize:11, color:"#cbd5e1", marginTop:2 }}>
            Lat: {mapPopup.lat.toFixed(5)} · Lon: {mapPopup.lon.toFixed(5)}
          </div>
        </div>
        <button onClick={() => setMapPopup(null)} style={{
          background:C.yellow, color:C.navy, border:"none", borderRadius:6,
          padding:"6px 12px", fontSize:12, fontWeight:"700", cursor:"pointer", fontFamily:"inherit"
        }}>✕ Fermer</button>
      </div>
      <div style={{ flex:1 }}>
        <MapContainer center={[mapPopup.lat, mapPopup.lon]} zoom={13} style={{ height:"100%", width:"100%" }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
          <TileLayer url="https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png" attribution="© OpenRailwayMap" opacity={0.7} />
          <Marker position={[mapPopup.lat, mapPopup.lon]} icon={trainIcon}>
            <Popup>
              <div style={{ fontFamily:"'Inter',sans-serif", fontSize:12 }}>
                <b>🚂 {mapPopup.id}</b><br/>
                {mapPopup.lat.toFixed(5)}, {mapPopup.lon.toFixed(5)}
              </div>
            </Popup>
          </Marker>
        </MapContainer>
      </div>
    </div>
  </div>
)}
    </div>
  );
}