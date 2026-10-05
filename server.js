require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'medisafe_secret_2024';

// ─────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ─────────────────────────────────────────────
// In-Memory Data Store (Replace with DB in prod)
// ─────────────────────────────────────────────
const db = {
  patients: {},
  providers: {},
  consentTokens: {},   // short-lived QR tokens
  accessLogs: [],
  sessions: {}
};

// ─────────────────────────────────────────────
// Seed data – demo patient & providers
// ─────────────────────────────────────────────
function seedData() {
  const patientId = 'PAT-2024-001';
  db.patients[patientId] = {
    id: patientId,
    abhaId: 'ABHA-12-3456-7890-12',
    name: 'Priya Sharma',
    dob: '1990-04-15',
    gender: 'Female',
    bloodGroup: 'B+',
    phone: '+91-9876543210',
    email: 'priya.sharma@email.com',
    emergencyContact: { name: 'Ramesh Sharma', relation: 'Husband', phone: '+91-9876543211' },
    passwordHash: bcrypt.hashSync('patient123', 10),
    consentEnabled: true,
    activeConsentTokens: [],
    revokedProviders: [],
    medicalHistory: {
      allergies: [
        { substance: 'Penicillin', severity: 'High', reaction: 'Anaphylaxis', recordedAt: '2020-03-10', recordedBy: 'Dr. Meena Patel, Apollo Clinic' },
        { substance: 'Sulfa drugs', severity: 'Moderate', reaction: 'Skin rash', recordedAt: '2021-07-22', recordedBy: 'Dr. Arun Kumar, PHC Sector 5' }
      ],
      conditions: [
        { name: 'Type 2 Diabetes', diagnosedAt: '2019-08-01', status: 'Ongoing', notes: 'HbA1c monitored quarterly', recordedBy: 'Dr. Meena Patel' },
        { name: 'Hypertension', diagnosedAt: '2021-01-15', status: 'Controlled', notes: 'On medication', recordedBy: 'Dr. Sunita Rao, District Hospital' }
      ],
      medications: [
        { name: 'Metformin 500mg', dosage: 'Twice daily with meals', startDate: '2019-08-01', prescribedBy: 'Dr. Meena Patel', status: 'Active' },
        { name: 'Amlodipine 5mg', dosage: 'Once daily morning', startDate: '2021-01-15', prescribedBy: 'Dr. Sunita Rao', status: 'Active' },
        { name: 'Paracetamol 500mg', dosage: 'As needed', startDate: '2022-11-05', prescribedBy: 'Dr. Arun Kumar', status: 'Completed' }
      ],
      labResults: [
        { test: 'HbA1c', result: '7.2%', normalRange: '< 5.7%', date: '2024-01-10', lab: 'PathLab, Sector 12', interpretation: 'Slightly elevated – continue medication' },
        { test: 'Blood Pressure', result: '128/82 mmHg', normalRange: '< 120/80 mmHg', date: '2024-02-20', lab: 'District Hospital', interpretation: 'Borderline – monitor' },
        { test: 'Fasting Blood Glucose', result: '118 mg/dL', normalRange: '70-99 mg/dL', date: '2024-01-10', lab: 'PathLab, Sector 12', interpretation: 'Slightly elevated' }
      ],
      visits: [
        { date: '2024-02-20', provider: 'District Hospital, Dr. Sunita Rao', reason: 'BP Follow-up', diagnosis: 'Hypertension – Controlled', prescription: 'Continue Amlodipine 5mg', notes: 'BP trending better' },
        { date: '2024-01-10', provider: 'Apollo Clinic, Dr. Meena Patel', reason: 'Diabetes Review', diagnosis: 'Type 2 Diabetes', prescription: 'Continue Metformin 500mg BID', notes: 'HbA1c improved from 7.8 to 7.2' },
        { date: '2023-11-05', provider: 'PHC Sector 5, Dr. Arun Kumar', reason: 'Fever', diagnosis: 'Viral Fever', prescription: 'Paracetamol 500mg TID x 5 days', notes: 'Resolved in 4 days' }
      ],
      immunizations: [
        { vaccine: 'COVID-19 (Covishield)', dose: '2nd Dose', date: '2021-06-15', center: 'PHC Sector 5' },
        { vaccine: 'Influenza', dose: 'Annual', date: '2023-10-01', center: 'Apollo Clinic' }
      ]
    }
  };

  // Provider accounts
  db.providers['DR-PHC-001'] = {
    id: 'DR-PHC-001',
    name: 'Dr. Arun Kumar',
    facility: 'PHC Sector 5',
    type: 'PHC',
    specialization: 'General Medicine',
    passwordHash: bcrypt.hashSync('provider123', 10)
  };
  db.providers['DR-PRIV-001'] = {
    id: 'DR-PRIV-001',
    name: 'Dr. Meena Patel',
    facility: 'Apollo Clinic',
    type: 'Private Clinic',
    specialization: 'Endocrinology',
    passwordHash: bcrypt.hashSync('provider123', 10)
  };
}

