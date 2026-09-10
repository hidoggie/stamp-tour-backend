(function checkReload() {
  // 최신 브라우저 및 구형 브라우저 호환성을 모두 체크하여 새로고침 여부 판별
  const isReload =
    (window.performance &&
      window.performance.navigation &&
      window.performance.navigation.type === 1) ||
    (window.performance &&
      window.performance.getEntriesByType("navigation").length > 0 &&
      window.performance.getEntriesByType("navigation")[0].type === "reload");

  if (isReload) {
    console.log("새로고침이 감지되어 메인 화면으로 이동합니다.");
    // 일반적인 href 이동이 아닌 replace를 사용하여 '뒤로가기' 히스토리가 꼬이지 않게 처리
    window.location.replace("index.html");
  }
})();

// 1. 카메라 강제 종료 (좀비 카메라 방지 - 공통 적용)
window.releaseCamera = function () {
  if (window.XR8) {
    XR8.stop();
    XR8.clearCameraPipelineModules();
  }
};
window.addEventListener("beforeunload", releaseCamera);
window.addEventListener("pagehide", releaseCamera);

// 2. 8th Wall 녹화/촬영 UI 이벤트 제어
window.addEventListener("mediarecorder-photocomplete", () => {
  const recorder = document.getElementById("recorder");
  if (recorder) recorder.style.display = "none";
});
window.addEventListener("mediarecorder-previewclosed", () => {
  const recorder = document.getElementById("recorder");
  if (recorder) recorder.style.display = "flex";
});

// 3. 팝업 및 뒤로가기 제어
window.openPopup = function () {
  document.getElementById("popup").style.display = "flex";
};
window.closePopup = function () {
  document.getElementById("popup").style.display = "none";
};
window.goBackToMain = function () {
  releaseCamera(); // 뒤로 갈 때 무조건 카메라 끄기
  const currentjoaId = localStorage.getItem("return_joa_id");
  if (currentjoaId) {
    // 사진 인증을 완료하지 않고 포기한 경우, 이전 단계(게임 클리어) 상태 유지
    localStorage.setItem("return_status", "GAME_CLEARED");
  }
  setTimeout(() => {
    window.location.href = "index.html?view=map";
  }, 100);
};

window.startNavigation = function (zoneType) {
  if (window.XR8 && window.XR8.XrController) {
    window.XR8.XrController.recenter();
  }

  // 시작 팝업이 없으므로, 로딩 후 약간의 딜레이(0.4초)만 주고 바로 요소들을 활성화합니다.
  setTimeout(() => {
    // 1. 숨겨져 있던 컨트롤 버튼들 표시
    const audioBtn = document.getElementById("audio-toggle-btn");
    if (audioBtn) audioBtn.style.display = "flex";

    const resetBtn = document.getElementById("ar-reset-btn"); 
    if (resetBtn) resetBtn.style.display = "flex";             

    // 2. 선택된 3D 모델 가시성 활성화 및 애니메이션 시작!
    const zones = window.PHOTO_ZONE_IDS || [];
    zones.forEach((id) => {
      const entity = document.getElementById(id);
      if (entity && id === zoneType) {
        entity.setAttribute("visible", "true");
        entity.setAttribute("scale", "1 1 1");
        entity.setAttribute("position", "0 0 0");
        entity.setAttribute("rotation", "0 0 0");
        entity.emit("ar-start");
        console.log(zoneType + " 애니메이션 시퀀스 개시");
      }
    });
  }, 400);

  // 💡 선택되지 않은 나머지 개체들은 즉시 숨김 처리 및 크기 0으로 격리
  const zones = window.PHOTO_ZONE_IDS || [];
  zones.forEach((id) => {
    const entity = document.getElementById(id);
    if (entity && id !== zoneType) {
      entity.setAttribute("visible", "false");
      entity.setAttribute("scale", "0 0 0");
    }
  });

  // 사운드 시퀀스 강제 스타트
  const bgm = document.getElementById("bgm");
  if (bgm) {
    bgm.play().catch((err) => console.log("BGM 오토 플레이 정책 핸들링:", err));
  }
};

