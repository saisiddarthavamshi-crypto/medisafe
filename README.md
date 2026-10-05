# MediSafe – Patient-Held Consent-Driven Health Record
## Hackathon Setup Guide

## 🚀 Quick Start (No Installation Required)

**Just open `MediSafe_Demo.html` in any web browser!**
That's it. The complete app runs locally with no server needed.

---

## 🔑 Demo Credentials

### Patient
| Field | Value |
|-------|-------|
| Patient ID | `PAT-2024-001` |
| ABHA ID | `ABHA-12-3456-7890-12` |
| Password | `patient123` |
| Demo Patient | Priya Sharma (32F, B+) |

### Providers
| Field | PHC Doctor | Clinic Doctor |
|-------|-----------|----------------|
| Provider ID | `DR-PHC-001` | `DR-PRIV-001` |
| Password | `provider123` | `provider123` |
| Name | Dr. Arun Kumar | Dr. Meena Patel |
| Facility | PHC Sector 5 | Apollo Clinic |

---

## 🎯 Hackathon Demo Flow

### Scenario 1: Normal Patient Visit (QR Consent)
1. Open `MediSafe_Demo.html` in **two browser tabs**
2. **Tab 1** → Patient → Login as `PAT-2024-001` / `patient123`
3. **Tab 1** → Click "QR Share" → Select scope → Click **Generate QR Code**
4. Note the **Consent Token** (e.g. `TKN-ABC123XYZ`)
5. **Tab 2** → Provider → Login as `DR-PHC-001` / `provider123`
6. **Tab 2** → Paste the token → Click **Access**
7. Provider sees full patient history + AI clinical summary in seconds!

### Scenario 2: Consent Revocation (Key Demo Point)
1. While provider has access, go back to **Tab 1 (Patient)**
2. Click **"🚫 REVOKE THIS QR NOW"**
3. Switch to **Tab 2 (Provider)** and refresh/click Access again
4. Provider sees **"🚫 Consent Revoked – Access Denied"**
5. This demonstrates real-time patient control!

### Scenario 3: Emergency Access
1. As patient → Click **🆘 SOS** button in top-right
2. Critical allergies, medications, and emergency contact shown
3. No consent needed for emergency view

### Scenario 4: AI Assistant
- As patient → Click **AI Chat** tab
- Ask: *"Am I safe to take ibuprofen?"*
- As provider → After accessing patient, click **✨ Generate** in AI Clinical Summary
- Ask: *"Any drug interactions to be aware of?"*

---

## 🏗️ Full Stack Version (With Node.js Backend)

### Prerequisites
- Node.js v18+ installed
- Gemini API key (optional, for real AI)

### Setup
```bash
cd medisafe
npm install
# Edit .env and add your GEMINI_API_KEY
node server.js
```

### Access
- Patient App: http://localhost:3001
- Provider Portal: http://localhost:3001/provider-access

---

## ✨ Features Built

### Core Requirements ✅
- [x] **Patient-held health record** – all data controlled by patient
- [x] **QR-based consent** – time-limited, scoped access tokens
- [x] **ABHA ID integration** – linked to India's health ID system
- [x] **Consent granting** – patient generates QR with selected scope
- [x] **Consent revocation** – immediate, visible, prominent UI
- [x] **Access in seconds** – provider pastes token, sees records instantly
- [x] **No laptop/complex login** – works on any phone/tablet browser

### AI Features 🤖
- [x] **AI Clinical Summary** – auto-generates point-of-care summary for providers
- [x] **AI Health Chat (Patient)** – patients can ask questions about their records
- [x] **Drug Interaction Check** – AI warns about potential interactions
- [x] **Smart Query Answering** – providers can ask natural language questions

### Additional Features 🌟
- [x] **Scope-based access** – Summary / Full / Emergency Only
- [x] **Auto-expiring tokens** – QR codes expire after set time
- [x] **Access audit log** – patients see who accessed and when
- [x] **Emergency view** – critical info always accessible
- [x] **Provider record addition** – providers can add records during visit
- [x] **Allergy alerts** – prominent warnings at top of provider view
- [x] **Full medical history** – allergies, conditions, medications, labs, visits, vaccines
- [x] **Mobile-responsive** – works on smartphones

---

## 🏛️ Architecture

```
Patient Phone/Tablet          Provider Phone/Tablet
      │                              │
      │  [Generates QR Code]         │
      │  [Contains: tokenId +        │
      │   scope + expiry]            │
      │                              │
      └──────── QR Code ────────────>│
                                     │
                             [Scans QR / Pastes Token]
                                     │
                          [Calls API: /provider/access/:tokenId]
                                     │
                          [Server checks: valid? revoked? expired?]
                                     │
                          [Returns scoped patient data]
                                     │
                          [AI generates clinical summary]
```

---

## 📁 File Structure

```
medisafe/
├── MediSafe_Demo.html    ← ⭐ OPEN THIS FOR DEMO (no server needed)
├── server.js              ← Node.js backend (optional, full-stack)
├── package.json           ← Dependencies
├── .env                   ← Environment config
└── public/
    ├── index.html         ← Patient app (requires server)
    └── provider.html      ← Provider portal (requires server)
```

---

## 🔐 Security Design

- **Short-lived tokens** – QR codes expire in 5-60 minutes
- **Scope-based access** – Provider only sees what patient allows
- **Immediate revocation** – Patient can deny access in 1 tap
- **Audit trail** – Every access is logged with timestamp
- **No permanent credentials shared** – Token is one-use access key
- **ABHA linkage** – Tied to India's national health ID

---

## 🎨 UX Highlights (Judges will notice)

- **Allergy alert banner** – Prominent red warning for providers
- **Countdown timer** – Visual countdown on QR code
- **Real-time revocation** – Provider sees denial message instantly
- **Access log** – Patient sees "👁 Accessed 1 time" on their consent
- **Emergency SOS button** – Always visible, no login needed for critical info
