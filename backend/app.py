from flask import Flask, jsonify, request, g
from flask_cors import CORS
import pandas as pd
import os
import threading
import time
import google.generativeai as genai
import json
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import uuid
from datetime import datetime


# ── Configuration Gemini ──
GEMINI_API_KEY = "AQ.Ab8RN6LnoqzU2DDr1cfyBMqhbLdaR8BZJZ37mBLVdQNpkZoDyg"
genai.configure(api_key=GEMINI_API_KEY)
#gemini_model = genai.GenerativeModel('gemini-2.5-flash')

# ── Configuration Email Gmail (vide pour l'instant) ──
GMAIL_USER     = ""
GMAIL_PASSWORD = ""

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=True)

# ─── State global ───
DF     = None
BUFFER = []
INDEX  = 0
LOCK   = threading.Lock()


def load_data():
    global DF
    path = 'data.csv'
    if os.path.exists(path):
        DF = pd.read_csv(path, sep=',')
        DF = DF[(DF['MY_LATITUDE'] != 0) & (DF['MY_LONGITUDE'] != 0)]
        DF = DF.dropna(subset=['MY_LATITUDE', 'MY_LONGITUDE'])
        DF = DF.reset_index(drop=True)
        print(f"✅ {len(DF)} lignes valides chargées")
    else:
        print("❌ Fichier data.csv introuvable")


def safe_float(val):
    try:
        f = float(val)
        return 0.0 if f != f else f
    except:
        return 0.0


def safe_int(val):
    try:
        f = float(val)
        return 0 if f != f else int(f)
    except:
        return 0


def row_to_dict(row, index):
    return {
        'index':        index + 1,
        'latitude':     safe_float(row['MY_LATITUDE']),
        'longitude':    safe_float(row['MY_LONGITUDE']),
        'altitude':     safe_float(row['MY_ALTITUDE']),
        'date':         str(row['DAT_DATE']),
        'heure':        str(row['DAT_TIMESTAMP']),
        'fuel_rate':    safe_float(row['MY_FUEL_RATE']),
        'fuel_level':   safe_float(row['MY_NIVEAU_FUEL']),
        'temperature':  safe_float(row['MY_T_COOLANT']),
        'p_oil':        safe_float(row['MY_P_OIL']),
        'battery':      safe_float(row['MY_BATTERY_VOLT']),
        'load':         safe_float(row['MY_LOAD']),
        'engine_hours': safe_float(row['MY_ENGINERUNHOURS']),
        'cap':          safe_float(row['MY_CAP']),
        'etat':         safe_int(row['MY_ETAT']),
        'rpm':          safe_float(row['TEMPERATURE_CRYPTAGE']),
        'axle_temp':    safe_float(row['TEMPERATURE_CRYPTAGE']),
    }


# ─── Système d'alertes ───
ALERTS_FILE  = 'alerts.json'
HISTORY_FILE = 'alerts_history.json'


