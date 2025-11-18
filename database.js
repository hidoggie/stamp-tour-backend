// database.js (PostgreSQL 최종 완성본)

const { Pool } = require('pg');
const bcrypt = require('bcrypt');

let pool;
try {
  // Render.com이 제공하는 DATABASE_URL 환경 변수를 사용하여 DB에 연결합니다.
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false // Render의 PostgreSQL에 연결하기 위한 필수 옵션
    }
  });
/*
  pool.on('connect', () => {
      console.log('PostgreSQL 데이터베이스에 성공적으로 연결되었습니다.');
  });
  */
  pool.on('error', (err) => {
      console.error('PostgreSQL 연결 중 예기치 않은 오류 발생:', err);
  });

   // ✨ 대신, 연결을 한 번만 테스트하고 로그를 남깁니다.
  pool.query('SELECT NOW()', (err, res) => {
    if (err) {
      console.error('PostgreSQL 연결 테스트 실패:', err);
    } else {
      console.log('PostgreSQL 데이터베이스에 성공적으로 연결되었습니다.');
    }
  });

} catch (err) {
    console.error("PostgreSQL Pool 생성 실패:", err.message);
}

// 서버 시작 시 테이블이 없으면 자동으로 생성하는 함수
// event_type 은 gps_ar , simple_qr, auth_qr, image_ai 중 하나
async function setupDatabase() {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS events (
                event_id VARCHAR(255) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                main_page_url VARCHAR(255) NOT NULL,
                total_stamps INTEGER NOT NULL,
                has_quiz BOOLEAN DEFAULT false,
                has_roulette BOOLEAN DEFAULT false,
                has_ar BOOLEAN DEFAULT false,
                auto_collect BOOLEAN DEFAULT false,
                theme_config JSONB
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS prizes (
                id SERIAL PRIMARY KEY,
                event_id VARCHAR(255) REFERENCES Events(event_id),
                name VARCHAR(255) NOT NULL,
                total_quantity INTEGER NOT NULL,
                remaining_quantity INTEGER NOT NULL
            );
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                user_id VARCHAR(255) PRIMARY KEY,
                name VARCHAR(255),
                phone VARCHAR(50) UNIQUE,
                email VARCHAR(255) UNIQUE,
                registration_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS admins (
                username VARCHAR(255) PRIMARY KEY,
                password_hash VARCHAR(255)
            );
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS redemptions (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(255),
                prize_id INTEGER,
                prize_name VARCHAR(255),
                redemption_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS userprogress (
                progress_id SERIAL PRIMARY KEY,
                user_id VARCHAR(255) REFERENCES Users(user_id),
                event_id VARCHAR(255) REFERENCES Events(event_id),
                stamps JSONB,
                prize_won_id INTEGER REFERENCES Prizes(id),
                is_redeemed INTEGER DEFAULT 0,
                redeem_code VARCHAR(255),
                UNIQUE(user_id, event_id)
            );
        `);

        // 기본 관리자 계정 생성 (없을 경우에만)
        const adminRes = await client.query("SELECT * FROM admins WHERE username = 'admin'");
        if (adminRes.rows.length === 0) {
            const saltRounds = 10;
            const adminPassword = 'suzisoft2011'; // ✨ 초기 비밀번호
            const hash = await bcrypt.hash(adminPassword, saltRounds);
            await client.query(`INSERT INTO admins (username, password_hash) VALUES ($1, $2)`, ['admin', hash]);
            console.log("기본 Admin 계정이 생성되었습니다. (ID: admin, PW: admin)");
        }

        console.log("✅ 모든 테이블이 성공적으로 준비되었습니다.");
    } catch (err) {
        console.error("💥 테이블 생성 오류:", err);
    } finally {
        client.release();
    }
}

// --- 관리자 관련 함수 ---
async function getAdminUser(username) {
    const res = await pool.query("SELECT * FROM admins WHERE username = $1", [username]);
    return res.rows[0];
}

// --- 이벤트 통계 함수 ---
async function getStats(date) {
    const stats = {};
    const client = await pool.connect();
    try {
        const [ dailyParticipantsRes, dailyPrizesRes, cumulativeParticipantsRes, 
                cumulativePrizesRes, currentInventoryRes ] = await Promise.all([
            client.query(`SELECT COUNT(DISTINCT user_id) as count FROM users WHERE DATE(registration_date) = $1`, [date]),
            client.query(`SELECT prize_name, COUNT(*) as count FROM redemptions WHERE DATE(redemption_date) = $1 GROUP BY prize_name`, [date]),
            client.query(`SELECT COUNT(DISTINCT user_id) as count FROM users`),
            client.query(`SELECT prize_name, COUNT(*) as count FROM redemptions GROUP BY prize_name`),
            client.query("SELECT id, name, total_quantity, remaining_quantity FROM prizes ORDER BY id")
        ]);

        stats.dailyParticipants = parseInt(dailyParticipantsRes.rows[0]?.count || 0, 10);
        stats.dailyPrizesGiven = dailyPrizesRes.rows;
        stats.dailyTotalGiven = stats.dailyPrizesGiven.reduce((sum, p) => sum + parseInt(p.count, 10), 0);

        stats.cumulativeParticipants = parseInt(cumulativeParticipantsRes.rows[0]?.count || 0, 10);
        stats.cumulativePrizesGiven = cumulativePrizesRes.rows;
        stats.cumulativeTotalGiven = stats.cumulativePrizesGiven.reduce((sum, p) => sum + parseInt(p.count, 10), 0);
        
        stats.currentInventory = currentInventoryRes.rows;
        return stats;
    } finally {
        client.release();
    }
}

// --- 경품 관련 함수 ---
async function getRemainingPrizes(eventId) {
    const res = await pool.query(
        'SELECT id, name, remaining_quantity FROM prizes WHERE remaining_quantity > 0 AND event_id = $1 ORDER BY id',
        [eventId]);
    return res.rows;
}

async function updatePrizeQuantity(prizeName, newQuantity) {
    const res = await pool.query(
        "UPDATE prizes SET remaining_quantity = $1, total_quantity = $1 WHERE name = $2", 
        [newQuantity, prizeName]
    );
    return res.rowCount;
}

// --- 참가자 및 당첨/수령 관련 함수 ---
async function getUser(userId) {
    if (!userId) return null;
    const res = await pool.query("SELECT * FROM users WHERE user_id = $1", [userId]);
    return res.rows[0];
}

async function recordWinner(userId, eventId, prizeId, prizeName) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // ✨ 1. 교환권 코드를 이 함수 안에서 생성합니다.
        const redeemCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        
        const today = new Date();
 
        // 1. UserProgress 테이블에 당첨 정보 업데이트
        await client.query(
            `UPDATE "UserProgress" SET prize_won_id = $1, is_redeemed = 1, redeem_code = $2
             WHERE user_id = $3 AND event_id = $4`,
            [prizeId, redeemCode, userId, eventId]
        );
        
        // 2. Redemptions 테이블에 지급 기록 (날짜별 통계용)
        await client.query(
            'INSERT INTO "redemptions" (user_id, prize_id, prize_name, redemption_date) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)',
            [userId, prizeId, prizeName]
        );
        
        // 3. Prizes 테이블 재고 차감
        await client.query(
            'UPDATE "prizes" SET remaining_quantity = remaining_quantity - 1 WHERE id = $1 AND remaining_quantity > 0',
            [prizeId]
        );
        
        await client.query("COMMIT");

        // ✨ 2. 생성된 교환권 코드를 반환합니다.
        return redeemCode;

    } catch (err) {
        await client.query("ROLLBACK");
        throw err;
    } finally {
        client.release();
    }
}

// ✨ 스탬프 획득 시 사용자 정보를 생성하거나 업데이트하는 함수 (반드시 필요)
async function upsertUserStamp(userId, eventId, stampId) {
    const today = new Date();
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Users 테이블에 사용자가 등록되어 있는지 확인하고, 없으면 생성합니다.
        const userSql = `
            INSERT INTO users (user_id, registration_date)
            VALUES ($1, $2)
            ON CONFLICT (user_id) DO NOTHING
        `;
        await client.query(userSql, [userId, today]);

        // 2. UserProgress 테이블에서 해당 사용자의 '해당 이벤트' 진행 상황을 찾습니다.
        const progress = await client.query(
            "SELECT stamps FROM userprogress WHERE user_id = $1 AND event_id = $2 FOR UPDATE",
            [userId, eventId]
        );
        
        let stamps = {};
        if (progress.rows.length > 0) {
            // --- 3a. 이미 진행 기록이 있으면, UPDATE ---
            stamps = progress.rows[0].stamps || {};
            stamps[stampId] = true;
            
            await client.query(
                "UPDATE userprogress SET stamps = $1 WHERE user_id = $2 AND event_id = $3",
                [stamps, userId, eventId]
            );
        } else {
            // --- 3b. 진행 기록이 없으면, 새로 INSERT ---
            stamps[stampId] = true;
            
            await client.query(
                "INSERT INTO userprogress (user_id, event_id, stamps) VALUES ($1, $2, $3)",
                [userId, eventId, stamps]
            );
        }
        
        await client.query('COMMIT');
    } catch (e) {
        console.error("upsertUserStamp 오류:", e.message); // 서버 로그에 오류 기록
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

// ✨ 신규 사용자를 DB에 생성하는 함수
async function createUser(userId) {
    if (!userId) return;
    const today = new Date();
    // ON CONFLICT DO NOTHING: 이미 존재하는 사용자라면 아무것도 하지 않음
    const sql = `INSERT INTO users (user_id, stamps, registration_date, is_redeemed) VALUES ($1, '{}', $2, 0) ON CONFLICT (user_id) DO NOTHING`;
    try {
        await pool.query(sql, [userId, today]);
    } catch (e) {
        console.error("신규 사용자 생성 오류:", e);
    }
}

// [수정] 사용자의 특정 이벤트 진행 상황 조회
async function getUserProgress(userId, eventId) {
    if (!userId || !eventId) return null;
    const res = await pool.query(
        'SELECT * FROM "userprogress" WHERE user_id = $1 AND event_id = $2',
        [userId, eventId]
    );
    return res.rows[0];
}

async function getEventTheme(eventId) {
    if (!eventId) return null;
    const res = await pool.query(
        "SELECT theme_config FROM events WHERE event_id = $1",
        [eventId]
    );
    // theme_config 컬럼의 값 (JSON)을 반환, 없으면 null 반환
    return res.rows[0]?.theme_config; 
}

// [신규] 이벤트의 규칙 정보를 가져오는 함수
async function getEventConfig(eventId) {
    if (!eventId) return null;
    const res = await pool.query('SELECT * FROM "events" WHERE event_id = $1', [eventId]);
    return res.rows[0];
}

// [신규] 본인 인증 사용자 등록 함수
async function registerUser(userId, name, phone, email) {
    const sql = `
        INSERT INTO "users" (user_id, name, phone, email)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id) DO UPDATE SET
        name = $2, phone = $3, email = $4
    `;
    await pool.query(sql, [userId, name, phone, email]);
}

// 서버 시작 시 DB 셋업
setupDatabase();

// --- 모듈 내보내기 ---
module.exports = {
    getAdminUser,
    getStats,
    getRemainingPrizes,
    updatePrizeQuantity,
    recordWinner,
    getUser,
    upsertUserStamp,
    createUser,
    getEventTheme,
    getEventConfig,
    registerUser,
    getUserProgress,
};