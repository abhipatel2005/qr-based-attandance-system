const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser'); // ✅ Import cookie-parser
const QRCode = require('qrcode');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = 3000;

// ✅ Add middleware to enable cookies
app.use(cookieParser());

// Middleware setup
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(session({ secret: 'secureqr', resave: false, saveUninitialized: true }));

// Store session details (session_id -> device)
let qrSessions = {};

// Function to generate unique session IDs
function generateSessionId() {
    return crypto.randomBytes(4).toString('hex');
}

// Home route to display the QR code page
app.get('/', (req, res) => {
    res.render('index');
});

// Generate a new QR code every 3 seconds
// app.get('/generate_qr', async (req, res) => {
//     let sessionId = generateSessionId();
//     let timestamp = Date.now();
//     let qrData = `http://localhost:${PORT}/attendance?session=${sessionId}&timestamp=${timestamp}`;

//     qrSessions[sessionId] = { device: null, timestamp };
//     let qrCode = await QRCode.toDataURL(qrData);
//     res.json({ qr_code: qrCode, qr_url: qrData });
// });
// app.get('/generate_qr', async (req, res) => {
//     let sessionId = generateSessionId();
//     let timestamp = Date.now();
//     let studentEmail = req.session.email || "unknown@student.com"; // Get student info from session

//     let localIP = "192.168.13.163";  // Replace with your actual IP
//     let qrData = `http://${localIP}:${PORT}/attendance?session=${sessionId}&timestamp=${timestamp}`;
//     // let qrData = `http://localhost:${PORT}/attendance?session=${sessionId}&timestamp=${timestamp}&email=${encodeURIComponent(studentEmail)}`;

//     qrSessions[sessionId] = { device: null, timestamp, student: studentEmail };
//     let qrCode = await QRCode.toDataURL(qrData);
//     res.json({ qr_code: qrCode, qr_url: qrData });
// });
app.get('/generate_qr', async (req, res) => {
    let sessionId = generateSessionId();
    let timestamp = Date.now();

    // 🔹 Instead of a personal email, the QR contains only session data
    let qrData = `http://192.168.13.163:${PORT}/attendance?session=${sessionId}&timestamp=${timestamp}`;

    qrSessions[sessionId] = { timestamp };
    let qrCode = await QRCode.toDataURL(qrData);
    res.json({ qr_code: qrCode, qr_url: qrData });
});



// Verify the QR scan and prevent reuse/sharing
// app.get('/attendance', (req, res) => {
//     let { session, timestamp } = req.query;
//     let userDevice = req.headers['user-agent'];
//     let referrer = req.headers['referer'] || '';

//     // Block shared links from WhatsApp, SMS, etc.
//     let blockedSources = ['web.whatsapp.com', 'messages.android.com', 'facebook.com'];
//     if (blockedSources.some(source => referrer.includes(source))) {
//         return res.status(403).json({ error: 'Access Denied: QR link cannot be opened from shared sources.' });
//     }

//     // Reject if QR is expired (valid for 3 seconds)
//     if (Date.now() - timestamp > 3000) {
//         return res.status(403).json({ error: 'QR code expired' });
//     }

//     // Check if QR is already locked to a device
//     if (qrSessions[session]) {
//         if (qrSessions[session].device && qrSessions[session].device !== userDevice) {
//             return res.status(403).json({ error: 'QR already used on another device' });
//         }
//         qrSessions[session].device = userDevice; // Lock the QR to first device
//     } else {
//         return res.status(403).json({ error: 'Invalid QR session' });
//     }

//     res.json({ success: 'Attendance marked' });
// });
// app.get('/attendance', (req, res) => {
//     let { session, timestamp, email } = req.query;
//     let userDevice = req.headers['user-agent'];

//     if (!email) {
//         return res.status(403).json({ error: 'Invalid QR. No student data found!' });
//     }

//     if (Date.now() - timestamp > 3000) {
//         return res.status(403).json({ error: 'QR code expired' });
//     }

//     if (qrSessions[session]) {
//         if (qrSessions[session].device && qrSessions[session].device !== userDevice) {
//             return res.status(403).json({ error: 'QR already used on another device' });
//         }
//         qrSessions[session].device = userDevice; // Lock QR to first device

//         // ✅ SAVE TO DATABASE (OR LOG IT)
//         console.log(`✅ Attendance marked for ${email}`);
//     } else {
//         return res.status(403).json({ error: 'Invalid QR session' });
//     }

//     res.json({ success: `Attendance marked for ${email}` });
// });
// const attendanceRecords = {}; // Store attendance logs

app.get('/attendance', (req, res) => {
    let { session } = req.query;
    let userDevice = req.headers['user-agent']; // Get browser/device info
    let userIP = req.ip; // Get user’s IP address

    if (!qrSessions[session]) {
        return res.status(403).json({ error: 'Invalid QR session' });
    }

    // 🔹 If session is already locked to a device/IP, block others
    if (qrSessions[session].device && qrSessions[session].device !== userDevice) {
        return res.status(403).json({ error: 'This QR has been locked to another device' });
    }
    if (qrSessions[session].ip && qrSessions[session].ip !== userIP) {
        return res.status(403).json({ error: 'This QR has been locked to another IP address' });
    }

    // 🔹 Lock this session to the first scanned device and IP
    qrSessions[session].device = userDevice;
    qrSessions[session].ip = userIP;
    qrSessions[session].timestamp = Date.now() + 30000; // Extend validity

    res.cookie('qrSession', session, { httpOnly: true, maxAge: 30000 }); // Store session cookie

    res.render('enter_id', { session });
});




const attendanceRecords = {}; // Store attendance logs

app.get('/mark_attendance', (req, res) => {
    let { session, studentId } = req.query;
    let userDevice = req.headers['user-agent'];
    let userIP = req.ip;
    let userSession = req.cookies ? req.cookies.qrSession : null; // ✅ Check if cookies exist

    if (!studentId) {
        return res.status(403).json({ error: 'Student ID is required!' });
    }

    if (!qrSessions[session] || Date.now() > qrSessions[session].timestamp) {
        return res.status(403).json({ error: 'Session expired. Please scan again.' });
    }

    // 🔹 Prevent multiple IDs from the same session/device/IP
    if (qrSessions[session].submitted) {
        return res.status(403).json({ error: 'You have already submitted attendance from this device!' });
    }
    if (qrSessions[session].ip === userIP || qrSessions[session].device === userDevice) {
        return res.status(403).json({ error: 'Attendance already marked from this device or network!' });
    }
    if (userSession && userSession === session) {
        return res.status(403).json({ error: 'You have already submitted attendance!' });
    }

    // 🔹 Prevent duplicate Student IDs
    if (attendanceRecords[studentId]) {
        return res.status(403).json({ error: 'Attendance already marked for this Student ID!' });
    }

    qrSessions[session].submitted = true; // Mark session as used
    attendanceRecords[studentId] = { time: new Date(), device: userDevice, ip: userIP };

    console.log(`✅ Attendance marked for ${studentId}`);
    res.json({ success: `Attendance recorded for ${studentId}` });
});



app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
