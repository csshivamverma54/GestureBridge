"""
model.py  (backend/ml/model.py)
---------------------------------
PyTorch LSTM model for sign language word recognition.

Architecture (dual-hand input: 126 features per frame):
    Input  (batch, 30, 126)
      │
      ├─ LSTM 256 units, return_sequences=True
      ├─ BatchNorm + Dropout 0.3
      │
      ├─ LSTM 256 units, return_sequences=True
      ├─ BatchNorm + Dropout 0.3
      │
      ├─ LSTM 128 units, return_sequences=False
      ├─ BatchNorm + Dropout 0.3
      │
      ├─ Dense 512 units, ReLU
      ├─ BatchNorm + Dropout 0.4
      │
      ├─ Dense 256 units, ReLU
      ├─ Dropout 0.3
      │
      └─ Dense num_classes, Softmax

Design decisions:
  - Input size doubled to 126 (left-hand 63 + right-hand 63) to capture
    bilateral sign language gestures accurately.
  - Three LSTM layers for richer temporal modelling over the 30-frame window.
  - Wider hidden states (256) to handle the larger vocabulary (~800 classes).
  - Deeper classifier head (512 → 256 → num_classes).
  - BatchNorm after every LSTM and the first Dense for training stability.
  - Dropout rates tuned for regularisation at this scale.
  - L2 weight decay via the optimizer weight_decay parameter.

This file only defines the model.
Training, callbacks, and persistence live in ml/train.py.
"""

import torch
import torch.nn as nn


# ------------------------------------------------------------------
# Constants (must match preprocessing)
# ------------------------------------------------------------------
SEQUENCE_LENGTH = 30
LANDMARK_VECTOR_SIZE = 126   # 21 landmarks × 3 (x, y, z) × 2 hands


# ------------------------------------------------------------------
# Model definition
# ------------------------------------------------------------------
class GestureBridgeLSTM(nn.Module):
    """Three-layer stacked LSTM classifier for two-hand gesture sequences."""

    def __init__(self, num_classes: int):
        super().__init__()

        # ── First LSTM block (returns full sequence) ──────────────
        self.lstm1 = nn.LSTM(
            input_size=LANDMARK_VECTOR_SIZE,
            hidden_size=256,
            batch_first=True,
        )
        self.bn1   = nn.BatchNorm1d(256)
        self.drop1 = nn.Dropout(0.3)

        # ── Second LSTM block (returns full sequence) ─────────────
        self.lstm2 = nn.LSTM(
            input_size=256,
            hidden_size=256,
            batch_first=True,
        )
        self.bn2   = nn.BatchNorm1d(256)
        self.drop2 = nn.Dropout(0.3)

        # ── Third LSTM block (returns last step only) ─────────────
        self.lstm3 = nn.LSTM(
            input_size=256,
            hidden_size=128,
            batch_first=True,
        )
        self.bn3   = nn.BatchNorm1d(128)
        self.drop3 = nn.Dropout(0.3)

        # ── Dense classifier head ─────────────────────────────────
        self.dense1 = nn.Linear(128, 512)
        self.bn4    = nn.BatchNorm1d(512)
        self.relu1  = nn.ReLU()
        self.drop4  = nn.Dropout(0.4)

        self.dense2 = nn.Linear(512, 256)
        self.relu2  = nn.ReLU()
        self.drop5  = nn.Dropout(0.3)

        self.out    = nn.Linear(256, num_classes)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (batch, seq_len, 126)

        # ── LSTM 1 ──
        x, _ = self.lstm1(x)                           # (batch, seq_len, 256)
        B, T, H = x.shape
        x = self.bn1(x.reshape(B * T, H)).reshape(B, T, H)
        x = self.drop1(x)

        # ── LSTM 2 ──
        x, _ = self.lstm2(x)                           # (batch, seq_len, 256)
        B, T, H = x.shape
        x = self.bn2(x.reshape(B * T, H)).reshape(B, T, H)
        x = self.drop2(x)

        # ── LSTM 3 (take last time-step) ──
        x, _ = self.lstm3(x)                           # (batch, seq_len, 128)
        x = x[:, -1, :]                                # → (batch, 128)
        x = self.bn3(x)
        x = self.drop3(x)

        # ── Classifier head ──
        x = self.relu1(self.bn4(self.dense1(x)))       # (batch, 512)
        x = self.drop4(x)
        x = self.relu2(self.dense2(x))                 # (batch, 256)
        x = self.drop5(x)
        x = self.out(x)                                # (batch, num_classes) — logits
        return x


# ------------------------------------------------------------------
# Factory helpers
# ------------------------------------------------------------------
def build_model(num_classes: int, learning_rate: float = 1e-3):
    """
    Build the GestureBridge LSTM model and its Adam optimizer.

    Parameters
    ----------
    num_classes   : int   — number of unique sign language words (glosses)
    learning_rate : float — initial learning rate for Adam (default 1e-3)

    Returns
    -------
    model     : GestureBridgeLSTM
    optimizer : torch.optim.Adam
    criterion : nn.CrossEntropyLoss
    """
    model = GestureBridgeLSTM(num_classes=num_classes)
    optimizer = torch.optim.Adam(
        model.parameters(),
        lr=learning_rate,
        weight_decay=1e-5,
    )
    criterion = nn.CrossEntropyLoss()
    return model, optimizer, criterion


def load_saved_model(model_path: str, num_classes: int) -> "GestureBridgeLSTM":
    """
    Load a previously saved GestureBridge model from a .pt file.

    Parameters
    ----------
    model_path  : str — path to the saved state-dict file (.pt)
    num_classes : int — must match the num_classes used during training

    Returns
    -------
    GestureBridgeLSTM in eval mode
    """
    model = GestureBridgeLSTM(num_classes=num_classes)
    state = torch.load(model_path, map_location="cpu", weights_only=True)
    model.load_state_dict(state)
    model.eval()
    return model


# ------------------------------------------------------------------
# Quick self-test
# ------------------------------------------------------------------
if __name__ == "__main__":
    import numpy as np

    NUM_CLASSES = 800
    model, optimizer, criterion = build_model(num_classes=NUM_CLASSES)
    print(model)

    dummy = torch.zeros(4, SEQUENCE_LENGTH, LANDMARK_VECTOR_SIZE)
    model.eval()
    with torch.no_grad():
        logits = model(dummy)
    assert logits.shape == (4, NUM_CLASSES), f"Unexpected shape: {logits.shape}"
    print(f"\nSmoke test passed — output shape: {tuple(logits.shape)}")
