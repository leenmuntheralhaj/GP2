import os
import glob
import time
import pandas as pd
import numpy as np
import torch
import torch.nn as nn
import joblib
import requests
import json
import random

# --- Configuration ---
DATASET_DIR = r"C:\Users\ASUS\GP\GP_Final\CSV files"
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
WINDOW_SIZE = 15  # SYNCED WITH model.py

# =========================================================
# 1. ARCHITECTURE (Must match model.py)
# =========================================================
class CNN_LSTM(nn.Module):
    def __init__(self, num_features, num_classes, window_size=15):
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

# =========================================================
# 2. BRUTAL ADVERSARIAL GENERATOR
# =========================================================
def generate_brutal_traffic(seed_row, benign_seed, num_samples=600):
    synthetic_data = []
    seed_array = np.array(seed_row, dtype=float)
    benign_array = np.array(benign_seed, dtype=float)
    
    # BRUTAL PARAMETERS
    MUTATION_POWER = 0.25  # 25% Variation
    CAMO_POWER = 0.15      # 15% Benign Blending
    ERASURE_RATE = 0.15    # 15% Feature deletion
    
    for i in range(num_samples):
        # 1. Extreme Mutation (Shift spatial data)
        multipliers = np.random.uniform(1.0 - MUTATION_POWER, 1.0 + MUTATION_POWER, size=len(seed_array))
        mutant = seed_array * multipliers
        
        # 2. Camouflage (Blend with normal traffic)
        mutant = (mutant * (1.0 - CAMO_POWER)) + (benign_array * CAMO_POWER)
        
        # 3. Feature Erasure (Simulate packet loss/encryption)
        mask = np.random.binomial(1, 1 - ERASURE_RATE, size=len(mutant))
        mutant = mutant * mask
        
        # 4. Temporal Jitter: Every 4th packet is pure Benign
        if i % 4 == 0:
            synthetic_data.append(benign_array.tolist())
        else:
            synthetic_data.append(mutant.tolist())
        
    return synthetic_data

def get_standardized_label(raw_label):
    lbl = str(raw_label).upper()
    if pd.isna(raw_label) or lbl == 'NAN': return None
    # 2. Handle Benign
    if 'BENIGN' in lbl or 'NORMAL' in lbl:
        return 'Benign'

    # 3. Web Attacks (Checked FIRST)
    # Catches: "DoS Web Attack", "Brute Force Web Attack", "Web Attack  XSS", "SQL Attack", etc.
    if 'WEB' in lbl or 'SQL' in lbl or 'XSS' in lbl:
        return 'Web Attack'

    # 4. DoS Attacks
    if 'DOS' in lbl or 'HULK' in lbl or 'SLOW' in lbl or 'HEARTBLEED' in lbl or 'GOLDENEYE' in lbl:
        return 'DoS'

    # 5. Brute Force
    # Catches: "Brute Force", "Brute Force Attack"
    if 'BRUTE' in lbl:
        return 'Brute Force'

    # 6. DDoS
    # Catches: "No Label"
    if 'DDOS' in lbl or 'NO LABEL' in lbl:
        return 'DDoS'

    # 7. PortScan
    if 'PORT' in lbl or 'SCAN' in lbl:
        return 'PortScan'

    # 8. Botnet
    if 'BOT' in lbl:
        return 'Botnet'

    # Catch-all for anything unexpected
    return 'Other'

# =========================================================
# 3. RUN BRUTAL SIMULATION
# =========================================================
def run_simulation():
    print("\n=== STARTING BLACK-BOX BRUTAL STRESS TEST (WINDOW=15) ===")
    
    # Load Artifacts
    features = joblib.load("features_Unified.pkl")
    scaler = joblib.load("scaler_Unified.pkl")
    le = joblib.load("label_encoder_Unified.pkl")
    
    model = CNN_LSTM(num_features=len(features), num_classes=len(le.classes_), window_size=WINDOW_SIZE).to(DEVICE)
    model.load_state_dict(torch.load("Shield_Unified.pth", map_location=DEVICE, weights_only=True))
    model.eval()
    
    target_classes = ['Benign', 'DoS', 'Web Attack', 'Brute Force', 'PortScan', 'Botnet']
    dna_seeds = {}
    
    # Extract Seeds
    files = glob.glob(os.path.join(DATASET_DIR, "**/*.csv"), recursive=True)
    for f in files:
        if len(dna_seeds) == len(target_classes): break
        try:
            df = pd.read_csv(f, low_memory=False, nrows=5000)
            df.columns = df.columns.str.strip()
            l_col = next((c for c in df.columns if 'label' in c.lower() or 'attack' in c.lower()), None)
            if not l_col: continue
            df['Unified_Label'] = df[l_col].apply(get_standardized_label)
            for col in features:
                if col not in df.columns: df[col] = 0
            df[features] = df[features].apply(pd.to_numeric, errors='coerce').fillna(0)
            for cls in target_classes:
                if cls not in dna_seeds:
                    cls_df = df[df['Unified_Label'] == cls]
                    if len(cls_df) > 0:
                        dna_seeds[cls] = cls_df[features].iloc[0].values.tolist()
        except: continue

    benign_seed = dna_seeds['Benign']
    print("\n⚠️  EVASION ACTIVE: 25% Mutation | 15% Erasure | Temporal Jitter (1:4)")

    for cls, seed_row in dna_seeds.items():
        if cls == 'Benign': continue 
        
        print(f"\n💀 ATTACKING: {cls.upper()}")
        
        '''raw_traffic = generate_brutal_traffic(seed_row, benign_seed, num_samples=600)
        scaled_traffic = scaler.transform(raw_traffic)
        
        dist = {}
        buffer = []'''
        # ... (inside run_simulation)
        raw_traffic = generate_brutal_traffic(seed_row, benign_seed, num_samples=600)
        
        # WE CHANGE THIS LOOP:
        dist = {}
        for row in raw_traffic: # Send RAW data to the API
            fake_ip = f"192.168.1.{random.randint(2, 254)}"

            payload = {
                "features": row,
                "src_ip": fake_ip, # Now it will show as 192.168.1.x
                "dst_ip": "10.0.0.5"
            }
            
            try:
                # This is the "bridge" that sends data to your website
                response = requests.post("http://127.0.0.1:5000/predict", json=payload)
                
                if response.status_code == 200:
                    result = response.json()
                    pred_label = result.get("prediction")
                    dist[pred_label] = dist.get(pred_label, 0) + 1
            except Exception as e:
                print(f"❌ Failed to reach backend: {e}")
                break
        
        correct = dist.get(cls, 0)
        total = sum(dist.values())
        accuracy = (correct / total) * 100 if total > 0 else 0
        print(f"📊 Robustness Score: {accuracy:.1f}%")
        print("Breakdown:")
        for k, v in sorted(dist.items(), key=lambda x: x[1], reverse=True):
            print(f"  -> {k.ljust(15)} : {v}")

if __name__ == "__main__":
    run_simulation()