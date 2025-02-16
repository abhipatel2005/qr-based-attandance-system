// const express = require('express');
// const session = require('express-session');
// const cookieParser = require('cookie-parser');
// const QRCode = require('qrcode');
// const crypto = require('crypto');
// const path = require('path');

// const app = express();
// const PORT = 3000;
// const IP = '192.168.71.163';

// // Middleware setup
// app.set('view engine', 'ejs');
// app.use(express.static('public'));
// app.use(cookieParser());
// app.use(session({ secret: 'secureqr', resave: false, saveUninitialized: true }));

// // Store session details (session_id -> { device, ip, timestamp, subject })
// let qrSessions = {};
// let attendanceRecords = {};

// // Function to generate unique session IDs
// function generateSessionId() {
//     return crypto.randomBytes(4).toString('hex');
// }

// // Home route to display subject selection
// app.get('/', (req, res) => {
//     res.render('index');
// });

// // Generate a new QR code for a subject
// app.get('/generate_qr', async (req, res) => {
//     let subject = req.query.subject;
//     if (!subject) {
//         return res.status(400).json({ error: 'Subject is required' });
//     }
//     let sessionId = generateSessionId();
//     let timestamp = Date.now();
//     let qrData = `http://${IP}:${PORT}/attendance?session=${sessionId}&timestamp=${timestamp}&subject=${encodeURIComponent(subject)}`;

//     qrSessions[sessionId] = { device: null, ip: null, timestamp, subject, submitted: false };
//     let qrCode = await QRCode.toDataURL(qrData);
//     res.json({ qr_code: qrCode, qr_url: qrData });
// });

// // Verify QR scan and prevent reuse/sharing
// app.get('/attendance', (req, res) => {
//     let { session, timestamp, subject } = req.query;
//     let userDevice = req.headers['user-agent'];
//     let userIP = req.ip;

//     if (!session || !qrSessions[session] || qrSessions[session].subject !== subject) {
//         return res.status(403).json({ error: 'Invalid QR session or subject mismatch' });
//     }

//     if (Date.now() - Number(timestamp) > 30000) {
//         return res.status(403).json({ error: 'QR code expired' });
//     }

//     if (qrSessions[session].device && qrSessions[session].device !== userDevice) {
//         return res.status(403).json({ error: 'This QR has been locked to another device' });
//     }
//     if (qrSessions[session].ip && qrSessions[session].ip !== userIP) {
//         return res.status(403).json({ error: 'This QR has been locked to another IP address' });
//     }

//     qrSessions[session].device = userDevice;
//     qrSessions[session].ip = userIP;
//     qrSessions[session].timestamp = Date.now() + 30000;
//     res.cookie('qrSession', session, { httpOnly: true, maxAge: 30000 });

//     res.render('enter_id', { session, subject });
// });

// // Mark attendance
// // app.get('/mark_attendance', (req, res) => {
// //     let { session, studentId, subject } = req.query;
// //     console.log(subject);
// //     let userDevice = req.headers['user-agent'];
// //     let userIP = req.ip;

// //     if (!studentId) {
// //         return res.status(403).json({ error: 'Student ID is required!' });
// //     }

// //     if (!qrSessions[session] || qrSessions[session].submitted) {
// //         return res.status(403).json({ error: 'Attendance already marked from this device!' });
// //     }

// //     if (!attendanceRecords[subject]) {
// //         attendanceRecords[subject] = {};
// //     }

// //     if (attendanceRecords[subject][studentId]) {
// //         return res.status(403).json({ error: 'Attendance already marked for this Student ID in this subject!' });
// //     }

// //     qrSessions[session].submitted = true;
// //     attendanceRecords[subject][studentId] = { time: new Date(), device: userDevice, ip: userIP };

// //     console.log(`Attendance marked for ${studentId} in ${subject}`);
// //     res.json({ success: `Attendance recorded for ${studentId} in ${subject}` });
// // });
// app.get('/mark_attendance', (req, res) => {
//     let { session, studentId, subject } = req.query;

//     // If subject is undefined in the request, try retrieving from qrSessions
//     if (!subject && qrSessions[session]) {
//         subject = qrSessions[session].subject;
//     }

//     console.log("Received subject:", subject);

//     let userDevice = req.headers['user-agent'];
//     let userIP = req.ip;

//     if (!studentId) {
//         return res.status(403).json({ error: 'Student ID is required!' });
//     }

