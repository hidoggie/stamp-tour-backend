let userStamps = [];
let pollingInterval = null;

// 1. 내 스탬프 내역 가져오기
async function loadUserStamps() {
  try {
    const timestamp = new Date().getTime();
    const response = await fetch(`/api/tour/my_stamps?t=${timestamp}`, { 
        cache: "no-store" 
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.success) {
        userStamps = data.stamps;
        console.log(`현재 획득한 스탬프: ${userStamps.length}개`);
        
        // 데이터 로드 후 5개 달성 여부 체크
        checkPrizeCondition();
        if (typeof window.updateMarkersOpacity === 'function') {
            window.updateMarkersOpacity();
        }
      }
    }
  } catch (err) {
    console.error("스탬프 기록 로드 실패", err);
  }
}
// 2. 경품 수령 조건(5개 달성) 확인 및 완주 화면 이동
async function checkPrizeCondition() {
  const acquiredStamps = userStamps.filter((s) => s.status === "PHOTO_SUBMITTED");
  const acquiredCount = acquiredStamps.length;

  const mapProgEl = document.getElementById("mapProg");
  if (mapProgEl) mapProgEl.innerText = `${acquiredCount} / 5`;

  try {
    const res = await fetch("/api/tour/prize_status");
    const data = await res.json();
    if (!data.success) return;
    const claimedPrizes = data.claimedPrizes || [];

    // 🌟 스탬프 5개를 모았고 & 아직 경품을 받지 않은 상태라면
    if (acquiredCount >= 5 && !claimedPrizes.includes("COMPLETION")) {
        
        // ★ 1. 사용자에게 알림창(팝업) 띄우기
        alert("🎉 모든 조아용 스탬프를 모았습니다!\n경품 수령처로 이동하여 아래 [경품 QR 스캔하기] 버튼을 눌러주세요.");
        
        // ★ 2. 기존의 완주 화면(screen-complete)으로 부드럽게 이동
        if (typeof showScreen === 'function') {
            showScreen("screen-complete");
        }
    }
  } catch (err) {
    console.error("경품 상태 확인 실패:", err);
  }
}

// 3. 사용자 고유 QR 코드 생성 함수 (관리자 스캐너용)
function generateUserQR() {
  const qrContainer = document.getElementById("qrcode-container");
  if (!qrContainer) return;
  qrContainer.innerHTML = ""; // 기존 내용 비우기

  const myPassportId = localStorage.getItem("my_passport_id");
  if (!myPassportId) return;

  // 관리자 앱에서만 인식하도록 접두어 부착
  const qrData = "DJGO_PRIZE:" + myPassportId;

  new QRCode(qrContainer, {
    text: qrData,
    width: 160,
    height: 160,
    colorDark: "#000000",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.H,
  });
}

// 4. 모달 닫기
function closePrizeModal() {
  const modal = document.getElementById("prizeModal");
  if (modal) modal.style.display = "none";
  const qrContainer = document.getElementById("qrcode-container");
  if (qrContainer) qrContainer.innerHTML = "";
}

// 5. 룰렛 돌리기 API (roulette.html 같은 별도 페이지에서 사용)
let theWheel = null; // Winwheel 객체가 연결될 변수

async function spinRoulette() {
  try {
    const response = await fetch("/api/tour/spin", { method: "POST" });
    const data = await response.json();

    if (data.success) {
      if (theWheel) {
        theWheel.animation.stopAngle = data.stopAt; // 서버에서 정해준 각도로 멈춤
        theWheel.startAnimation();

        // 회전 완료 후 콜백
        theWheel.animation.callbackFinished = function () {
          alert(`🎉 축하합니다!\n[ ${data.prizeName} ] 에 당첨되셨습니다!`);
          window.location.href = "index.html"; // 교환 후 메인 복귀
        };
      }
    } else {
      alert(data.error);
    }
  } catch (e) {
    alert("룰렛 통신 중 오류가 발생했습니다.");
  }
}
