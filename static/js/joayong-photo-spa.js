// ==========================================
// 1. 전역 상수 및 3D 모델 스펙 정의
// ==========================================
const MODEL_SPECS = {
  type1: { name: "✨ 불뿜는 조아용", bgm: "./audio/Where_the_White_Petals_Fall.mp3", url: "./models/joayong_angry.glb", scale: "2.5 2.5 2.5", position: "0 0 0", rotation: "0 0 0", animation: "" },
  type2: { name: "✨ UFO 조아용", bgm: "./audio/Chasing_the_Morning_Sun.mp3", url: "./models/joayong_ufo.glb", scale: "1 1 1", position: "0 0 0", rotation: "0 -45 0", animation: "" },
  type3: { name: "✨ 드럼치는 조아용", bgm: "./audio/The_Final_Lap_of_Grace.mp3", url: "./models/joayong_drum.glb", scale: "1.5 1.5 1.5", position: "0 0.5 0", rotation: "0 0 0", animation: "" },
  type4: { name: "✨ 꽃과 함께 조아용", bgm: "./audio/The_Final_Lap_of_Grace.mp3", url: "./models/joayong_flower.glb", scale: "2 2 2", position: "0 0 0", rotation: "0 0 0", animation: "" },
  type5: { name: "✨ 기타 치는 조아용", bgm: "./audio/The_Final_Lap_of_Grace.mp3", url: "./models/joayong_guitar.glb", scale: "2 2 2", position: "0 0 0", rotation: "0 0 0", animation: "" },
  type6: { name: "✨ 사랑꾼 조아용", bgm: "./audio/The_Final_Lap_of_Grace.mp3", url: "./models/joayong_heart.glb", scale: "2.5 2.5 2.5", position: "0 0 0", rotation: "0 0 0", animation: "" },
  type7: { name: "✨ 보드 타는 조아용", bgm: "./audio/The_Final_Lap_of_Grace.mp3", url: "./models/joayong_board.glb", scale: "2 2 2", position: "0 0 0", rotation: "0 -45 0", animation: "" },
  type8: { name: "✨ 탐사중인 조아용", bgm: "./audio/The_Final_Lap_of_Grace.mp3", url: "./models/joayong_probe.glb", scale: "2 2 2", position: "0 0 0", rotation: "0 0 0", animation: "" },
  type9: { name: "✨ 로봇 조아용", bgm: "./audio/The_Final_Lap_of_Grace.mp3", url: "./models/joayong_mecha.glb", scale: "2.5 2.5 2.5", position: "0 0 0", rotation: "0 0 0", animation: "" },
  type10: { name: "✨ 로켓 타는 조아용", bgm: "./audio/The_Final_Lap_of_Grace.mp3", url: "./models/joayong_rocket.glb", scale: "1 1 1", position: "0 0 0", rotation: "0 -45 0", animation: "" },
  type11: { name: "✨ 기차 타는 조아용", bgm: "./audio/The_Final_Lap_of_Grace.mp3", url: "./models/joayong_train.glb", scale: "1 1 1", position: "1 1 0", rotation: "0 -45 0", animation: "" },
};

let capturedDataUrl = null;
let capturedFile = null;
let isArEventListenersAttached = false;
let isBgmIntentionallyPaused = false; 

// ==========================================
// 2. A-Frame 커스텀 컴포넌트 등록 
// ==========================================
if (typeof AFRAME !== "undefined") {
  AFRAME.registerComponent("smooth-model", {
    init: function () {
      this.el.addEventListener("model-loaded", () => {
        const mesh = this.el.getObject3D("mesh");
        if (mesh) {
          mesh.traverse((node) => {
            if (node.isMesh && node.material) {
              node.frustumCulled = false;
              node.material.flatShading = false;
              node.material.roughness = 0.7;
              node.material.needsUpdate = true;
            }
          });
        }
      });
    },
  });

  AFRAME.registerComponent("fix-metal-material", {
    init() {
      this.el.addEventListener("model-loaded", () => {
        const mesh = this.el.getObject3D("mesh");
        if (mesh) {
          mesh.traverse((node) => {
            if (node.isMesh && node.material) {
              node.material.metalness = 0.1;
              node.material.roughness = 0.35;
              node.material.needsUpdate = true;
            }
          });
        }
      });
    },
  });
}