//     if (!qrSessions[session] || qrSessions[session].submitted) {
//         return res.status(403).json({ error: 'Attendance already marked from this device!' });
//     }

//     if (!attendanceRecords[subject]) {
//         attendanceRecords[subject] = {};
//     }

//     if (attendanceRecords[subject][studentId]) {
//         return res.status(403).json({ error: 'Attendance already marked for this Student ID in this subject!' });
//     }

//     qrSessions[session].submitted = true;
//     attendanceRecords[subject][studentId] = { time: new Date(), device: userDevice, ip: userIP };

//     console.log(`Attendance marked for ${studentId} in ${subject}`);
//     res.json({ success: `Attendance recorded for ${studentId} in ${subject}` });
// });


// // Dashboard to track attendance
// app.get('/dashboard', (req, res) => {
//     res.render('dashboard', { attendanceRecords });
// });

// app.set('views', path.join(__dirname, 'views'));

// app.listen(PORT, () => {
//     console.log(`Server running at http://localhost:${PORT}`);
// });

const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const QRCode = require('qrcode');
const crypto = require('crypto');
const path = require('path');
const app = express();
const PORT = 3000;
const IP = '192.168.71.163'; // Replace with your actual IP

// Middleware setup
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(cookieParser());
app.use(session({ secret: 'secureqr', resave: false, saveUninitialized: true }));

let qrSessions = {};
let attendanceRecords = {};

function generateSessionId() {
    return crypto.randomBytes(4).toString('hex');
}

app.get('/', (req, res) => {
    res.render('index');
});

app.get('/generate_qr', async (req, res) => {
    let subject = req.query.subject;
    if (!subject) {
        return res.status(400).json({ error: 'Subject is required' });
    }
    let sessionId = generateSessionId();
    let timestamp = Date.now();
    let qrData = `http://${IP}:${PORT}/attendance?session=${sessionId}&timestamp=${timestamp}&subject=${encodeURIComponent(subject)}`;

    qrSessions[sessionId] = { device: null, ip: null, timestamp, subject, submitted: false };
    let qrCode = await QRCode.toDataURL(qrData);
    res.json({ qr_code: qrCode, qr_url: qrData });
});

app.get('/attendance', (req, res) => {
    let { session, timestamp, subject } = req.query;
    let userDevice = req.headers['user-agent'];
    let userIP = req.ip;

    if (!qrSessions[session] || qrSessions[session].subject !== subject) {
        return res.status(403).json({ error: 'Invalid QR session or subject mismatch' });
    }
    if (Date.now() - Number(timestamp) > 30000) {
        return res.status(403).json({ error: 'QR code expired' });
    }
    if (qrSessions[session].device && qrSessions[session].device !== userDevice) {
        return res.status(403).json({ error: 'QR locked to another device' });
    }
    if (qrSessions[session].ip && qrSessions[session].ip !== userIP) {
        return res.status(403).json({ error: 'QR locked to another IP' });
    }
    if (!req.get('User-Agent') || req.get('User-Agent').match(/Googlebot|Lens|QR/i)) {
        return res.status(403).json({ error: 'QR code cannot be accessed via automated tools or QR scanners' });
    }

    qrSessions[session].device = userDevice;
    qrSessions[session].ip = userIP;
    qrSessions[session].timestamp = Date.now() + 30000;
    res.cookie('qrSession', session, { httpOnly: true, maxAge: 30000 });
    res.render('enter_id', { session, subject });
});

app.get('/mark_attendance', (req, res) => {
    let { session, studentId } = req.query;
    let subject = qrSessions[session]?.subject;
    if (!studentId) {
        return res.status(403).json({ error: 'Student ID is required!' });
    }
    if (!qrSessions[session] || qrSessions[session].submitted) {
        return res.status(403).json({ error: 'Attendance already marked!' });
    }
    if (!attendanceRecords[subject]) {
        attendanceRecords[subject] = {};
    }
    if (attendanceRecords[subject][studentId]) {
        return res.status(403).json({ error: 'Already marked attendance!' });
    }

    qrSessions[session].submitted = true;
    attendanceRecords[subject][studentId] = { time: new Date(), device: req.headers['user-agent'], ip: req.ip };
    res.json({ success: `Attendance recorded for ${studentId} in ${subject}` });
});

app.get('/dashboard', (req, res) => {
    res.render('dashboard', { attendanceRecords });
});

app.set('views', path.join(__dirname, 'views'));

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
