// server.js (최종 완성본)

// --- 1. 모듈 불러오기 ---
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');

const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('./database.js'); // 최종 버전의 database.js

// --- 2. Express 앱 설정 ---
const app = express();
// ✨ 2. Express 앱으로 http 서버 생성
const server = http.createServer(app);
// Render.com 같은 클라우드 환경을 위해 process.env.PORT를 우선 사용
const PORT = process.env.PORT || 3000;
const ADMIN_SECRET_CODE = "1004"; // 운영자 확인용 코드
const JWT_SECRET = 'your-super-secret-key-for-jwt-and-events'; // JWT 서명용 비밀키

// ✨ 1. 프론트엔드의 stampLocations와 동일한 배열을 서버에도 정의합니다.
const stampLocations = [
    { title: '🌍 지구', id: 'earth' },
    { title: '🔴 화성', id: 'mars' },
    { title: '🪐 목성', id: 'jupiter' },
    { title: '💫 토성', id: 'saturn' },
//    { title: '💎 천왕성', id: 'uranus' },
    { title: '🌊 해왕성', id: 'neptune' },    
];
const TOTAL_STAMPS = stampLocations.length;
console.log(`총 스탬프 개수가 ${TOTAL_STAMPS}개로 설정되었습니다.`);

app.use(express.json()); // JSON 요청 본문 파싱
app.use(express.static(path.join(__dirname, 'static'))); // 'static' 폴더를 정적 파일 폴더로 지정

// --- 3. 프론트엔드 페이지 라우팅 ---
// 사용자가 루트 주소로 접속하면 map.html을 보여줌
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'static', 'index.html'));
});

// ✨ 3. WebSocket 서버 생성 및 관리자 클라이언트 목록 생성
const wss = new WebSocketServer({ server });
const adminClients = new Set();

wss.on('connection', (ws) => {
    console.log('관리자 클라이언트가 연결되었습니다.');
    adminClients.add(ws);

    ws.on('close', () => {
        console.log('관리자 클라이언트 연결이 끊어졌습니다.');
        adminClients.delete(ws);
    });

    ws.on('error', console.error);
});

// ✨ 4. 모든 관리자에게 업데이트 메시지를 방송하는 함수
function broadcastStatsUpdate() {
    console.log(`'stats-updated' 메시지를 ${adminClients.size}명의 관리자에게 방송합니다.`);
    for (const client of adminClients) {
        if (client.readyState === client.OPEN) {
            client.send(JSON.stringify({ type: 'stats-updated' }));
        }
    }
}