// ==========================================
// 3. AR 진입 함수 (강력한 인라인 스타일 적용)
// ==========================================
window.enterAR = function () {
  if (typeof showScreen === "function") showScreen("screen-ar");

  const selectedKey = localStorage.getItem("selected_model_key") || "type1";
  const currentModel = MODEL_SPECS[selectedKey] || MODEL_SPECS["type1"];

  const arContainer = document.getElementById("ar-container");
  if (!arContainer) return;

  // 🌟 CSS 충돌을 피하기 위해 핵심 UI 요소들에 명시적인 인라인(style) 디자인 적용!
  arContainer.innerHTML = `
        <style>
          #reset-tooltip {
            position: fixed; bottom: 7rem; left: 1.8rem; z-index: 99998;
            background: white; color: black; padding: 8px 14px; border-radius: 20px;
            font-size: 1rem; font-weight: bold; pointer-events: none;
            box-shadow: 0 4px 10px rgba(0,0,0,0.2);
            animation: bounce-ar 1.5s infinite;
          }
          /* 말풍선 꼬리 */
          #reset-tooltip::after {
            content: ''; position: absolute; top: 100%; left: 20px;
            border-width: 6px; border-style: solid;
            border-color: white transparent transparent transparent;
          }
          /* 둥둥 애니메이션 */
          @keyframes bounce-ar {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-5px); }
          }
        </style>
        <audio id="bgm" src="${currentModel.bgm}" loop></audio>
        
        <!-- 팝업 닫기 전까지 display: none 으로 숨겨둠 -->
        <button id="audio-toggle-btn" aria-label="음악 끄기 및 켜기" style="display: none; position: fixed; bottom: 10rem; left: 1.5rem; z-index: 99998; width: 50px; height: 50px; padding: 0; border-radius: 50%; border: none; background: white; font-size: 24px; box-shadow: 0 4px 10px rgba(0,0,0,0.2); align-items: center; justify-content: center;">🎵</button>
      
        <div id="reset-tooltip" style="display: none; position: fixed; bottom: 7rem; left: 1.8rem; z-index: 99998; background: white; color: black; padding: 8px 14px; border-radius: 20px; font-size: 1rem; font-weight: bold; pointer-events: none; box-shadow: 0 4px 10px rgba(0,0,0,0.2);">조아용을 중앙으로</div>
        
        <button id="ar-reset-btn" aria-label="3D 모델 위치 초기화" style="display: none; position: fixed; bottom: 3rem; left: 1.5rem; z-index: 99998; width: 50px; height: 50px; padding: 0; border-radius: 50%; border: none; background: white; box-shadow: 0 4px 10px rgba(0,0,0,0.2); align-items: center; justify-content: center;">
            <img src="./img/character-2-center-gray.png" style="display: block; margin: 0 auto;">
        </button>

        <div class="arNavi-popup-overlay" id="popup" style="display: flex;">
          <div class="arNavi-popup-box">
            <h2 class="arNavi-popup-title">📱 포토존 이용 안내</h2>
            <img src="./img/manual-hands.png" alt="AR 포토 사용법" class="arNavi-content-img">
            <ul class="arNavi-info-list">
              <li>한 손가락으로 캐릭터를 눌러 원하는 위치로 이동할 수 있어요</li>
              <li>두 손가락으로 캐릭터를 잡고 크기를 조절할 수 있어요</li>
              <li>두 손가락으로 캐릭터를 잡고 회전 및 각도 조절할 수 있어요</li>
              <li>사진을 기기에 저장하거나 SNS에 공유하면 스탬프가 발행됩니다.</li>
            </ul>
            <button class="arNavi-btn-transparent arNavi-ok-btn" aria-label="확인" onclick="closePopup()">OK</button>
          </div>
        </div>        

        <!-- 미리보기 화면 (캡처본 스타일 완벽 적용) -->
        <div id="custom-ui-layer" style="display: none; position: absolute; top: 0; left: 0; width: 100%; height: 85%; z-index: 1000001; background: #ffffff; border-bottom-left-radius: 24px; border-bottom-right-radius: 24px; box-shadow: 0 10px 20px rgba(0,0,0,0.15);">
            <div id="preview-screen" style="width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px; box-sizing: border-box;">
                
                <!-- 사진 영역 (4:5 비율 및 둥근 모서리) -->
                <div class="media-container" style="width: 100%; max-width: 380px; margin-bottom: 25px; display: flex; justify-content: center;">
                    <img id="preview-image" style="display: none; width: 100%; aspect-ratio: 4 / 5; object-fit: cover; border-radius: 16px; box-shadow: 0 4px 15px rgba(0,0,0,0.15);" />
                </div>
                
                <!-- 하단 버튼 영역 (테두리 및 색상 매칭) -->
                <div class="bottom-action" style="width: 100%; max-width: 380px;">
                    <div class="btn-row" style="gap: 10px; margin-bottom: 12px;">
                        <button id="btn-cancel" onclick="resetUI()" style="flex: 1; padding: 14px; border-radius: 12px; font-weight: 800; background: #F2F4F6; color: #000; font-size: 16px; border: 1px solid #333;">다시 촬영</button>
                        <button id="btn-share-sns" style="flex: 1; padding: 14px; border-radius: 12px; font-weight: 800; background: #FF6BF4; color: #000; font-size: 16px; border: 1px solid #333;">SNS 공유</button>
                    </div>
                    <button id="btn-save-device" style="width: 100%; padding: 16px; border-radius: 12px; font-weight: 800; background: #4A90E2; color: white; font-size: 16px; border: 1px solid #333;">사진 저장하고 스탬프 받기</button>
                </div>
            </div>
        </div>

        <a-scene xrextras-gesture-detector xrextras-loading xrextras-runtime-error renderer="colorManagement: true" xrweb="allowedDevices: any" postprocessing="bloomStrength: 0.2" xrextras-capture-config="requestMic: none">
            <xrextras-capture-button capture-mode="photo"></xrextras-capture-button>
            <a-camera id="camera" position="0 4 8" raycaster="objects: .cantap" cursor="fuse: false; rayOrigin: mouse;"></a-camera>
            
            <a-light type="hemisphere" color="#ffffff" groundColor="#aaaaaa" intensity="0.7"></a-light>
            <a-entity light="type: directional; intensity: 0.6; castShadow: true; target: #ar_target_zone;" xrextras-attach="target: ar_target_zone; offset: 1 15 3;" shadow></a-entity>
            <a-light type="ambient" intensity="0.5"></a-light>
            
            <a-entity id="ar_target_zone" position="0 0 0" scale="1 1 1" xrextras-hold-drag xrextras-two-finger-rotate xrextras-pinch-scale>
                <a-entity gltf-model="${currentModel.url}" class="cantap" position="${currentModel.position}" rotation="${currentModel.rotation}" scale="${currentModel.scale}" ${currentModel.animation !== false ? `animation-mixer="${currentModel.animation}"` : ""} shadow="receive: false" fix-metal-material smooth-model></a-entity>
                <a-entity gltf-model="./models/common-shadow-or-effect.glb" position="0 0 -1" scale="2 2 2"></a-entity>
            </a-entity>

            <a-plane id="ground" rotation="-90 0 0" width="1000" height="1000" material="shader: shadow" shadow></a-plane>
        </a-scene>
    `;

  bindArUIEvents();
  attachGlobalArListeners();
};