// 5. 사진 촬영 및 전송/공유 핵심 로직
document.addEventListener("DOMContentLoaded", () => {
  window.addEventListener("message", (event) => {
    if (event.data && event.data.type === "STAMP_SAVE_SUCCESS") {
      const shareModal = document.getElementById("modal-share");
      if (shareModal) shareModal.classList.remove("hidden");
    }
  });

  const guideTextEl = document.querySelector(".guide-text");
  const joaTitle = localStorage.getItem("return_joa_title") || "관광지";
  if (guideTextEl) {
    guideTextEl.innerHTML = `<strong>${joaTitle}</strong>을(를) 배경으로 <br>사진을 찍고 저장하거나 SNS에 올리면 최종 인증이 완료됩니다.`;
  }

  const audioBtn = document.getElementById("audio-toggle-btn");
  const resetBtn = document.getElementById("ar-reset-btn");
  const bgm = document.getElementById("bgm");
 // const uiContainer = document.getElementById("container");
  //  const startArea = document.getElementById("start_area");

  // 오디오 음성 제어 토글 리스너
  if (audioBtn && bgm) {
    ["click", "touchstart"].forEach((eventType) => {
      audioBtn.addEventListener(
        eventType,
        (e) => {
          e.preventDefault();
          e.stopPropagation();

          if (bgm.paused) {
            bgm.play().catch((err) => console.log("Play failed: ", err));
            audioBtn.innerText = "🎵";
            audioBtn.style.backgroundColor = "#ffffff";
          } else {
            bgm.pause();
            audioBtn.innerText = "🔇";
            audioBtn.style.backgroundColor = "#f1f3f2";
          }
        },
        { passive: false },
      );
    });
  }

// 🔄 3D 모델 위치/크기/회전 초기화 버튼 제어
if (resetBtn) {
  ["click", "touchstart"].forEach((eventType) => {
    resetBtn.addEventListener(
      eventType,
      (e) => {
        e.preventDefault();
        e.stopPropagation();

        // 1. 8th Wall AR 트래킹 기준점 리센터링 (카메라 정면 재설정)
        if (window.XR8 && window.XR8.XrController) {
          window.XR8.XrController.recenter();
        }

        // 2. 3D 모델(ar_target_zone)을 처음 떴을 때의 위치, 크기, 회전값으로 복원
        const targetEntity = document.getElementById("ar_target_zone");
        if (targetEntity) {
          targetEntity.emit("ar-start"); // joayong_photo.html에 정의된 초기화 이벤트 실행
          console.log("🔄 3D 모델 위치 및 크기 리셋 완료");
        }
      },
      { passive: false }
    );
  });
}

  document.addEventListener("visibilitychange", () => {
    const bgm = document.getElementById("bgm");
    const audioBtn = document.getElementById("audio-toggle-btn");

    if (!bgm) return;

    if (document.hidden) {
      // 화면이 꺼지거나 다른 탭/앱으로 이동했을 때
      if (!bgm.paused) {
        bgm.pause();
        bgm.dataset.wasPlaying = "true"; // 재생 중이었음을 기억
        if (audioBtn) {
          audioBtn.innerText = "🔇";
          audioBtn.style.backgroundColor = "#f1f3f2";
        }
      }
    } else {
      // 다시 화면으로 돌아왔을 때
      if (bgm.dataset.wasPlaying === "true") {
        bgm.play().catch((err) => console.log("BGM 복구 실패:", err));
        bgm.dataset.wasPlaying = "false"; // 기억 초기화
        if (audioBtn) {
          audioBtn.innerText = "🎵";
          audioBtn.style.backgroundColor = "#ffffff";
        }
      }
    }
  });

  const uiLayer = document.getElementById("custom-ui-layer");
  const previewScreen = document.getElementById("preview-screen");
  const previewImg = document.getElementById("preview-image");
  const btnSaveStamp = document.getElementById("btn-save-stamp");

  let capturedDataUrl = null;
  let capturedFile = null;

  window.addEventListener("mediarecorder-photocomplete", (e) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      addTimestampToImage(ev.target.result, (composed) => {
        capturedDataUrl = composed;
        fetch(composed)
          .then((r) => r.blob())
          .then((blob) => {
            capturedFile = new File([blob], "조아용-stamp.jpg", {
              type: "image/jpeg",
            });
          });
        showPreview(composed);
      });
    };
    reader.readAsDataURL(e.detail.blob);
  });

  function addTimestampToImage(dataUrl, callback) {
    const img = new Image();
    img.onload = () => {
      const targetWidth = 720,
        targetHeight = 900;
      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext("2d");

      const targetRatio = targetWidth / targetHeight;
      const imageRatio = img.width / img.height;
      let sx, sy, sw, sh;
      if (imageRatio > targetRatio) {
        sh = img.height;
        sw = sh * targetRatio;
        sx = (img.width - sw) / 2;
        sy = 0;
      } else {
        sw = img.width;
        sh = sw / targetRatio;
        sx = 0;
        sy = (img.height - sh) * 0.35;
      }

      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight);

      const now = new Date();
      const timeStr =
        `${now.getFullYear()}.` +
        `${String(now.getMonth() + 1).padStart(2, "0")}.` +
        `${String(now.getDate()).padStart(2, "0")} ` +
        `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      let lighthouseName =
        localStorage.getItem("return_joa_title") || "조아용 축제";

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

  function showPreview(mediaUrl) {
    if (uiLayer) uiLayer.classList.remove("hidden");
    if (previewScreen) previewScreen.classList.remove("hidden");
    if (previewImg) {
      previewImg.src = mediaUrl;
      previewImg.classList.remove("hidden");
    }
  }

  if (btnSaveStamp)
    btnSaveStamp.addEventListener("click", () =>
      modalConfirm.classList.remove("hidden"),
    );
  // if (btnConfirmCancel)
  //   btnConfirmCancel.addEventListener("click", () =>
  //     modalConfirm.classList.add("hidden"),
  //   );

  // 1. 서버에 사진을 보내지 않고 완료 상태만 업데이트하는 함수로 변경
  async function uploadPhotoToServer() {
    const currentJoaId = localStorage.getItem("return_joa_id");
    try {
      const response = await fetch("/api/tour/photo_upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          joa_id: currentJoaId,
          // image_data, review_text 전송 완전 제거
        }),
      });
      const data = await response.json();

      if (data.success) {
        localStorage.setItem("last_ar_status", "PHOTO_SUBMITTED");

        const currentKey = localStorage.getItem("selected_model_key");
        let collected = JSON.parse(
          localStorage.getItem("collected_models") || "[]",
        );
        if (currentKey && !collected.includes(currentKey)) {
          collected.push(currentKey);
          localStorage.setItem("collected_models", JSON.stringify(collected));
        }
        return true;
      } else {
        alert(data.error);
        return false;
      }
    } catch (err) {
      console.error(err);
      alert("서버 전송 중 에러가 발생했습니다.");
      return false;
    }
  }

  // 📸 [기기 저장] 버튼 클릭 시
  document.getElementById("btn-save-device")?.addEventListener("click", async () => {
      if (!capturedDataUrl || !capturedFile) return;

      // 1. 서버에 완료 신호 전송
      const isUploaded = await uploadPhotoToServer();
      if (!isUploaded) return;

      // iOS(아이폰/아이패드) 환경 체크
      const isIOS =
        /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

      // 2-A. iOS(아이폰)인 경우: iOS 시스템 공유창 호출 (사진 앱 앨범 저장 유도)
      if (
        isIOS &&
        navigator.canShare &&
        navigator.canShare({ files: [capturedFile] })
      ) {
        try {
          await navigator.share({
            files: [capturedFile],
            title: "조아용 인증샷",
            text: "하단의 [이미지 저장]을 눌러 사진 앨범에 보관하세요!",
          });
          alert("스탬프가 발급되었습니다! 🎁");
        } catch (error) {
          console.log("iOS 공유/저장 취소 또는 에러:", error);
          alert("스탬프가 발급되었습니다! 🎁");
        } finally {
          // 공유창이 닫힌 후 안전하게 메인으로 복귀
          goBackToMain();
        }
        return;
      }

      // 2-B. 안드로이드 및 일반 브라우저: Blob ObjectURL 기반 다운로드 처리
      const joaTitle = localStorage.getItem("return_joa_title") || "조아용";
      const timeStamp = new Date().getTime();
      const fileName = `${joaTitle}_인증샷_${timeStamp}.jpg`;

      // Base64 대신 Blob URL을 사용하여 다운로드 안정성 확보
      const blobUrl = URL.createObjectURL(capturedFile);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // 사용한 Blob URL 메모리 해제
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

      alert("사진이 저장되어 스탬프가 발급되었습니다! 🎁");

      // 3. 다운로드가 완전히 시작될 수 있도록 약간의 시차(0.5초)를 주고 페이지 이동
      setTimeout(() => {
        goBackToMain();
      }, 500);
    });
  // 🌐 [SNS 공유] 버튼 클릭 시
  document
    .getElementById("btn-share-sns")
    ?.addEventListener("click", async () => {
      if (!capturedFile) return;

      // 1. 서버에 파라미터 없이 완료 신호만 전송
      const isUploaded = await uploadPhotoToServer();
      if (!isUploaded) return;

      // 2. Web Share API를 이용한 SNS 공유 패널 호출 (★ reviewText 변수 대신 고정 텍스트 사용)
      const shareData = {
        title: "용인시과학축제 AR스탬프투어",
        text: "조아용과 함께 찰칵!", // reviewText 대신 하드코딩
      };

      try {
        if (
          navigator.canShare &&
          navigator.canShare({ files: [capturedFile] })
        ) {
          await navigator.share({ ...shareData, files: [capturedFile] });
        } else if (navigator.share) {
          await navigator.share(shareData); // 파일 미지원 브라우저용 텍스트 공유
        } else {
          alert(
            "현재 브라우저에서는 공유 기능을 지원하지 않습니다.\n대신 스탬프는 정상 발급되었습니다!",
          );
        }
      } catch (error) {
        console.log("공유 취소 또는 에러:", error);
      } finally {
        // 공유 완료(혹은 취소) 시 메인으로 복귀
        goBackToMain();
      }
    });

  window.resetUI = function () {
    if (uiLayer) uiLayer.classList.add("hidden");
    if (previewScreen) previewScreen.classList.add("hidden");

    // 예전 모달(modalConfirm, modalShare) 관련 코드 완전히 삭제

    if (previewImg) previewImg.src = "";
    capturedDataUrl = null;
    capturedFile = null;

    // 촬영 버튼(8th Wall recorder) 다시 표시
    const recorder = document.getElementById("recorder");
    if (recorder) {
      recorder.style.display = "flex";
      recorder.style.visibility = "visible"; // 안전장치 추가
    }
  };
}); // 문서 로드 이벤트 닫기
