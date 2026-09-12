// 뷰포트 높이 설정
function setScreenHeight() {
  let vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty("--vh", `${vh}px`);
}
window.addEventListener("resize", setScreenHeight);
setScreenHeight();

// 화면 전환 함수
function showScreen(screenId) {
  document
    .querySelectorAll(".screen")
    .forEach((el) => el.classList.remove("on"));
  document.getElementById(screenId).classList.add("on");

  // ★ 네이버 지도 렌더링 오류 완벽 해결 (Window Resize 이벤트 강제 발생)
  if (screenId === "screen-map" && window.map) {
    setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
    }, 50); // 0.05초 뒤에 브라우저 크기가 변한 것처럼 이벤트를 쏴줌
  }
}
document.addEventListener("DOMContentLoaded", async function () {
  const urlParams = new URLSearchParams(window.location.search);
  const viewParam = urlParams.get("view");

  const joaIdParam = urlParams.get("joa_id");

  if (viewParam === "map") {
    window.history.replaceState({}, document.title, window.location.pathname);
    showScreen("screen-map");
  }

  if (typeof loadUserStamps === "function") {
    loadUserStamps();
  }
  if (joaIdParam) {
    processScannedQR(joaIdParam);
  }
});

async function processScannedQR(scannedJoaId) {
  if (!navigator.geolocation) {
    alert("현재 브라우저에서는 위치 정보를 지원하지 않습니다.");
    showScreen("screen-map");
    return;
  }

  // 위치 정보 가져오기 시작 (로딩 화면 등을 띄워주면 더 좋습니다)
  navigator.geolocation.getCurrentPosition(
    async function (position) {
      // 테스트용 행사장 중심 좌표 강제 할당 (실제 배포시 주석 처리 필요)
      const lat = 37.249746;
      const lng = 127.165157;

      try {
        const startResponse = await fetch("/api/tour/start", {
          method: "POST",
        });
        const startData = await startResponse.json();

        if (startData.success) {
          localStorage.setItem("my_passport_id", startData.passport_id);
        }

        const response = await fetch("/api/tour/arrive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ joa_id: scannedJoaId, lat: lat, lng: lng }),
        });

        const data = await response.json();

        if (response.ok && data.success) {
          if (!localStorage.getItem("debug_user_id")) {
            localStorage.setItem("debug_user_id", data.user_id);
            alert("🛠️ 임시 발급된 사용자 ID: " + data.user_id);
          }
          if (data.prize_completed) {
            alert(
              "이미 경품 수령을 완료하셨습니다.\n참여해 주셔서 감사합니다!",
            );
            if (typeof loadUserStamps === "function") await loadUserStamps();
            openCardbook();
          } else if (data.status === "PHOTO_SUBMITTED") {
            alert(
              "이미 스탬프를 획득한 장소입니다. 다른 곳에 숨어있는 조아용을 찾아주세요!",
            );
            if (typeof loadUserStamps === "function") await loadUserStamps();
            showScreen("screen-map");
          } else {
            localStorage.setItem("return_joa_id", scannedJoaId);
            shuffleAndPickCard();
          }
        } else {
          alert(data.error || "위치 인증에 실패했습니다.");
          if (typeof loadUserStamps === "function") loadUserStamps();
          showScreen("screen-map");
        }
      } catch (error) {
        console.error(error);
        alert("서버와 통신하는 중 문제가 발생했습니다.");
        showScreen("screen-map");
      }
    },
    function (error) {
      alert("위치 정보(GPS) 접근을 허용해야 이벤트에 참여할 수 있습니다!");
      showScreen("screen-map");
    },
    { enableHighAccuracy: true, timeout: 5000 },
  );
}

window.addEventListener("pageshow", function (event) {
  // event.persisted가 true이면 캐시에서 페이지가 복원되었음을 의미합니다.
  if (event.persisted) {
    if (typeof loadUserStamps === "function") {
      loadUserStamps();
    }
  }
});

function shuffleAndPickCard() {
  showScreen("screen-shuffle");
}

