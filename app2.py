import random
import pandas as pd
import numpy as np
import torch
import torch.nn as nn
import joblib
from flask import Flask, jsonify, request
from flask_cors import CORS
from datetime import datetime
from threading import Thread
from Test_ingect import run_simulation
import smtplib
import random
import string
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import  platform



demo_running = False
# 1. FLASK APP SETUP
app = Flask(__name__)
CORS(app)

# 2. UPGRADED NEURAL NETWORK ARCHITECTURE (MUST MATCH TRAINING)
class CNN_LSTM(nn.Module):
    def __init__(self, num_features, num_classes, window_size=15): # UPDATED TO 15
        super(CNN_LSTM, self).__init__()
        self.conv1 = nn.Conv1d(in_channels=num_features, out_channels=128, kernel_size=3, padding=1)
        self.bn1 = nn.BatchNorm1d(128)
        self.leaky_relu = nn.LeakyReLU(negative_slope=0.1)
        self.pool = nn.MaxPool1d(kernel_size=2, padding=1)
        self.lstm = nn.LSTM(input_size=128, hidden_size=64, num_layers=2, batch_first=True, dropout=0.3)
        self.fc1 = nn.Linear(64, 32)
        self.fc2 = nn.Linear(32, num_classes)
        self.dropout = nn.Dropout(0.4)

    def forward(self, x):
        x = x.permute(0, 2, 1) 
        x = self.conv1(x)
        x = self.bn1(x)
        x = self.leaky_relu(x)
        x = self.pool(x)
        x = x.permute(0, 2, 1)
        out, _ = self.lstm(x)
        out = out[:, -1, :] 
        out = self.fc1(out)
        out = self.leaky_relu(out)
        out = self.dropout(out)
        out = self.fc2(out)
        return out

# 3. LOAD THE UNIFIED MASTER MODEL
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

print("\n" + "="*50)
print(" BOOTING ADVERSARY SHIELD: UNIFIED MASTER AI")
print("="*50)

try:
    scaler = joblib.load('scaler_Unified.pkl')
    le = joblib.load('label_encoder_Unified.pkl')
    features = joblib.load('features_Unified.pkl')
    
    num_features = len(features)
    num_classes = len(le.classes_)
    
    # UPDATED TO 15
    model = CNN_LSTM(num_features, num_classes, window_size=15).to(device)
    model.load_state_dict(torch.load("Shield_Unified.pth", map_location=device, weights_only=True))
    model.eval()
    
    print(f" LOADED: Unified Master Model ({num_features} features, {num_classes} classes)")
    print(f" Device: {str(device).upper()}")
except Exception as e:
    print(f" FAILED to load Unified Model. Error: {e}")
    exit()

# Global memory buffer for the sliding window
live_window_buffer = []

# 4. IN-MEMORY DATABASE
db = {
    "events": [], "alerts": [], "responses": [],
    "ip_status": {}, "event_id_counter": 1
}

def get_risk_level(prediction, confidence):
    if prediction == "Benign": return "Low"
    if "Web" in prediction or "Botnet" in prediction: return "Critical"
    if "DDoS" in prediction or "DoS" in prediction: return "High"
    return "Medium"

# 5. API ENDPOINTS
@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        "status": "ok"
    })

@app.route('/schema', methods=['GET'])
def get_schema():
    return jsonify({"expected_features": features})