seedData();

// ─────────────────────────────────────────────
// Gemini AI Helper
// ─────────────────────────────────────────────
async function getAISummary(medicalHistory, query = null) {
  try {
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here') {
      return generateFallbackSummary(medicalHistory, query);
    }
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = query
      ? `As a medical AI assistant, answer this query about the patient: "${query}"\n\nPatient Data:\n${JSON.stringify(medicalHistory, null, 2)}\n\nProvide a concise, clinically relevant answer in 2-3 sentences. Do not suggest diagnoses. Only summarize known data.`
      : `As a medical AI assistant, create a concise clinical summary (under 150 words) for a healthcare provider at point of care. Highlight: active medications, critical allergies, chronic conditions, and recent test results.\n\nPatient Data:\n${JSON.stringify(medicalHistory, null, 2)}\n\nFormat as: CRITICAL ALERTS | ACTIVE CONDITIONS | CURRENT MEDICATIONS | RECENT TESTS`;
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (err) {
    console.error('Gemini AI error:', err.message);
    return generateFallbackSummary(medicalHistory, query);
  }
}

function generateFallbackSummary(history, query) {
  const allergies = history.allergies?.map(a => `${a.substance} (${a.severity})`).join(', ') || 'None';
  const meds = history.medications?.filter(m => m.status === 'Active').map(m => m.name).join(', ') || 'None';
  const conditions = history.conditions?.map(c => c.name).join(', ') || 'None';
  if (query) {
    return `Based on records: Allergies: ${allergies}. Active medications: ${meds}. Conditions: ${conditions}. Please review full history for detailed information.`;
  }
  return `⚠️ CRITICAL ALERTS: Allergies to ${allergies}\n📋 ACTIVE CONDITIONS: ${conditions}\n💊 CURRENT MEDICATIONS: ${meds}\n🔬 Recent HbA1c: 7.2%, BP: 128/82 mmHg (Jan-Feb 2024)`;
}

// ─────────────────────────────────────────────
// Auth Middleware
// ─────────────────────────────────────────────
function authPatient(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'patient') return res.status(403).json({ error: 'Not a patient token' });
    req.patient = db.patients[decoded.id];
    if (!req.patient) return res.status(404).json({ error: 'Patient not found' });
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function authProvider(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'provider') return res.status(403).json({ error: 'Not a provider token' });
    req.provider = db.providers[decoded.id];
    if (!req.provider) return res.status(404).json({ error: 'Provider not found' });
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ─────────────────────────────────────────────
// ROUTES – Patient Auth
// ─────────────────────────────────────────────
app.post('/api/patient/login', (req, res) => {
  const { patientId, password } = req.body;
  const patient = Object.values(db.patients).find(p => p.id === patientId || p.abhaId === patientId || p.phone === patientId);
  if (!patient || !bcrypt.compareSync(password, patient.passwordHash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ id: patient.id, role: 'patient' }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, patient: { id: patient.id, name: patient.name, abhaId: patient.abhaId } });
});

app.post('/api/provider/login', (req, res) => {
  const { providerId, password } = req.body;
  const provider = db.providers[providerId];
  if (!provider || !bcrypt.compareSync(password, provider.passwordHash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ id: provider.id, role: 'provider' }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, provider: { id: provider.id, name: provider.name, facility: provider.facility } });
});

// ─────────────────────────────────────────────
// ROUTES – Patient Profile
// ─────────────────────────────────────────────
app.get('/api/patient/profile', authPatient, (req, res) => {
  const { passwordHash, activeConsentTokens, ...safe } = req.patient;
  res.json(safe);
});

