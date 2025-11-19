// server.js (최종 완성본)

// --- 1. 모듈 불러오기 ---
require('dotenv').config();
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
const JWT_SECRET = 'suzisoft2011'; // JWT 서명용 비밀키

app.use(express.json()); // JSON 요청 본문 파싱
app.use(express.static(path.join(__dirname, 'static'))); // 'static' 폴더를 정적 파일 폴더로 지정

// ✨ 3. WebSocket 서버 생성 및 관리자 클라이언트 목록 생성
const wss = new WebSocketServer({ server });
const adminClients = new Set();

wss.on('connection', (ws) => {
    adminClients.add(ws);
    ws.on('close', () => adminClients.delete(ws));
    ws.on('error', console.error);
});

// ✨ 4. 모든 관리자에게 업데이트 메시지를 방송하는 함수
function broadcastStatsUpdate() {
    for (const client of adminClients) {
        if (client.readyState === client.OPEN) {
            client.send(JSON.stringify({ type: 'stats-updated' }));
        }
    }
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'static', 'index.html'));
});

// [신규] 본인 인증 사용자 등록 API (서비스 2)
app.post('/api/auth/register', async (req, res) => {
    try {
        const { userId, name, phone, email } = req.body;
        if (!userId || !name || !phone) {
            return res.status(400).json({ error: '필수 정보(userId, name, phone)가 누락되었습니다.' });
        }
        await db.registerUser(userId, name, phone, email);
        res.json({ success: true, message: '사용자 정보가 등록되었습니다.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// [신규] 사용자 상태 동기화 API (map.html에서 사용)
app.get('/api/user-status/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { event_id } = req.query;
        if (!event_id) return res.status(400).json({ error: 'event_id가 필요합니다.' });

        const user = await db.getUser(userId);
        const progress = await db.getUserProgress(userId, event_id);
        
        res.json({
            stamps: progress ? progress.stamps : {},
            hasRedeemed: progress ? progress.is_redeemed === 1 : false
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

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

// [수정] 룰렛 경품 목록 (event_id 추가)
app.get('/api/prizes', async (req, res) => {
    try {
        // 1. URL 쿼리에서 'event_id'를 가져옵니다.
        const { event_id } = req.query;
        if (!event_id) {
            return res.status(400).json({ error: 'event_id가 필요합니다.' });
        }
        
        // 2. DB에서 '해당 이벤트'에 속한, 재고가 남은 경품만 조회합니다.
        const prizes = await db.getRemainingPrizes(event_id);

        if (!prizes || prizes.length === 0) {
            return res.json([]); // 재고가 없으면 빈 배열 반환
        }

        // 3. 룰렛을 그리기 위해, 경품 데이터를 '세그먼트' 정보로 가공합니다.
        const totalQuantity = prizes.reduce((sum, p) => sum + p.remaining_quantity, 0);
        if (totalQuantity === 0) {
             return res.json([]); // 총재고가 0이어도 빈 배열 반환
        }

        const segments = prizes.map((p, index) => ({
            'fillStyle': ['#ef4444', '#3b82f6', '#22d3ee'][index % 3],
            'text': p.name,
            'size': (p.remaining_quantity / totalQuantity) * 360, // 서버가 각도를 계산
            'prizeId': p.id
        }));
        
        // 4. 가공된 '세그먼트' 정보를 프론트엔드에 전달합니다.
        res.json(segments);

    } catch (err) {
        console.error("경품 정보 조회 오류:", err.message);
        res.status(500).json({ error: '경품 정보를 가져오는 중 오류가 발생했습니다.' });
    }
});
// 룰렛 돌리기
app.post('/api/spin', async (req, res) => {
    try {
        const { userId, event_id } = req.body;
        if (!userId || !event_id) return res.status(400).json({ error: 'userId와 event_id가 필요합니다.' });

        // 2a. 이벤트 정보(총 스탬프 개수) 가져오기
        const event = await db.getEventConfig(event_id);
        if (!event) {
            return res.status(404).json({ error: '존재하지 않는 이벤트입니다.' });
        }
        
        // 2b. 사용자의 이벤트 진행 상황 가져오기
        const progress = await db.getUserProgress(userId, event_id);

        // 2c. 자격 판단
        if (!progress) {
            return res.status(403).json({ error: '아직 스탬프를 모으지 않았습니다.' });
        }
        if (progress.is_redeemed === 1) {
            return res.status(403).json({ error: '이미 경품을 수령하셨습니다. 중복 참여는 불가능합니다.' });
        }
        
        const stamps = progress.stamps || {};
        if (Object.keys(stamps).length < event.total_stamps) {
            return res.status(403).json({ error: `모든 스탬프(${event.total_stamps}개)를 모아야 합니다.` });
        }       
        
        const prizes = await db.getRemainingPrizes(event_id);
        if (prizes.length === 0) {
            return res.status(500).json({ error: '모든 경품이 소진되었습니다.' });
        }

        const totalQuantity = prizes.reduce((sum, p) => sum + p.remaining_quantity, 0);
        if (totalQuantity === 0) {
             return res.status(500).json({ error: '모든 경품이 소진되었습니다.' });
        }
        
        // 확률에 따라 당첨 경품 결정
        let cumulativeProbability = 0;
        const random = Math.random();
        let winningPrize = prizes[prizes.length - 1]; // 기본값 (혹시 모를 오류 대비)
        for (const prize of prizes) {
            cumulativeProbability += prize.remaining_quantity / totalQuantity;
            if (random < cumulativeProbability) {
                winningPrize = prize;
                break;
            }
        }

        // --- ✨ 2. 멈출 각도를 정확하게 계산 (핵심 수정) ---
        let startAngle = 0;
        let stopAtAngle = 0;
        
        // 프론트엔드와 동일한 방식으로 세그먼트 정보를 서버에서도 만듭니다.
        for (const prize of prizes) {
            const segmentSize = (prize.remaining_quantity / totalQuantity) * 360;
            
            if (prize.id === winningPrize.id) {
                // 당첨된 칸의 시작 각도와 끝 각도 사이의 임의의 지점을 멈출 각도로 정합니다.
                // (약간의 여백을 두어 경계선에 멈추지 않도록 함)
                stopAtAngle = startAngle + (Math.random() * (segmentSize - 10) + 5);
                break;
            }
            startAngle += segmentSize;
        }


        // ✨ 1. 교환권 코드 생성
        const redeemCode = await db.recordWinner(userId, event_id, winningPrize.id, winningPrize.name);

        // --- ✨ 2. 관리자 페이지에 실시간 업데이트 신호 방송 ---
        broadcastStatsUpdate();

        res.json({ stopAt: stopAtAngle, redeemCode: redeemCode, prizeName: winningPrize.name });
    } catch (err) {
        res.status(500).json({ error: '룰렛 처리 중 오류가 발생했습니다.' });
    }
});

// ✨ 사용자가 룰렛을 돌릴 자격이 있는지 확인하는 API
app.get('/api/check-eligibility/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { event_id } = req.query;
        if (!event_id) return res.status(400).json({ error: 'event_id가 필요합니다.' });

        // 1. 이벤트의 총 스탬프 개수 확인
        const event = await db.getEventConfig(event_id);
        if (!event) return res.status(404).json({ eligible: false, reason: '존재하지 않는 이벤트입니다.' });
        
        // 2. 사용자의 진행 상황 확인
        const progress = await db.getUserProgress(userId, event_id);
        if (!progress) return res.json({ eligible: false, reason: '아직 스탬프를 모으지 않았습니다.' });
        if (progress.is_redeemed === 1) return res.json({ eligible: false, reason: '이미 경품을 수령했습니다.' });

        // 3. 스탬프 개수 비교
        const stamps = progress.stamps || {};
        if (Object.keys(stamps).length >= event.total_stamps) {
            return res.json({ eligible: true });
        }
        
        res.json({ eligible: false, reason: `모든 스탬프(${event.total_stamps}개)를 모아야 합니다.` });
    } catch (e) { 
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
        const stats = await db.getStats(date); // getStats 함수가 새 DB 구조를 읽도록 수정됨
        res.json(stats);
    } catch (err) {
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
    const { userId, stampId, event_id } = req.body;
    if (!userId || !stampId || !event_id) {
        return res.status(400).json({ error: 'userId, stampId, event_id가 모두 필요합니다.' });
    }
    try {
        await db.upsertUserStamp(userId, event_id, stampId);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/event-theme/:event_id', async (req, res) => {
    try {
        const event_id = req.params.event_id;
        if (!event_id) {
            return res.status(400).json({ error: 'event_id가 필요합니다.' });
        }
        
        const themeConfig = await db.getEventTheme(event_id);
        
        if (themeConfig) {
            res.json(themeConfig);
        } else {
            res.status(404).json({ error: '이벤트 설정을 찾을 수 없습니다.' });
        }
    } catch (e) {
        console.error("이벤트 테마 조회 오류:", e.message);
        res.status(500).json({ error: e.message });
    }
});
// ✨ [신규] 이벤트의 '규칙'을 반환하는 API
app.get('/api/event-config/:event_id', async (req, res) => {
    try {
        const event_id = req.params.event_id;
        // ✨ database.js에 getEventConfig 함수가 필요합니다.
        const config = await db.getEventConfig(event_id); 
        
        if (config) {
            res.json(config);
        } else {
            res.status(404).json({ error: '이벤트 설정을 찾을 수 없습니다.' });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ✨ 1. 퀴즈 설정 가져오기 API
app.get('/api/quiz-config/:event_id', async (req, res) => {
    try {
        const event_id = req.params.event_id;
        
        const quizConfig = await db.getQuizConfig(event_id);
        
        if (quizConfig) {
            res.json(quizConfig);
        } else {
            // 데이터는 있지만 quiz_config 컬럼이 비어있거나, 이벤트가 없는 경우
            res.status(404).json({ error: '퀴즈 설정이 없습니다.' });
        }
    } catch (e) {
        console.error("퀴즈 설정 조회 오류:", e.message);
        res.status(500).json({ error: e.message });
    }
});

// ✨ 2. 퀴즈 완료 처리 API
app.post('/api/quiz/complete', async (req, res) => {
    try {
        const { userId, eventId } = req.body;
        await db.completeQuiz(userId, eventId);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- 6. 서버 시작 ---
server.listen(PORT, () => {
    console.log(`🎉 스탬프 투어 서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
});