// ==========================================
// 4. 이벤트 및 UI 바인딩 
// ==========================================
window.exitAR = function () {
  if (window.XR8) { window.XR8.stop(); window.XR8.clearCameraPipelineModules(); }
  const bgm = document.getElementById("bgm");
  if (bgm) { bgm.pause(); bgm.src = ""; }

  const arContainer = document.getElementById("ar-container");
  if (arContainer) arContainer.innerHTML = ""; 

  if (typeof loadUserStamps === "function") loadUserStamps();
  if (typeof showScreen === "function") showScreen("screen-map");
};

function bindArUIEvents() {
  const audioBtn = document.getElementById("audio-toggle-btn");
  const bgm = document.getElementById("bgm");
  const resetBtn = document.getElementById("ar-reset-btn");

  if (audioBtn && bgm) {
    audioBtn.onclick = function (e) {
      e.preventDefault();
      if (bgm.paused) {
        bgm.play().then(() => {
            audioBtn.innerText = "🎵";
            audioBtn.style.backgroundColor = "#ffffff";
            isBgmIntentionallyPaused = false;
          }).catch(err => console.log(err));
      } else {
        bgm.pause();
        audioBtn.innerText = "🔇";
        audioBtn.style.backgroundColor = "#f1f3f2";
        isBgmIntentionallyPaused = true;
      }
    };
  }

  if (resetBtn) {
    resetBtn.onclick = function (e) {
      e.preventDefault();
      if (window.XR8 && window.XR8.XrController) { window.XR8.XrController.recenter(); }
      const targetZone = document.getElementById("ar_target_zone");
      if (targetZone) {
        targetZone.setAttribute("position", "0 0 0");
        targetZone.setAttribute("rotation", "0 0 0");
        targetZone.setAttribute("scale", "1 1 1");
      }
      const tooltip = document.getElementById("reset-tooltip");
      if (tooltip) tooltip.style.display = "none";
    };
  }

  document.getElementById("btn-save-device")?.addEventListener("click", handleSaveDevice);
  document.getElementById("btn-share-sns")?.addEventListener("click", handleShareSNS);
}