@app.route('/stats', methods=['GET'])
def get_stats():
    try:
        events = db.get("events", [])
        alerts = db.get("alerts", [])

        # ✅ Unique devices (ignore empty/unknown)
        unique_devices = len(set(
            e.get("src_ip") for e in events
            if e.get("src_ip") and e.get("src_ip") != "unknown"
        ))

        # ✅ Count ALL attack types correctly
        attack_counts = {}
        for a in alerts:
            label = a.get("prediction", "Unknown")
            attack_counts[label] = attack_counts.get(label, 0) + 1

        # ✅ Convert to list (NO LIMIT HERE)
        dist = [
            {"label": k, "count": v}
            for k, v in sorted(attack_counts.items(), key=lambda x: x[1], reverse=True)
        ]

        # ✅ Latest threat (FIXED — use most recent alert)
        latest_threat = alerts[0]["prediction"] if len(alerts) > 0 else "None"

        return jsonify({
            "status": "ok",
            "total_events": len(events),
            "total_threats": len(alerts),
            "unique_devices": unique_devices,
            "latest_threat": latest_threat,
            "attack_counts": dist,
            "model_info": {
                "device": str(device).upper(),
                "active_model": "Unified_Master"
            }
        })

    except Exception as e:
        return jsonify({
            "status": "error",
            "error": str(e)
        }), 500




@app.route('/events', methods=['GET'])
def get_events(): 
    return jsonify(list(reversed(db["events"]))[:int(request.args.get('limit', 50))])

# ---- email config ----
SMTP_EMAIL    = "youremail@gmail.com" # write your email
SMTP_PASSWORD = "#### #### #### ####"   # Generate 2FA OTP mail password from your google account

# in-memory OTP store  {username: {"otp": "123456", "expires": timestamp}}
_otp_store = {}