def load_alerts():
    if not os.path.exists(ALERTS_FILE):
        return []
    with open(ALERTS_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_alerts(alerts):
    with open(ALERTS_FILE, 'w', encoding='utf-8') as f:
        json.dump(alerts, f, indent=2, ensure_ascii=False)


def load_history():
    if not os.path.exists(HISTORY_FILE):
        return []
    with open(HISTORY_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_history(history):
    with open(HISTORY_FILE, 'w', encoding='utf-8') as f:
        json.dump(history, f, indent=2, ensure_ascii=False)

# ═══════════════════════════════════════════════════════
# ══ Actions exécutables par le chatbot (function calling) ══
# ═══════════════════════════════════════════════════════

# Synonymes FR → clés internes (au cas où Gemini écrit "température" au lieu de "temperature")
PARAM_MAP = {
    "temperature": "temperature", "température": "temperature", "temp": "temperature", "coolant": "temperature",
    "battery": "battery", "batterie": "battery", "tension": "battery", "volt": "battery",
    "rpm": "rpm", "regime": "rpm", "régime": "rpm", "tr/min": "rpm",
    "fuel_rate": "fuel_rate", "consommation": "fuel_rate", "conso": "fuel_rate",
    "fuel_level": "fuel_level", "niveau carburant": "fuel_level", "carburant": "fuel_level",
    "p_oil": "p_oil", "pression huile": "p_oil", "huile": "p_oil",
    "load": "load", "charge": "load",
    "altitude": "altitude",
    "axle_temp": "axle_temp", "temperature essieux": "axle_temp", "essieux": "axle_temp",
    "engine_hours": "engine_hours", "heures moteur": "engine_hours",
}
OP_MAP = {
    ">": ">", "superieur": ">", "supérieur": ">", "depasse": ">", "dépasse": ">", "plus de": ">", "au-dessus": ">",
    "<": "<", "inferieur": "<", "inférieur": "<", "en dessous": "<", "moins de": "<", "sous": "<",
    ">=": ">=", "au moins": ">=", "min": ">=",
    "<=": "<=", "au plus": "<=", "max": "<=",
    "==": "==", "=": "==", "egal": "==", "égal": "==", "vaut": "==",
}
VALID_PARAMS = ["temperature", "battery", "rpm", "fuel_rate", "fuel_level", "p_oil", "load", "altitude", "axle_temp", "engine_hours"]


def creer_alerte(nom: str, parametre: str, operateur: str, valeur: float, destinataires: str = "") -> dict:
    """Crée une alerte de surveillance télémétrique pour l'engin ferroviaire.

    À utiliser quand l'utilisateur demande de créer, ajouter ou configurer une alerte.

    Args:
        nom: Nom court et descriptif (ex: "Surchauffe moteur", "Batterie faible").
        parametre: Paramètre à surveiller. Possibles : temperature, battery, rpm, fuel_rate, fuel_level, p_oil, load, altitude, axle_temp, engine_hours.
        operateur: Comparaison. Possibles : ">", "<", ">=", "<=", "==".
        valeur: Seuil numérique qui déclenche l'alerte (ex: 90 pour 90°C).
        destinataires: Emails séparés par des virgules à notifier. Vide si non précisé.

    Returns:
        Dictionnaire indiquant le succès et le détail de l'alerte.
    """
    param = PARAM_MAP.get(str(parametre).strip().lower(), str(parametre).strip().lower())
    op = OP_MAP.get(str(operateur).strip().lower(), str(operateur).strip())

    if param not in VALID_PARAMS:
        return {"success": False, "error": f"Paramètre '{parametre}' inconnu. Valides : {', '.join(VALID_PARAMS)}."}
    if op not in [">", "<", ">=", "<=", "=="]:
        return {"success": False, "error": f"Opérateur '{operateur}' invalide. Utilise >, <, >=, <= ou ==."}
    try:
        seuil = float(valeur)
    except (TypeError, ValueError):
        return {"success": False, "error": f"Valeur '{valeur}' invalide, il faut un nombre."}

    recipients = [e.strip() for e in str(destinataires).split(",") if e.strip()]
    alerts = load_alerts()
    new_alert = {
        "id": str(uuid.uuid4()),
        "name": nom,
        "conditions": [{"parameter": param, "operator": op, "value": seuil}],
        "recipients": recipients,
        "active": True,
        "created_at": datetime.now().isoformat(),
    }
    alerts.append(new_alert)
    save_alerts(alerts)
    print(f"🤖 Alerte créée par le chatbot : {nom} ({param} {op} {seuil})")
    return {
        "success": True,
        "nom": nom,
        "condition": f"{param} {op} {seuil}",
        "destinataires": recipients if recipients else "aucun (ajoute un email pour la notif)",
    }


def lister_alertes() -> dict:
    """Liste toutes les alertes déjà configurées.

    À utiliser quand l'utilisateur demande de voir/lister ses alertes.

    Returns:
        Dictionnaire avec le nombre d'alertes et leur détail.
    """
    alerts = load_alerts()
    resume = []
    for a in alerts:
        conds = " ET ".join(f"{c['parameter']} {c['operator']} {c['value']}" for c in a.get("conditions", []))
        resume.append({
            "nom": a.get("name"),
            "condition": conds,
            "active": a.get("active", True),
            "destinataires": a.get("recipients", []),
        })
    return {"nombre": len(alerts), "alertes": resume}


def supprimer_alerte(nom: str) -> dict:
    """Supprime une alerte par son nom (insensible à la casse).

    À utiliser quand l'utilisateur demande de supprimer/retirer une alerte.

    Args:
        nom: Nom de l'alerte à supprimer.

    Returns:
        Dictionnaire indiquant combien d'alertes ont été supprimées.
    """
    alerts = load_alerts()
    cible = str(nom).strip().lower()
    restantes = [a for a in alerts if a.get("name", "").strip().lower() != cible]
    nb = len(alerts) - len(restantes)
    if nb == 0:
        noms = [a.get("name") for a in alerts]
        return {"success": False, "error": f"Aucune alerte nommée '{nom}'. Existantes : {noms if noms else 'aucune'}."}
    save_alerts(restantes)
    print(f"🤖 {nb} alerte(s) supprimée(s) par le chatbot : {nom}")
    return {"success": True, "supprimees": nb, "nom": nom}


# ─── Données pour les graphiques / cartes du chatbot ───
COL_MAP = {
    "temperature": "MY_T_COOLANT", "battery": "MY_BATTERY_VOLT", "rpm": "MY_RESERVE1",
    "fuel_rate": "MY_FUEL_RATE", "fuel_level": "MY_NIVEAU_FUEL", "p_oil": "MY_P_OIL",
    "load": "MY_LOAD", "altitude": "MY_ALTITUDE", "axle_temp": "TEMPERATURE_CRYPTAGE",
    "engine_hours": "MY_ENGINERUNHOURS",
}
LABELS = {
    "temperature": "Température (°C)", "battery": "Tension batterie (V)", "rpm": "RPM (tr/min)",
    "fuel_rate": "Consommation (L/h)", "fuel_level": "Niveau carburant (%)", "p_oil": "Pression huile (bar)",
    "load": "Charge moteur (%)", "altitude": "Altitude (m)", "axle_temp": "Température essieux (°C)",
    "engine_hours": "Heures moteur (h)",
}
PLAGE = "Le dataset va du 2025-01-06 au 2025-03-11."


def _filtrer_par_date(date_debut, date_fin=""):
    if DF is None or len(DF) == 0:
        return None
    d1 = str(date_debut).strip()
    d2 = str(date_fin).strip() or d1
    dates = DF['DAT_DATE'].astype(str).str[:10]
    return DF[(dates >= d1) & (dates <= d2)].copy()


def tracer_graphique(parametre: str, date_debut: str, date_fin: str = "") -> dict:
    """Affiche un graphique de l'évolution d'un paramètre sur une période.

    À utiliser quand l'utilisateur demande de tracer, visualiser ou voir l'évolution / la courbe d'une mesure sur une date ou une période.

    Args:
        parametre: Paramètre à tracer. Possibles : temperature, battery, rpm, fuel_rate, fuel_level, p_oil, load, altitude, axle_temp, engine_hours.
        date_debut: Date de début au format AAAA-MM-JJ, année 2025 (ex: "2025-01-18").
        date_fin: Date de fin au format AAAA-MM-JJ. Vide = un seul jour.

    Returns:
        Confirmation de l'affichage du graphique.
    """
    param = PARAM_MAP.get(str(parametre).strip().lower(), str(parametre).strip().lower())
    if param not in COL_MAP:
        return {"success": False, "error": f"Paramètre '{parametre}' inconnu. Possibles : {', '.join(COL_MAP)}."}
    seg = _filtrer_par_date(date_debut, date_fin)
    if seg is None or len(seg) == 0:
        return {"success": False, "error": f"Aucune donnée pour cette période. {PLAGE}"}
    if len(seg) > 1500:
        seg = seg.iloc[::len(seg) // 1500]
    x = [str(v).replace(" ", "T") for v in seg['DAT_TIMESTAMP'].tolist()]
    y = [safe_float(v) for v in seg[COL_MAP[param]].tolist()]
    d2 = str(date_fin).strip() or str(date_debut).strip()
    titre = LABELS[param] + (f" — {date_debut}" if str(date_debut).strip() == d2 else f" — {date_debut} → {d2}")
    g.viz = {"type": "chart", "label": LABELS[param], "x": x, "y": y, "titre": titre}
    return {"success": True, "type": "graphique", "parametre": param, "nb_points": len(y),
            "note": "Le graphique est déjà affiché à l'utilisateur. Confirme simplement en une phrase."}


def afficher_trajet(date_debut: str, date_fin: str = "") -> dict:
    """Affiche sur une carte la position GPS / le trajet de l'engin sur une période.

    À utiliser quand l'utilisateur demande la position GPS, l'emplacement, le trajet ou le parcours à une date ou une période.

    Args:
        date_debut: Date de début au format AAAA-MM-JJ, année 2025 (ex: "2025-01-18").
        date_fin: Date de fin au format AAAA-MM-JJ. Vide = un seul jour.

    Returns:
        Confirmation de l'affichage de la carte.
    """
    seg = _filtrer_par_date(date_debut, date_fin)
    if seg is None or len(seg) == 0:
        return {"success": False, "error": f"Aucune position pour cette période. {PLAGE}"}
    if len(seg) > 1000:
        seg = seg.iloc[::len(seg) // 1000]
    points = [{"lat": safe_float(r['MY_LATITUDE']), "lng": safe_float(r['MY_LONGITUDE']), "heure": str(r['DAT_TIMESTAMP'])}
              for _, r in seg.iterrows()]
    d2 = str(date_fin).strip() or str(date_debut).strip()
    titre = "Trajet" + (f" — {date_debut}" if str(date_debut).strip() == d2 else f" — {date_debut} → {d2}")
    g.viz = {"type": "map", "points": points, "titre": titre}
    return {"success": True, "type": "carte", "nb_points": len(points),
            "note": "La carte est déjà affichée à l'utilisateur. Confirme simplement en une phrase."}


# Modèle Gemini AVEC les outils (remplace celui supprimé en haut)
gemini_model = genai.GenerativeModel(
    "gemini-2.5-flash",
    tools=[creer_alerte, lister_alertes, supprimer_alerte, tracer_graphique, afficher_trajet],
)
def send_email(to_emails, subject, body):
    if not GMAIL_USER or not GMAIL_PASSWORD:
        print(f"📧 [SIMULATION] Email à : {', '.join(to_emails)}")
        print(f"📧 [SIMULATION] Sujet  : {subject}")
        return True
    try:
        msg = MIMEMultipart()
        msg['From']    = GMAIL_USER
        msg['To']      = ", ".join(to_emails)
        msg['Subject'] = subject
        msg.attach(MIMEText(body, 'html'))
        with smtplib.SMTP('smtp.gmail.com', 587) as server:
            server.starttls()
            server.login(GMAIL_USER, GMAIL_PASSWORD.replace(" ", ""))
            server.send_message(msg)
        return True
    except Exception as e:
        print(f"❌ Erreur email : {e}")
        return False


def check_alerts(data_point):
    alerts = load_alerts()
    history = load_history()

    for alert in alerts:
        if not alert.get('active', True):
            continue

        all_met = True
        triggered_conditions = []

        for cond in alert['conditions']:
            param = cond['parameter']
            op    = cond['operator']
            val   = float(cond['value'])
            actual = data_point.get(param, 0)

            met = False
            if op == '>':  met = actual >  val
            if op == '<':  met = actual <  val
            if op == '>=': met = actual >= val
            if op == '<=': met = actual <= val
            if op == '==': met = abs(actual - val) < 0.01

            if not met:
                all_met = False
                break
            triggered_conditions.append(f"{param} {op} {val} (réel: {actual})")

        if all_met:
            recent = [h for h in history if h['alert_id'] == alert['id']]
            if recent and (data_point['index'] - recent[-1].get('data_index', 0)) < 60:
                continue

            entry = {
                'id':         str(uuid.uuid4()),
                'alert_id':   alert['id'],
                'alert_name': alert['name'],
                'timestamp':  datetime.now().isoformat(),
                'data_index': data_point['index'],
                'data_date':  data_point.get('date', ''),
                'data_heure': data_point.get('heure', ''),
                'conditions': triggered_conditions,
                'recipients': alert['recipients'],
                'email_sent': False,
            }

            subject = f"🚨 Alerte MyMatics : {alert['name']}"
            body = f"""
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px;background:#f5f7fb;">
              <div style="background:#0a1733;color:white;padding:20px;border-radius:8px 8px 0 0;">
                <h2 style="margin:0;">🚨 Alerte MyMatics déclenchée</h2>
              </div>
              <div style="background:white;padding:20px;border-radius:0 0 8px 8px;">
                <p><strong>Alerte :</strong> {alert['name']}</p>
                <p><strong>Train :</strong> CR-4521</p>
                <p><strong>Date :</strong> {data_point.get('date', '')[:10]} {data_point.get('heure', '')[11:19]}</p>
                <h3 style="color:#dc2626;">Conditions déclenchées :</h3>
                <ul>{''.join(f'<li>{c}</li>' for c in triggered_conditions)}</ul>
                <p style="color:#6b7280;font-size:12px;margin-top:20px;">— Plateforme MyMatics, Colas Rail / DPE</p>
              </div>
            </div>
            """
            entry['email_sent'] = send_email(alert['recipients'], subject, body)

            history.append(entry)
            save_history(history)
            print(f"🚨 Alerte déclenchée : {alert['name']} → {'✅' if entry['email_sent'] else '❌'}")


# ─── Thread qui lit 1 ligne à la fois ───
def reader_thread():
    global INDEX, BUFFER
    while True:
        if DF is None:
            time.sleep(1)
            continue

        total = len(DF)

        if INDEX >= total:
            print("🔄 Cycle terminé — repart du début")
            with LOCK:
                BUFFER = []
                INDEX  = 0
            time.sleep(3)
            continue

        with LOCK:
            row = DF.iloc[INDEX]
            point = row_to_dict(row, INDEX)
            BUFFER.append(point)
            INDEX += 1

        check_alerts(point)
        time.sleep(0.5)


# ═══════════════════════════════════════════════════════
# ════════════════ API ROUTES ═══════════════════════════
# ═══════════════════════════════════════════════════════

@app.route('/')
def index():
    return jsonify({'status': 'ok', 'message': 'Train Tracker API'})


@app.route('/api/positions')
def get_positions():
    with LOCK:
        data  = list(BUFFER)
        total = len(DF) if DF is not None else 0
    return jsonify({
        'data':    data,
        'total':   total,
        'current': INDEX,
    })


@app.route('/api/position')
def get_position():
    with LOCK:
        if not BUFFER:
            return jsonify({'error': 'Pas encore de données'}), 404
        return jsonify(BUFFER[-1])


@app.route('/api/chat', methods=['POST'])
def chat():
    body = request.get_json()
    question = body.get('question', '')
    history  = body.get('history', [])

    if DF is None or len(DF) == 0:
        return jsonify({'response': "Pas de données chargées."})

    df = DF

    stats = {
        'total_lignes': int(len(df)),
        'periode': f"{df['DAT_DATE'].iloc[0]} → {df['DAT_DATE'].iloc[-1]}",
        'temperature_C': {
            'moyenne': round(float(df['MY_T_COOLANT'].mean()), 1),
            'min':     round(float(df['MY_T_COOLANT'].min()), 1),
            'max':     round(float(df['MY_T_COOLANT'].max()), 1),
        },
        'consommation_Lh': {
            'moyenne': round(float(df['MY_FUEL_RATE'].mean()), 1),
            'min':     round(float(df['MY_FUEL_RATE'].min()), 1),
            'max':     round(float(df['MY_FUEL_RATE'].max()), 1),
        },
        'batterie_V': {
            'moyenne': round(float(df['MY_BATTERY_VOLT'].mean()), 1),
            'min':     round(float(df['MY_BATTERY_VOLT'].min()), 1),
            'max':     round(float(df['MY_BATTERY_VOLT'].max()), 1),
        },
        'altitude_m': {
            'moyenne': round(float(df['MY_ALTITUDE'].mean()), 0),
            'min':     round(float(df['MY_ALTITUDE'].min()), 0),
            'max':     round(float(df['MY_ALTITUDE'].max()), 0),
        },
        'pression_huile_bar': {
            'moyenne': round(float(df['MY_P_OIL'].mean()), 2),
            'min':     round(float(df['MY_P_OIL'].min()), 2),
            'max':     round(float(df['MY_P_OIL'].max()), 2),
        },
        'heures_moteur': round(float(df['MY_ENGINERUNHOURS'].max() - df['MY_ENGINERUNHOURS'].min()), 1),
        'alertes_temp_haute': int((df['MY_T_COOLANT'] > 90).sum()),
        'alertes_batterie_basse': int((df['MY_BATTERY_VOLT'] < 22).sum()),
    }

    system_context = f"""Tu es l'assistant MyMatics de Colas Rail / DPE.
Tu analyses les données télémétriques d'un engin ferroviaire (F3000039).

Voici les statistiques complètes du dataset :
{json.dumps(stats, indent=2, ensure_ascii=False)}

Réponds en français, sois précis, concis et professionnel.
Utilise les chiffres exacts ci-dessus quand pertinent.
Tu peux te référer aux échanges précédents dans cette conversation pour assurer la cohérence.
Si on te demande si une valeur est "normale", compare-la aux normes ferroviaires et aux seuils typiques.

Tu peux aussi EFFECTUER DES ACTIONS via tes outils :
- creer_alerte : créer une alerte de surveillance quand l'utilisateur le demande.
- lister_alertes : montrer les alertes déjà configurées.
- supprimer_alerte : supprimer une alerte par son nom.
- tracer_graphique : afficher la courbe d'un paramètre sur une date/période.
- afficher_trajet : afficher la position GPS ou le trajet sur une carte pour une date/période.
Pour les graphiques et cartes, le dataset est de l'ANNÉE 2025. Convertis toujours les dates de l'utilisateur en AAAA-MM-JJ (ex: "18/01" → "2025-01-18"). Si l'utilisateur ne donne qu'une seule date, laisse date_fin vide.
Paramètres surveillables : temperature (°C), battery (V), rpm (tr/min), fuel_rate (L/h), fuel_level (%), p_oil (bar), load (%), altitude (m), axle_temp (°C), engine_hours (h).
Opérateurs : >, <, >=, <=, ==.
Déduis le bon paramètre et opérateur depuis la demande en langage naturel. Si l'utilisateur veut une notification email mais ne donne pas d'adresse, demande-la avant de créer. Confirme toujours en langage naturel ce que tu as fait.

Si tu ne peux pas répondre avec ces données, dis-le clairement."""

    chat_history = [
        {'role': 'user',  'parts': [system_context]},
        {'role': 'model', 'parts': ["Compris ! Je suis prêt à répondre à vos questions sur la F3000039 et son contexte ferroviaire."]}
    ]

    for msg in history[-10:]:
        role = 'user' if msg.get('role') == 'user' else 'model'
        chat_history.append({
            'role': role,
            'parts': [msg.get('text', '')]
        })

    try:
        chat_session = gemini_model.start_chat(history=chat_history,enable_automatic_function_calling=True,)
        response = chat_session.send_message(question)
        return jsonify({'response': response.text, 'visualization': getattr(g, 'viz', None)})
    except Exception as e:
        return jsonify({'response': f"Erreur : {str(e)}"}), 500


@app.route('/api/alerts', methods=['GET'])
def get_alerts():
    return jsonify(load_alerts())


@app.route('/api/alerts', methods=['POST'])
def create_alert():
    body = request.get_json()
    alerts = load_alerts()
    new_alert = {
        'id':         str(uuid.uuid4()),
        'name':       body['name'],
        'conditions': body['conditions'],
        'recipients': body['recipients'],
        'active':     body.get('active', True),
        'created_at': datetime.now().isoformat(),
    }
    alerts.append(new_alert)
    save_alerts(alerts)
    return jsonify(new_alert), 201


@app.route('/api/alerts/<alert_id>', methods=['DELETE'])
def delete_alert(alert_id):
    alerts = [a for a in load_alerts() if a['id'] != alert_id]
    save_alerts(alerts)
    return jsonify({'success': True})


@app.route('/api/alerts/<alert_id>/toggle', methods=['POST'])
def toggle_alert(alert_id):
    alerts = load_alerts()
    for a in alerts:
        if a['id'] == alert_id:
            a['active'] = not a.get('active', True)
    save_alerts(alerts)
    return jsonify({'success': True})


@app.route('/api/alerts/history')
def get_alerts_history():
    return jsonify(load_history()[-100:])


@app.route('/api/fleet')
def get_fleet():
    if DF is None or len(DF) == 0:
        return jsonify([])

    fleet = []
    num_trains = 8
    segment_size = len(DF) // num_trains

    for i in range(num_trains):
        start = i * segment_size
        end = min(start + segment_size, len(DF) - 1)
        latest = DF.iloc[end]

        fleet.append({
            'id':            f'CR-{4521 + i*7}',
            'numero_gm':     '',
            'agence':        '',
            'type':          '',
            'marque':        '',
            'last_update':   str(latest['DAT_TIMESTAMP']),
            'latitude':      safe_float(latest['MY_LATITUDE']),
            'longitude':     safe_float(latest['MY_LONGITUDE']),
            'altitude':      safe_float(latest['MY_ALTITUDE']),
            'temperature':   safe_float(latest['MY_T_COOLANT']),
            'fuel_rate':     safe_float(latest['MY_FUEL_RATE']),
            'fuel_level':    safe_float(latest['MY_NIVEAU_FUEL']),
            'battery':       safe_float(latest['MY_BATTERY_VOLT']),
            'load':          safe_float(latest['MY_LOAD']),
            'p_oil':         safe_float(latest['MY_P_OIL']),
            'engine_hours':  safe_float(latest['MY_ENGINERUNHOURS']),
            'cap':           safe_float(latest['MY_CAP']),
            'etat':          safe_int(latest['MY_ETAT']),
            'rpm':           safe_float(latest['TEMPERATURE_CRYPTAGE']),
            'axle_temp':     safe_float(latest['TEMPERATURE_CRYPTAGE']),
        })

    return jsonify(fleet)


@app.route('/api/dataset/info')
def dataset_info():
    if DF is None or len(DF) == 0:
        return jsonify({})

    num_trains = 8
    segment_size = len(DF) // num_trains
    engines = []
    for i in range(num_trains):
        start = i * segment_size
        end = min(start + segment_size, len(DF) - 1)
        engines.append({
            'id':         f'CR-{4521 + i*7}',
            'first_date': str(DF.iloc[start]['DAT_DATE'])[:10],
            'last_date':  str(DF.iloc[end]['DAT_DATE'])[:10],
        })
    return jsonify({
        'first_date': str(DF['DAT_DATE'].iloc[0])[:10],
        'last_date':  str(DF['DAT_DATE'].iloc[-1])[:10],
        'engines':    engines,
    })


@app.route('/api/history')
def get_history():
    engine_id  = request.args.get('engine_id', 'CR-4521')
    start_date = request.args.get('start_date', '')
    end_date   = request.args.get('end_date', '')

    if DF is None or len(DF) == 0:
        return jsonify({'points': [], 'total': 0})

    num_trains = 8
    segment_size = len(DF) // num_trains

    try:
        engine_num = int(engine_id.split('-')[1])
        idx = (engine_num - 4521) // 7
        if idx < 0 or idx >= num_trains:
            idx = 0
    except:
        idx = 0

    start_i = idx * segment_size
    end_i   = min(start_i + segment_size, len(DF))
    segment = DF.iloc[start_i:end_i].copy()

    if start_date:
        segment = segment[segment['DAT_DATE'].astype(str).str[:10] >= start_date]
    if end_date:
        segment = segment[segment['DAT_DATE'].astype(str).str[:10] <= end_date]

    if len(segment) > 2000:
        step = len(segment) // 2000
        segment = segment.iloc[::step]

    points = []
    for _, row in segment.iterrows():
        points.append({
            'latitude':    safe_float(row['MY_LATITUDE']),
            'longitude':   safe_float(row['MY_LONGITUDE']),
            'date':        str(row['DAT_DATE'])[:10],
            'heure':       str(row['DAT_TIMESTAMP']),
            'temperature': safe_float(row['MY_T_COOLANT']),
        })

    return jsonify({'points': points, 'total': len(points), 'engine_id': engine_id})


if __name__ == '__main__':
    load_data()
    t = threading.Thread(target=reader_thread, daemon=True)
    t.start()
    port = int(os.environ.get('PORT', 5000))
    app.run(debug=False, host='0.0.0.0', port=port)