// 🌟 사용자가 '카드 뽑기' 버튼을 클릭했을 때 실행
function pickCard() {
  // 1. 각 타입에 맞는 카드 이름과 이미지 경로 세팅
  const CARDS_INFO = {
    type1: { name: "불뿜는 조아용", img: "./img/card-joa-angry.png" },
    type2: { name: "UFO 조아용", img: "./img/card-joa-ufo.png" },
    type3: { name: "드럼치는 조아용", img: "./img/card-joa-drum.png" },
    type4: { name: "꽃과 함께 조아용", img: "./img/card-joa-flower.png" },
    type5: { name: "기타 치는 조아용", img: "./img/card-joa-guitar.png" },
    type6: { name: "사랑꾼 조아용", img: "./img/card-joa-heart.png" },
    type7: { name: "보드 타는 조아용", img: "./img/card-joa-board.png" },
    type8: { name: "탐사중인 조아용", img: "./img/card-joa-probe.png" },
    type9: { name: "로봇 조아용", img: "./img/card-joa-robot.png" },
    type10: { name: "로켓 타는 조아용", img: "./img/card-joa-rocket.png" },
    type11: { name: "기차 타는 조아용", img: "./img/card-joa-train.png" },
  };

  const allKeys = Object.keys(CARDS_INFO);
  const collectedModels = JSON.parse(
    localStorage.getItem("collected_models") || "[]",
  );

  let availableKeys = allKeys.filter((key) => !collectedModels.includes(key));
  if (availableKeys.length === 0) availableKeys = allKeys; // 만약 11개를 다 모았다면 다시 전체에서 랜덤

  // 2. 랜덤으로 카드 하나 뽑기
  const randomIndex = Math.floor(Math.random() * availableKeys.length);
  const selectedKey = availableKeys[randomIndex];

  // 3. 뽑힌 키값 저장 (joayong_photo.html에서 꺼내서 3D 모델을 띄울 때 사용)
  localStorage.setItem("selected_model_key", selectedKey);
  localStorage.setItem("return_joa_title", CARDS_INFO[selectedKey].name);

  // ★ 4. 화면의 카드 이름과 이미지를 진짜 뽑힌 카드의 정보로 교체
  document.getElementById("picked-card-name").textContent =
    CARDS_INFO[selectedKey].name;
  document.getElementById("picked-card-img").src = CARDS_INFO[selectedKey].img;

  // 5. 결과 화면 띄우기 (애니메이션과 함께 뽑힌 카드가 짠! 하고 나타남)
  showScreen("screen-card");

  // 6. 카드를 보여주고 2초(2000ms) 뒤 AR 포토존으로 자동 이동
  setTimeout(() => {
    // 🌟 페이지 이동 없이 동적으로 AR 화면 진입 함수 호출
    if (typeof enterAR === "function") {
      enterAR();
    } else {
      console.error("enterAR 함수가 없습니다.");
    }
  }, 2000);
}