// --- 4. 일반 사용자용 API 라우트 ---
// ✨ 신규 사용자를 DB에 등록하는 API 엔드포인트
app.post('/api/register-user', async (req, res) => {
    const { userId } = req.body;
    if (!userId) {
        return res.status(400).json({ error: '사용자 ID가 필요합니다.' });
    }
    try {
        await db.createUser(userId);
        res.json({ success: true, message: '사용자가 등록되었습니다.' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 룰렛 구성에 필요한 경품 목록 제공
app.get('/api/prizes', async (req, res) => {
    try {
        const prizes = await db.getRemainingPrizes();
        // 경품 수량에 따라 룰렛 확률(각도) 계산
        res.json(prizes);
    } catch (err) {
        console.error("경품 정보 조회 오류:", err.message);
        res.status(500).json({ error: '경품 정보 조회 오류' });
    }
});

// 룰렛 돌리기
app.post('/api/spin', async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) return res.status(400).json({ error: '사용자 ID가 없습니다.' });
        
        // --- ✨ 1. 중복 지급 방지 로직 (가장 중요) ---
        const user = await db.getUser(userId);
        if (user && user.is_redeemed === 1) {
            return res.status(403).json({ error: '이미 경품을 수령하셨습니다. 중복 참여는 불가능합니다.' });        }
        
        const prizes = await db.getRemainingPrizes();
        if (prizes.length === 0) return res.status(400).json({ error: '모든 경품이 소진되었습니다.' });

        const totalQuantity = prizes.reduce((sum, p) => sum + p.remaining_quantity, 0);
        
        // 확률에 따라 당첨 경품 결정
        let cumulativeProbability = 0;
        const random = Math.random();
        let winningPrize = prizes[prizes.length - 1];
        for (const prize of prizes) {
            cumulativeProbability += prize.remaining_quantity / totalQuantity;
            if (random < cumulativeProbability) {
                winningPrize = prize;
                break;
            }
        }

        // 룰렛 애니메이션을 위한 각도 계산
        const segmentAngle = 360 / prizes.length;
        const winningIndex = prizes.findIndex(p => p.id === winningPrize.id);
        const stopAt = (winningIndex * segmentAngle) + (Math.random() * (segmentAngle - 10) + 5);

        // ✨ 1. 교환권 코드 생성
        const redeemCode = await db.recordWinner(userId, winningPrize.id, winningPrize.name);

        // --- ✨ 2. 관리자 페이지에 실시간 업데이트 신호 방송 ---
        broadcastStatsUpdate();

        res.json({ stopAt: stopAt, redeemCode: redeemCode, prizeName: winningPrize.name });
    } catch (err) {
        console.error("스핀 처리 중 오류:", err.message);
        res.status(500).json({ error: '룰렛 처리 중 오류가 발생했습니다.' });
    }
});

// ✨ 사용자가 룰렛을 돌릴 자격이 있는지 확인하는 API
// ✨ /api/check-eligibility/:userId 엔드포인트를 아래 코드로 교체
app.get('/api/check-eligibility/:userId', async (req, res) => {
    try {
        const user = await db.getUser(req.params.userId);
        // 사용자가 DB에 존재하고, is_redeemed 플래그가 1이면 수령한 것임
        if (!user) {
            // 사용자가 DB에 없으면 아직 스탬프를 하나도 모으지 않은 것
            return res.json({ eligible: false, reason: '아직 스탬프를 모으지 않았습니다.' });
        }
        if (user.is_redeemed === 1) {
            return res.json({ eligible: false, reason: '이미 경품을 수령했습니다.' });
        }

        // ✨ stamps 데이터가 문자열이면 파싱하고, 아니면 그대로 사용
        let stamps = {};
        if (user.stamps) {
            stamps = (typeof user.stamps === 'string') ? JSON.parse(user.stamps) : user.stamps;
        }

        if (Object.keys(stamps).length >= TOTAL_STAMPS) {
            return res.json({ eligible: true });
        }

        res.json({ eligible: false, reason: '모든 스탬프를 모아야 합니다.' });

    } catch (e) { 
        console.error("자격 확인 오류:", e);
        res.status(500).json({ error: e.message });
    }
});
// --- 5. 관리자용 API 라우트 ---

// 관리자 로그인
app.post('/admin/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const admin = await db.getAdminUser(username);
        if (!admin) return res.status(401).json({ error: '아이디 또는 비밀번호가 잘못되었습니다.' });
        
        const match = await bcrypt.compare(password, admin.password_hash);
        if (match) {
            const token = jwt.sign({ username: admin.username }, JWT_SECRET, { expiresIn: '12h' });
            res.json({ token: token });
        } else {
            res.status(401).json({ error: '아이디 또는 비밀번호가 잘못되었습니다.' });
        }
    } catch (err) {
        res.status(500).json({ error: '로그인 처리 중 오류 발생' });
    }
});

// JWT 토큰 인증 미들웨어
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
}

// 통계 데이터 조회 (인증 필요)
app.get('/admin/stats', authenticateToken, async (req, res) => {
    try {
        const date = req.query.date || new Date().toISOString().split('T')[0];
        const stats = await db.getStats(date);
        res.json(stats);
    } catch (err) {
        console.error("통계 조회 중 DB 오류:", err.message);
        res.status(500).json({ error: '통계 조회 오류' });
    }
});

// 경품 수량 수정 (인증 필요)
app.post('/admin/update-prizes', authenticateToken, async (req, res) => {
    try {
        const { prizeName, newQuantity, adminPassword } = req.body;
        const admin = await db.getAdminUser(req.user.username);
        const match = await bcrypt.compare(adminPassword, admin.password_hash);

        if (!match) return res.status(401).json({ error: '관리자 비밀번호가 올바르지 않습니다.' });

        await db.updatePrizeQuantity(prizeName, newQuantity);
        res.json({ success: true, message: `${prizeName}의 수량이 ${newQuantity}개로 업데이트되었습니다.` });
    } catch (err) {
        res.status(500).json({ error: '업데이트 처리 중 오류 발생' });
    }
});

// ✨ 스탬프 획득을 서버에 기록하는 새로운 API
app.post('/api/collect-stamp', async (req, res) => {
    const { userId, planetId } = req.body;
    if (!userId || !planetId) {
        return res.status(400).json({ error: '사용자 ID와 행성 ID가 필요합니다.' });
    }
    try {
        await db.upsertUserStamp(userId, planetId);
        res.json({ success: true, message: `${planetId} 스탬프가 서버에 기록되었습니다.` });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- 6. 서버 시작 ---
server.listen(PORT, () => {
    console.log(`🎉 스탬프 투어 서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
});