// 명시적으로 display 값 컨트롤하여 화면 감추기
window.resetUI = function () {
  const uiLayer = document.getElementById("custom-ui-layer");
  const previewImg = document.getElementById("preview-image");
  
  if (uiLayer) uiLayer.style.display = "none";
  if (previewImg) {
      previewImg.src = "";
      previewImg.style.display = "none";
  }
  
  capturedDataUrl = null;
  capturedFile = null;

  const recorder = document.getElementById("recorder");
  if (recorder) recorder.style.display = "flex";
};


// ==========================================
// 5. 8th Wall 캡처 전역 리스너 및 팝업 닫기 (문제 해결 부분!)
// ==========================================
window.closePopup = function () {
  const popup = document.getElementById("popup");
  if (popup) popup.style.display = "none";
  
  // 🌟 팝업창을 닫을 때 버튼들이 보이도록 명시적 처리!
  const audioBtn = document.getElementById("audio-toggle-btn");
  const resetBtn = document.getElementById("ar-reset-btn");
  const tooltip = document.getElementById("reset-tooltip");
  
  if (audioBtn) audioBtn.style.display = "flex";
  if (resetBtn) resetBtn.style.display = "flex";
  if (tooltip) {
      tooltip.style.display = "block";
   //   setTimeout(() => { tooltip.style.display = "none"; }, 4000); // 4초 뒤 안내문구 자동 숨김
  }
  
  const bgm = document.getElementById("bgm");
  if (bgm && bgm.paused && !isBgmIntentionallyPaused) {
    bgm.play().then(() => {
      if (audioBtn) { audioBtn.innerText = "🎵"; audioBtn.style.backgroundColor = "#ffffff"; }
    }).catch(err => console.log(err));
  }
};

function attachGlobalArListeners() {
  if (isArEventListenersAttached) return;
  isArEventListenersAttached = true;

  window.addEventListener("mediarecorder-photocomplete", (e) => {
    try {
        // Blob 데이터가 없는 환경까지 대비한 방어 코드
        const imageData = e.detail?.blob || e.detail?.base64 || e.detail?.src;
        if (!imageData) return;

        const processImage = (dataUrl) => {
            addTimestampToImage(dataUrl, (composed) => {
                capturedDataUrl = composed;
                fetch(composed).then((r) => r.blob()).then((blob) => {
                    capturedFile = new File([blob], "조아용-stamp.jpg", { type: "image/jpeg" });
                });

                // 🌟 촬영 완료 즉시 미리보기 레이어 강제 노출
                const uiLayer = document.getElementById("custom-ui-layer");
                const previewImg = document.getElementById("preview-image");
                
                if (uiLayer) uiLayer.style.display = "block";
                if (previewImg) {
                    previewImg.src = composed;
                    previewImg.style.display = "block";
                }
            });
        };

        if (imageData instanceof Blob) {
            const reader = new FileReader();
            reader.onload = (ev) => processImage(ev.target.result);
            reader.readAsDataURL(imageData);
        } else {
            processImage(imageData.startsWith('data:') ? imageData : 'data:image/jpeg;base64,' + imageData);
        }
    } catch(err) {
        console.error("사진 생성 중 오류 발생:", err);
    }
  });

  window.addEventListener("mediarecorder-previewclosed", () => {
    const recorder = document.getElementById("recorder");
    if (recorder) recorder.style.display = "flex";
  });
}


// ==========================================
// 6. 이미지 합성 및 서버 전송 로직
// ==========================================
function addTimestampToImage(dataUrl, callback) {
  const img = new Image();
  img.onload = () => {
    const targetWidth = 720, targetHeight = 900;
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");

    const targetRatio = targetWidth / targetHeight;
    const imageRatio = img.width / img.height;
    let sx, sy, sw, sh;
    
    if (imageRatio > targetRatio) {
      sh = img.height; sw = sh * targetRatio; sx = (img.width - sw) / 2; sy = 0;
    } else {
      sw = img.width; sh = sw / targetRatio; sx = 0; sy = (img.height - sh) * 0.35;
    }

    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight);

    const now = new Date();
    const timeStr = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    let lighthouseName = localStorage.getItem("return_joa_title") || "이벤트장소";

    ctx.font = `bold 28px Arial`;
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = "white";

    ctx.textAlign = "left";
    ctx.fillText(lighthouseName, 30, targetHeight - 35);
    ctx.textAlign = "right";
    ctx.fillText(timeStr, targetWidth - 30, targetHeight - 35);

    callback(canvas.toDataURL("image/jpeg", 0.92));
  };
  img.src = dataUrl;
}