// 🌟 네이버 지도 초기화 (오버레이 & 수령처 마커)
function initMap() {
  const eventCenterPoint = new naver.maps.LatLng(37.249746, 127.165157);
  window.map = new naver.maps.Map("map", {
    center: eventCenterPoint,
    zoom: 18,
  });

  new naver.maps.Marker({
    position: eventCenterPoint,
    map: window.map,
    title: "용인시과학축제 행사장",
  });

  const overlayBounds = new naver.maps.LatLngBounds(
    new naver.maps.LatLng(37.2506087, 127.1659997),
    new naver.maps.LatLng(37.2488391, 127.1642977),
  );

  function ImageOverlay(bounds, imageUrl, map) {
    this._bounds = bounds;
    this._imageUrl = imageUrl;
    this._element = document.createElement("img");
    this._element.src = this._imageUrl;
    this._element.className = "overlay-image";
    this.setMap(map);
  }

  ImageOverlay.prototype = new naver.maps.OverlayView();
  ImageOverlay.prototype.constructor = ImageOverlay;
  ImageOverlay.prototype.onAdd = function () {
    this.getPanes().overlayImage.appendChild(this._element);
  };
  ImageOverlay.prototype.draw = function () {
    const prj = this.getProjection();
    const sw = prj.fromCoordToOffset(this._bounds.getSW());
    const ne = prj.fromCoordToOffset(this._bounds.getNE());
    this._element.style.left = sw.x + "px";
    this._element.style.top = ne.y + "px";
    this._element.style.width = ne.x - sw.x + "px";
    this._element.style.height = sw.y - ne.y + "px";
  };
  ImageOverlay.prototype.onRemove = function () {
    this._element.parentNode.removeChild(this._element);
  };

  new ImageOverlay(overlayBounds, "./img/mir-layout.png", window.map);

  // 1. 5군데 스탬프 QR의 위경도 좌표를 배열로 정의합니다.
  // (아래 좌표들은 임의로 넣은 것이니 실제 위치 좌표로 수정해 주세요)
  const stampPositions = [
    new naver.maps.LatLng(37.2500978, 127.1646161),
    new naver.maps.LatLng(37.2496836, 127.1647082),
    new naver.maps.LatLng(37.2491335, 127.1648911),
    new naver.maps.LatLng(37.2502435, 127.1654148),
    new naver.maps.LatLng(37.2498069, 127.1655542),
  ];

  // 2. 스탬프 아이콘 이미지 경로 지정
  const stampImageUrl = [
    "./img/joa_id_1.png",
    "./img/joa_id_2.png",
    "./img/joa_id_3.png",
    "./img/joa_id_4.png",
    "./img/joa_id_5.png",
  ]; // 실제 준비하신 스탬프 이미지 경로로 변경하세요.
  window.stampMarkers = [];

  // 3. 반복문을 통해 지도에 5개의 스탬프 마커를 배치합니다.
  for (let i = 0; i < stampPositions.length; i++) {
    let marker = new naver.maps.Marker({
      position: stampPositions[i],
      map: window.map, // index.html에 선언된 지도 객체 변수
      title: "스탬프 QR 위치 " + (i + 1),
      icon: {
        url: stampImageUrl[i],
        size: new naver.maps.Size(100, 100), // 화면에 표시될 아이콘 크기
        scaledSize: new naver.maps.Size(50, 50), // 원본 이미지를 해당 크기로 리사이징
        anchor: new naver.maps.Point(25, 50), // 이미지의 중심점을 좌표에 맞추기 위한 기준점
      },
    });
    window.stampMarkers.push(marker);
  }

  // 경품 수령처 마커
  const infoMarkerPosition = new naver.maps.LatLng(37.2492938, 127.1657185);
  const infoMarker = new naver.maps.Marker({
    position: infoMarkerPosition,
    map: window.map,
    title: "ℹ️ 경품 수령처",
    icon: {
      url: "./img/present_place.png",
      size: new naver.maps.Size(100, 100),
      scaledSize: new naver.maps.Size(60, 60),
      anchor: new naver.maps.Point(30, 60),
    },
  });

  window.updateMarkersOpacity = function () {
    if (!window.stampMarkers || typeof userStamps === "undefined") return;

    userStamps.forEach((stamp) => {
      if (stamp.status === "PHOTO_SUBMITTED") {
        let markerIndex = parseInt(stamp.joa_id) - 1;
        let marker = window.stampMarkers[markerIndex];

        if (marker) {
          // opacity 대신 filter: grayscale(100%)를 적용하여 완전한 흑백으로 만듭니다.
          marker.setIcon({
            content: `<div style="width: 50px; height: 50px; filter: grayscale(100%);"><img src="${stampImageUrl[markerIndex]}" style="width: 100%; height: 100%; display: block;"></div>`,
            size: new naver.maps.Size(50, 50),
            anchor: new naver.maps.Point(25, 50),
          });
        }
      }
    });
  };

  const infoWindow = new naver.maps.InfoWindow({
    content: `<div style="padding:5px;font-size:12px;text-align:center; color: black">ℹ️ 경품 수령처</div>`,
  });
  naver.maps.Event.addListener(infoMarker, "mouseover", () =>
    infoWindow.open(window.map, infoMarker),
  );
  naver.maps.Event.addListener(infoMarker, "mouseout", () =>
    infoWindow.close(),
  );

  let isMarkerEnlarged = false;
  naver.maps.Event.addListener(infoMarker, "click", () => {
    if (isMarkerEnlarged) {
      infoMarker.setIcon({
        url: "./img/present_place.png",
        size: new naver.maps.Size(100, 100),
        scaledSize: new naver.maps.Size(60, 60),
        anchor: new naver.maps.Point(30, 60),
      });
      isMarkerEnlarged = false;
    } else {
      infoMarker.setIcon({
        url: "./img/present_place.png",
        size: new naver.maps.Size(100, 100),
        scaledSize: new naver.maps.Size(60, 60),
        anchor: new naver.maps.Point(30, 60),
      });
      isMarkerEnlarged = true;
    }
  });

  if (typeof loadUserStamps === "function") {
    loadUserStamps();
  }
}

// 🌟 사용자 QR 스캐너 제어 로직
let html5QrcodeScanner = null;

