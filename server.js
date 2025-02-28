// server.js
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const QRCode = require('qrcode');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const path = require('path');

const app = express();
const PORT = 3000;

// MySQL Connection Pool
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'Abhi@2005',
    database: 'attendance_system',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Middleware setup
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
    secret: 'teacherqr',
    resave: false,
    saveUninitialized: true
}));

// Store QR sessions
let qrSessions = {};

// Authentication middleware
const requireLogin = async (req, res, next) => {
    if (!req.session.teacherId) {
        return res.redirect('/login');
    }
    next();
};

// Routes
app.get('/login', (req, res) => {
    res.render('login');
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const [rows] = await pool.execute(
            'SELECT id FROM teachers WHERE username = ? AND password = ?',
            [username, password]
        );

        if (rows.length > 0) {
            req.session.teacherId = rows[0].id;
            res.redirect('/dashboard');
        } else {
            res.redirect('/login');
        }
    } catch (error) {
        console.error('Login error:', error);
        res.redirect('/login');
    }
});

app.get('/dashboard', requireLogin, async (req, res) => {
    try {
        const [timetable] = await pool.execute(
            `SELECT * FROM timetable 
             WHERE teacher_id = ? 
             ORDER BY 
                CASE day 
                    WHEN 'Monday' THEN 1 
                    WHEN 'Tuesday' THEN 2 
                    WHEN 'Wednesday' THEN 3 
                    WHEN 'Thursday' THEN 4 
                    WHEN 'Friday' THEN 5 
                END, 
                time_slot`,
            [req.session.teacherId]
        );
        res.render('dashboard', { timetable });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).send('Server error');
    }
});

// app.post('/generate-qr', requireLogin, async (req, res) => {
//     const { timetableId } = req.body;
//     const sessionId = crypto.randomBytes(4).toString('hex');
//     const today = new Date().toISOString().split('T')[0];

//     try {
//         // Check if attendance already taken
//         const [existing] = await pool.execute(
//             'SELECT id FROM attendance_sessions WHERE timetable_id = ? AND session_date = ?',
//             [timetableId, today]
//         );

//         if (existing.length > 0) {
//             return res.json({ error: 'Attendance already taken for this session today' });
//         }

//         // Create new session
//         const [result] = await pool.execute(
//             'INSERT INTO attendance_sessions (timetable_id, session_date, qr_session_id) VALUES (?, ?, ?)',
//             [timetableId, today, sessionId]
//         );

//         const sessionDbId = result.insertId;
//         const timestamp = Date.now();
//         const qrData = `http://192.168.71.163:${PORT}/attendance?session=${sessionId}&db_session=${sessionDbId}&timestamp=${timestamp}`;

//         qrSessions[sessionId] = {
//             timestamp: Date.now() + 300000, // 5 minutes validity
//             dbSessionId: sessionDbId
//         };

//         const qrCode = await QRCode.toDataURL(qrData);
//         res.json({ qr_code: qrCode });
//     } catch (error) {
//         console.error('QR generation error:', error);
//         res.status(500).json({ error: 'Failed to generate QR code' });
//     }
// });

app.get('/view-attendance/:timetableId', requireLogin, async (req, res) => {
    const { timetableId } = req.params;

    try {
        const [attendance] = await pool.execute(
            `SELECT 
                as.session_date,
                sa.student_id,
                sa.timestamp
             FROM attendance_sessions as
             LEFT JOIN student_attendance sa ON sa.session_id = as.id
             WHERE as.timetable_id = ?
             ORDER BY as.session_date DESC, sa.timestamp ASC`,
            [timetableId]
        );
        res.render('attendance-view', { attendance });
    } catch (error) {
        console.error('View attendance error:', error);
        res.status(500).send('Server error');
    }
});

app.use((req, res, next) => {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
});

// Modified generate-qr endpoint with enhanced security
app.post('/generate-qr', requireLogin, async (req, res) => {
    const { timetableId } = req.body;
    const sessionId = crypto.randomBytes(16).toString('hex');
    const today = new Date().toISOString().split('T')[0];

    try {
        // Check for existing active session
        const [existing] = await pool.execute(
            'SELECT id FROM attendance_sessions WHERE timetable_id = ? AND session_date = ?',
            [timetableId, today]
        );

        if (existing.length > 0) {
            // Initialize new session data for existing attendance
            const newSessionId = crypto.randomBytes(16).toString('hex');
            const timestamp = Date.now();
            const securityToken = crypto.createHash('sha256')
                .update(`${newSessionId}${timestamp}${req.session.teacherId}`)
                .digest('hex');

            const qrData = `http://192.168.224.163:${PORT}/attendance?` +
                `session=${newSessionId}&` +
                `db_session=${existing[0].id}&` +
                `timestamp=${timestamp}&` +
                `token=${securityToken}`;

            // Properly initialize the session object with all required properties
            qrSessions[newSessionId] = {
                timestamp: Date.now() + 30000, // 30 seconds validity
                dbSessionId: existing[0].id,
                securityToken: securityToken,
                usedDevices: new Set(), // Initialize empty Set
                usedIPs: new Set(),     // Initialize empty Set
                submitted: false
            };

            const qrCode = await QRCode.toDataURL(qrData);
            res.json({
                qr_code: qrCode,
                expiresIn: 30000
            });
            return;
        }

        // Create new session if none exists
        const [result] = await pool.execute(
            'INSERT INTO attendance_sessions (timetable_id, session_date, qr_session_id) VALUES (?, ?, ?)',
            [timetableId, today, sessionId]
        );

        const sessionDbId = result.insertId;
        const timestamp = Date.now();
        const securityToken = crypto.createHash('sha256')
            .update(`${sessionId}${timestamp}${req.session.teacherId}`)
            .digest('hex');

        const qrData = `http://192.168.224.163:${PORT}/attendance?` +
            `session=${sessionId}&` +
            `db_session=${sessionDbId}&` +
            `timestamp=${timestamp}&` +
            `token=${securityToken}`;

        // Properly initialize the session object with all required properties
        qrSessions[sessionId] = {
            timestamp: Date.now() + 30000,
            dbSessionId: sessionDbId,
            securityToken: securityToken,
            usedDevices: new Set(), // Initialize empty Set
            usedIPs: new Set(),     // Initialize empty Set
            submitted: false
        };

        const qrCode = await QRCode.toDataURL(qrData);
        res.json({
            qr_code: qrCode,
            expiresIn: 30000
        });
    } catch (error) {
        console.error('QR generation error:', error);
        res.status(500).json({ error: 'Failed to generate QR code' });
    }
});

