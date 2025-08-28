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
async function setupDatabase() {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS Prizes (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL UNIQUE,
                total_quantity INTEGER NOT NULL,
                remaining_quantity INTEGER NOT NULL
            );
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS Users (
                user_id VARCHAR(255) PRIMARY KEY,
                stamps JSONB,
                prize_won_id INTEGER REFERENCES Prizes(id),
                is_redeemed INTEGER DEFAULT 0,
                redeem_code VARCHAR(255),
                registration_date TIMESTAMPTZ
            );
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS Admins (
                username VARCHAR(255) PRIMARY KEY,
                password_hash VARCHAR(255)
            );
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS Redemptions (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(255),
                prize_id INTEGER,
                prize_name VARCHAR(255),
                redemption_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 기본 관리자 계정 생성 (없을 경우에만)
        const adminRes = await client.query("SELECT * FROM Admins WHERE username = 'admin'");
        if (adminRes.rows.length === 0) {
            const saltRounds = 10;
            const adminPassword = 'admin'; // ✨ 초기 비밀번호
            const hash = await bcrypt.hash(adminPassword, saltRounds);
            await client.query(`INSERT INTO Admins (username, password_hash) VALUES ($1, $2)`, ['admin', hash]);
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
    const res = await pool.query("SELECT * FROM Admins WHERE username = $1", [username]);
    return res.rows[0];
}

// --- 이벤트 통계 함수 ---
async function getStats(date) {
    const stats = {};
    const client = await pool.connect();
    try {
        const [ dailyParticipantsRes, dailyPrizesRes, cumulativeParticipantsRes, 
                cumulativePrizesRes, currentInventoryRes ] = await Promise.all([
            client.query(`SELECT COUNT(DISTINCT user_id) as count FROM Users WHERE DATE(registration_date) = $1`, [date]),
            client.query(`SELECT prize_name, COUNT(*) as count FROM Redemptions WHERE DATE(redemption_date) = $1 GROUP BY prize_name`, [date]),
            client.query(`SELECT COUNT(DISTINCT user_id) as count FROM Users`),
            client.query(`SELECT prize_name, COUNT(*) as count FROM Redemptions GROUP BY prize_name`),
            client.query("SELECT id, name, total_quantity, remaining_quantity FROM Prizes ORDER BY id")
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
async function getRemainingPrizes() {
    const res = await pool.query("SELECT id, name, remaining_quantity FROM prizes WHERE remaining_quantity > 0 ORDER BY id");
    return res.rows;
}

async function updatePrizeQuantity(prizeName, newQuantity) {
    const res = await pool.query(
        "UPDATE Prizes SET remaining_quantity = $1, total_quantity = $1 WHERE name = $2", 
        [newQuantity, prizeName]
    );
    return res.rowCount;
}

// --- 참가자 및 당첨/수령 관련 함수 ---
async function getUser(userId) {
    if (!userId) return null;
    const res = await pool.query("SELECT * FROM Users WHERE user_id = $1", [userId]);
    return res.rows[0];
}

async function recordWinner(userId, prizeId, prizeName) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // ✨ 1. 교환권 코드를 이 함수 안에서 생성합니다.
        const redeemCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        
        const today = new Date();
        const userSql = `
            INSERT INTO Users (user_id, prize_won_id, redeem_code, is_redeemed, registration_date, stamps) 
            VALUES ($1, $2, $3, 1, $4, '{"completed": true}')
            ON CONFLICT (user_id) DO UPDATE SET
            prize_won_id = EXCLUDED.prize_won_id,
            redeem_code = EXCLUDED.redeem_code,
            is_redeemed = 1
        `;
        await client.query(userSql, [userId, prizeId, redeemCode, today]);

        // Redemptions 및 Prizes 테이블 업데이트
        await client.query("INSERT INTO Redemptions (user_id, prize_id, prize_name) VALUES ($1, $2, $3)", 
            [userId, prizeId, prizeName]);
        await client.query("UPDATE Prizes SET remaining_quantity = remaining_quantity - 1 WHERE id = $1 AND remaining_quantity > 0", [prizeId]);
        
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
async function upsertUserStamp(userId, planetId) {
    const today = new Date();
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const user = await client.query("SELECT stamps FROM Users WHERE user_id = $1", [userId]);
        
        let stamps = {};
        // 기존 사용자인 경우, 기존 스탬프 정보를 가져옴
        if (user.rows.length > 0 && user.rows[0].stamps) {
            stamps = (typeof user.rows[0].stamps === 'string') ? JSON.parse(user.rows[0].stamps) : user.rows[0].stamps;
        }
        stamps[planetId] = true;

        const sql = `
            INSERT INTO Users (user_id, stamps, registration_date, is_redeemed) 
            VALUES ($1, $2, $3, 0)
            ON CONFLICT (user_id) DO UPDATE SET
            stamps = $2
        `;
        // 신규 사용자는 등록 날짜와 함께 INSERT, 기존 사용자는 stamps 정보만 UPDATE
        await client.query(sql, [userId, JSON.stringify(stamps), today]);
        await client.query('COMMIT');
    } catch (e) {
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
    const sql = `INSERT INTO Users (user_id, stamps, registration_date, is_redeemed) VALUES ($1, '{}', $2, 0) ON CONFLICT (user_id) DO NOTHING`;
    try {
        await db.run(sql, [userId, today]);
    } catch (e) {
        console.error("신규 사용자 생성 오류:", e);
    }
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
};