@app.route('/send_otp', methods=['POST'])
def send_otp():
    data     = request.json or {}
    username = data.get("username", "").strip().lower()
    email    = data.get("email", "").strip()

    if not username or not email:
        return jsonify({"status": "error", "message": "Missing username or email"}), 400
    

    otp     = "".join(random.choices(string.digits, k=6))
    expiry  = datetime.now().timestamp() + 300   # 5 minutes

    _otp_store[username] = {"otp": otp, "expires": expiry}

    # build email
    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Your SecureIDS verification code"
    msg["From"]    = SMTP_EMAIL
    msg["To"]      = email

    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;
                border:1px solid #dde3ec;border-radius:10px;padding:32px;">
      <h2 style="color:#1a3c5e;margin-top:0">SecureIDS — Login Verification</h2>
      <p style="color:#555;font-size:14px">
        Your one-time verification code is:
      </p>
      <div style="font-size:36px;font-weight:700;letter-spacing:8px;
                  color:#1a3c5e;text-align:center;padding:20px 0">
        {otp}
      </div>
      <p style="color:#888;font-size:12px">
        This code expires in <strong>5 minutes</strong>.<br>
        If you didn't request this, ignore this email.
      </p>
    </div>
    """
    msg.attach(MIMEText(html, "html"))

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(SMTP_EMAIL, SMTP_PASSWORD)
            server.sendmail(SMTP_EMAIL, email, msg.as_string())
        #return jsonify({"status": "success"})
        return jsonify({"status": "success", "otp": otp}) #for the doctors to test easily
    except Exception as e:
        print("Email error:", e)
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/verify_otp', methods=['POST'])
def verify_otp():
    data     = request.json or {}
    username = data.get("username", "").strip().lower()
    otp      = data.get("otp", "").strip()

    record = _otp_store.get(username)
    if not record:
        return jsonify({"status": "error", "message": "No OTP requested"}), 400
    if datetime.now().timestamp() > record["expires"]:
        del _otp_store[username]
        return jsonify({"status": "error", "message": "OTP expired"}), 400
    if otp != record["otp"]:
        return jsonify({"status": "error", "message": "Invalid OTP"}), 400

    del _otp_store[username]
    return jsonify({"status": "success"})
    
@app.route('/alerts', methods=['GET'])
def get_alerts(): 
    return jsonify(list(reversed(db["alerts"]))[:int(request.args.get('limit', 50))])

@app.route('/suspicious_ips', methods=['GET'])
def suspicious_ips():
    min_count = int(request.args.get('min_count', 1))
    sus_ips = {}
    for a in db["alerts"]:
        ip = a["src_ip"]
        if ip not in sus_ips: 
            sus_ips[ip] = {"ip": ip, "count": 0, "max_confidence": 0, "latest_prediction": a["prediction"], "latest_risk": a["risk"]}
        sus_ips[ip]["count"] += 1
        sus_ips[ip]["max_confidence"] = max(sus_ips[ip]["max_confidence"], a["confidence"])
    result = [data for data in sus_ips.values() if data["count"] >= min_count]
    return jsonify(sorted(result, key=lambda x: x["count"], reverse=True))

@app.route('/predict', methods=['POST'])
def predict_attack():
    global live_window_buffer
    data = request.json
    
    incoming_features = data.get("features")
    src_ip = data.get("src_ip", f"104.28.{random.randint(1,255)}.x")
    dst_ip = data.get("dst_ip", "10.0.0.5")

    # 1. Add to the memory buffer
    live_window_buffer.append(incoming_features)
    # UPDATED TO 15
    if len(live_window_buffer) > 15: live_window_buffer.pop(0)

    # 2. Pad if we don't have 15 packets yet
    # UPDATED TO 15
    if len(live_window_buffer) < 15: 
        current_window = live_window_buffer + [incoming_features] * (15 - len(live_window_buffer))
    else: 
        current_window = live_window_buffer

    # 3. Predict using the Unified model
    try:
        seq_array = np.array(current_window, dtype=np.float32)
        
        # BUG FIX: Reshape to (15, num_features) to scale each packet correctly like in training
        # UPDATED TO 15
        flat_seq = seq_array.reshape(15, num_features)
        scaled_seq = scaler.transform(flat_seq)
        
        # Reshape back to (1, 15, num_features) for the CNN-LSTM
        # UPDATED TO 15
        X_tensor = torch.tensor(scaled_seq.reshape(1, 15, num_features), dtype=torch.float32).to(device)

        with torch.no_grad():
            outputs = model(X_tensor)
            probabilities = torch.softmax(outputs, dim=1)[0]
            confidence, predicted_idx = torch.max(probabilities, 0)
            
        predicted_label = le.inverse_transform([predicted_idx.item()])[0]
        conf_pct = round(confidence.item() * 100, 2)
        
        #  THE WEB ATTACK FALSE POSITIVE FIX 
        override_note = ""
        if predicted_label == "Web Attack" and conf_pct < 85.0:
            predicted_label = "Benign"
            override_note = " (Web Attack overridden to Benign due to confidence < 85%)"
            
        is_attack = predicted_label != "Benign"
        risk = get_risk_level(predicted_label, conf_pct)

        event = {
            "id": db["event_id_counter"],
            "timestamp": datetime.now().isoformat(),
            "src_ip": src_ip,
            "dst_ip": dst_ip,
            "prediction": predicted_label,
            "confidence": conf_pct,
            "risk": risk,
            "is_attack": is_attack,
            "detected_by": f"Unified_Master{override_note}"
        }
        
        db["events"].append(event)
        if is_attack: db["alerts"].append(event.copy())
        db["event_id_counter"] += 1

        return jsonify({
            "status": "success", 
            "prediction": predicted_label, 
            "confidence": conf_pct,
            "expert_used": "Unified_Master"
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/response_action', methods=['POST'])
def handle_response():
    data = request.json
    db["responses"].append({
        "id": len(db["responses"]) + 1,
        "timestamp": datetime.now().isoformat(),
        "ip": data.get("ip"),
        "action": data.get("action"),
        "status": "Success",
        "note": data.get("note", "")
    })
    return jsonify({"status": "action_logged"})

@app.route('/responses', methods=['GET'])
def get_responses():
    return jsonify(list(reversed(db["responses"]))[:int(request.args.get('limit', 50))])


@app.route('/start_demo', methods=['POST'])

def start_demo():
    global demo_running

    if demo_running:
        return jsonify({"status": "error", "message": "already running"})

    demo_running = True
    Thread(target=run_simulation, daemon=True).start()

    return jsonify({"status": "success"})
@app.route("/stop_demo", methods=["POST"])
def stop_demo():
    global demo_running
    demo_running = False
    return jsonify({"status": "stopped"})
if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000, debug=False)