// Also add this helper function to verify session validity
function isValidSession(session) {
    return (
        session &&
        qrSessions[session] &&
        qrSessions[session].usedDevices instanceof Set &&
        qrSessions[session].usedIPs instanceof Set &&
        Date.now() <= qrSessions[session].timestamp
    );
}

// Enhanced attendance endpoint
app.get('/attendance', async (req, res) => {
    const { session, db_session, timestamp, token } = req.query;
    const userDevice = req.headers['user-agent'];
    const userIP = req.ip;
    const referrer = req.headers['referer'] || '';

    // Use the helper function to validate session
    if (!isValidSession(session)) {
        return res.status(403).json({ error: 'Invalid or expired QR session' });
    }

    // Security checks
    const blockedSources = [
        'web.whatsapp.com',
        'messages.android.com',
        'facebook.com',
        't.me', // Telegram
        'wa.me', // WhatsApp
        'messenger.com',
        'instagram.com'
    ];

    // Block shared links
    if (blockedSources.some(source => referrer.includes(source))) {
        return res.status(403).json({
            error: 'Access Denied: QR cannot be opened from messaging apps or social media.'
        });
    }

    // Verify security token
    const expectedToken = crypto.createHash('sha256')
        .update(`${session}${timestamp}${req.session.teacherId}`)
        .digest('hex');

    if (token !== qrSessions[session].securityToken) {
        return res.status(403).json({ error: 'Invalid security token' });
    }

    // Check expiration
    if (Date.now() > qrSessions[session].timestamp) {
        // Clean up expired session
        delete qrSessions[session];
        return res.status(403).json({ error: 'QR code has expired' });
    }

    // Device and IP checks
    if (qrSessions[session].usedDevices.has(userDevice)) {
        return res.status(403).json({
            error: 'This device has already been used for attendance'
        });
    }

    if (qrSessions[session].usedIPs.has(userIP)) {
        return res.status(403).json({
            error: 'Multiple attempts from same network not allowed'
        });
    }

    // Add device and IP to used sets
    qrSessions[session].usedDevices.add(userDevice);
    qrSessions[session].usedIPs.add(userIP);

    // Set secure cookie with short expiration
    res.cookie('qrSession', session, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 300000 // 5 minutes
    });

    res.render('enter_id', { session });
});

// Enhanced mark_attendance endpoint
app.get('/mark_attendance', async (req, res) => {
    const { session, studentId } = req.query;
    const userDevice = req.headers['user-agent'];
    const userIP = req.ip;
    const userSession = req.cookies?.qrSession;

    try {
        // Basic validation
        if (!studentId || !/^[A-Za-z0-9]+$/.test(studentId)) {
            return res.status(403).json({ error: 'Invalid Student ID format' });
        }

        // Session validation
        if (!qrSessions[session] || Date.now() > qrSessions[session].timestamp) {
            return res.status(403).json({ error: 'Session expired. Please scan again.' });
        }

        // Cookie validation
        if (!userSession || userSession !== session) {
            return res.status(403).json({ error: 'Invalid or missing session cookie' });
        }

        // Check for duplicate attendance
        const [existing] = await pool.execute(
            'SELECT id FROM student_attendance WHERE session_id = ? AND student_id = ?',
            [qrSessions[session].dbSessionId, studentId]
        );

        if (existing.length > 0) {
            return res.status(403).json({ error: 'Attendance already marked for this ID' });
        }

        // Device and network validation
        if (qrSessions[session].submitted) {
            return res.status(403).json({
                error: 'This QR session has already been used'
            });
        }

        // Record attendance with device info
        await pool.execute(
            `INSERT INTO student_attendance 
            (session_id, student_id, device_info, ip_address) 
            VALUES (?, ?, ?, ?)`,
            [qrSessions[session].dbSessionId, studentId, userDevice, userIP]
        );

        // Mark session as used
        qrSessions[session].submitted = true;

        // Clear session cookie
        res.clearCookie('qrSession');

        res.json({ success: 'Attendance marked successfully' });
    } catch (error) {
        console.error('Mark attendance error:', error);
        res.status(500).json({ error: 'Failed to mark attendance' });
    }
});

// Add cleanup routine for expired sessions
setInterval(() => {
    const now = Date.now();
    Object.keys(qrSessions).forEach(sessionId => {
        if (now > qrSessions[sessionId].timestamp) {
            delete qrSessions[sessionId];
        }
    });
}, 60000); // Clean up every minute

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/dashboard`);
});