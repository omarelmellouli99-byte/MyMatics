from flask import Flask, jsonify
from flask_cors import CORS
import pandas as pd
import os
import threading
import time

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

        print(f"  📍 Ligne {INDEX} / {total}")
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

if __name__ == '__main__':
    load_data()
    t = threading.Thread(target=reader_thread, daemon=True)
    t.start()
    port = int(os.environ.get('PORT', 5000))
    app.run(debug=False, host='0.0.0.0', port=port)