// ★ [핵심 추가] 스캐너 카메라 하드웨어를 확실하게 끄고 기다리는 함수
async function stopScannerSafe() {
  if (html5QrcodeScanner) {
    try {
      // 상태 체크 없이 무조건 stop 시도 후 catch로 방어
      await html5QrcodeScanner.stop();
    } catch (err) {
      console.warn("QR 끄기 에러(무시 가능):", err);
    } finally {
      try {
        html5QrcodeScanner.clear(); // UI 정리
      } catch (e) {}
      html5QrcodeScanner = null;
    }
  }
}

        function startScanner(mode = 'stamp') {
            showScreen('screen-scanner');

            if (html5QrcodeScanner) {
                html5QrcodeScanner.clear();
            }

            html5QrcodeScanner = new Html5Qrcode("qr-reader");
            const config = { fps: 10, qrbox: { width: 250, height: 250 } };

            html5QrcodeScanner.start(
                { facingMode: "environment" },
                config,
                (decodedText) => {
                    html5QrcodeScanner.stop().then(() => {
                        // ★ 분기 처리: 경품 스캔 모드일 때
                        if (mode === 'prize') {
                            // 행사장에 비치할 QR 코드 내용은 딱 이 텍스트로 만들어주세요!
                            if (decodedText.trim() === "SECRET_PRIZE_QR_2026") {
                                window.location.href = "roulette.html";
                            } else {
                                alert("올바른 경품 QR 코드가 아닙니다. 행사장에 비치된 QR을 스캔해주세요.");
                                showScreen('screen-complete');
                            }
                        }
                        // ★ 분기 처리: 일반 스탬프 스캔 모드일 때
                        else {
                            if (decodedText.includes("joa_id=") || decodedText.includes("m.site.naver.com")) {
                                window.location.href = decodedText;
                            } else {
                                alert("유효하지 않은 스탬프 QR 코드입니다. 행사장에 비치된 조아용 QR을 스캔해주세요.");
                                if (typeof loadUserStamps === "function") loadUserStamps();
                                showScreen('screen-map');
                            }
                        }
                    }).catch((err) => {
                        console.error("스캐너 정지 중 오류", err);
                    });
                },
                (errorMessage) => { }
            ).catch((err) => {
                alert("카메라 권한을 허용해야 QR 스캔이 가능합니다.");
                showScreen(mode === 'prize' ? 'screen-complete' : 'screen-map');
            });
        }

        // 스캐너 닫기 (취소) 함수
        function stopScanner() {
            if (html5QrcodeScanner) {
                html5QrcodeScanner.stop().then((ignore) => {
                    html5QrcodeScanner.clear();
                }).catch((err) => {
                    console.error("스캐너 정지 실패", err);
                });
            }
            // 스캐너를 끄고 지도 화면으로 돌아감
            if (typeof loadUserStamps === "function") loadUserStamps(); // ★ 추가
            showScreen('screen-map');
        }


// 🌟 스탬프 카드북 렌더링 함수
function openCardbook() {
  // 전체 조아용 카드 정보
  const CARDS_INFO = {
    type1: { name: "불뿜는 조아용", img: "./img/card-joa-angry.png" },
    type2: { name: "UFO 조아용", img: "./img/card-joa-ufo.png" },
    type3: { name: "드럼치는 조아용", img: "./img/card-joa-drum.png" },
    type4: { name: "꽃과 함께 조아용", img: "./img/card-joa-flower.png" },
    type5: { name: "기타 치는 조아용", img: "./img/card-joa-guitar.png" },
    type6: { name: "사랑꾼 조아용", img: "./img/card-joa-heart.png" },
    type7: { name: "보드 타는 조아용", img: "./img/card-joa-board.png" },
    type8: { name: "탐사중인 조아용", img: "./img/card-joa-probe.png" },
    type9: { name: "로봇 조아용", img: "./img/card-joa-robot.png" },
    type10: { name: "로켓 타는 조아용", img: "./img/card-joa-rocket.png" },
    type11: { name: "기차 타는 조아용", img: "./img/card-joa-train.png" },
  };

  // 1. 지금까지 모은 카드 키값 가져오기
  const collectedModels = JSON.parse(
    localStorage.getItem("collected_models") || "[]",
  );

  // 2. 서버에서 인증 완료된 스탬프 개수 가져오기 (joayong.js의 userStamps 활용)
  let acquiredCount = 0;
  if (typeof userStamps !== "undefined") {
    const acquiredStamps = userStamps.filter(
      (s) => s.status === "PHOTO_SUBMITTED",
    );
    acquiredCount = acquiredStamps.length;
  } else {
    acquiredCount = collectedModels.length; // 방어 코드
  }

  // 3. 상단 프로그레스 업데이트
  const cardbookProgEl = document.getElementById("cardbookProg");
  if (cardbookProgEl) {
    cardbookProgEl.innerText = `${acquiredCount} / 5`;
  }

  // 4. 슬롯 5개 그리기
  const grid = document.getElementById("cardbook-grid");
  if (grid) {
    grid.innerHTML = ""; // 기존 내용 비우기

    for (let i = 0; i < 5; i++) {
      if (i < collectedModels.length) {
        // 획득한 카드 슬롯
        const key = collectedModels[i];
        const card = CARDS_INFO[key] || {
          name: "조아용",
          img: "./img/card-joa-angry.png",
        };
        grid.innerHTML += `
                            <div class="card-slot collected">
                                <div class="inner">
                                    <img src="${card.img}" alt="${card.name}">
                                    <div class="name">${card.name}</div>
                                </div>
                            </div>
                        `;
      } else {
        // 빈 슬롯 (아직 못 찾은 카드)
        grid.innerHTML += `
                            <div class="card-slot empty">
                                <div class="name">?</div>
                            </div>
                        `;
      }
    }
  }

  // 화면 전환
  showScreen("screen-cardbook");
}