async function uploadPhotoToServer() {
  const currentJoaId = localStorage.getItem("return_joa_id");
  try {
    const response = await fetch("/api/tour/photo_upload", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ joa_id: currentJoaId }),
    });
    const data = await response.json();

    if (data.success) {
      localStorage.setItem("last_ar_status", "PHOTO_SUBMITTED");
      const currentKey = localStorage.getItem("selected_model_key");
      let collected = JSON.parse(localStorage.getItem("collected_models") || "[]");
      if (currentKey && !collected.includes(currentKey)) {
        collected.push(currentKey);
        localStorage.setItem("collected_models", JSON.stringify(collected));
      }
      return true;
    } else { alert(data.error); return false; }
  } catch (err) { alert("서버 전송 중 에러가 발생했습니다."); return false; }
}

async function handleSaveDevice() {
  if (!capturedDataUrl || !capturedFile) return;
  const isUploaded = await uploadPhotoToServer();
  if (!isUploaded) return;

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  if (isIOS && navigator.canShare && navigator.canShare({ files: [capturedFile] })) {
    try {
      await navigator.share({ files: [capturedFile], title: "조아용 인증샷", text: "하단의 [이미지 저장]을 눌러 사진 앨범에 보관하세요!" });
      alert("스탬프가 발급되었습니다! 🎁");
    } catch (error) { alert("스탬프가 발급되었습니다! 🎁"); } finally { exitAR(); }
    return;
  }

  const joaTitle = localStorage.getItem("return_joa_title") || "조아용";
  const blobUrl = URL.createObjectURL(capturedFile);
  const link = document.createElement("a");
  link.href = blobUrl; link.download = `${joaTitle}_인증샷_${new Date().getTime()}.jpg`;
  document.body.appendChild(link); link.click(); document.body.removeChild(link);

  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  alert("사진이 저장되어 스탬프가 발급되었습니다! 🎁");
  setTimeout(() => { exitAR(); }, 500); 
}

async function handleShareSNS() {
  if (!capturedFile) return;
  const isUploaded = await uploadPhotoToServer();
  if (!isUploaded) return;

  const shareData = { title: "용인시과학축제 AR스탬프투어", text: "조아용과 함께 찰칵!" };
  try {
    if (navigator.canShare && navigator.canShare({ files: [capturedFile] })) {
      await navigator.share({ ...shareData, files: [capturedFile] });
    } else if (navigator.share) { await navigator.share(shareData); } 
    else { alert("현재 브라우저에서는 공유 기능을 지원하지 않습니다.\n대신 스탬프는 정상 발급되었습니다!"); }
  } catch (error) {} finally { exitAR(); }
}

// ==========================================
// 7. 유틸 및 전역 세팅
// ==========================================
(function checkReload() {
  const isReload = (window.performance && window.performance.navigation && window.performance.navigation.type === 1) ||
    (window.performance && window.performance.getEntriesByType("navigation").length > 0 && window.performance.getEntriesByType("navigation")[0].type === "reload");

  if (isReload) window.location.replace("index.html");
})();

window.releaseCamera = function () {
  if (window.XR8) { XR8.stop(); XR8.clearCameraPipelineModules(); }
};
window.addEventListener("beforeunload", releaseCamera);
window.addEventListener("pagehide", releaseCamera);

window.addEventListener("mediarecorder-photocomplete", () => {
  const recorder = document.getElementById("recorder");
  if (recorder) recorder.style.display = "none";
});

window.openPopup = function () {
  const popup = document.getElementById("popup");
  if (popup) popup.style.display = "flex";
};

document.addEventListener("DOMContentLoaded", () => {
  document.addEventListener("visibilitychange", () => {
    const bgm = document.getElementById("bgm");
    const audioBtn = document.getElementById("audio-toggle-btn");

    if (!bgm) return;
    if (document.hidden) {
      if (!bgm.paused) {
        bgm.pause(); bgm.dataset.wasPlaying = "true"; 
        if (audioBtn) { audioBtn.innerText = "🔇"; audioBtn.style.backgroundColor = "#f1f3f2"; }
      }
    } else {
      if (bgm.dataset.wasPlaying === "true" && !isBgmIntentionallyPaused) {
        bgm.play().catch((err) => console.log(err)); bgm.dataset.wasPlaying = "false"; 
        if (audioBtn) { audioBtn.innerText = "🎵"; audioBtn.style.backgroundColor = "#ffffff"; }
      }
    }
  });
});