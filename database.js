// database.js (최종 안정화 버전)

const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const bcrypt = require('bcrypt');

let db;

// 즉시 실행 비동기 함수를 사용해 DB 초기화
(async () => {
    try {
        db = await open({
            filename: './event.db',
            driver: sqlite3.Database
        });
        console.log("데이터베이스에 성공적으로 연결되었습니다.");
        
        // 서버 시작 시 필요한 모든 테이블이 없으면 자동으로 생성
        await db.exec(`
            CREATE TABLE IF NOT EXISTS Prizes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                total_quantity INTEGER NOT NULL,
                remaining_quantity INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS Users (
                user_id TEXT PRIMARY KEY,
                stamps TEXT,
                prize_won_id INTEGER,
                is_redeemed INTEGER DEFAULT 0,
                redeem_code TEXT,
                registration_date TEXT
            );
            CREATE TABLE IF NOT EXISTS Admins (
                username TEXT PRIMARY KEY,
                password_hash TEXT
            );
            CREATE TABLE IF NOT EXISTS Redemptions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT,
                prize_id INTEGER,
                prize_name TEXT,
                redemption_date TEXT
            );
        `);
        
        // 기본 관리자 계정 생성 (없을 경우에만)
        const admin = await db.get("SELECT * FROM Admins WHERE username = 'admin'");
        if (!admin) {
            const saltRounds = 10;
            const adminPassword = 'admin'; // ✨ 초기 비밀번호. 로그인 후 변경 권장
            const hash = await bcrypt.hash(adminPassword, saltRounds);
            await db.run(`INSERT INTO Admins (username, password_hash) VALUES (?, ?)`, ['admin', hash]);
            console.log("기본 Admin 계정이 생성되었습니다. (ID: admin, PW: admin)");
        }

    } catch (err) {
        console.error("데이터베이스 초기화 실패:", err.message);
    }
})();

// --- 관리자 관련 함수 ---
async function getAdminUser(username) {
    return await db.get("SELECT * FROM Admins WHERE username = ?", [username]);
}

// --- 이벤트 통계 함수 ---
async function getStats(date) {
    const stats = {};
    const dailyUserFilter = `strftime('%Y-%m-%d', registration_date) = ?`;
    const dailyRedemptionFilter = `strftime('%Y-%m-%d', redemption_date) = ?`;
    
    const [
        dailyParticipants, dailyPrizes, cumulativeParticipants, 
        cumulativePrizes, currentInventory
    ] = await Promise.all([
        db.get(`SELECT COUNT(DISTINCT user_id) as count FROM Users WHERE ${dailyUserFilter}`, date),
        db.all(`SELECT prize_name, COUNT(*) as count FROM Redemptions WHERE ${dailyRedemptionFilter} GROUP BY prize_name`, date),
        db.get(`SELECT COUNT(DISTINCT user_id) as count FROM Users`),
        db.all(`SELECT prize_name, COUNT(*) as count FROM Redemptions GROUP BY prize_name`),
        db.all("SELECT id, name, total_quantity, remaining_quantity FROM Prizes")
    ]);

    stats.dailyParticipants = dailyParticipants?.count || 0;
    stats.dailyPrizesGiven = dailyPrizes || [];
    stats.dailyTotalGiven = stats.dailyPrizesGiven.reduce((sum, p) => sum + p.count, 0);

    stats.cumulativeParticipants = cumulativeParticipants?.count || 0;
    stats.cumulativePrizesGiven = cumulativePrizes || [];
    stats.cumulativeTotalGiven = stats.cumulativePrizesGiven.reduce((sum, p) => sum + p.count, 0);
    
    stats.currentInventory = currentInventory || [];
    return stats;
}

// --- 경품 관련 함수 ---
async function getRemainingPrizes() {
    return await db.all("SELECT id, name, remaining_quantity FROM prizes WHERE remaining_quantity > 0");
}

async function updatePrizeQuantity(prizeName, newQuantity) {
    // total과 remaining을 함께 업데이트하여 일관성 유지
    const result = await db.run(
        "UPDATE Prizes SET remaining_quantity = ?, total_quantity = ? WHERE name = ?", 
        [newQuantity, newQuantity, prizeName]
    );
    return result.changes;
}

// --- 참가자 및 당첨/수령 관련 함수 ---
async function recordWinner(userId, prizeId, redeemCode, prizeName) { // redeemCode를 인자로 받음
    const today = new Date().toISOString();
    try {
        await db.run("BEGIN TRANSACTION");
        
        // Users 테이블에 당첨 정보 및 교환권 코드 기록
        const userSql = `
            INSERT INTO Users (user_id, prize_won_id, redeem_code, is_redeemed, registration_date, stamps) 
            VALUES (?, ?, ?, 1, ?, '{"completed": true}')
            ON CONFLICT(user_id) DO UPDATE SET
            prize_won_id = excluded.prize_won_id,
            redeem_code = excluded.redeem_code,
            is_redeemed = 1
        `;
        await db.run(userSql, [userId, prizeId, redeemCode, today]);

        // Redemptions 테이블에 지급 기록
        await db.run("INSERT INTO Redemptions (user_id, prize_id, prize_name, redemption_date) VALUES (?, ?, ?, datetime('now', 'localtime'))", 
            [userId, prizeId, prizeName]);

        // Prizes 테이블 재고 차감
        await db.run("UPDATE Prizes SET remaining_quantity = remaining_quantity - 1 WHERE id = ? AND remaining_quantity > 0", [prizeId]);

        await db.run("COMMIT");
        return { success: true };
    } catch (err) {
        await db.run("ROLLBACK");
        throw err;
    }
}
// ✨ 사용자 ID로 정보를 조회하는 함수 추가
async function getUser(userId) {
    if (!userId) return null;
    return await db.get("SELECT * FROM Users WHERE user_id = ?", [userId]);
}


// --- 모듈 내보내기 ---
module.exports = {
    getAdminUser,
    getStats,
    getRemainingPrizes,
    updatePrizeQuantity,
    recordWinner,
    getUser,
};