// ─────────────────────────────────────────────
// ROUTES – QR Consent Generation
// ─────────────────────────────────────────────
app.post('/api/patient/generate-consent', authPatient, async (req, res) => {
  const { expiresInMinutes = 10, scope = 'full', note = '' } = req.body;
  const patient = req.patient;

  // Create short-lived consent token
  const tokenId = uuidv4();
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

  const consentToken = {
    tokenId,
    patientId: patient.id,
    scope,              // 'full' | 'summary' | 'emergency'
    note,
    createdAt: new Date().toISOString(),
    expiresAt: expiresAt.toISOString(),
    used: false,
    revoked: false,
    accessedBy: []
  };

  db.consentTokens[tokenId] = consentToken;
  patient.activeConsentTokens = patient.activeConsentTokens || [];
  patient.activeConsentTokens.push(tokenId);

  // QR payload – points to our provider access URL
  const qrPayload = JSON.stringify({
    type: 'medisafe-consent',
    tokenId,
    patientId: patient.id,
    abhaId: patient.abhaId,
    scope,
    expiresAt: expiresAt.toISOString(),
    accessUrl: `http://localhost:3001/provider-access?token=${tokenId}`
  });

  try {
    const qrDataUrl = await QRCode.toDataURL(qrPayload, {
      errorCorrectionLevel: 'H',
      width: 300,
      margin: 2,
      color: { dark: '#1e40af', light: '#ffffff' }
    });

    res.json({
      success: true,
      tokenId,
      qrDataUrl,
      expiresAt: expiresAt.toISOString(),
      expiresInMinutes,
      scope,
      accessUrl: `http://localhost:3001/provider-access?token=${tokenId}`
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// ─────────────────────────────────────────────
// ROUTES – Revoke Consent
// ─────────────────────────────────────────────
app.post('/api/patient/revoke-consent', authPatient, (req, res) => {
  const { tokenId } = req.body;
  const patient = req.patient;
  const token = db.consentTokens[tokenId];

  if (!token || token.patientId !== patient.id) {
    return res.status(404).json({ error: 'Consent token not found' });
  }

  token.revoked = true;
  token.revokedAt = new Date().toISOString();
  patient.activeConsentTokens = (patient.activeConsentTokens || []).filter(t => t !== tokenId);

  db.accessLogs.push({
    type: 'CONSENT_REVOKED',
    patientId: patient.id,
    tokenId,
    timestamp: new Date().toISOString()
  });

  res.json({ success: true, message: 'Consent revoked successfully', revokedAt: token.revokedAt });
});

// Revoke all active consents
app.post('/api/patient/revoke-all', authPatient, (req, res) => {
  const patient = req.patient;
  const revokedCount = (patient.activeConsentTokens || []).length;

  (patient.activeConsentTokens || []).forEach(tokenId => {
    if (db.consentTokens[tokenId]) {
      db.consentTokens[tokenId].revoked = true;
      db.consentTokens[tokenId].revokedAt = new Date().toISOString();
    }
  });

  patient.activeConsentTokens = [];

  db.accessLogs.push({
    type: 'ALL_CONSENTS_REVOKED',
    patientId: patient.id,
    revokedCount,
    timestamp: new Date().toISOString()
  });

  res.json({ success: true, message: `${revokedCount} consent(s) revoked`, revokedAt: new Date().toISOString() });
});

// ─────────────────────────────────────────────
// ROUTES – Active Consents List
// ─────────────────────────────────────────────
app.get('/api/patient/consents', authPatient, (req, res) => {
  const patient = req.patient;
  const consents = Object.values(db.consentTokens)
    .filter(t => t.patientId === patient.id)
    .map(({ tokenId, scope, note, createdAt, expiresAt, revoked, revokedAt, accessedBy, used }) => ({
      tokenId, scope, note, createdAt, expiresAt, revoked, revokedAt,
      accessCount: accessedBy.length,
      isExpired: new Date() > new Date(expiresAt),
      isActive: !revoked && new Date() < new Date(expiresAt)
    }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.json({ consents });
});

// ─────────────────────────────────────────────
// ROUTES – Provider Access (QR Scan)
// ─────────────────────────────────────────────
app.get('/api/provider/access/:tokenId', (req, res) => {
  const { tokenId } = req.params;
  const consentToken = db.consentTokens[tokenId];

  if (!consentToken) return res.status(404).json({ error: 'Invalid or expired consent token' });
  if (consentToken.revoked) return res.status(403).json({ error: 'CONSENT_REVOKED', message: 'Patient has revoked this consent' });
  if (new Date() > new Date(consentToken.expiresAt)) return res.status(403).json({ error: 'CONSENT_EXPIRED', message: 'Consent QR code has expired' });

  const patient = db.patients[consentToken.patientId];
  if (!patient) return res.status(404).json({ error: 'Patient not found' });

  // Log access
  const accessRecord = {
    accessedAt: new Date().toISOString(),
    accessorId: req.headers['x-provider-id'] || 'anonymous',
    ip: req.ip
  };
  consentToken.accessedBy.push(accessRecord);
  consentToken.used = true;

  db.accessLogs.push({
    type: 'RECORD_ACCESSED',
    patientId: patient.id,
    tokenId,
    accessorId: accessRecord.accessorId,
    timestamp: accessRecord.accessedAt
  });

  // Scope-based data return
  const data = buildScopedData(patient, consentToken.scope);

  res.json({
    success: true,
    accessGranted: true,
    scope: consentToken.scope,
    consentNote: consentToken.note,
    patient: data,
    accessedAt: accessRecord.accessedAt,
    tokenExpiresAt: consentToken.expiresAt
  });
});

function buildScopedData(patient, scope) {
  const base = {
    id: patient.id,
    abhaId: patient.abhaId,
    name: patient.name,
    dob: patient.dob,
    gender: patient.gender,
    bloodGroup: patient.bloodGroup,
    emergencyContact: patient.emergencyContact
  };

  if (scope === 'emergency') {
    return {
      ...base,
      allergies: patient.medicalHistory.allergies,
      conditions: patient.medicalHistory.conditions,
      medications: patient.medicalHistory.medications.filter(m => m.status === 'Active')
    };
  }

  if (scope === 'summary') {
    return {
      ...base,
      allergies: patient.medicalHistory.allergies,
      conditions: patient.medicalHistory.conditions,
      medications: patient.medicalHistory.medications,
      recentVisit: patient.medicalHistory.visits[0] || null
    };
  }

  // Full scope
  return { ...base, medicalHistory: patient.medicalHistory };
}

// ─────────────────────────────────────────────
// ROUTES – AI Summary
// ─────────────────────────────────────────────
app.post('/api/ai/summary', async (req, res) => {
  const { tokenId, query } = req.body;
  const consentToken = db.consentTokens[tokenId];

  if (!consentToken || consentToken.revoked || new Date() > new Date(consentToken.expiresAt)) {
    return res.status(403).json({ error: 'Invalid or expired consent' });
  }

  const patient = db.patients[consentToken.patientId];
  const summary = await getAISummary(patient.medicalHistory, query);

  res.json({ summary, generatedAt: new Date().toISOString() });
});

// Patient AI chat
app.post('/api/ai/patient-chat', authPatient, async (req, res) => {
  const { query } = req.body;
  const patient = req.patient;
  const summary = await getAISummary(patient.medicalHistory, query);
  res.json({ response: summary, generatedAt: new Date().toISOString() });
});

// ─────────────────────────────────────────────
// ROUTES – Add Medical Record (Provider)
// ─────────────────────────────────────────────
app.post('/api/provider/add-record', authProvider, (req, res) => {
  const { tokenId, recordType, recordData } = req.body;
  const consentToken = db.consentTokens[tokenId];

  if (!consentToken || consentToken.revoked || new Date() > new Date(consentToken.expiresAt)) {
    return res.status(403).json({ error: 'Invalid or expired consent' });
  }

  const patient = db.patients[consentToken.patientId];
  const provider = req.provider;

  const record = {
    ...recordData,
    recordedAt: new Date().toISOString(),
    recordedBy: `${provider.name}, ${provider.facility}`,
    providerId: provider.id
  };

  switch (recordType) {
    case 'visit':
      patient.medicalHistory.visits.unshift({ date: new Date().toISOString().split('T')[0], provider: `${provider.facility}, ${provider.name}`, ...recordData });
      break;
    case 'medication':
      patient.medicalHistory.medications.unshift(record);
      break;
    case 'lab':
      patient.medicalHistory.labResults.unshift(record);
      break;
    case 'allergy':
      patient.medicalHistory.allergies.unshift(record);
      break;
    default:
      return res.status(400).json({ error: 'Invalid record type' });
  }

  db.accessLogs.push({
    type: 'RECORD_ADDED',
    patientId: patient.id,
    tokenId,
    recordType,
    providerId: provider.id,
    timestamp: new Date().toISOString()
  });

  res.json({ success: true, message: `${recordType} record added successfully` });
});

// ─────────────────────────────────────────────
// ROUTES – Access Logs
// ─────────────────────────────────────────────
app.get('/api/patient/access-logs', authPatient, (req, res) => {
  const logs = db.accessLogs
    .filter(l => l.patientId === req.patient.id)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 50);
  res.json({ logs });
});

// ─────────────────────────────────────────────
// Serve Frontend
// ─────────────────────────────────────────────
app.get('/provider-access', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'provider.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🏥 MediSafe Server running on http://localhost:${PORT}`);
  console.log(`📱 Patient App: http://localhost:${PORT}`);
  console.log(`🩺 Provider Access: http://localhost:${PORT}/provider-access`);
  console.log(`\n🔑 Demo Credentials:`);
  console.log(`   Patient: PAT-2024-001 / patient123`);
  console.log(`   Provider: DR-PHC-001 / provider123\n`);
});
