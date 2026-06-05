from flask import Flask, jsonify
from flask_cors import CORS
import pandas as pd
import os
import threading
import time
import google.generativeai as genai
import json
from flask import request


# ── Configuration Gemini (gratuit) ──
GEMINI_API_KEY = "AQ.Ab8RN6LnoqzU2DDr1cfyBMqhbLdaR8BZJZ37mBLVdQNpkZoDyg"
genai.configure(api_key=GEMINI_API_KEY)
gemini_model = genai.GenerativeModel('gemini-2.5-flash')  
 
app = Flask(__name__)
CORS(app)
 
# ─── State global ───
DF    = None
BUFFER = []
INDEX  = 0
LOCK   = threading.Lock()
 
def load_data():
    global DF
    path = 'data.csv'
    if os.path.exists(path):
        DF = pd.read_csv(path, sep=',')
        # Supprime les lignes avec lat ou lon = 0 ou NaN
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
    }
 
# ─── Thread qui lit 1 ligne à la fois ───
def reader_thread():
    global INDEX, BUFFER
    while True:
        if DF is None:
            time.sleep(1)
            continue
 
        total = len(DF)
 
        # Repart de zéro si fin du fichier
        if INDEX >= total:
            print("🔄 Cycle terminé — repart du début")
            with LOCK:
                BUFFER = []
                INDEX  = 0
            time.sleep(3)
            continue
 
        # Lit 1 ligne à la fois
        with LOCK:
            row = DF.iloc[INDEX]
            BUFFER.append(row_to_dict(row, INDEX))
            INDEX += 1
 
        #print(f"  📍 Ligne {INDEX} / {total}")
        time.sleep(0.5)  # 2 lignes par seconde — ajustable
 
# ─── API ───
 
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
 
 
 #--API Gemini--"
 
@app.route('/api/chat', methods=['POST'])
def chat():
    body = request.get_json()
    question = body.get('question', '')
    
    if DF is None or len(DF) == 0:
        return jsonify({'response': "Pas de données chargées."})
    
    df = DF
    
    # ── Stats résumées sur les 30 000 lignes ──
    stats = {
        'total_lignes': int(len(df)),
        'periode': f"{df['DAT_DATE'].iloc[0]} → {df['DAT_DATE'].iloc[-1]}",
        'temperature_C': {
            'moyenne': round(float(df['MY_T_COOLANT'].mean()), 1),
            'min': round(float(df['MY_T_COOLANT'].min()), 1),
            'max': round(float(df['MY_T_COOLANT'].max()), 1),
        },
        'consommation_Lh': {
            'moyenne': round(float(df['MY_FUEL_RATE'].mean()), 1),
            'min': round(float(df['MY_FUEL_RATE'].min()), 1),
            'max': round(float(df['MY_FUEL_RATE'].max()), 1),
        },
        'batterie_V': {
            'moyenne': round(float(df['MY_BATTERY_VOLT'].mean()), 1),
            'min': round(float(df['MY_BATTERY_VOLT'].min()), 1),
            'max': round(float(df['MY_BATTERY_VOLT'].max()), 1),
        },
        'altitude_m': {
            'moyenne': round(float(df['MY_ALTITUDE'].mean()), 0),
            'min': round(float(df['MY_ALTITUDE'].min()), 0),
            'max': round(float(df['MY_ALTITUDE'].max()), 0),
        },
        'pression_huile_bar': {
            'moyenne': round(float(df['MY_P_OIL'].mean()), 2),
            'min': round(float(df['MY_P_OIL'].min()), 2),
            'max': round(float(df['MY_P_OIL'].max()), 2),
        },
        'heures_moteur': round(float(df['MY_ENGINERUNHOURS'].max() - df['MY_ENGINERUNHOURS'].min()), 1),
        'alertes_temp_haute': int((df['MY_T_COOLANT'] > 90).sum()),
        'alertes_batterie_basse': int((df['MY_BATTERY_VOLT'] < 22).sum()),
    }
    
    # ── Prompt pour Gemini ──
    prompt = f"""Tu es l'assistant MyMatics de Colas Rail / DPE.
Tu analyses les données télémétriques d'un engin ferroviaire (Train CR-4521).

Voici les statistiques complètes du dataset :
{json.dumps(stats, indent=2, ensure_ascii=False)}

Réponds en français, sois précis, concis et professionnel.
Utilise les chiffres exacts ci-dessus quand pertinent.
Si tu ne peux pas répondre avec ces données, dis-le clairement.

Question : {question}"""
    
    try:
        response = gemini_model.generate_content(prompt)
        return jsonify({'response': response.text})
    except Exception as e:
        return jsonify({'response': f"Erreur : {str(e)}"}), 500

if __name__ == '__main__':
    load_data()
    t = threading.Thread(target=reader_thread, daemon=True)
    t.start()
    port = int(os.environ.get('PORT', 5000))
    app.run(debug=False, host='0.0.0.0', port=port)