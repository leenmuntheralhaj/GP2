import glob
import pandas as pd
import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
import joblib
import matplotlib.pyplot as plt
from torch.utils.data import DataLoader
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.metrics import classification_report, confusion_matrix, ConfusionMatrixDisplay
from imblearn.over_sampling import SMOTE
import os

# --- Configuration ---
DATASET_DIR = r"C:\Users\ASUS\GP\GP_Final\CSV files"
EPOCHS = 10
BATCH_SIZE = 512
WINDOW_SIZE = 15  # THE GOLDILOCKS ZONE
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# --- NFStream DDoS Identification Rules ---
IP_COL = 'src_ip'
DDOS_ATTACKER_IPS = ['192.168.10.50', '172.16.0.1']

# 1. UPGRADED CNN-LSTM ARCHITECTURE
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

def get_standardized_label(raw_label):
    lbl = str(raw_label).upper()
    # 1. Handle Nulls & Unknowns (These will return None and get dropped)
    if pd.isna(raw_label) or lbl == 'NAN' or 'UNKNOWN' in lbl:
        return None

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

# 2. CHRONOLOGICAL DATA LOADER
def load_and_split_chronological():
    print(f"🔍 Scanning {DATASET_DIR}...")
    all_files = glob.glob(os.path.join(DATASET_DIR, "**/*.csv"), recursive=True)
    train_dfs, val_dfs, test_dfs = [], [], []
    for f in all_files:
        try:
            df = pd.read_csv(f, low_memory=False)
            df.columns = df.columns.str.strip()
            l_col = next((c for c in df.columns if 'label' in c.lower() or 'attack' in c.lower()), None)
            if not l_col: continue
            if "NFStreamer" in f and IP_COL in df.columns:
                is_ddos = df[l_col].isna() & df[IP_COL].isin(DDOS_ATTACKER_IPS)
                df.loc[is_ddos, l_col] = 'DDoS'
            df['Unified_Label'] = df[l_col].apply(get_standardized_label)
            df = df.dropna(subset=['Unified_Label'])
            df = df[df['Unified_Label'] != 'Other']
            split1, split2 = int(len(df) * 0.70), int(len(df) * 0.85)
            train_dfs.append(df.iloc[:split1])
            val_dfs.append(df.iloc[split1:split2])
            test_dfs.append(df.iloc[split2:])
        except: continue

    train_master = pd.concat(train_dfs, ignore_index=True)
    val_master = pd.concat(val_dfs, ignore_index=True)
    test_master = pd.concat(test_dfs, ignore_index=True)
    leakage = ['Unnamed: 0', 'Source Port', 'Destination Port', 'src_ip', 'dst_ip']
    features = [c for c in train_master.select_dtypes(include=[np.number]).columns if c not in leakage]

    train_master[features] = train_master[features].fillna(0).replace([np.inf, -np.inf], 0)
    val_master[features] = val_master[features].fillna(0).replace([np.inf, -np.inf], 0)
    test_master[features] = test_master[features].fillna(0).replace([np.inf, -np.inf], 0)

    return train_master, val_master, test_master, features

# 3. ON-THE-FLY DATASET WITH AUGMENTATION
class OnTheFlyDataset(torch.utils.data.Dataset):

    def __init__(self, X, y, window_size, augment=False):
        self.X = torch.tensor(X, dtype=torch.float32)
        self.y = torch.tensor(y, dtype=torch.long)
        self.window_size = window_size
        self.augment = augment

    def __len__(self):
        return len(self.X) - self.window_size + 1

    def __getitem__(self, idx):
        window = self.X[idx : idx + self.window_size].clone()
        label = self.y[idx + self.window_size - 1]
        if self.augment and torch.rand(1) < 0.2:
            noise = torch.randn_like(window) * 0.02
            window += noise

        return window, label


# 4. MAIN PIPELINE
if __name__ == "__main__":

    train_df, val_df, test_df, features = load_and_split_chronological()

    le = LabelEncoder()
    y_train_enc = le.fit_transform(train_df['Unified_Label'].values)
    y_val_enc = le.transform(val_df['Unified_Label'].values)
    y_test_enc = le.transform(test_df['Unified_Label'].values)
    class_names = le.classes_

    sc = StandardScaler()
    X_train_scaled = sc.fit_transform(train_df[features].values)
    X_val_scaled = sc.transform(val_df[features].values)
    X_test_scaled = sc.transform(test_df[features].values)

    print("\n⚖️ Applying SMOTE...")
    smote = SMOTE(sampling_strategy='auto', random_state=42)
    X_train_res, y_train_res = smote.fit_resample(X_train_scaled, y_train_enc)

    train_dataset = OnTheFlyDataset(X_train_res, y_train_res, WINDOW_SIZE, augment=True)
    val_dataset = OnTheFlyDataset(X_val_scaled, y_val_enc, WINDOW_SIZE, augment=False)
    test_dataset = OnTheFlyDataset(X_test_scaled, y_test_enc, WINDOW_SIZE, augment=False)

    train_loader = DataLoader(train_dataset, batch_size=BATCH_SIZE, shuffle=True)
    val_loader = DataLoader(val_dataset, batch_size=BATCH_SIZE, shuffle=False)
    test_loader = DataLoader(test_dataset, batch_size=BATCH_SIZE, shuffle=False)

    model = CNN_LSTM(len(features), len(class_names), WINDOW_SIZE).to(DEVICE)
    criterion = nn.CrossEntropyLoss()
    optimizer = optim.AdamW(model.parameters(), lr=0.001)

    print(f"\n🚀 Training with Window={WINDOW_SIZE} and Robustness Augmentation...")
    for epoch in range(EPOCHS):
        model.train()
        train_loss = 0
        for inputs, labels in train_loader:
            inputs, labels = inputs.to(DEVICE), labels.to(DEVICE)
            optimizer.zero_grad()
            outputs = model(inputs)
            loss = criterion(outputs, labels)
            loss.backward()
            optimizer.step()
            train_loss += loss.item()
        print(f"Epoch {epoch+1}/{EPOCHS} | Avg Loss: {train_loss/len(train_loader):.4f}")

    # 5. FINAL TEST PHASE & CONFUSION MATRIX
    print("\n🛡️ Running Final Evaluation on Holdout Test Set...")
    model.eval()
    y_true_list, y_pred_list = [], []

    with torch.no_grad():
        for inputs, labels in test_loader:
            inputs, labels = inputs.to(DEVICE), labels.to(DEVICE)
            outputs = model(inputs)
            _, predicted = torch.max(outputs.data, 1)
            y_true_list.extend(labels.cpu().numpy())
            y_pred_list.extend(predicted.cpu().numpy())

    print("\n📊 CLASSIFICATION REPORT:")
    print(classification_report(y_true_list, y_pred_list, target_names=class_names, zero_division=0))

    # Plot Confusion Matrix
    cm = confusion_matrix(y_true_list, y_pred_list)
    fig, ax = plt.subplots(figsize=(10, 8))
    disp = ConfusionMatrixDisplay(confusion_matrix=cm, display_labels=class_names)
    disp.plot(cmap=plt.cm.Blues, xticks_rotation=45, ax=ax)
    plt.title(f"Confusion Matrix (Window Size {WINDOW_SIZE})")
    plt.show()

    # Export Artifacts
    joblib.dump(sc, 'scaler_Unified.pkl')
    joblib.dump(le, 'label_encoder_Unified.pkl')
    joblib.dump(features, "features_Unified.pkl")
    torch.save(model.state_dict(), "Shield_Unified.pth")
    print("✅ EXPORT COMPLETE: Saved Unified Master Model and features.") 